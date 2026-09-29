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

/** One service type's four teams. */
export type ServiceTypeTeams = {
  serviceTypeId: string;
  name: string;
  color: string;
  teams: TeamSettings[];
};

export type TeamNotificationSettings = {
  /** Live service types, oldest first. */
  serviceTypes: ServiceTypeTeams[];
  /** Admins and owners, oldest first: everybody who can lead or be copied in. */
  managers: (TeamPerson & { role: OrgRole })[];
};

/**
 * Who leads each team on each service type, and who else hears about it, for
 * the settings screens and the event forms that prefill from them.
 *
 * Read as the alerts read it (lib/notifications/directory.ts): a lead or a
 * watcher who has since been demoted to member doesn't count, so they drop
 * out here too. Their rows stay, and a re-promotion brings them back.
 *
 * Tagged with the member list and the service types as well, because a
 * promotion, a demotion or a new service type changes what this shows
 * without touching either table.
 */
export const getTeamNotificationSettings = async (
  organizationId: string,
): Promise<TeamNotificationSettings> => {
  "use cache";

  cacheLife("hours");
  cacheTag(`org-${organizationId}-team-notifications`);
  cacheTag(`org-${organizationId}-members-list`);
  cacheTag(`org-${organizationId}-st`);

  const [memberships, serviceTypes, leads, watchers] = await Promise.all([
    prisma.membership.findMany({
      where: { organizationId, role: { not: OrgRole.MEMBER } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: {
        role: true,
        user: { select: { id: true, firstName: true, lastName: true } },
      },
    }),
    prisma.serviceType.findMany({
      where: { organizationId, deletedAt: null },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true, name: true, color: true },
    }),
    prisma.teamLead.findMany({
      where: { organizationId, serviceType: { deletedAt: null } },
      select: { serviceTypeId: true, category: true, userId: true },
    }),
    prisma.teamWatcher.findMany({
      where: { organizationId, serviceType: { deletedAt: null } },
      orderBy: { createdAt: "asc" },
      select: { serviceTypeId: true, category: true, userId: true },
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
    serviceTypes: serviceTypes.map((serviceType) => ({
      serviceTypeId: serviceType.id,
      name: serviceType.name,
      color: serviceType.color,
      teams: TEAM_ORDER.map((team) => {
        const leadId =
          leads.find(
            (row) => row.serviceTypeId === serviceType.id && row.category === team,
          )?.userId ?? null;

        const lead = leadId ? person(leadId) : null;

        return {
          team,
          lead,
          watchers: watchers
            .filter(
              (row) =>
                row.serviceTypeId === serviceType.id &&
                row.category === team &&
                row.userId !== lead?.userId,
            )
            .map((row) => person(row.userId))
            .filter((entry): entry is TeamPerson => entry !== null),
        };
      }),
    })),
  };
};

/** Who handles one team on one event. */
export type EventTeamLead = {
  person: TeamPerson;
  /** Handling it for this event only, in place of the service type's lead. */
  cover: boolean;
};

/**
 * Who handles each team on one event, the way the alerts decide it: whoever
 * covers it for this event, else the service type's lead. A team with
 * neither is left out — its open spots go to the event's creator.
 *
 * A cover or a lead who is no longer an admin or owner is skipped, as the
 * alerts skip them.
 */
export const eventTeamLeads = (
  settings: TeamNotificationSettings,
  serviceTypeId: string,
  covers: { category: Team; userId: string }[],
): Partial<Record<Team, EventTeamLead>> => {
  const managers = new Map(
    settings.managers.map((manager) => [
      manager.userId,
      {
        userId: manager.userId,
        firstName: manager.firstName,
        lastName: manager.lastName,
      },
    ]),
  );

  const serviceType = settings.serviceTypes.find(
    (entry) => entry.serviceTypeId === serviceTypeId,
  );

  const result: Partial<Record<Team, EventTeamLead>> = {};

  for (const team of TEAM_ORDER) {
    const coverId = covers.find((cover) => cover.category === team)?.userId;
    const cover = coverId ? managers.get(coverId) : undefined;

    if (cover) {
      result[team] = { person: cover, cover: true };
      continue;
    }

    const lead = serviceType?.teams.find((entry) => entry.team === team)?.lead;

    if (lead) result[team] = { person: lead, cover: false };
  }

  return result;
};
