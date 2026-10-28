import "server-only";

import { OrgRole } from "@/generated/prisma/enums";
import { createEventDraftAgent, type AgentTeamLeads, type AgentViewer } from "@/lib/agents/event/agent";
import { singingVoiceType } from "@/lib/config/roles";
import { getOrgEventTemplates } from "@/lib/services/event-templates";
import { getOrgMembersWithUser } from "@/lib/services/organization";
import { getEligibilityByRole } from "@/lib/services/scheduling";
import { getOrgServiceTypes } from "@/lib/services/service-types";
import { getTeamNotificationSettings } from "@/lib/services/team-notifications";

/**
 * The event-draft agent with everything it reads, for the web and phone
 * routes alike: the org's service types, templates and members, and who leads
 * each team — so a draft only picks people for the teams the person drafting
 * staffs. Null when the org has no service type to file an event under.
 */
export async function buildEventDraftAgent({
  organizationId,
  organizationName,
  viewer,
  today,
}: {
  organizationId: string;
  organizationName: string;
  viewer: AgentViewer;
  today: string;
}) {
  const [serviceTypes, templates, members, settings] = await Promise.all([
    getOrgServiceTypes(organizationId),
    getOrgEventTemplates(organizationId),
    getOrgMembersWithUser(organizationId),
    getTeamNotificationSettings(organizationId),
  ]);

  if (serviceTypes.length === 0) return null;

  // A lead who's the person drafting is just "you": their team is theirs.
  const teamLeads: AgentTeamLeads = Object.fromEntries(
    settings.serviceTypes.map((serviceType) => [
      serviceType.serviceTypeId,
      Object.fromEntries(
        serviceType.teams.flatMap(({ team, lead }) =>
          lead && lead.userId !== viewer.userId
            ? [[team, { userId: lead.userId, name: `${lead.firstName} ${lead.lastName}` }]]
            : [],
        ),
      ),
    ]),
  );

  return createEventDraftAgent({
    orgName: organizationName,
    viewer,
    today,
    serviceTypes,
    templates: templates.map((t) => ({
      name: t.name,
      dayOfWeek: t.dayOfWeek,
      location: t.location,
      description: t.description,
      days: t.days,
      rolesNeeded: t.rolesNeeded,
      roleSpots: t.roleSpots,
      expiresInDays: t.expiresInDays,
      smartSchedulingEnabled: t.smartSchedulingEnabled,
      rehearsalDayOffset: t.rehearsalDayOffset,
      rehearsalStartTime: t.rehearsalStartTime,
      rehearsalEndTime: t.rehearsalEndTime,
      serviceTypeId: t.serviceTypeId,
    })),
    roster: members.map((m) => ({
      userId: m.userId,
      name: `${m.user.firstName} ${m.user.lastName}`,
      volunteerRoles: m.volunteerRoles,
      voiceType: singingVoiceType(m.volunteerRoles, m.voiceType),
      manager: m.role !== OrgRole.MEMBER,
    })),
    teamLeads,
    // The one place calendar date + clock time become the stored floating-UTC
    // instants. The agent never sees a timezone.
    deps: {
      checkAvailability: ({ days, roles }) =>
        getEligibilityByRole({
          organizationId,
          dates: days.map((d) => ({
            startTime: `${d.date}T${d.startTime}:00Z`,
            endTime: `${d.date}T${d.endTime}:00Z`,
          })),
          roles,
        }),
    },
  });
}
