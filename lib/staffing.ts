import "server-only";

import prisma from "@/lib/prisma";
import { InvitationStatus, type VolunteerRole } from "@/generated/prisma/enums";
import { spotsFor, type RoleSpots } from "@/lib/role-spots";

/**
 * Where an event's roster stands — the staffing meter on the All Events list,
 * on the dashboard and the phone alike. Counted in spots, so a role needing
 * three BGVs is three segments and "2 of 3" shows. The counts never overlap,
 * so each spot is exactly one colour.
 */
export type Staffing = {
  /** Every spot the event needs. */
  needed: number;
  /** Spots somebody accepted. */
  filled: number;
  /** Spots somebody is still deciding on, inside their deadline. */
  awaiting: number;
  /** Open spots on a role somebody turned down. */
  declined: number;
};

/**
 * The same, one per role — what app builds from before spot counts read off
 * `filledRoleCount` and friends. A role is filled once every spot on it has
 * somebody who accepted and nobody on it is still deciding.
 */
export type RoleStaffing = Omit<Staffing, "needed">;

/**
 * The event card's meter: one segment per role, however many spots it has, so
 * a big worship team doesn't grow a bar of dots and a glance says which roles
 * are done. Each role takes one colour, worst first — a role with a problem
 * reads red even with others on it accepted, because that is the one to look at.
 * Event pages keep the per-person roster; this is only the card.
 */
export type RoleMeter = {
  /** Roles the event needs. */
  roles: number;
  /** Every spot accepted and nobody on the role still deciding. */
  filled: number;
  /** Somebody still deciding, and no spot left open by a problem. */
  awaiting: number;
  /** A spot left open by somebody who declined, was canceled or let it expire. */
  needsAttention: number;
};

type RoleCounts = {
  accepted: number;
  deciding: number;
  declined: number;
  /** Expired — by the sweep, or past the deadline before it — or canceled. */
  lapsed: number;
};

type Tally = Map<VolunteerRole, RoleCounts>;

/**
 * Every event in the organization, mapped to how many people on each role have
 * said yes, are deciding, or said no.
 */
export async function staffingTallies(
  organizationId: string,
  now: Date,
): Promise<Map<string, Tally>> {
  const [rows, lapsedRows] = await Promise.all([
    prisma.eventAssignment.groupBy({
      by: ["eventId", "role", "status"],
      where: {
        organizationId,
        OR: [
          { status: InvitationStatus.ACCEPTED },
          // Past its deadline is nobody deciding, even before the hourly sweep
          // writes EXPIRED.
          { status: InvitationStatus.PENDING, expiresAt: { gt: now } },
          { status: InvitationStatus.DECLINED },
        ],
      },
      _count: { _all: true },
    }),
    // Its own query: a pending row past its deadline is lapsed, and grouping by
    // status alone can't tell it from one still inside its window.
    prisma.eventAssignment.groupBy({
      by: ["eventId", "role"],
      where: {
        organizationId,
        OR: [
          { status: { in: [InvitationStatus.EXPIRED, InvitationStatus.CANCELED] } },
          { status: InvitationStatus.PENDING, expiresAt: { lte: now } },
        ],
      },
      _count: { _all: true },
    }),
  ]);

  const tallies = new Map<string, Tally>();

  const countsFor = (eventId: string, role: VolunteerRole) => {
    const tally = tallies.get(eventId) ?? new Map<VolunteerRole, RoleCounts>();
    const counts = tally.get(role) ?? { accepted: 0, deciding: 0, declined: 0, lapsed: 0 };
    tally.set(role, counts);
    tallies.set(eventId, tally);
    return counts;
  };

  for (const row of rows) {
    const counts = countsFor(row.eventId, row.role);

    if (row.status === InvitationStatus.ACCEPTED) {
      counts.accepted += row._count._all;
    } else if (row.status === InvitationStatus.DECLINED) {
      counts.declined += row._count._all;
    } else {
      counts.deciding += row._count._all;
    }
  }

  for (const row of lapsedRows) {
    countsFor(row.eventId, row.role).lapsed += row._count._all;
  }

  return tallies;
}

const NOBODY: RoleCounts = { accepted: 0, deciding: 0, declined: 0, lapsed: 0 };

/** One event's spots, from its roles, their counts and its entry in {@link staffingTallies}. */
export function staffingOf(
  rolesNeeded: VolunteerRole[],
  spots: RoleSpots,
  tally: Tally | undefined,
): Staffing {
  const staffing: Staffing = { needed: 0, filled: 0, awaiting: 0, declined: 0 };

  for (const role of new Set(rolesNeeded)) {
    const counts = tally?.get(role) ?? NOBODY;
    const needed = spotsFor(spots, role);
    const filled = Math.min(counts.accepted, needed);
    const awaiting = Math.min(counts.deciding, needed - filled);

    staffing.needed += needed;
    staffing.filled += filled;
    staffing.awaiting += awaiting;
    staffing.declined += Math.min(counts.declined, needed - filled - awaiting);
  }

  return staffing;
}

/** The same event one segment per role, for app builds from before spot counts. */
export function roleStaffingOf(
  rolesNeeded: VolunteerRole[],
  spots: RoleSpots,
  tally: Tally | undefined,
): RoleStaffing {
  const staffing: RoleStaffing = { filled: 0, awaiting: 0, declined: 0 };

  for (const role of new Set(rolesNeeded)) {
    const counts = tally?.get(role) ?? NOBODY;

    if (counts.deciding > 0) {
      staffing.awaiting += 1;
    } else if (counts.accepted >= spotsFor(spots, role)) {
      staffing.filled += 1;
    } else if (counts.declined > 0) {
      staffing.declined += 1;
    }
  }

  return staffing;
}

/**
 * One event's {@link RoleMeter}. Worst first: a spot still open after a
 * decline, cancel or expiry is red whoever else accepted; then anybody
 * deciding is amber; then every spot accepted is green; else grey, nobody
 * asked. A replacement who accepted or is deciding closes the problem, so a
 * role refilled after a decline doesn't stay red.
 */
export function roleMeterOf(
  rolesNeeded: VolunteerRole[],
  spots: RoleSpots,
  tally: Tally | undefined,
): RoleMeter {
  const meter: RoleMeter = { roles: 0, filled: 0, awaiting: 0, needsAttention: 0 };

  for (const role of new Set(rolesNeeded)) {
    const counts = tally?.get(role) ?? NOBODY;
    const needed = spotsFor(spots, role);
    const stillOpen = counts.accepted + counts.deciding < needed;

    meter.roles += 1;

    if (counts.accepted >= needed && counts.deciding === 0) {
      meter.filled += 1;
    } else if (stillOpen && counts.declined + counts.lapsed > 0) {
      meter.needsAttention += 1;
    } else if (counts.deciding > 0) {
      meter.awaiting += 1;
    }
  }

  return meter;
}
