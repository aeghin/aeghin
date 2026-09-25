import "server-only";

import prisma from "@/lib/prisma";
import { InvitationStatus, type VolunteerRole } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import type { LapsedInvite } from "@/components/email/event-invite-expired-template";
import { volunteerRoleLabels } from "@/lib/activity";
import {
  eventStaffingRecipients,
  inviteSenderRecipients,
  type EmailRecipient,
} from "@/lib/email/recipients";

/**
 * What the cron tells an event's managers about its roster. Shared by the
 * email, which goes when the cron finds it, and the push, which waits for the
 * manager's waking hours (`lib/push/staffing.ts`) — so the two can't disagree
 * about who hears or what counts as a gap.
 */

/**
 * Days before an event's first block that the staffing check runs, furthest
 * first. A check's stage is its position here plus one, which is the number
 * `Event.lastCallStage` records.
 */
export const LAST_CALL_DAYS = [3, 1];

/**
 * How recently an invitation must have lapsed for anyone to be told about it.
 *
 * The sweep is the only writer of EXPIRED, so any interruption — a paused cron,
 * a rolled-back deploy, CRON_SECRET going missing — leaves lapses piling up as
 * PENDING, and the tick that resumes would report every one of them at once.
 * SWEEP_LIMIT and `hasMore` exist because that backlog is expected to be
 * possible; this is the same guard applied to the notices.
 *
 * Comfortably wider than the hourly schedule, so an ordinary tick — where a
 * lapse is at most an hour old — never notices it. Older rows are still swept
 * and still turn EXPIRED in the UI; they just stop generating notices about a
 * deadline that passed long enough ago that nobody can act on it any faster
 * for having been told.
 */
export const NOTIFY_WINDOW_HOURS = 6;

type RosterAssignment = {
  role: VolunteerRole;
  status: InvitationStatus;
  expiresAt: Date;
  user: { firstName: string; lastName: string };
};

/**
 * What an event's roster still lacks: roles with nobody on them, and
 * invitations still waiting on an answer. "Fully staffed" is the bell's test —
 * every role has somebody who accepted, and nobody is still deciding.
 */
export function rosterGaps(
  event: { rolesNeeded: VolunteerRole[]; assignments: RosterAssignment[] },
  now: Date,
) {
  const confirmed = new Set(
    event.assignments
      .filter((row) => row.status === InvitationStatus.ACCEPTED)
      .map((row) => row.role),
  );

  const waiting = event.assignments.filter(
    (row) => row.status === InvitationStatus.PENDING && row.expiresAt > now,
  );

  const deciding = new Set(waiting.map((row) => row.role));

  return {
    fullyStaffed:
      event.rolesNeeded.every((role) => confirmed.has(role)) &&
      waiting.length === 0,
    unfilledRoles: event.rolesNeeded
      .filter((role) => !confirmed.has(role) && !deciding.has(role))
      .map((role) => volunteerRoleLabels[role]),
    waitingOn: waiting.map((row) => ({
      inviteeName: `${row.user.firstName} ${row.user.lastName}`,
      roleLabel: volunteerRoleLabels[row.role],
    })),
  };
}

/** One lapsed invitation, with what the push needs to time and claim it. */
export type Lapse = LapsedInvite & {
  assignmentId: string;
  lapsedAt: Date | null;
};

/** Everything one person is told about one event's lapsed invitations. */
export type LapseBucket = {
  recipient: EmailRecipient;
  organizationId: string;
  organizationName: string;
  logoUrl: string | null;
  eventId: string;
  eventName: string;
  dates: { startTime: Date; endTime: Date }[];
  lapsed: Lapse[];
};

/** The email's subject and the push's title. */
export function lapseSubject(lapsed: LapsedInvite[], eventName: string) {
  const roles = [...new Set(lapsed.map((item) => item.roleLabel))];

  return roles.length === 1
    ? `Needs a ${roles[0]}: ${eventName}`
    : `Needs ${roles.length} roles filled: ${eventName}`;
}

/**
 * Who hears about which lapsed invitations: one bucket per person per event.
 *
 * `where` picks the lapses — the rows a sweep just flipped, for the email, or
 * everything flipped lately, for the push that may have waited overnight. Only
 * EXPIRED rows are ever read, so somebody who accepted in the gap between a
 * sweep's select and its update never counts; cache tags can afford to
 * over-fire, notices cannot.
 *
 * Restricted to events that have not happened yet — a past event is not
 * something anyone can go and staff — and to lapses inside
 * NOTIFY_WINDOW_HOURS of when they were swept, so a backlog is swept quietly.
 */
export async function lapseBuckets(
  where: Prisma.EventAssignmentWhereInput,
  now: Date,
): Promise<LapseBucket[]> {
  const rows = await prisma.eventAssignment.findMany({
    where: {
      ...where,
      status: InvitationStatus.EXPIRED,
      event: { dates: { some: { endTime: { gte: now } } } },
    },
    select: {
      id: true,
      role: true,
      assignedById: true,
      organizationId: true,
      expiresAt: true,
      lapsedAt: true,
      user: { select: { firstName: true, lastName: true } },
      event: {
        select: {
          id: true,
          name: true,
          createdById: true,
          dates: { select: { startTime: true, endTime: true } },
        },
      },
      organization: { select: { name: true, logoUrl: true } },
    },
  });

  const lapsed = rows.filter(
    (row) =>
      row.expiresAt.getTime() >=
      (row.lapsedAt ?? now).getTime() - NOTIFY_WINDOW_HOURS * 60 * 60 * 1000,
  );

  if (lapsed.length === 0) return [];

  // A role somebody has since accepted is not a gap. Two admins inviting two
  // pianists, or a smart-fill replacement that stuck, both end here — and
  // "needs a Pianist" about an event with a confirmed pianist is the kind of
  // wrong that stops people reading the mail.
  const staffed = await prisma.eventAssignment.groupBy({
    by: ["eventId", "role"],
    where: {
      eventId: { in: [...new Set(lapsed.map((row) => row.event.id))] },
      status: InvitationStatus.ACCEPTED,
    },
    _count: { _all: true },
  });

  const filled = new Set(staffed.map((row) => `${row.eventId}:${row.role}`));

  const open = lapsed.filter((row) => !filled.has(`${row.event.id}:${row.role}`));

  if (open.length === 0) return [];

  // Matched as organization+user pairs, so a membership in a different
  // organization can never resolve a sender.
  const senderPairs = new Map(
    open
      .filter((row) => row.assignedById !== null)
      .map((row) => [
        `${row.organizationId}:${row.assignedById}`,
        {
          organizationId: row.organizationId,
          userId: row.assignedById as string,
        },
      ]),
  );

  const senders = await inviteSenderRecipients([...senderPairs.values()]);

  // One bucket per recipient per event: an admin who invited five people to
  // one event hears once, listing five roles, and hears only about the
  // invitations they sent.
  const buckets = new Map<string, LapseBucket>();
  const orphaned = new Map<string, typeof open>();

  const entryFor = (row: (typeof open)[number]): Lapse => ({
    inviteeName: `${row.user.firstName} ${row.user.lastName}`,
    roleLabel: volunteerRoleLabels[row.role],
    assignmentId: row.id,
    lapsedAt: row.lapsedAt,
  });

  const add = (
    recipient: EmailRecipient,
    row: (typeof open)[number],
    entries: Lapse[],
  ) => {
    const key = `${row.event.id}:${recipient.email}`;
    const existing = buckets.get(key);

    if (existing) {
      existing.lapsed.push(...entries);
      return;
    }

    buckets.set(key, {
      recipient,
      organizationId: row.organizationId,
      organizationName: row.organization.name,
      logoUrl: row.organization.logoUrl,
      eventId: row.event.id,
      eventName: row.event.name,
      dates: row.event.dates,
      lapsed: [...entries],
    });
  };

  for (const row of open) {
    const sender = row.assignedById
      ? senders.get(`${row.organizationId}:${row.assignedById}`)
      : undefined;

    if (sender) {
      add(sender, row, [entryFor(row)]);
      continue;
    }

    const pending = orphaned.get(row.event.id) ?? [];
    pending.push(row);
    orphaned.set(row.event.id, pending);
  }

  // Sender deleted, gone from the organization, or demoted to MEMBER. Falls
  // through to the event's creator and then the owners, which is never an
  // empty list — so a lapsed invitation always reaches somebody who can act.
  // Merged into any bucket that already exists, so an owner who also sent one
  // of these hears once rather than twice.
  for (const orphans of orphaned.values()) {
    const recipients = await eventStaffingRecipients(
      orphans[0].organizationId,
      orphans[0].event.createdById,
    );

    const entries = orphans.map(entryFor);

    for (const recipient of recipients) {
      add(recipient, orphans[0], entries);
    }
  }

  return [...buckets.values()];
}
