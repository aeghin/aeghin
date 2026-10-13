import { notFound } from "next/navigation";
import { MembersTabContent } from "@/components/dashboard/members-tab-content";
import { getOrgAccess } from "@/components/dashboard/org-shell/get-org-shell";

export default async function OrganizationMembersPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const access = await getOrgAccess(id);

  if (!access) notFound();

  return (
    <MembersTabContent
      organizationId={access.orgId}
      organizationName={access.organizationName}
      userId={access.userId}
    />
  );
}
