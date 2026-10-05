import "server-only";

import prisma from "@/lib/prisma";
import { InvitationStatus, type VolunteerRole } from "@/generated/prisma/enums";

/**
 * Where an event's roster stands, role by role — the staffing meter on the
 * All Events list, on the dashboard and the phone alike. The three counts
 * never overlap, so each role is exactly one colour.
 */
export type Staffing = {
  /**
   * Somebody accepted and nobody on the role is still deciding. The bell's
   * "fully staffed" test, per role: three BGVs invited and one accepted is not
   * filled until the other two answer.
   */
  filled: number;
  /** Somebody on the role is still deciding, inside their deadline. */
  awaiting: number;
  /** Somebody declined, and nobody has accepted or is deciding in their place. */
  declined: number;
};

type Tally = {
  confirmed: Set<VolunteerRole>;
  deciding: Set<VolunteerRole>;
  declined: Set<VolunteerRole>;
};

/**
 * Every event in the organization, mapped to which of its roles somebody has
 * said yes, is deciding, or said no to. Grouping by role rather than counting
 * rows keeps two guitarists from reading as a filled drum stool.
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
    const tally = tallies.get(row.eventId) ?? {
      confirmed: new Set<VolunteerRole>(),
      deciding: new Set<VolunteerRole>(),
      declined: new Set<VolunteerRole>(),
    };

    if (row.status === InvitationStatus.ACCEPTED) {
      tally.confirmed.add(row.role);
    } else if (row.status === InvitationStatus.DECLINED) {
      tally.declined.add(row.role);
    } else {
      tally.deciding.add(row.role);
    }

    tallies.set(row.eventId, tally);
  }

  return tallies;
}

/** One event's counts, from its roles and its entry in {@link staffingTallies}. */
export function staffingOf(
  rolesNeeded: VolunteerRole[],
  tally: Tally | undefined,
): Staffing {
  const confirmed = (role: VolunteerRole) => tally?.confirmed.has(role) ?? false;
  const deciding = (role: VolunteerRole) => tally?.deciding.has(role) ?? false;
  const declined = (role: VolunteerRole) => tally?.declined.has(role) ?? false;

  return {
    filled: rolesNeeded.filter((role) => confirmed(role) && !deciding(role)).length,
    awaiting: rolesNeeded.filter(deciding).length,
    declined: rolesNeeded.filter(
      (role) => declined(role) && !confirmed(role) && !deciding(role),
    ).length,
  };
}
