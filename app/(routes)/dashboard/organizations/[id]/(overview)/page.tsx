import { notFound } from "next/navigation";
import { EventsTabContent } from "@/components/dashboard/events-tab-content";
import { getOrgAccess } from "@/components/dashboard/org-shell/get-org-shell";

// The org's home: its events, at the org's root URL — where every email and push link lands.
export default async function OrganizationEventsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const access = await getOrgAccess(id);

  if (!access) notFound();

  return (
    <EventsTabContent
      organizationId={access.orgId}
      canManage={access.canManage}
      userId={access.userId}
    />
  );
}
