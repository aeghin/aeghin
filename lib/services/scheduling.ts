import "server-only";

import prisma from "@/lib/prisma";
import { InvitationStatus, VolunteerRole } from "@/generated/prisma/enums";
import { getBlockedUserIds, getBlockoutsForDates } from "@/lib/services/blockouts";
import type {
  RoleCandidate,
  RoleEligibility,
  RoleExclusion,
} from "@/lib/types";

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

export async function getAcceptanceCounts(organizationId: string) {
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


const DAY_MS = 24 * 60 * 60 * 1000;

/** Blockouts and event days are stored as floating UTC, so slice in UTC. */
const toDateOnly = (d: Date) => d.toISOString().slice(0, 10);

/**
 * How often each member has actually served recently, and when they last did.
 *
 * Only ACCEPTED assignments on events that already started count — a pending
 * invitation isn't a serve, and a future booking isn't fatigue. This is the
 * rotation signal `findBestReplacement` has no notion of: it ranks purely on
 * reliability, so left alone it will pick the same dependable member forever.
 */
export async function getRecentServeCounts(
  organizationId: string,
  sinceDays: number,
): Promise<Map<string, { count: number; lastServedOn: Date | null }>> {
  const now = new Date();
  const since = new Date(now.getTime() - sinceDays * DAY_MS);

  const rows = await prisma.eventAssignment.findMany({
    where: {
      organizationId,
      status: InvitationStatus.ACCEPTED,
      event: { dates: { some: { startTime: { gte: since, lte: now } } } },
    },
    select: {
      userId: true,
      event: {
        select: {
          dates: {
            where: { startTime: { gte: since, lte: now } },
            select: { startTime: true },
          },
        },
      },
    },
  });

  const counts = new Map<string, { count: number; lastServedOn: Date | null }>();

  for (const row of rows) {
    const entry = counts.get(row.userId) ?? { count: 0, lastServedOn: null };
    entry.count += 1;

    for (const { startTime } of row.event.dates) {
      if (entry.lastServedOn === null || startTime > entry.lastServedOn) {
        entry.lastServedOn = startTime;
      }
    }

    counts.set(row.userId, entry);
  }

  return counts;
}

/**
 * The full scheduling picture for a set of candidate days, one entry per role.
 *
 * Ranking deliberately mirrors `findBestReplacement` — Laplace-smoothed
 * acceptance, then proven volume — so the automatic floor here is the same
 * member smart scheduling would have picked. `recentServes`/`lastServedOn` ride
 * along so a caller can deviate for rotation and say why.
 *
 * Exclusions come back named and reasoned rather than silently filtered: a
 * caller that can't see *who* was dropped and why will invent an explanation.
 */
export async function getEligibilityByRole(params: {
  organizationId: string;
  dates: DateRange[];
  roles: VolunteerRole[];
  maxPerRole?: number;
  recentWindowDays?: number;
}): Promise<RoleEligibility[]> {
  const {
    organizationId,
    dates,
    roles,
    maxPerRole = 8,
    recentWindowDays = 60,
  } = params;

  if (dates.length === 0 || roles.length === 0) {
    return roles.map((role) => ({
      role,
      eligible: [],
      excluded: [],
      totalQualified: 0,
    }));
  }

  const [conflictRows, blockoutRows, memberships, acceptance, recent] =
    await Promise.all([
      getConflictingAssignments(organizationId, dates),
      getBlockoutsForDates(organizationId, dates),
      prisma.membership.findMany({
        where: { organizationId, volunteerRoles: { hasSome: roles } },
        select: {
          createdAt: true,
          volunteerRoles: true,
          user: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      getAcceptanceCounts(organizationId),
      getRecentServeCounts(organizationId, recentWindowDays),
    ]);

  const conflictBy = new Map<string, string>();
  for (const row of conflictRows) {
    if (!conflictBy.has(row.userId)) conflictBy.set(row.userId, row.event.name);
  }

  const blockoutBy = new Map<string, string>();
  for (const row of blockoutRows) {
    if (!blockoutBy.has(row.userId)) {
      blockoutBy.set(
        row.userId,
        `${toDateOnly(row.startDate)} to ${toDateOnly(row.endDate)}`,
      );
    }
  }

  return roles.map((role) => {
    const qualified = memberships.filter((m) =>
      m.volunteerRoles.includes(role),
    );

    const ranked: { candidate: RoleCandidate; rate: number; joined: number }[] =
      [];
    const excluded: RoleExclusion[] = [];

    for (const m of qualified) {
      const name = `${m.user.firstName} ${m.user.lastName}`;

      const conflict = conflictBy.get(m.user.id);
      if (conflict) {
        excluded.push({
          userId: m.user.id,
          name,
          reason: "conflict",
          detail: conflict,
        });
        continue;
      }

      const blockout = blockoutBy.get(m.user.id);
      if (blockout) {
        excluded.push({
          userId: m.user.id,
          name,
          reason: "blockout",
          detail: blockout,
        });
        continue;
      }

      const { accepted, declined } = acceptance.get(m.user.id) ?? {
        accepted: 0,
        declined: 0,
      };
      const responded = accepted + declined;
      // Laplace smoothing: no-history members sit at 0.5.
      const rate = (accepted + 1) / (responded + 2);
      const serve = recent.get(m.user.id);

      ranked.push({
        rate,
        joined: m.createdAt.getTime(),
        candidate: {
          userId: m.user.id,
          name,
          // Rounded for display only — the sort below uses full precision, so
          // this stays consistent with findBestReplacement's ordering.
          reliability: Math.round(rate * 100) / 100,
          responded,
          recentServes: serve?.count ?? 0,
          lastServedOn: serve?.lastServedOn
            ? toDateOnly(serve.lastServedOn)
            : null,
        },
      });
    }

    ranked.sort((a, b) => {
      if (b.rate !== a.rate) return b.rate - a.rate;
      if (b.candidate.responded !== a.candidate.responded) {
        return b.candidate.responded - a.candidate.responded;
      }
      if (a.candidate.recentServes !== b.candidate.recentServes) {
        return a.candidate.recentServes - b.candidate.recentServes;
      }
      return a.joined - b.joined;
    });

    return {
      role,
      eligible: ranked.slice(0, maxPerRole).map((r) => r.candidate),
      excluded,
      totalQualified: qualified.length,
    };
  });
}
