import "server-only";

import prisma from "@/lib/prisma";
import { InvitationStatus, type VolunteerRole } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import type { LapsedInvite } from "@/components/email/event-invite-expired-template";
import { teamOfRole, volunteerRoleConfig } from "@/lib/config/roles";
import {
  reasonLine,
  roleAudience,
  type Addressee,
  type Person,
} from "@/lib/notifications/audience";
import { directoriesFor } from "@/lib/notifications/directory";

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
      .map((role) => volunteerRoleConfig[role].label),
    waitingOn: waiting.map((row) => ({
      inviteeName: `${row.user.firstName} ${row.user.lastName}`,
      roleLabel: volunteerRoleConfig[row.role].label,
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
  recipient: Person;
  /** "You're receiving this because …", for the first lapse they own, else the first they're copied on. */
  footer: string;
  /** Whether any lapse here is theirs to act on, rather than a heads-up. */
  owns: boolean;
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

/** The push's body: whose invitation lapsed, and who has it when that isn't them. */
export function lapseBody(lapsed: LapsedInvite[]) {
  const what =
    lapsed.length === 1
      ? `${lapsed[0].inviteeName}'s invitation expired without an answer.`
      : `${lapsed.length} invitations expired without an answer.`;

  const headsUps = [...new Set(lapsed.map((item) => item.headsUp ?? null))];

  // Only when none of it is theirs: a heads-up on one line of several they
  // own reads as though the whole push were somebody else's.
  if (headsUps.includes(null)) return what;

  return headsUps.length === 1
    ? `${what} ${headsUps[0]}`
    : `${what} Others have been asked to fill them.`;
}

/**
 * Who hears about which lapsed invitations: one bucket per person per event.
 *
 * Each lapse is owned by whoever covers its team on the event, else the
 * team's lead for the event's service type, else the event's creator, else
 * the owners — and copies in the team's "Also notify" and whoever sent the
 * invitation (lib/notifications/audience.ts). A creator with five lapses on
 * one event hears once, listing five roles; a band lead hears about the
 * band's and not the ushers'.
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
          serviceTypeId: true,
          dates: { select: { startTime: true, endTime: true } },
          teamLeads: { select: { category: true, userId: true } },
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

  const directoryFor = directoriesFor();

  const buckets = new Map<string, LapseBucket>();

  const add = (
    { person, reason }: Addressee,
    row: (typeof open)[number],
    headsUp: string | null,
    organizationName: string,
    serviceTypeName: string | null,
  ) => {
    const lapse: Lapse = {
      inviteeName: `${row.user.firstName} ${row.user.lastName}`,
      roleLabel: volunteerRoleConfig[row.role].label,
      assignmentId: row.id,
      lapsedAt: row.lapsedAt,
      headsUp,
    };

    const footer = reasonLine(reason, organizationName, row.role, serviceTypeName);
    const key = `${row.event.id}:${person.email}`;
    const existing = buckets.get(key);

    if (!existing) {
      buckets.set(key, {
        recipient: person,
        footer,
        owns: headsUp === null,
        organizationId: row.organizationId,
        organizationName: row.organization.name,
        logoUrl: row.organization.logoUrl,
        eventId: row.event.id,
        eventName: row.event.name,
        dates: row.event.dates,
        lapsed: [lapse],
      });
      return;
    }

    existing.lapsed.push(lapse);

    // The footer names the reason they own something, when they do.
    if (headsUp === null && !existing.owns) {
      existing.owns = true;
      existing.footer = footer;
    }
  };

  for (const row of open) {
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

    const serviceTypeName =
      directory.serviceTypeNames.get(row.event.serviceTypeId) ?? null;

    for (const owner of audience.owners) {
      add(owner, row, null, directory.organizationName, serviceTypeName);
    }

    for (const copied of audience.copied) {
      add(copied, row, audience.headsUp, directory.organizationName, serviceTypeName);
    }
  }

  return [...buckets.values()];
}
