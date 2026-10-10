import "server-only";

import prisma from "@/lib/prisma";
import { InvitationStatus } from "@/generated/prisma/enums";
import EventInviteClosedEmail from "@/components/email/event-invite-closed-template";
import type { LapsedInvite as WaitingInvite } from "@/components/email/event-invite-expired-template";
import EventInviteReminderEmail from "@/components/email/event-invite-reminder-template";
import EventInviteUnansweredEmail from "@/components/email/event-invite-unanswered-template";
import { SMART_SCHEDULING_ENTITLEMENTS } from "@/lib/billing/entitlements";
import { teamOfRole, volunteerRoleConfig } from "@/lib/config/roles";
import { formatEventShort, formatEventWhen } from "@/lib/email/event-when";
import { organizationSender } from "@/lib/email/organization";
import { sendEmailBatches } from "@/lib/email/send";
import {
  eventOwners,
  reasonLine,
  roleAudience,
  type Addressee,
  type Person,
} from "@/lib/notifications/audience";
import { directoriesFor } from "@/lib/notifications/directory";
import {
  LAST_CALL_DAYS,
  NOTIFY_WINDOW_HOURS,
  nameList,
} from "@/lib/notifications/staffing";
import { sendPushNotices, type PushNotice } from "@/lib/push/send";
import { claimOnce } from "@/lib/push/staffing";
import { parseRoleSpots, spotsFor } from "@/lib/role-spots";
import {
  daysBefore,
  inZone,
  isDue,
  isDueAt,
  wakingNext,
  wakingSameDay,
  wallClock,
  zonesByEmail,
} from "@/lib/push/timing";

/**
 * An event invitation nobody has answered, from both ends. The invitee is
 * reminded, the managers are told it's still open, and when it closes the
 * invitee hears that too. The managers' own "Pianist needed" when it closes is
 * the sweep's, in the cron route.
 *
 * An answer is needed by whichever comes first: the invitation's deadline, or
 * the event itself. A deadline is counted from when the invitation was sent and
 * never cut short for the event, so a seven-day invitation to a service four
 * days off closes three days after it — and anything timed off the deadline
 * alone would be timed for after the service. So everything here counts down
 * to the sooner of the two.
 *
 * Each goes by email and push together, at a moment planned on the
 * recipient's own clock: the zone their phone reports keeps the push inside
 * 8am to 9pm, and the email goes with it. Somebody whose phone has never
 * reported a zone — usually somebody without the app — gets the email alone.
 */

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** The last reminder goes this many days before the answer is needed. */
const FINAL_DAYS_LEFT = 1;

/**
 * How far before the event a manager hears that somebody hasn't answered, when
 * that's sooner than a day before the invitation closes — with the day before
 * the event as the fallback for an invitation sent closer in than that. The
 * same two marks as the last call, so the two can't ring the same person twice.
 */
const [EVENT_LEAD_DAYS, EVENT_LAST_DAYS] = LAST_CALL_DAYS;

/**
 * The rows worth reading on a tick: invitations closing soon, and invitations
 * to events starting soon. A send planned N days out can move from 4 hours
 * earlier (into the evening) to 8 later (into the morning), may go up to 3
 * hours late, and an event's floating start can sit up to 14 hours either side
 * of the instant it names; the furthest out anything is planned is three days.
 */
const DEADLINE_FROM_MS = 12 * HOUR_MS;
const FINAL_DEADLINE_UNTIL_MS = FINAL_DAYS_LEFT * DAY_MS + 6 * HOUR_MS;
const REMINDER_DEADLINE_UNTIL_MS = 3 * DAY_MS + 6 * HOUR_MS;
const EVENT_HORIZON_MS = 4 * DAY_MS + 12 * HOUR_MS;

/**
 * The least time an invitation must have had before anything is said about
 * it, so one sent with barely a day to run — a smart-fill replacement
 * inheriting a close deadline — isn't chased in the same breath it arrived.
 */
const MIN_AGE_MS = 12 * HOUR_MS;

/**
 * How long a closed invitation's notice can wait for the invitee's morning:
 * as long as `sendLapsePushes` holds the managers' push.
 */
const CLOSED_HOLD_MS = 16 * HOUR_MS;

/** Reminder candidates read per query. Every page is read; this only bounds each. */
const PAGE = 500;

/**
 * Most rows one tick reads for the managers' alert or the closed notices. Only
 * binds on a backlog: each window holds a few days' worth, and whatever it
 * leaves waits for the next tick.
 */
const LIMIT = 1000;

export type SendCount = { pushes: number; emails: number };

const firstStartOf = (dates: { startTime: Date }[]) =>
  new Date(Math.min(...dates.map((date) => date.startTime.getTime())));

/**
 * The event's floating first start as an instant: on the reader's clock, or
 * read as UTC when there's no zone — hours out at worst, which mail can bear.
 */
const startInstant = (firstStart: Date, timeZone: string | undefined) =>
  timeZone ? inZone(firstStart, timeZone) : firstStart;

/**
 * How many days before the answer is due the halfway reminder goes: half the
 * time the invitee has, rounded down — three for a seven-day invitation, two
 * for five. Any less would land on the day-before reminder, so there is none.
 */
function midwayDaysLeft(invitedAt: Date, answerBy: Date): number | null {
  const days = Math.round((answerBy.getTime() - invitedAt.getTime()) / DAY_MS);
  const left = Math.floor(days / 2);

  return left > FINAL_DAYS_LEFT ? left : null;
}

/**
 * `daysLeft` days before an invitation closes: that time on the reader's
 * clock, kept inside waking hours on its own day, or the bare instant when
 * there's no zone to read.
 */
function beforeDeadline(deadline: Date, daysLeft: number, timeZone: string | undefined): Date {
  const planned = new Date(deadline.getTime() - daysLeft * DAY_MS);

  return timeZone
    ? inZone(wakingSameDay(wallClock(planned, timeZone)), timeZone)
    : planned;
}

/**
 * `days` before the event, at its own time of day on the reader's clock and
 * inside waking hours, as the last call is timed.
 */
function beforeEvent(firstStart: Date, days: number, timeZone: string | undefined): Date {
  return timeZone
    ? inZone(wakingSameDay(daysBefore(firstStart, days)), timeZone)
    : daysBefore(firstStart, days);
}

const due = (sendAt: Date, now: Date, timeZone: string | undefined) =>
  timeZone ? isDue(sendAt, now, timeZone) : isDueAt(sendAt, now);

const dayIndex = (floating: Date) => Math.floor(floating.getTime() / DAY_MS);

/** "today", "tomorrow", "in 3 days" — counted on the reader's calendar. */
function untilEvent(firstStart: Date, now: Date, timeZone: string | undefined): string {
  const days = timeZone
    ? dayIndex(firstStart) - dayIndex(wallClock(now, timeZone))
    : Math.round((firstStart.getTime() - now.getTime()) / DAY_MS);

  if (days <= 0) return "today";
  if (days === 1) return "tomorrow";

  return `in ${days} days`;
}

/** "Sat 10:30 PM", for a push: which week it falls in is never in doubt. */
const shortDeadline = (deadline: Date, timeZone: string) =>
  deadline.toLocaleString("en-US", {
    timeZone,
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });

/**
 * "Sat, Oct 11, 10:30 PM CDT" in the reader's zone, for an email. Without one
 * there's no honest clock time to give, so it's "in about 3 days".
 */
const longDeadline = (deadline: Date, timeZone: string | undefined, now: Date) => {
  if (timeZone) {
    return deadline.toLocaleString("en-US", {
      timeZone,
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    });
  }

  const days = Math.round((deadline.getTime() - now.getTime()) / DAY_MS);

  return days > 1 ? `in about ${days} days` : "in about a day";
};

/**
 * Reminds whoever is still sitting on an event invitation: "Still need your
 * answer: Sunday Service". Twice when there's time — halfway, then the day
 * before the answer is due — and once, the day before, when there isn't: a
 * seven-day invitation three days and one day before it closes, a five-day one
 * two days and one, a three-day one and every re-invite one. When the event
 * comes first, the same count runs to the event instead, and the reminder says
 * so: "It's tomorrow."
 *
 * Planned on the invitee's own clock. Skipped for an event already under way,
 * which the Pending list no longer shows. Each reminder is claimed on its own
 * column, which a re-invite clears: a new window earns its own.
 */
export async function sendAnswerReminders(now: Date): Promise<SendCount> {
  const count: SendCount = { pushes: 0, emails: 0 };
  let after: string | undefined;

  for (;;) {
    const rows = await prisma.eventAssignment.findMany({
      where: {
        ...(after ? { id: { gt: after } } : {}),
        status: InvitationStatus.PENDING,
        expiresAt: { gt: now },
        AND: [
          { OR: [{ midwayNudgedAt: null }, { nudgedAt: null }] },
          {
            OR: [
              {
                expiresAt: {
                  gt: new Date(now.getTime() + DEADLINE_FROM_MS),
                  lte: new Date(now.getTime() + REMINDER_DEADLINE_UNTIL_MS),
                },
              },
              {
                event: {
                  dates: {
                    some: {
                      startTime: {
                        gt: now,
                        lte: new Date(now.getTime() + EVENT_HORIZON_MS),
                      },
                    },
                  },
                },
              },
            ],
          },
        ],
      },
      select: {
        id: true,
        role: true,
        invitedAt: true,
        expiresAt: true,
        midwayNudgedAt: true,
        nudgedAt: true,
        // Who invited them, for the reminder to name — unless Smart Scheduling
        // did, which keeps the sender of the declined invitation it replaced.
        autoAssigned: true,
        assignedBy: { select: { firstName: true, lastName: true } },
        user: { select: { email: true, firstName: true } },
        event: {
          select: {
            id: true,
            name: true,
            organizationId: true,
            dates: { select: { startTime: true, endTime: true } },
            organization: { select: { name: true, logoUrl: true } },
          },
        },
      },
      orderBy: { id: "asc" },
      take: PAGE,
    });

    if (rows.length === 0) return count;

    const zones = await zonesByEmail(rows.map((row) => row.user.email));

    const planned = rows.flatMap((row) => {
      if (row.event.dates.length === 0) return [];

      const timeZone = zones.get(row.user.email);
      const firstStart = firstStartOf(row.event.dates);

      try {
        const start = startInstant(firstStart, timeZone);

        if (start.getTime() <= now.getTime()) return [];

        const eventFirst = row.expiresAt.getTime() >= start.getTime();
        const sendAt = (daysLeft: number) =>
          eventFirst
            ? beforeEvent(firstStart, daysLeft, timeZone)
            : beforeDeadline(row.expiresAt, daysLeft, timeZone);

        const stages = [
          { final: true, daysLeft: FINAL_DAYS_LEFT, sent: row.nudgedAt },
          {
            final: false,
            daysLeft: midwayDaysLeft(row.invitedAt, eventFirst ? start : row.expiresAt),
            sent: row.midwayNudgedAt,
          },
        ];

        // The first that's due, so a tick can never send both at once.
        const stage = stages.find(({ daysLeft, sent }) => {
          if (daysLeft === null || sent) return false;

          const at = sendAt(daysLeft);

          return (
            due(at, now, timeZone) &&
            at.getTime() - row.invitedAt.getTime() >= MIN_AGE_MS
          );
        });

        return stage
          ? [{ row, timeZone, final: stage.final, eventFirst, firstStart }]
          : [];
      } catch {
        // A zone this runtime can't resolve: no reminder, rather than no tick.
        return [];
      }
    });

    const claim = async (final: boolean) => {
      const ids = planned.filter((item) => item.final === final).map((item) => item.row.id);

      if (ids.length === 0) return [];

      return prisma.eventAssignment.updateManyAndReturn({
        where: {
          id: { in: ids },
          status: InvitationStatus.PENDING,
          expiresAt: { gt: now },
          ...(final ? { nudgedAt: null } : { midwayNudgedAt: null }),
        },
        data: final ? { nudgedAt: now } : { midwayNudgedAt: now },
        select: { id: true },
      });
    };

    const claimed = new Set(
      [...(await claim(true)), ...(await claim(false))].map((row) => row.id),
    );

    const sending = planned.filter((item) => claimed.has(item.row.id));

    const pushes: PushNotice[] = sending.flatMap(({ row, timeZone, eventFirst, firstStart }) =>
      timeZone
        ? [
            {
              email: row.user.email,
              title: `Still need your answer: ${row.event.name}`,
              subtitle: row.event.organization.name,
              body: [
                [volunteerRoleConfig[row.role].label, formatEventShort(row.event.dates)]
                  .filter(Boolean)
                  .join(" · "),
                eventFirst
                  ? `It's ${untilEvent(firstStart, now, timeZone)}. Tap to accept or decline.`
                  : `Expires ${shortDeadline(row.expiresAt, timeZone)}. Tap to accept or decline.`,
              ].join("\n"),
              data: {
                type: "invitation",
                organizationId: row.event.organizationId,
                eventId: row.event.id,
              },
            },
          ]
        : [],
    );

    const emails = sending.map(({ row, timeZone, eventFirst, firstStart }) => {
      const when = formatEventWhen(row.event.dates);

      return {
        from: organizationSender(row.event.organization.name),
        to: row.user.email,
        subject: `Still need your answer: ${row.event.name}`,
        react: EventInviteReminderEmail({
          recipientName: row.user.firstName,
          eventName: row.event.name,
          organizationName: row.event.organization.name,
          logoUrl: row.event.organization.logoUrl,
          roleLabel: volunteerRoleConfig[row.role].label,
          invitedByName: row.assignedBy
            ? `${row.assignedBy.firstName} ${row.assignedBy.lastName}`
            : null,
          autoFilled: row.autoAssigned,
          timing: eventFirst
            ? `${row.event.name} is ${untilEvent(firstStart, now, timeZone)}`
            : `Your invitation expires ${longDeadline(row.expiresAt, timeZone, now)}`,
          eventFirst,
          eventDate: when?.date ?? null,
          eventTime: when?.time ?? null,
          viewLink: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/organizations/${row.event.organizationId}`,
        }),
      };
    });

    await sendEmailBatches("answer reminder", emails);
    await sendPushNotices("answer reminder", pushes);

    count.pushes += pushes.length;
    count.emails += emails.length;

    if (rows.length < PAGE) return count;

    after = rows[rows.length - 1].id;
  }
}

/** Everything one manager is told about one event's unanswered invitations. */
type WaitingBucket = {
  recipient: Person;
  timeZone: string | undefined;
  footer: string;
  /** Whether any of these is theirs to act on, rather than a heads-up. */
  owns: boolean;
  organizationId: string;
  organizationName: string;
  logoUrl: string | null;
  eventId: string;
  eventName: string;
  dates: { startTime: Date; endTime: Date }[];
  firstStart: Date;
  /**
   * The soonest any of them closes before the event, or null when every one
   * runs past it — then the event is the deadline that matters.
   */
  closesFirst: Date | null;
  waiting: WaitingInvite[];
};

/** "Expires Sat 10:30 PM", or "Sunday Service is in 3 days" when the event comes first. */
function waitingTiming(bucket: WaitingBucket, now: Date, long: boolean): string {
  if (!bucket.closesFirst) {
    return `${bucket.eventName} is ${untilEvent(bucket.firstStart, now, bucket.timeZone)}`;
  }

  const deadline = long
    ? longDeadline(bucket.closesFirst, bucket.timeZone, now)
    : bucket.timeZone
      ? shortDeadline(bucket.closesFirst, bucket.timeZone)
      : longDeadline(bucket.closesFirst, undefined, now);

  return bucket.waiting.length === 1
    ? `The invitation expires ${deadline}`
    : `The first expires ${deadline}`;
}

/**
 * Tells the managers that somebody hasn't answered, while there's still time
 * to plan around it: "No answer from Vic Test: Sunday Service". Once per
 * invitation, at whichever comes first — a day before it closes, or three days
 * before the event — or, for one sent inside those three days, the day before
 * the event. Then, if it closes before the event, the sweep's "Pianist
 * needed" follows. Two at most, never one after the event.
 *
 * The same people hear as when it closes (`lapseBuckets`): whoever covers its
 * team on the event, else the team's lead, else the creator, else the owners,
 * with "Also notify" and whoever sent it copied in. One email and one push per
 * person per event, however many are waiting. Somebody else accepting the same
 * role changes nothing — every invite is somebody wanted there — unless the
 * role already has as many yeses as it needs. And on a plan with the
 * last call, whoever that check already reaches on the same day — the event's
 * creator, else its owners — is left to it, since it lists who hasn't answered.
 */
export async function sendNoAnswerAlerts(now: Date): Promise<SendCount> {
  const rows = await prisma.eventAssignment.findMany({
    where: {
      status: InvitationStatus.PENDING,
      expiresAt: { gt: now },
      OR: [
        {
          expiresAt: {
            gt: new Date(now.getTime() + DEADLINE_FROM_MS),
            lte: new Date(now.getTime() + FINAL_DEADLINE_UNTIL_MS),
          },
        },
        {
          event: {
            dates: {
              some: {
                startTime: {
                  gt: now,
                  lte: new Date(now.getTime() + EVENT_HORIZON_MS),
                },
              },
            },
          },
        },
      ],
    },
    select: {
      id: true,
      role: true,
      invitedAt: true,
      expiresAt: true,
      assignedById: true,
      organizationId: true,
      user: { select: { firstName: true, lastName: true } },
      event: {
        select: {
          id: true,
          name: true,
          createdAt: true,
          createdById: true,
          serviceTypeId: true,
          roleSpots: true,
          dates: { select: { startTime: true, endTime: true } },
          teamLeads: { select: { category: true, userId: true } },
        },
      },
      organization: { select: { name: true, logoUrl: true, entitlements: true } },
    },
    orderBy: { expiresAt: "asc" },
    take: LIMIT,
  });

  const upcoming = rows.filter((row) => row.event.dates.length > 0);

  if (upcoming.length === 0) return { pushes: 0, emails: 0 };

  const staffed = await prisma.eventAssignment.groupBy({
    by: ["eventId", "role"],
    where: {
      eventId: { in: [...new Set(upcoming.map((row) => row.event.id))] },
      status: InvitationStatus.ACCEPTED,
    },
    _count: { _all: true },
  });

  const acceptedOn = new Map(
    staffed.map((row) => [`${row.eventId}:${row.role}`, row._count._all]),
  );

  const directoryFor = directoriesFor();

  const candidates: {
    row: (typeof upcoming)[number];
    addressee: Addressee;
    headsUp: string | null;
    serviceTypeName: string | null;
    /** Whether the last call reaches this person about this event. */
    lastCalled: boolean;
  }[] = [];

  for (const row of upcoming) {
    const accepted = acceptedOn.get(`${row.event.id}:${row.role}`) ?? 0;

    if (accepted >= spotsFor(parseRoleSpots(row.event.roleSpots), row.role)) continue;

    const directory = await directoryFor(row.organizationId);

    if (!directory) continue;

    const audience = roleAudience(directory, {
      serviceTypeId: row.event.serviceTypeId,
      createdById: row.event.createdById,
      role: row.role,
      coverId:
        row.event.teamLeads.find((cover) => cover.category === teamOfRole(row.role))
          ?.userId ?? null,
      inviterId: row.assignedById,
    });

    const lastCall = row.organization.entitlements.some((entitlement) =>
      SMART_SCHEDULING_ENTITLEMENTS.includes(entitlement),
    );

    const lastCalledIds = lastCall
      ? new Set(eventOwners(directory, row.event.createdById).people.map((person) => person.userId))
      : new Set<string>();

    const serviceTypeName =
      directory.serviceTypeNames.get(row.event.serviceTypeId) ?? null;

    for (const addressee of audience.owners) {
      candidates.push({
        row,
        addressee,
        headsUp: null,
        serviceTypeName,
        lastCalled: lastCalledIds.has(addressee.person.userId),
      });
    }

    for (const addressee of audience.copied) {
      candidates.push({
        row,
        addressee,
        headsUp: audience.headsUp,
        serviceTypeName,
        lastCalled: lastCalledIds.has(addressee.person.userId),
      });
    }
  }

  const zones = await zonesByEmail(
    candidates.map(({ addressee }) => addressee.person.email),
  );

  const planned = candidates.flatMap((candidate) => {
    const { row, addressee, lastCalled } = candidate;
    const timeZone = zones.get(addressee.person.email);
    const firstStart = firstStartOf(row.event.dates);

    try {
      const start = startInstant(firstStart, timeZone);
      const earliest = row.invitedAt.getTime() + MIN_AGE_MS;
      const closesFirst = row.expiresAt.getTime() < start.getTime();

      const fits = (at: Date) =>
        at.getTime() >= earliest && at.getTime() < start.getTime();

      // Whichever comes first: a day before it closes, when that's before the
      // event, or three days before the event; else the day before the event.
      const options = [
        ...(closesFirst
          ? [{ at: beforeDeadline(row.expiresAt, FINAL_DAYS_LEFT, timeZone), lastCallDays: null }]
          : []),
        { at: beforeEvent(firstStart, EVENT_LEAD_DAYS, timeZone), lastCallDays: EVENT_LEAD_DAYS },
      ].filter(({ at }) => fits(at));

      const fallback = {
        at: beforeEvent(firstStart, EVENT_LAST_DAYS, timeZone),
        lastCallDays: EVENT_LAST_DAYS,
      };

      const chosen =
        options.sort((a, b) => a.at.getTime() - b.at.getTime())[0] ??
        (fits(fallback.at) ? fallback : null);

      if (!chosen || !due(chosen.at, now, timeZone)) return [];

      // The last call goes the same day and already lists who hasn't
      // answered — unless the event was made after its mark had passed.
      if (
        chosen.lastCallDays !== null &&
        lastCalled &&
        row.event.createdAt.getTime() <=
          firstStart.getTime() - chosen.lastCallDays * DAY_MS
      ) {
        return [];
      }

      return [
        {
          ...candidate,
          timeZone,
          firstStart,
          closesFirst,
          key: `no-answer:${row.id}:${row.expiresAt.getTime()}:${addressee.person.email}`,
        },
      ];
    } catch {
      // A zone this runtime can't resolve: no alert, rather than no tick.
      return [];
    }
  });

  const won = await claimOnce(planned.map((item) => item.key));

  const buckets = new Map<string, WaitingBucket>();

  for (const item of planned) {
    if (!won.has(item.key)) continue;

    const { row, addressee, headsUp, serviceTypeName, timeZone, firstStart, closesFirst } = item;
    const { person, reason } = addressee;
    const footer = reasonLine(reason, row.organization.name, row.role, serviceTypeName);
    const invite: WaitingInvite = {
      inviteeName: `${row.user.firstName} ${row.user.lastName}`,
      roleLabel: volunteerRoleConfig[row.role].label,
      headsUp,
    };

    const bucketKey = `${row.event.id}:${person.email}`;
    const existing = buckets.get(bucketKey);

    if (!existing) {
      buckets.set(bucketKey, {
        recipient: person,
        timeZone,
        footer,
        owns: headsUp === null,
        organizationId: row.organizationId,
        organizationName: row.organization.name,
        logoUrl: row.organization.logoUrl,
        eventId: row.event.id,
        eventName: row.event.name,
        dates: row.event.dates,
        firstStart,
        closesFirst: closesFirst ? row.expiresAt : null,
        waiting: [invite],
      });
      continue;
    }

    existing.waiting.push(invite);

    if (
      closesFirst &&
      (!existing.closesFirst || row.expiresAt < existing.closesFirst)
    ) {
      existing.closesFirst = row.expiresAt;
    }

    // The footer names the reason they own something, when they do.
    if (headsUp === null && !existing.owns) {
      existing.owns = true;
      existing.footer = footer;
    }
  }

  const sending = [...buckets.values()];

  const subjectOf = (bucket: WaitingBucket) =>
    `${bucket.owns ? "" : "Heads-up: "}No answer from ${nameList(
      bucket.waiting.map((invite) => invite.inviteeName),
    )}: ${bucket.eventName}`;

  const emails = sending.map((bucket) => {
    const when = formatEventWhen(bucket.dates);

    return {
      from: organizationSender(bucket.organizationName),
      to: bucket.recipient.email,
      subject: subjectOf(bucket),
      react: EventInviteUnansweredEmail({
        recipientName: bucket.recipient.firstName,
        eventName: bucket.eventName,
        organizationName: bucket.organizationName,
        logoUrl: bucket.logoUrl,
        waiting: bucket.waiting,
        timing: waitingTiming(bucket, now, true),
        eventDate: when?.date ?? null,
        eventTime: when?.time ?? null,
        viewLink: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/organizations/${bucket.organizationId}/events/${bucket.eventId}`,
        footer: bucket.footer,
      }),
    };
  });

  const pushes: PushNotice[] = sending
    .filter((bucket) => bucket.timeZone)
    .map((bucket) => {
      const headsUps = [...new Set(bucket.waiting.map((invite) => invite.headsUp))];

      return {
        email: bucket.recipient.email,
        title: subjectOf(bucket),
        subtitle: bucket.organizationName,
        body: [
          [...new Set(bucket.waiting.map((invite) => invite.roleLabel))].join(", "),
          `${waitingTiming(bucket, now, false)}.`,
          // Only when none of it is theirs: a heads-up on one of several they
          // own reads as though the whole push were somebody else's.
          !bucket.owns &&
            (headsUps.length === 1
              ? headsUps[0]
              : "Others have been asked to fill them."),
        ]
          .filter(Boolean)
          .join("\n"),
        data: {
          type: "event",
          organizationId: bucket.organizationId,
          eventId: bucket.eventId,
        },
      };
    });

  await sendEmailBatches("no answer yet", emails);
  await sendPushNotices("no answer yet", pushes);

  return { pushes: pushes.length, emails: emails.length };
}

/**
 * Tells somebody their invitation closed before they answered: "Invitation
 * expired: Sunday Service". Without it, the invitation simply vanished from
 * their Pending list and nobody said why.
 *
 * Read back from `lapsedAt` like the managers' push, so a lapse in the night
 * waits for the invitee's morning; somebody with no zone gets the email as
 * soon as the sweep finds it. Not for a lapse the sweep found long after the
 * fact, nor for an event that has already happened, nor once they've been
 * invited again.
 */
export async function sendClosedInviteNotices(now: Date): Promise<SendCount> {
  const rows = await prisma.eventAssignment.findMany({
    where: {
      status: InvitationStatus.EXPIRED,
      lapsedAt: { gt: new Date(now.getTime() - CLOSED_HOLD_MS), lte: now },
      event: { dates: { some: { endTime: { gte: now } } } },
    },
    select: {
      id: true,
      role: true,
      expiresAt: true,
      lapsedAt: true,
      user: { select: { email: true, firstName: true } },
      assignedBy: { select: { firstName: true, lastName: true } },
      event: {
        select: {
          id: true,
          name: true,
          organizationId: true,
          dates: { select: { startTime: true, endTime: true } },
          organization: { select: { name: true, logoUrl: true } },
        },
      },
    },
    // Latest first, so a backlog's old lapses can't crowd out today's.
    orderBy: { expiresAt: "desc" },
    take: LIMIT,
  });

  const recent = rows.flatMap(({ lapsedAt, ...row }) =>
    lapsedAt &&
    row.expiresAt.getTime() >= lapsedAt.getTime() - NOTIFY_WINDOW_HOURS * HOUR_MS
      ? [{ ...row, lapsedAt }]
      : [],
  );

  if (recent.length === 0) return { pushes: 0, emails: 0 };

  const zones = await zonesByEmail(recent.map((row) => row.user.email));

  const planned = recent.flatMap((row) => {
    const timeZone = zones.get(row.user.email);

    try {
      const sendAt = timeZone
        ? inZone(wakingNext(wallClock(row.lapsedAt, timeZone)), timeZone)
        : row.lapsedAt;

      return due(sendAt, now, timeZone)
        ? [{ row, timeZone, key: `invite-closed:${row.id}:${row.lapsedAt.getTime()}` }]
        : [];
    } catch {
      // A zone this runtime can't resolve: no notice, rather than no tick.
      return [];
    }
  });

  const won = await claimOnce(planned.map((item) => item.key));

  const sending = planned.filter((item) => won.has(item.key));

  const emails = sending.map(({ row }) => {
    const when = formatEventWhen(row.event.dates);

    return {
      from: organizationSender(row.event.organization.name),
      to: row.user.email,
      subject: `Invitation expired: ${row.event.name}`,
      react: EventInviteClosedEmail({
        recipientName: row.user.firstName,
        eventName: row.event.name,
        organizationName: row.event.organization.name,
        logoUrl: row.event.organization.logoUrl,
        roleLabel: volunteerRoleConfig[row.role].label,
        invitedByName: row.assignedBy
          ? `${row.assignedBy.firstName} ${row.assignedBy.lastName}`
          : null,
        eventDate: when?.date ?? null,
        eventTime: when?.time ?? null,
        viewLink: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/organizations/${row.event.organizationId}`,
      }),
    };
  });

  const pushes: PushNotice[] = sending
    .filter((item) => item.timeZone)
    .map(({ row }) => ({
      email: row.user.email,
      title: `Invitation expired: ${row.event.name}`,
      subtitle: row.event.organization.name,
      body: [
        [volunteerRoleConfig[row.role].label, formatEventShort(row.event.dates)]
          .filter(Boolean)
          .join(" · "),
        `It closed before you answered. If you can still make it, ask ${
          row.assignedBy
            ? `${row.assignedBy.firstName} ${row.assignedBy.lastName}`
            : "an admin"
        } to send it again.`,
      ].join("\n"),
      // The invitation has left the Pending list, so there's no page of its
      // own to open.
      data: { type: "organization", organizationId: row.event.organizationId },
    }));

  await sendEmailBatches("invitation closed", emails);
  await sendPushNotices("invitation closed", pushes);

  return { pushes: pushes.length, emails: emails.length };
}
