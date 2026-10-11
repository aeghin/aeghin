import { getUserEvents } from "@/lib/services/events";
import { getOrgServiceTypes } from "@/lib/services/service-types";
import { getOrganizationTimeZone } from "@/lib/services/organization";
import { floatingNow } from "@/lib/time-zone";
import { volunteerRoleConfig } from "@/lib/config/roles";
import { InvitationStatus, VolunteerRole } from "@/generated/prisma/enums";
import {
  NeedsResponseBanner,
  type PendingInvite,
} from "@/components/dashboard/needs-response-banner";

interface NeedsResponseSectionProps {
  organizationId: string;
  userId: string;
  canManage: boolean;
}

// Events store wall-clock times with a Z suffix, so display always pins to UTC.
function formatShortDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    timeZone: "UTC",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

// Invitation expiry is a real timestamp, so it compares against actual now.
function expiryLabel(
  expiresAt: Date,
  now: Date,
): { text: string; urgent: boolean } {
  const hoursLeft = (expiresAt.getTime() - now.getTime()) / 3_600_000;
  if (hoursLeft < 24) {
    return {
      text: `${Math.max(1, Math.floor(hoursLeft))}h left`,
      urgent: true,
    };
  }
  return { text: `${Math.floor(hoursLeft / 24)}d left`, urgent: false };
}

export const NeedsResponseSection = async ({
  organizationId,
  userId,
  canManage
}: NeedsResponseSectionProps) => {

  const [events, serviceTypes, timeZone] = await Promise.all([
    getUserEvents(organizationId, userId),
    getOrgServiceTypes(organizationId),
    getOrganizationTimeZone(organizationId),
  ]);

  // Deadlines are real instants; event times are the church's wall clock, so
  // "not over yet" reads the church's clock instead.
  const now = new Date();
  const churchNow = floatingNow(timeZone, now);

  // Open invitations: pending, not expired, and the event isn't over yet.
  const pending: { invite: PendingInvite; expiresAt: Date }[] = [];

  for (const event of events) {
    const assignment = event.assignments.find(
      (a) => a.status === InvitationStatus.PENDING && a.expiresAt > now,
    );
    if (!assignment) continue;

    const upcomingDates = event.dates.filter((d) => d.endTime >= churchNow);
    if (upcomingDates.length === 0) continue;

    const start = upcomingDates.reduce(
      (earliest, d) => (d.startTime < earliest ? d.startTime : earliest),
      upcomingDates[0].startTime,
    );

    const service = serviceTypes.find((s) => s.id === event.serviceTypeId);
    const roleConfig = volunteerRoleConfig[assignment.role as VolunteerRole];
    const expiry = expiryLabel(assignment.expiresAt, now);

    pending.push({
      expiresAt: assignment.expiresAt,
      invite: {
        eventId: event.id,
        eventName: event.name,
        whenLabel: `${formatShortDate(start)}, ${formatTime(start)}`,
        roleLabel: roleConfig ? `${roleConfig.icon} ${roleConfig.label}` : null,
        serviceColor: service?.color ?? "indigo",
        expiryLabel: expiry.text,
        expiryUrgent: expiry.urgent,
      },
    });
  }

  if (pending.length === 0) return null;

  // Most urgent first.
  pending.sort((a, b) => a.expiresAt.getTime() - b.expiresAt.getTime());

  return (
    <NeedsResponseBanner
      invites={pending.map((p) => p.invite)}
      organizationId={organizationId}
      canManage={canManage}
    />
  );
};
