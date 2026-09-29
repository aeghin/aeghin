import { redirect } from "next/navigation";
import { CreateEventPageContent } from "@/components/dashboard/create-event-content";
import { OrgRole } from "@/generated/prisma/enums";
import { currentUser } from "@/lib/services/user";
import {
  getUserMembershipWithOrg,
  getOrgMembersWithUser,
} from "@/lib/services/organization";
import { getOrgServiceTypes } from "@/lib/services/service-types";
import { getOrgEventTemplates } from "@/lib/services/event-templates";
import { getTeamNotificationSettings } from "@/lib/services/team-notifications";
import { getAiProAccess, getOrgPlan } from "@/lib/billing/entitlements";
import { PLAN_LIMITS } from "@/lib/config/plans";


export default async function CreateEventPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ templateId?: string }>
}) {
  const [{ id: orgId }, { templateId }, user] = await Promise.all([
    params,
    searchParams,
    currentUser(),
  ]);

  if (!user) redirect("/sign-in");

  const [membership, members, serviceTypes, templates, hasAiPro, plan, teamSettings] = await Promise.all([
    getUserMembershipWithOrg(user.id, orgId),
    getOrgMembersWithUser(orgId),
    getOrgServiceTypes(orgId),
    getOrgEventTemplates(orgId),
    getAiProAccess({ userId: user.id, orgId }),
    getOrgPlan(orgId),
    getTeamNotificationSettings(orgId),
  ])

  const organizationName = membership?.organization.name || '';

  const canManage = membership?.role === OrgRole.OWNER || membership?.role === OrgRole.ADMIN;

  if (!canManage) {
    redirect(`/dashboard/organizations/${orgId}`)
  };

  // Each service type's leads, so the form can show who handles each team
  // for whichever service type gets picked.
  const teamLeads = {
    byServiceType: Object.fromEntries(
      teamSettings.serviceTypes.map((serviceType) => [
        serviceType.serviceTypeId,
        Object.fromEntries(
          serviceType.teams.flatMap(({ team, lead }) => (lead ? [[team, lead]] : [])),
        ),
      ]),
    ),
    managers: teamSettings.managers.map(({ userId, firstName, lastName }) => ({
      userId,
      firstName,
      lastName,
    })),
    viewerId: user.id,
  };

  return (
    <CreateEventPageContent
      organizationId={orgId}
      organizationName={organizationName}
      members={members}
      serviceTypes={serviceTypes}
      templates={templates}
      initialTemplateId={templateId}
      canDraftWithAi={hasAiPro}
      canSubscribe={membership?.role === OrgRole.OWNER}
      smartSchedulingAvailable={PLAN_LIMITS[plan].smartScheduling}
      plan={plan}
      teamLeads={teamLeads}
    />
  )
}
