import "server-only";

import prisma from "@/lib/prisma";
import { cacheLife, cacheTag } from "next/cache";
import { OrgRole, type RoleCategory as Team } from "@/generated/prisma/enums";
import { TEAM_ORDER } from "@/lib/config/roles";

export type TeamPerson = {
  userId: string;
  firstName: string;
  lastName: string;
};

export type TeamSettings = {
  team: Team;
  /** Asked to act when one of the team's roles opens up. */
  lead: TeamPerson | null;
  /** "Also notify": copied in for a heads-up. Never repeats the lead. */
  watchers: TeamPerson[];
};

export type TeamNotificationSettings = {
  teams: TeamSettings[];
  /** Admins and owners, oldest first: everybody who can lead or be copied in. */
  managers: (TeamPerson & { role: OrgRole })[];
};

/**
 * Who leads each team and who else hears about it, for the settings screens.
 *
 * Read as the alerts read it (lib/notifications/directory.ts): a lead or a
 * watcher who has since been demoted to member doesn't count, so they drop
 * out here too. Their rows stay, and a re-promotion brings them back.
 *
 * Tagged with the member list as well, because a promotion or demotion
 * changes who counts without touching either table.
 */
export const getTeamNotificationSettings = async (
  organizationId: string,
): Promise<TeamNotificationSettings> => {
  "use cache";

  cacheLife("hours");
  cacheTag(`org-${organizationId}-team-notifications`);
  cacheTag(`org-${organizationId}-members-list`);

  const [memberships, leads, watchers] = await Promise.all([
    prisma.membership.findMany({
      where: { organizationId, role: { not: OrgRole.MEMBER } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: {
        role: true,
        user: { select: { id: true, firstName: true, lastName: true } },
      },
    }),
    prisma.teamLead.findMany({
      where: { organizationId },
      select: { category: true, userId: true },
    }),
    prisma.teamWatcher.findMany({
      where: { organizationId },
      orderBy: { createdAt: "asc" },
      select: { category: true, userId: true },
    }),
  ]);

  const managers = memberships.map(({ role, user }) => ({
    userId: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    role,
  }));

  const byId = new Map(managers.map((person) => [person.userId, person]));

  const person = (userId: string): TeamPerson | null => {
    const found = byId.get(userId);

    return found
      ? { userId: found.userId, firstName: found.firstName, lastName: found.lastName }
      : null;
  };

  return {
    managers,
    teams: TEAM_ORDER.map((team) => {
      const leadId = leads.find((row) => row.category === team)?.userId ?? null;
      const lead = leadId ? person(leadId) : null;

      return {
        team,
        lead,
        watchers: watchers
          .filter((row) => row.category === team && row.userId !== lead?.userId)
          .map((row) => person(row.userId))
          .filter((entry): entry is TeamPerson => entry !== null),
      };
    }),
  };
};

/** Whether one person is watching one event. */
export const isWatchingEvent = async (
  eventId: string,
  userId: string,
): Promise<boolean> => {
  "use cache";

  cacheLife("hours");
  cacheTag(`event-${eventId}-watch-${userId}`);

  const row = await prisma.eventWatcher.findUnique({
    where: { eventId_userId: { eventId, userId } },
    select: { id: true },
  });

  return row !== null;
};
