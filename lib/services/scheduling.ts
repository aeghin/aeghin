import "server-only";

import prisma from "@/lib/prisma";
import { InvitationStatus, VolunteerRole } from "@/generated/prisma/enums";
import { getBlockedUserIds, getBlockoutsForDates } from "@/lib/services/blockouts";
import { getOrganizationTimeZone } from "@/lib/services/organization";
import { floatingNow } from "@/lib/time-zone";
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
      /** Accepted or still deciding on this event. */
      alreadyOn: number;
      /** Asked here already and not on it: declined, lapsed or removed. */
      alreadyAsked: number;
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

  // Anyone with a row here is skipped, whatever it says: somebody who
  // declined, let it lapse or was removed is never auto-invited back.
  const existing = await prisma.eventAssignment.findMany({
    where: { eventId },
    select: { userId: true, status: true, expiresAt: true },
  });
  const excluded = new Set<string>([
    ...excludeUserIds,
    ...existing.map((e) => e.userId),
  ]);

  // Which of them are actually on the event, so the breakdown doesn't call
  // somebody who said no "already on this event".
  const now = new Date();
  const onEvent = new Set(
    existing
      .filter(
        (e) =>
          e.status === InvitationStatus.ACCEPTED ||
          (e.status === InvitationStatus.PENDING && e.expiresAt > now),
      )
      .map((e) => e.userId),
  );

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
    let alreadyOn = 0;
    let alreadyAsked = 0;
    let conflictingCount = 0;
    let blockedCount = 0;

    for (const m of candidates) {
      if (onEvent.has(m.user.id)) alreadyOn += 1;
      else if (excluded.has(m.user.id)) alreadyAsked += 1;
      else if (conflicting.has(m.user.id)) conflictingCount += 1;
      else blockedCount += 1;
    }

    return {
      status: "ALL_UNAVAILABLE",
      qualified: candidates.length,
      alreadyOn,
      alreadyAsked,
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
  // "Already started" on the organization's clock, which event times are
  // written in — a floating time, compared with floating times.
  const now = floatingNow(await getOrganizationTimeZone(organizationId));
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
 * How many events ahead each member is already on — said yes, or still inside
 * their window to answer — so a pick can see who's booked solid.
 *
 * Kept apart from `getRecentServeCounts` on purpose: a booking isn't a serve,
 * and fatigue stays what has actually happened. This is the other half of a
 * fair rotation, the weeks still to come. `excludeEventId` leaves out the
 * event being staffed, or everyone already on it would count it.
 */
export async function getUpcomingCounts(
  organizationId: string,
  windowDays: number,
  excludeEventId?: string,
): Promise<Map<string, number>> {
  // "Ahead" on the organization's clock, which event times are written in.
  const now = floatingNow(await getOrganizationTimeZone(organizationId));
  const until = new Date(now.getTime() + windowDays * DAY_MS);

  const rows = await prisma.eventAssignment.groupBy({
    by: ["userId"],
    where: {
      organizationId,
      ...(excludeEventId ? { eventId: { not: excludeEventId } } : {}),
      OR: [
        { status: InvitationStatus.ACCEPTED },
        { status: InvitationStatus.PENDING, expiresAt: { gt: new Date() } },
      ],
      event: { dates: { some: { startTime: { gte: now, lte: until } } } },
    },
    _count: { _all: true },
  });

  // One row per person per event, so the count is events.
  return new Map(rows.map((row) => [row.userId, row._count._all]));
}

/**
 * The full scheduling picture for a set of candidate days, one entry per role.
 *
 * Ranking deliberately mirrors `findBestReplacement` — Laplace-smoothed
 * acceptance, then proven volume — so the automatic floor here is the same
 * member smart scheduling would have picked. `recentServes`, `lastServedOn` and
 * `upcoming` ride along so a caller can deviate for rotation and say why.
 *
 * Everyone free comes back unless a caller caps it: a list cut at the most
 * reliable few hides every newer member, who then never gets picked and never
 * builds the record that would rank them.
 *
 * Exclusions come back named and reasoned rather than silently filtered: a
 * caller that can't see *who* was dropped and why will invent an explanation.
 */
export async function getEligibilityByRole(params: {
  organizationId: string;
  dates: DateRange[];
  roles: VolunteerRole[];
  /** A cap per role. Left out, everyone free comes back. */
  maxPerRole?: number;
  recentWindowDays?: number;
  /** The event being staffed, once it exists: its own roster is neither a clash nor a booking. */
  excludeEventId?: string;
}): Promise<RoleEligibility[]> {
  const {
    organizationId,
    dates,
    roles,
    maxPerRole = Infinity,
    recentWindowDays = 60,
    excludeEventId,
  } = params;

  if (dates.length === 0 || roles.length === 0) {
    return roles.map((role) => ({
      role,
      eligible: [],
      excluded: [],
      totalQualified: 0,
    }));
  }

  const [conflictRows, blockoutRows, memberships, acceptance, recent, upcoming] =
    await Promise.all([
      getConflictingAssignments(organizationId, dates, excludeEventId),
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
      getUpcomingCounts(organizationId, recentWindowDays, excludeEventId),
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
          accepted,
          responded,
          recentServes: serve?.count ?? 0,
          lastServedOn: serve?.lastServedOn
            ? toDateOnly(serve.lastServedOn)
            : null,
          upcoming: upcoming.get(m.user.id) ?? 0,
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
