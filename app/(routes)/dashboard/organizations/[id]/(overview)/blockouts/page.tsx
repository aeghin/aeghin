import { notFound } from "next/navigation";
import { BlockoutsTabContent } from "@/components/dashboard/blockouts-tab-content";
import { getOrgAccess } from "@/components/dashboard/org-shell/get-org-shell";

export default async function OrganizationBlockoutsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const access = await getOrgAccess(id);

  if (!access) notFound();

  return (
    <BlockoutsTabContent
      organizationId={access.orgId}
      userId={access.userId}
    />
  );
}
