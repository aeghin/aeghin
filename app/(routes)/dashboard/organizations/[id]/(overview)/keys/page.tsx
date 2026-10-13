import { notFound, redirect } from "next/navigation";
import { SongKeysTabContent } from "@/components/dashboard/song-keys-tab-content";
import { getOrgAccess } from "@/components/dashboard/org-shell/get-org-shell";
import { orgBasePath } from "@/components/dashboard/org-shell/org-nav-config";

export default async function OrganizationKeysPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const access = await getOrgAccess(id);

  if (!access) notFound();

  // Lead vocalists and BGVs only; everyone else goes to the org's home.
  if (!access.isVocalist) redirect(orgBasePath(access.orgId));

  return (
    <SongKeysTabContent
      organizationId={access.orgId}
      userId={access.userId}
    />
  );
}
