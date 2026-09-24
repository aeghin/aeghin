import "server-only";

import { after } from "next/server";

import prisma from "@/lib/prisma";
import {
  InvitationStatus,
  NotificationCategory,
} from "@/generated/prisma/enums";
import EventFullyStaffedEmail from "@/components/email/event-fully-staffed-template";
import { formatEventShort, formatEventWhen } from "@/lib/email/event-when";
import { organizationSender } from "@/lib/email/organization";
import {
  eventStaffingRecipients,
  eventStaffingWatcherIds,
} from "@/lib/email/recipients";
import { sendEmailBatches } from "@/lib/email/send";
import { sendPushNotices } from "@/lib/push/send";

/** Same shape the actions already pass around, so `touch` threads straight through. */
export type TagInvalidator = (tag: string) => void;

/**
 * A role is covered when somebody has accepted it, or is still inside the
 * window to answer.
 *
 * The expiry guard matters: the hourly sweep is what turns a lapsed PENDING row
 * into EXPIRED, so for up to an hour a dead invitation still reads PENDING.
 * Counting it as covered would hide a hole in exactly the window an admin most
 * needs to see it. `declineEventInvitation` applies the same `expiresAt > now`
 * test for the same reason.
 */
const coversRole = (
  assignment: { status: InvitationStatus; expiresAt: Date },
  now: Date,
) =>
  assignment.status === InvitationStatus.ACCEPTED ||
  (assignment.status === InvitationStatus.PENDING && assignment.expiresAt > now);

/**
 * How long after its last block an event still counts as live.
 *
 * Event times are stored as floating wall clock pinned to Z and displayed in
 * UTC, so `endTime` is not a real instant — for an organization west of UTC it
 * reads as much as half a day earlier than the service actually finishes.
 * Comparing it to a true `now` would therefore retire an event while it is
 * still going on. A day's grace is wider than any offset, and the cost of being
 * late is one extra day of a row nobody needs, against the cost of being early,
 * which is the roster going quiet during the service it was about.
 */
const LIVE_GRACE_MS = 24 * 60 * 60 * 1000;

type Desired = {
  userId: string;
  category: NotificationCategory;
  count: number;
  // Created already read. Only FULLY_STAFFED uses it: that row is news the
  // moment a roster fills, not when a new owner inherits a staffed event or a
  // reconcile first reaches one after deploy.
  quiet?: boolean;
};

/** What `announceFullyStaffed` reads off the event, written out by hand. */
type StaffedEvent = {
  name: string;
  organizationId: string;
  createdById: string | null;
  dates: { startTime: Date; endTime: Date }[];
  organization: { name: string; logoUrl: string | null };
};

/**
 * The one email and push a fill-up sends, to whoever the roster belongs to —
 * the same creator-then-owners rule every other staffing email follows.
 *
 * Best effort, like the rest of this file: the claim on `fullyStaffedAt` has
 * already committed, so a send that fails is logged and not retried. Retrying
 * risks mailing twice, which is worse than once missed when the bell row is
 * there either way.
 */
const announceFullyStaffed = async (eventId: string, event: StaffedEvent) => {
  const recipients = await eventStaffingRecipients(
    event.organizationId,
    event.createdById,
  );

  if (recipients.length === 0) return;

  const when = formatEventWhen(event.dates);

  await sendEmailBatches(
    "syncEventNotifications fully staffed",
    recipients.map((recipient) => ({
      from: organizationSender(event.organization.name),
      to: recipient.email,
      subject: `Fully staffed: ${event.name}`,
      react: EventFullyStaffedEmail({
        recipientName: recipient.firstName,
        eventName: event.name,
        organizationName: event.organization.name,
        logoUrl: event.organization.logoUrl,
        eventDate: when?.date ?? null,
        eventTime: when?.time ?? null,
        viewLink: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/organizations/${event.organizationId}/events/${eventId}`,
      }),
    })),
  );

  // After the response: this runs inside whichever accept filled the roster,
  // and that tap shouldn't wait on Expo.
  after(() =>
    sendPushNotices(
      "syncEventNotifications fully staffed",
      recipients.map((recipient) => ({
        email: recipient.email,
        title: `Fully staffed: ${event.name}`,
        subtitle: event.organization.name,
        body: ["Every role has someone confirmed.", formatEventShort(event.dates)]
          .filter(Boolean)
          .join("\n"),
        data: { type: "event", organizationId: event.organizationId, eventId },
      })),
    ),
  );
};

/**
 * Recomputes every notification this event should produce, and makes the table
 * match.
 *
 * Reconcile rather than append, which is the whole point of the model: callers
 * do not decide what to notify, they just say "this event's roster moved" and
 * this works out the rest. That makes it idempotent — the web action, the
 * mobile route and the cron can all call it for the same event, in any order,
 * as many times as they like, and the result is the same. There is no
 * double-send to dedupe because there is no send, only a row that is either
 * right or not.
 *
 * The one exception is the roster filling up, which has no action of its own
 * to hang an email off: the last accept, the last outstanding invite being
 * declined or lapsing, a role coming off — all of them end here, so this is
 * the only place that sees the transition. That email is claimed on
 * `Event.fullyStaffedAt`, which keeps it to once per fill-up however many
 * times this runs.
 *
 * Best-effort, like `logActivity` and `sendEmailBatches`: every caller has
 * already committed the mutation this describes, so a failure here must never
 * become the caller's error. It is logged and swallowed.
 */
export const syncEventNotifications = async (
  eventId: string,
  touch: TagInvalidator,
): Promise<void> => {
  try {
    const now = new Date();

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: {
        name: true,
        organizationId: true,
        rolesNeeded: true,
        createdById: true,
        fullyStaffedAt: true,
        dates: { select: { startTime: true, endTime: true } },
        organization: { select: { name: true, logoUrl: true } },
        assignments: {
          select: {
            userId: true,
            role: true,
            status: true,
            expiresAt: true,
          },
        },
      },
    });

    // Deleted between the mutation and here. `clearEventNotifications` is what
    // handles a deliberate delete; there is nothing to reconcile against.
    if (!event) return;

    // An event that has happened produces nothing, and anything it already
    // produced is deleted below by the ordinary reconcile — the desired set is
    // simply empty. Nobody can staff last Sunday, and "waiting on your answer"
    // about a service that has been and gone is worse than silence. Events with
    // no dates at all stay live: there is no date to have passed.
    const over =
      event.dates.length > 0 &&
      event.dates.every(
        (date) => date.endTime.getTime() + LIVE_GRACE_MS < now.getTime(),
      );

    const covered = new Set(
      event.assignments
        .filter((assignment) => coversRole(assignment, now))
        .map((assignment) => assignment.role),
    );

    const openCount = event.rolesNeeded.filter(
      (role) => !covered.has(role),
    ).length;

    // Every role has somebody who said yes, and nobody is still deciding. The
    // second half is the organization's rule: three BGVs invited and one
    // accepted is not fully staffed until the other two answer, either way.
    const confirmed = new Set(
      event.assignments
        .filter((assignment) => assignment.status === InvitationStatus.ACCEPTED)
        .map((assignment) => assignment.role),
    );

    const stillDeciding = event.assignments.some(
      (assignment) =>
        assignment.status === InvitationStatus.PENDING &&
        assignment.expiresAt > now,
    );

    const fullyStaffed =
      event.rolesNeeded.length > 0 &&
      event.rolesNeeded.every((role) => confirmed.has(role)) &&
      !stillDeciding;

    // The fill-up itself, claimed before any row is written so the row knows
    // whether it is news. The claim is atomic, so of any number of reconciles
    // racing on one event exactly one owns it; clearing it the moment the
    // roster stops being full is what makes filling up again after a dropout
    // news again.
    let justFilled = false;

    if (!over && fullyStaffed && event.fullyStaffedAt === null) {
      const { count } = await prisma.event.updateMany({
        where: { id: eventId, fullyStaffedAt: null },
        data: { fullyStaffedAt: now },
      });

      justFilled = count > 0;
    } else if (!over && !fullyStaffed && event.fullyStaffedAt !== null) {
      await prisma.event.updateMany({
        where: { id: eventId, fullyStaffedAt: { not: null } },
        data: { fullyStaffedAt: null },
      });
    }

    const desired = new Map<string, Desired>();

    // Admin side: one row per watcher. Missing people carries the count; fully
    // staffed carries nothing, and the two can't both be true. In between —
    // every role taken but somebody still deciding — is no row at all: a
    // pending invite is not an admin's problem yet, and the lapse sweep and
    // the cron's last-call check are what catch one that never gets answered.
    if (!over && (openCount > 0 || fullyStaffed)) {
      const watchers = await eventStaffingWatcherIds(
        event.organizationId,
        event.createdById,
      );

      const category = fullyStaffed
        ? NotificationCategory.FULLY_STAFFED
        : NotificationCategory.ROSTER_ATTENTION;

      for (const userId of watchers) {
        desired.set(`${userId}:${category}`, {
          userId,
          category,
          count: fullyStaffed ? 1 : openCount,
          quiet: fullyStaffed && !justFilled,
        });
      }
    }

    // Volunteer side: the row's existence is the message, so the count is a
    // constant. This is the half that reaches the person who only opens the app
    // when something tells them to.
    for (const assignment of event.assignments) {
      if (
        !over &&
        assignment.status === InvitationStatus.PENDING &&
        assignment.expiresAt > now
      ) {
        desired.set(
          `${assignment.userId}:${NotificationCategory.AWAITING_RESPONSE}`,
          {
            userId: assignment.userId,
            category: NotificationCategory.AWAITING_RESPONSE,
            count: 1,
          },
        );
      }
    }

    const existing = await prisma.notification.findMany({
      where: { eventId },
      select: { id: true, userId: true, category: true, count: true },
    });

    const existingByKey = new Map(
      existing.map((row) => [`${row.userId}:${row.category}`, row]),
    );

    const stale = existing.filter(
      (row) => !desired.has(`${row.userId}:${row.category}`),
    );

    // Resolved: the roles got filled, or the volunteer answered. The row goes,
    // rather than lingering as something to mark read — which is what keeps the
    // bell's empty state honest.
    if (stale.length > 0) {
      await prisma.notification.deleteMany({
        where: { id: { in: stale.map((row) => row.id) } },
      });
    }

    const fresh: Desired[] = [];

    for (const [key, want] of desired) {
      const have = existingByKey.get(key);

      if (!have) {
        fresh.push(want);
        continue;
      }

      if (have.count === want.count) continue;

      await prisma.notification.update({
        where: { id: have.id },
        data: {
          count: want.count,
          // Only a worsening roster re-raises the flag. Going 4 open -> 3 is
          // progress, and pinging on progress is how a bell earns being
          // ignored. `undefined` leaves whatever read state it already had.
          unreadAt: want.count > have.count ? now : undefined,
        },
      });
    }

    if (fresh.length > 0) {
      await prisma.notification.createMany({
        data: fresh.map((want) => ({
          eventId,
          organizationId: event.organizationId,
          userId: want.userId,
          category: want.category,
          count: want.count,
          unreadAt: want.quiet ? null : now,
        })),
        // Two reconciles racing on the same event would otherwise collide on
        // the unique key. Losing the race is not an error — the winner wrote
        // the same row.
        skipDuplicates: true,
      });
    }

    // Everyone whose bell changed, including the people whose rows just went.
    const touched = new Set<string>([
      ...existing.map((row) => row.userId),
      ...[...desired.values()].map((want) => want.userId),
    ]);

    for (const userId of touched) {
      touch(`user-${userId}-notifications`);
    }

    // Last, so no bell waits on a mail provider.
    if (justFilled) {
      await announceFullyStaffed(eventId, event);
    }
  } catch (err) {
    console.error(`Failed to sync notifications for event ${eventId}`, err);
  }
};

/**
 * Drops an event's notifications before the event itself goes.
 *
 * `onDelete: Cascade` would remove the rows anyway, but silently — leaving
 * every affected user's cached bell holding a pointer to an event that no
 * longer exists until something else happened to bust their tag. This reads the
 * owners first so their tags can be expired, which the cascade cannot do.
 */
export const clearEventNotifications = async (
  eventId: string,
  touch: TagInvalidator,
): Promise<void> => {
  try {
    const rows = await prisma.notification.findMany({
      where: { eventId },
      select: { id: true, userId: true },
    });

    if (rows.length === 0) return;

    await prisma.notification.deleteMany({
      where: { id: { in: rows.map((row) => row.id) } },
    });

    for (const userId of new Set(rows.map((row) => row.userId))) {
      touch(`user-${userId}-notifications`);
    }
  } catch (err) {
    console.error(`Failed to clear notifications for event ${eventId}`, err);
  }
};

/**
 * Most events one membership change reconciles inline, and how many at a time.
 *
 * This runs inside an admin action, so it is spending somebody's click. A
 * reconcile measures ~120ms against Neon, which serial at 100 events would be
 * twelve seconds of spinner. Fifty, ten at a time, is about two seconds in the
 * worst case and far less in the ordinary one. They are taken soonest first,
 * so what the cap leaves behind is the far-future events, which the hourly
 * cron works through on the same soonest-first order. The departing member's
 * own rows are cleared outright by `clearMemberNotifications`, so what the cap
 * can delay is only a count on somebody else's row.
 */
const ORG_RECONCILE_LIMIT = 50;
const ORG_RECONCILE_BATCH = 10;

/**
 * Reconciles every upcoming event in one organization.
 *
 * Membership and role changes move the *watcher* set without touching any
 * roster, so nothing in the event actions fires for them — and the watcher set
 * is what decides who a hole belongs to. Without this: a demoted admin keeps
 * rows they can no longer act on; owners never inherit the events of a creator
 * who left; and removing the drummer from three upcoming services opens three
 * roles that no bell ever mentions.
 *
 * Scoped to upcoming events because past ones produce nothing anyway. Capped,
 * because this runs inline in an admin action — anything past the cap is picked
 * up by the hourly cron, which reconciles the same horizon.
 */
export const syncOrganizationNotifications = async (
  organizationId: string,
  touch: TagInvalidator,
): Promise<void> => {
  try {
    // Soonest first. Several blocks per event are possible, hence the headroom
    // before deduping down to events.
    const dates = await prisma.eventDate.findMany({
      where: {
        endTime: { gte: new Date(Date.now() - LIVE_GRACE_MS) },
        event: { organizationId },
      },
      orderBy: { startTime: "asc" },
      select: { eventId: true },
      take: ORG_RECONCILE_LIMIT * 2,
    });

    const eventIds = [...new Set(dates.map((date) => date.eventId))].slice(
      0,
      ORG_RECONCILE_LIMIT,
    );

    for (let i = 0; i < eventIds.length; i += ORG_RECONCILE_BATCH) {
      await Promise.all(
        eventIds
          .slice(i, i + ORG_RECONCILE_BATCH)
          .map((eventId) => syncEventNotifications(eventId, touch)),
      );
    }
  } catch (err) {
    console.error(`Failed to sync notifications for org ${organizationId}`, err);
  }
};

/**
 * Drops one person's notifications for one organization.
 *
 * Their rows are not reachable from anything a departure deletes: the FKs are
 * to the user, the event and the organization, none of which is going away.
 * Reconciling the org clears the rows on events it covers, but not ones on an
 * event outside that horizon — so somebody who leaves would keep a pointer into
 * an organization they can no longer open. This is the direct answer to that.
 */
export const clearMemberNotifications = async (
  userId: string,
  organizationId: string,
  touch: TagInvalidator,
): Promise<void> => {
  try {
    const { count } = await prisma.notification.deleteMany({
      where: { userId, organizationId },
    });

    if (count > 0) touch(`user-${userId}-notifications`);
  } catch (err) {
    console.error(
      `Failed to clear notifications for user ${userId} in org ${organizationId}`,
      err,
    );
  }
};
