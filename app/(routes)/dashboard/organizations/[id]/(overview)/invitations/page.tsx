import { notFound, redirect } from "next/navigation";
import { InvitationsTabContent } from "@/components/dashboard/invitations-tab-content";
import { getOrgAccess } from "@/components/dashboard/org-shell/get-org-shell";
import { orgBasePath } from "@/components/dashboard/org-shell/org-nav-config";

export default async function OrganizationInvitationsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const access = await getOrgAccess(id);

  if (!access) notFound();

  // Owners and admins only; everyone else goes to the org's home.
  if (!access.canManage) redirect(orgBasePath(access.orgId));

  return (
    <InvitationsTabContent
      organizationId={access.orgId}
      canUpgrade={access.isOwner}
    />
  );
}
