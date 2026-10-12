import { MemberEventsDashboard } from "@/components/dashboard/events-member-dashboard";
import { getOrgServiceTypes, getServiceTypeOrder } from "@/lib/services/service-types";
import { getUserEvents, getOrgEvents } from "@/lib/services/events";
import { getOrganizationTimeZone } from "@/lib/services/organization";

interface EventsTabContentProps {
  organizationId: string;
  userId: string;
  canManage: boolean;
}

export const EventsTabContent = async ({
  organizationId,
  userId,
  canManage,
}: EventsTabContentProps) => {

  const [serviceTypes, serviceTypeOrder, events, allEvents, timeZone] = await Promise.all([
    getOrgServiceTypes(organizationId),
    getServiceTypeOrder(userId, organizationId),
    getUserEvents(organizationId, userId),
    canManage ? getOrgEvents(organizationId, userId) : Promise.resolve([]),
    getOrganizationTimeZone(organizationId),
  ]);

  return (
    <MemberEventsDashboard
      events={events}
      allEvents={allEvents}
      serviceTypes={serviceTypes}
      serviceTypeOrder={serviceTypeOrder}
      organizationId={organizationId}
      canManage={canManage}
      timeZone={timeZone}
    />
  );
};
