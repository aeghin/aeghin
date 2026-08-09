import "server-only";

import prisma from "@/lib/prisma";
import { InvitationStatus, VolunteerRole } from "@/generated/prisma/enums";
import { getBlockedUserIds } from "@/lib/services/blockouts";

type DateRange = { startTime: Date | string; endTime: Date | string };

// `excludeEventId` skips one event's own assignments. Callers checking
// availability for an event that already exists must pass it, or everyone
// already on the roster comes back conflicting with themselves.
export async function getConflictingAssignments(
  organizationId: string,
  dates: DateRange[],
  excludeEventId?: string,
) {
  const overlapConditions = dates.map(({ startTime, endTime }) => ({
    event: {
      dates: {
        some: {
          startTime: { lt: new Date(endTime) },
          endTime: { gt: new Date(startTime) },
        },
      },
    },
  }));

  return prisma.eventAssignment.findMany({
    where: {
      organizationId,
      ...(excludeEventId ? { eventId: { not: excludeEventId } } : {}),
      AND: [
        {
          OR: [
            { status: InvitationStatus.ACCEPTED },
            {
              status: InvitationStatus.PENDING,
              expiresAt: { gt: new Date() },
            },
          ],
        },
        { OR: overlapConditions },
      ],
    },
    select: {
      userId: true,
      event: {
        select: {
          name: true,
          dates: { select: { startTime: true, endTime: true } },
        },
      },
    },
  });
}


export async function getConflictingUserIds(
  organizationId: string,
  dates: DateRange[],
  excludeEventId?: string,
): Promise<Set<string>> {
  if (dates.length === 0) return new Set();
  const rows = await getConflictingAssignments(organizationId, dates, excludeEventId);
  return new Set(rows.map((r) => r.userId));
}

async function getAcceptanceCounts(organizationId: string) {
  const grouped = await prisma.eventAssignment.groupBy({
    by: ["userId", "status"],
    where: {
      organizationId,
      status: { in: [InvitationStatus.ACCEPTED, InvitationStatus.DECLINED] },
    },
    _count: { _all: true },
  });

  const counts = new Map<string, { accepted: number; declined: number }>();
  for (const row of grouped) {
    const entry = counts.get(row.userId) ?? { accepted: 0, declined: 0 };
    if (row.status === InvitationStatus.ACCEPTED) entry.accepted = row._count._all;
    else entry.declined = row._count._all;
    counts.set(row.userId, entry);
  }
  return counts;
}

export type ReplacementCandidate = {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
};

export type ReplacementOutcome =
  | { status: "FOUND"; candidate: ReplacementCandidate }
  | { status: "EVENT_MISSING" }
  | { status: "NO_QUALIFIED_MEMBERS" }
  | {
      status: "ALL_UNAVAILABLE";
      qualified: number;
      alreadyAssigned: number;
      conflicting: number;
      blocked: number;
    };


export async function findBestReplacement(params: {
  organizationId: string;
  eventId: string;
  declinedRole: VolunteerRole;
  excludeUserIds?: string[];
}): Promise<ReplacementOutcome> {
  const { organizationId, eventId, declinedRole, excludeUserIds = [] } = params;

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { dates: { select: { startTime: true, endTime: true } } },
  });
  if (!event) return { status: "EVENT_MISSING" };

  const existing = await prisma.eventAssignment.findMany({
    where: { eventId },
    select: { userId: true },
  });
  const excluded = new Set<string>([
    ...excludeUserIds,
    ...existing.map((e) => e.userId),
  ]);

  const [conflicting, blocked, candidates] = await Promise.all([
    getConflictingUserIds(organizationId, event.dates),
    getBlockedUserIds(organizationId, event.dates),
    prisma.membership.findMany({
      where: {
        organizationId,
        volunteerRoles: { has: declinedRole },
      },
      select: {
        createdAt: true,
        user: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
      },
    }),
  ]);

  if (candidates.length === 0) return { status: "NO_QUALIFIED_MEMBERS" };

  const eligible = candidates.filter(
    (m) =>
      !excluded.has(m.user.id) &&
      !conflicting.has(m.user.id) &&
      !blocked.has(m.user.id),
  );

  if (eligible.length === 0) {
    let alreadyAssigned = 0;
    let conflictingCount = 0;
    let blockedCount = 0;

    for (const m of candidates) {
      if (excluded.has(m.user.id)) alreadyAssigned += 1;
      else if (conflicting.has(m.user.id)) conflictingCount += 1;
      else blockedCount += 1;
    }

    return {
      status: "ALL_UNAVAILABLE",
      qualified: candidates.length,
      alreadyAssigned,
      conflicting: conflictingCount,
      blocked: blockedCount,
    };
  }

  const counts = await getAcceptanceCounts(organizationId);

  const ranked = eligible
    .map((m) => {
      const { accepted, declined } = counts.get(m.user.id) ?? {
        accepted: 0,
        declined: 0,
      };
      const total = accepted + declined;
      // Laplace smoothing: no-history members sit at 0.5.
      const rate = (accepted + 1) / (total + 2);
      return { member: m, rate, total };
    })
    .sort((a, b) => {
      if (b.rate !== a.rate) return b.rate - a.rate; // higher acceptance first
      if (b.total !== a.total) return b.total - a.total; // more proven first
      return a.member.createdAt.getTime() - b.member.createdAt.getTime();
    });

  const best = ranked[0].member.user;
  return {
    status: "FOUND",
    candidate: {
      userId: best.id,
      email: best.email,
      firstName: best.firstName,
      lastName: best.lastName,
    },
  };
}
