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

/** One service type's teams. */
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

/** Why somebody is the one asked to fill a team on an event. */
export type InChargeReason = "cover" | "lead" | "creator" | "owner";

/** Who's in charge of one team on one event. Several people only when it falls to the owners. */
export type TeamInCharge = {
  people: TeamPerson[];
  reason: InChargeReason;
};

/** What decides who's in charge on one event — also how an unsaved draft is read. */
type EventStaffing = {
  serviceTypeId: string;
  createdById: string | null;
  covers: { category: Team; userId: string }[];
};

/**
 * Who's in charge of each team on one event — asked to fill its open spots —
 * the way the alerts decide it (`roleOwners` in lib/notifications/audience.ts):
 * whoever covers it on this event, else the service type's lead, else the
 * event's creator, else the owners. Each step counts only an admin or owner,
 * so somebody demoted to member drops out and the next step takes over.
 *
 * A draft that isn't saved yet reads the same way: the person drafting is the
 * creator, and the covers are the ones the draft picks.
 */
export const eventTeamsInCharge = (
  settings: TeamNotificationSettings,
  event: EventStaffing,
): Record<Team, TeamInCharge> => {
  const handlers = eventTeamLeads(settings, event.serviceTypeId, event.covers);

  const person = ({ userId, firstName, lastName }: TeamPerson): TeamPerson => ({
    userId,
    firstName,
    lastName,
  });

  const creator = settings.managers.find(
    (manager) => manager.userId === event.createdById,
  );

  const fallback: TeamInCharge = creator
    ? { people: [person(creator)], reason: "creator" }
    : {
        people: settings.managers
          .filter((manager) => manager.role === OrgRole.OWNER)
          .map(person),
        reason: "owner",
      };

  return Object.fromEntries(
    TEAM_ORDER.map((team): [Team, TeamInCharge] => {
      const handler = handlers[team];

      return [
        team,
        handler
          ? { people: [handler.person], reason: handler.cover ? "cover" : "lead" }
          : fallback,
      ];
    }),
  ) as Record<Team, TeamInCharge>;
};

/** A team one person can staff on one event. */
export type StaffableTeam = {
  team: Team;
  /** In charge of it, or only on its Also notify, as the backup. */
  inCharge: boolean;
  /** Whoever's in charge, so a backup is told who was asked first. */
  handledBy: TeamInCharge;
};

/**
 * The teams one person can staff on one event: the ones they're in charge of,
 * and the ones they're on Also notify for, as a backup. The AI fills these and
 * nothing else — never somebody else's team.
 */
export const staffableTeams = (
  settings: TeamNotificationSettings,
  event: EventStaffing,
  viewerId: string,
): StaffableTeam[] => {
  const inCharge = eventTeamsInCharge(settings, event);

  const teams =
    settings.serviceTypes.find(
      (serviceType) => serviceType.serviceTypeId === event.serviceTypeId,
    )?.teams ?? [];

  return TEAM_ORDER.flatMap((team) => {
    const handledBy = inCharge[team];
    const isInCharge = handledBy.people.some((person) => person.userId === viewerId);
    const isBackup = teams.some(
      (entry) =>
        entry.team === team &&
        entry.watchers.some((watcher) => watcher.userId === viewerId),
    );

    return isInCharge || isBackup ? [{ team, inCharge: isInCharge, handledBy }] : [];
  });
};
