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

type RoleCounts = { accepted: number; deciding: number; declined: number };

type Tally = Map<VolunteerRole, RoleCounts>;

/**
 * Every event in the organization, mapped to how many people on each role have
 * said yes, are deciding, or said no.
 */
export async function staffingTallies(
  organizationId: string,
  now: Date,
): Promise<Map<string, Tally>> {
  const rows = await prisma.eventAssignment.groupBy({
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
  });

  const tallies = new Map<string, Tally>();

  for (const row of rows) {
    const tally = tallies.get(row.eventId) ?? new Map<VolunteerRole, RoleCounts>();
    const counts = tally.get(row.role) ?? { accepted: 0, deciding: 0, declined: 0 };

    if (row.status === InvitationStatus.ACCEPTED) {
      counts.accepted += row._count._all;
    } else if (row.status === InvitationStatus.DECLINED) {
      counts.declined += row._count._all;
    } else {
      counts.deciding += row._count._all;
    }

    tally.set(row.role, counts);
    tallies.set(row.eventId, tally);
  }

  return tallies;
}

const NOBODY: RoleCounts = { accepted: 0, deciding: 0, declined: 0 };

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
