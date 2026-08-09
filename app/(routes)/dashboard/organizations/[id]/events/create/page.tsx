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

  const [membership, members, serviceTypes, templates] = await Promise.all([
    getUserMembershipWithOrg(user.id, orgId),
    getOrgMembersWithUser(orgId),
    getOrgServiceTypes(orgId),
    getOrgEventTemplates(orgId)
  ])

  const organizationName = membership?.organization.name || '';

  const canManage = membership?.role === OrgRole.OWNER || membership?.role === OrgRole.ADMIN;

  if (!canManage) {
    redirect(`/dashboard/organizations/${orgId}`)
  };

  return (
    <CreateEventPageContent
      organizationId={orgId}
      organizationName={organizationName}
      members={members}
      serviceTypes={serviceTypes}
      templates={templates}
      initialTemplateId={templateId}
    />
  )
}
