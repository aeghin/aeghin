import { BlockoutsManager } from "@/components/dashboard/blockouts-manager";
import { TeamBlockouts } from "@/components/dashboard/team-blockouts";
import { InvitationStatus } from "@/generated/prisma/enums";
import { eventBlockDays } from "@/lib/blockout-calendar";
import { dayKey } from "@/lib/event-format";
import { getTeamBlockouts, getUserBlockouts } from "@/lib/services/blockouts";
import { getUserEvents } from "@/lib/services/events";
import { getOrganizationTimeZone } from "@/lib/services/organization";
import { floatingNow } from "@/lib/time-zone";

interface BlockoutsTabContentProps {
  organizationId: string;
  userId: string;
  canManage: boolean;
}

export const BlockoutsTabContent = async ({
  organizationId,
  userId,
  canManage,
}: BlockoutsTabContentProps) => {
  const [blockouts, events, timeZone, team] = await Promise.all([
    getUserBlockouts(userId, organizationId),
    getUserEvents(organizationId, userId),
    getOrganizationTimeZone(organizationId),
    canManage ? getTeamBlockouts(organizationId) : null,
  ]);

  // The church's today, which the calendars outline and dim the past against.
  const today = dayKey(floatingNow(timeZone));

  // Days this person said yes to, for the calendars' dots. Pending invites
  // aren't on their schedule yet.
  const scheduledDays = [
    ...new Set(
      events
        .filter((event) =>
          event.assignments.some((a) => a.status === InvitationStatus.ACCEPTED),
        )
        .flatMap((event) =>
          event.dates.flatMap((date) => eventBlockDays(date.startTime, date.endTime)),
        ),
    ),
  ];

  return (
    <div className="space-y-6">
      <BlockoutsManager
        organizationId={organizationId}
        blockouts={blockouts}
        scheduledDays={scheduledDays}
        today={today}
      />
      {team && (
        <TeamBlockouts
          team={team}
          userId={userId}
          organizationId={organizationId}
          today={today}
        />
      )}
    </div>
  );
};
