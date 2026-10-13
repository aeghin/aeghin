import { notFound } from "next/navigation";
import { SettingsTabContent } from "@/components/dashboard/settings-tab-content";
import { getOrgAccess } from "@/components/dashboard/org-shell/get-org-shell";

export default async function OrganizationSettingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const access = await getOrgAccess(id);

  if (!access) notFound();

  return (
    <SettingsTabContent
      organizationId={access.orgId}
      userId={access.userId}
      canManage={access.canManage}
      isOwner={access.isOwner}
    />
  );
}
