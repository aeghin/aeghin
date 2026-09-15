import { MemberEventsDashboard } from "@/components/dashboard/events-member-dashboard";
import { UpNextBanner, findUpNext } from "@/components/dashboard/up-next-banner";
import { getOrgServiceTypes } from "@/lib/services/service-types";
import { getUserEvents, getOrgEvents } from "@/lib/services/events";

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

  const [serviceTypes, events, allEvents] = await Promise.all([
    getOrgServiceTypes(organizationId),
    getUserEvents(organizationId, userId),
    canManage ? getOrgEvents(organizationId, userId) : Promise.resolve([]),
  ]);

  // Picked once here so the banner and the schedule list can't disagree about
  // which event is up next — the list drops it rather than show it twice.
  const upNext = findUpNext(events, new Date());

  return (
    <div className="flex flex-col gap-6">
      <UpNextBanner
        upNext={upNext}
        serviceTypes={serviceTypes}
        organizationId={organizationId}
      />

      <MemberEventsDashboard
        events={events}
        allEvents={allEvents}
        serviceTypes={serviceTypes}
        organizationId={organizationId}
        canManage={canManage}
        upNextEventId={upNext?.event.id ?? null}
      />
    </div>
  );
};
