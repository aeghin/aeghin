import "server-only";

import prisma from "@/lib/prisma";
import { InvitationStatus, type RoleCategory as Team } from "@/generated/prisma/enums";
import {
  createTeamFillAgent,
  type TeamAgentViewer,
  type TeamEventDay,
  type TeamScope,
  type TeamSpotPerson,
} from "@/lib/agents/team/agent";
import { ROLE_ORDER, singingVoiceType, teamOfRole } from "@/lib/config/roles";
import { parseRoleSpots, roleStanding } from "@/lib/role-spots";
import { getEventDetailsById } from "@/lib/services/events";
import { getOrganizationTimeZone, getOrgMembersWithUser } from "@/lib/services/organization";
import { getEligibilityByRole } from "@/lib/services/scheduling";
import { getTeamNotificationSettings, staffableTeams } from "@/lib/services/team-notifications";
import { floatingNow, formatDateInZone, hasDateAhead } from "@/lib/time-zone";

/** Why somebody can't fill a team with AI on this event. */
export type TeamAgentRefusal = "not-found" | "over" | "not-yours";

/** Floating wall clock as the day and clock time it was written in. */
const wallClock = (start: Date, end: Date): TeamEventDay => ({
  date: start.toISOString().slice(0, 10),
  startTime: start.toISOString().slice(11, 16),
  endTime: end.toISOString().slice(11, 16),
});

/**
 * The Fill with AI agent for one person on one event, scoped to the teams
 * they can staff there: the ones they're in charge of — their lead, this
 * event's cover, else the creator — and the ones they back up on Also notify.
 * `teams` narrows it to the ones the dialog asked for.
 *
 * Refuses an event that's gone, over, or has no team of theirs. The route
 * checks the plan and that they're an admin or owner first.
 */
export async function buildTeamFillAgent({
  organizationId,
  organizationName,
  eventId,
  viewer,
  teams,
}: {
  organizationId: string;
  organizationName: string;
  eventId: string;
  viewer: TeamAgentViewer;
  teams?: Team[];
}): Promise<
  | { agent: ReturnType<typeof createTeamFillAgent>; teams: Team[] }
  | { refusal: TeamAgentRefusal }
> {
  const [event, settings, members, timeZone] = await Promise.all([
    getEventDetailsById(eventId, organizationId),
    getTeamNotificationSettings(organizationId),
    getOrgMembersWithUser(organizationId),
    getOrganizationTimeZone(organizationId),
  ]);

  if (!event) return { refusal: "not-found" };

  if (!hasDateAhead(event.dates, timeZone)) return { refusal: "over" };

  const rosterRoles = new Set([...event.rolesNeeded, ...event.assignments.map((a) => a.role)]);

  // Only teams with a role on this event: a creator with no leads set staffs
  // every team, and an empty one is nothing to fill.
  const staffable = staffableTeams(
    settings,
    { serviceTypeId: event.serviceTypeId, createdById: event.createdById, covers: event.teamLeads },
    viewer.userId,
  ).filter((s) => [...rosterRoles].some((role) => teamOfRole(role) === s.team));

  const chosen = teams?.length ? staffable.filter((s) => teams.includes(s.team)) : staffable;

  if (chosen.length === 0) return { refusal: "not-yours" };

  const now = new Date();
  const spots = parseRoleSpots(event.roleSpots);

  const statusOf = (a: (typeof event.assignments)[number]): TeamSpotPerson["status"] => {
    if (a.status === InvitationStatus.ACCEPTED) return "accepted";
    if (a.status === InvitationStatus.DECLINED) return "declined";
    if (a.status === InvitationStatus.CANCELED) return "canceled";
    if (a.status === InvitationStatus.PENDING && a.expiresAt > now) return "deciding";
    return "lapsed";
  };

  const scope: TeamScope[] = chosen.map(({ team, inCharge, handledBy }) => ({
    team,
    inCharge,
    inChargeName: handledBy.people.map((p) => `${p.firstName} ${p.lastName}`).join(" and "),
    roles: ROLE_ORDER.filter((role) => teamOfRole(role) === team && rosterRoles.has(role)).map((role) => {
      const standing = roleStanding(role, spots, event.assignments, now);

      return {
        role,
        needed: standing.needed,
        open: standing.open,
        people: event.assignments
          .filter((a) => a.role === role)
          .map((a) => {
            const status = statusOf(a);

            return {
              name: `${a.user.firstName} ${a.user.lastName}${a.userId === viewer.userId ? " (you)" : ""}`,
              status,
              answerBy: status === "deciding" ? formatDateInZone(a.expiresAt, timeZone) : null,
            };
          }),
      };
    }),
  }));

  const scopeRoles = new Set(scope.flatMap((s) => s.roles.map((r) => r.role)));
  const openRoles = scope.flatMap((s) => s.roles.filter((r) => r.open > 0).map((r) => r.role));

  const [eligibility, asked] = await Promise.all([
    openRoles.length > 0
      ? getEligibilityByRole({
          organizationId,
          dates: event.dates,
          roles: openRoles,
          excludeEventId: eventId,
        })
      : Promise.resolve([]),
    // Anyone with a row here at all, a dismissed decline included — never
    // asked again from the AI, as Smart Scheduling never asks them again.
    prisma.eventAssignment.findMany({ where: { eventId }, select: { userId: true } }),
  ]);

  const live = (a: (typeof event.assignments)[number]) =>
    a.status === InvitationStatus.ACCEPTED ||
    (a.status === InvitationStatus.PENDING && a.expiresAt > now);

  const agent = createTeamFillAgent({
    orgName: organizationName,
    viewer,
    today: floatingNow(timeZone).toISOString().slice(0, 10),
    event: {
      name: event.name,
      serviceTypeName: event.serviceType.name,
      days: event.dates.map((d) => wallClock(d.startTime, d.endTime)),
      location: event.location,
      rehearsal:
        event.rehearsalStart && event.rehearsalEnd
          ? wallClock(event.rehearsalStart, event.rehearsalEnd)
          : null,
    },
    scope,
    eligibility,
    alreadyAsked: new Set(asked.map((a) => a.userId)),
    elsewhere: event.assignments
      .filter((a) => live(a) && !scopeRoles.has(a.role))
      .map((a) => ({ name: `${a.user.firstName} ${a.user.lastName}${a.userId === viewer.userId ? " (you)" : ""}`, role: a.role })),
    roster: members.map((m) => ({
      userId: m.userId,
      name: `${m.user.firstName} ${m.user.lastName}`,
      volunteerRoles: m.volunteerRoles,
      voiceType: singingVoiceType(m.volunteerRoles, m.voiceType),
    })),
  });

  return { agent, teams: chosen.map((s) => s.team) };
}
