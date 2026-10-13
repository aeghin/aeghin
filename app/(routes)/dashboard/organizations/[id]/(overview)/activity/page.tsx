import { notFound, redirect } from "next/navigation";
import { ActivityTabContent } from "@/components/dashboard/activity-tab-content";
import { getOrgAccess } from "@/components/dashboard/org-shell/get-org-shell";
import { orgBasePath } from "@/components/dashboard/org-shell/org-nav-config";

export default async function OrganizationActivityPage({
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
    <ActivityTabContent
      organizationId={access.orgId}
    />
  );
}
