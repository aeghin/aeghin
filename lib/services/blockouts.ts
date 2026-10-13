import "server-only";

import prisma from "@/lib/prisma";
import { cacheLife, cacheTag } from "next/cache";
import type { VolunteerRole } from "@/generated/prisma/enums";
import { volunteerRoleConfig } from "@/lib/config/roles";
import { parseRoleSpots, rosterStandings } from "@/lib/role-spots";
import { getOrganizationTimeZone } from "@/lib/services/organization";
import { floatingNow } from "@/lib/time-zone";

type DateRange = { startTime: Date | string; endTime: Date | string };

const DAY_MS = 24 * 60 * 60 * 1000;

/** How far ahead the team view looks. */
const TEAM_WINDOW_DAYS = 60;

export type TeamBlockoutPerson = {
  userId: string;
  firstName: string;
  lastName: string;
  userImageUrl: string | null;
};

/**
 * One stretch of days and everybody away for exactly that stretch, with what
 * it costs: an event inside it that still has an open spot on a role nobody
 * who plays it is free to fill, at least one of them being away here.
 */
export type TeamBlockout = {
  /** First and last day, inclusive, each at its floating midnight. */
  startDate: Date;
  endDate: Date;
  people: TeamBlockoutPerson[];
  gaps: { eventId: string; text: string }[];
};

/** A blockout [start..end] runs from its first midnight to the one after its last day. */
const overlaps = (blockout: { startDate: Date; endDate: Date }, dates: DateRange[]) =>
  dates.some(
    ({ startTime, endTime }) =>
      blockout.startDate < new Date(endTime) &&
      blockout.endDate.getTime() > new Date(startTime).getTime() - DAY_MS,
  );


export const getUserBlockouts = async (
  userId: string,
  organizationId: string,
) => {
  "use cache";

  cacheLife("minutes");
  cacheTag(`user-${userId}-blockouts-${organizationId}`);
  cacheTag(`org-${organizationId}-details`);

  // A blockout's last day is inclusive and stored as its floating midnight, so
  // it runs until the next midnight on the organization's clock.
  const today = floatingNow(await getOrganizationTimeZone(organizationId));

  const blockouts = await prisma.blockoutDate.findMany({
    where: {
      userId,
      organizationId,
      endDate: { gt: new Date(today.getTime() - DAY_MS) },
    },
    orderBy: { startDate: "asc" },
    select: {
      id: true,
      startDate: true,
      endDate: true,
    },
  });

  return blockouts;
};


export async function getBlockoutsForDates(
  organizationId: string,
  dates: DateRange[],
) {
  if (dates.length === 0) return [];

  const overlapConditions = dates.map(({ startTime, endTime }) => ({
    startDate: { lt: new Date(endTime) },
    endDate: { gt: new Date(new Date(startTime).getTime() - DAY_MS) },
  }));

  return prisma.blockoutDate.findMany({
    where: {
      organizationId,
      OR: overlapConditions,
    },
    select: {
      userId: true,
      startDate: true,
      endDate: true,
    },
  });
}

export async function getBlockedUserIds(
  organizationId: string,
  dates: DateRange[],
): Promise<Set<string>> {
  if (dates.length === 0) return new Set();
  const rows = await getBlockoutsForDates(organizationId, dates);
  return new Set(rows.map((r) => r.userId));
}

/**
 * Who in the organization is away in the next {@link TEAM_WINDOW_DAYS} days,
 * grouped by identical stretches — owners and admins only, the caller checks.
 *
 * Gaps read the same open-spot rule as the staffing meter and alerts
 * (`rosterStandings`): a role with a spot nobody has accepted or is deciding
 * on, where everyone holding that role is blocked out across the event.
 */
export const getTeamBlockouts = async (organizationId: string): Promise<TeamBlockout[]> => {
  "use cache";

  cacheLife("minutes");
  cacheTag(`org-${organizationId}-blockouts`);
  // Gaps move with answers and invites, and with who holds which role.
  cacheTag(`org-${organizationId}-events`);
  cacheTag(`org-${organizationId}-members-list`);

  const today = floatingNow(await getOrganizationTimeZone(organizationId));
  const windowEnd = new Date(today.getTime() + TEAM_WINDOW_DAYS * DAY_MS);

  const [blockouts, members, events] = await Promise.all([
    prisma.blockoutDate.findMany({
      where: {
        organizationId,
        endDate: { gt: new Date(today.getTime() - DAY_MS) },
        startDate: { lt: windowEnd },
      },
      orderBy: [{ startDate: "asc" }, { endDate: "asc" }],
      select: {
        userId: true,
        startDate: true,
        endDate: true,
        user: { select: { firstName: true, lastName: true, userImageUrl: true } },
      },
    }),
    prisma.membership.findMany({
      where: { organizationId },
      select: { userId: true, volunteerRoles: true },
    }),
    prisma.event.findMany({
      where: {
        organizationId,
        dates: { some: { endTime: { gte: today }, startTime: { lt: windowEnd } } },
      },
      select: {
        id: true,
        name: true,
        rolesNeeded: true,
        roleSpots: true,
        dates: { select: { startTime: true, endTime: true } },
        assignments: { select: { role: true, status: true, expiresAt: true } },
      },
    }),
  ]);

  const groups = new Map<string, TeamBlockout>();

  for (const blockout of blockouts) {
    const key = `${blockout.startDate.getTime()}-${blockout.endDate.getTime()}`;
    const group = groups.get(key) ?? {
      startDate: blockout.startDate,
      endDate: blockout.endDate,
      people: [],
      gaps: [],
    };

    if (!group.people.some((person) => person.userId === blockout.userId)) {
      group.people.push({ userId: blockout.userId, ...blockout.user });
    }

    groups.set(key, group);
  }

  const players = new Map<VolunteerRole, string[]>();

  for (const member of members) {
    for (const role of member.volunteerRoles) {
      players.set(role, [...(players.get(role) ?? []), member.userId]);
    }
  }

  // Deadlines are real instants, so open spots are counted against the real clock.
  const now = new Date();

  for (const event of events) {
    const away = new Set(
      blockouts.filter((blockout) => overlaps(blockout, event.dates)).map((b) => b.userId),
    );

    if (away.size === 0) continue;

    const standings = rosterStandings(
      event.rolesNeeded,
      parseRoleSpots(event.roleSpots),
      event.assignments,
      now,
    );

    for (const { role, open } of standings) {
      const holders = players.get(role) ?? [];

      // Nobody holding the role at all is a roster problem, not an absence.
      if (open === 0 || holders.length === 0 || !holders.every((id) => away.has(id))) continue;

      const text = `${volunteerRoleConfig[role].label} needed for ${event.name}`;

      for (const group of groups.values()) {
        if (
          overlaps(group, event.dates) &&
          group.people.some((person) => holders.includes(person.userId)) &&
          !group.gaps.some((gap) => gap.text === text)
        ) {
          group.gaps.push({ eventId: event.id, text });
        }
      }
    }
  }

  return [...groups.values()];
};
