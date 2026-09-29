import "server-only";

import prisma from "@/lib/prisma";
import { InvitationStatus, type VolunteerRole } from "@/generated/prisma/enums";
import EventShortageEmail from "@/components/email/event-shortage-template";
import { volunteerRoleLabels } from "@/lib/activity";
import { formatEventWhen } from "@/lib/email/event-when";
import { organizationSender } from "@/lib/email/organization";
import { sendEmailBatches } from "@/lib/email/send";
import { reasonLine, roleAudience } from "@/lib/notifications/audience";
import { loadStaffingDirectory } from "@/lib/notifications/directory";
import { sendPushNotices } from "@/lib/push/send";

/**
 * Tells whoever owns a declined role that it is still open, and copies in
 * whoever follows it (lib/notifications/audience.ts).
 *
 * Called from every branch of a decline that leaves a hole, and from none
 * that fills one — so being asked to act on this always means somebody has to
 * go and staff something.
 *
 * Best effort, like the rest of the staffing mail: the decline has committed
 * and the volunteer has their answer, so a failure is logged and never becomes
 * the caller's error.
 */
export async function notifyDeclineShortage({
  organizationId,
  organization,
  eventId,
  eventName,
  createdById,
  dates,
  role,
  senderId,
  declinerName,
  reason,
}: {
  organizationId: string;
  organization: { name: string; logoUrl: string | null };
  eventId: string;
  eventName: string;
  createdById: string | null;
  dates: { startTime: Date; endTime: Date }[];
  role: VolunteerRole;
  /** Who sent the declined invitation. */
  senderId: string | null;
  declinerName: string;
  /** Why nobody was invited in their place, worded per smart-fill outcome. */
  reason: string;
}): Promise<void> {
  try {
    // A role somebody else has already confirmed isn't short — the rule the
    // expired-invite email follows too. Without it, the last extra invite on
    // a role declining would mail "Needs a BGVs" in the same moment the
    // roster reports itself fully staffed.
    const stillConfirmed = await prisma.eventAssignment.count({
      where: { eventId, role, status: InvitationStatus.ACCEPTED },
    });

    if (stillConfirmed > 0) return;

    const directory = await loadStaffingDirectory(organizationId, {
      eventIds: [eventId],
    });

    if (!directory) return;

    const audience = roleAudience(directory, {
      eventId,
      createdById,
      role,
      senderId,
    });

    const recipients = [
      ...audience.owners.map((addressee) => ({ ...addressee, headsUp: null })),
      ...audience.copied.map((addressee) => ({
        ...addressee,
        headsUp: audience.headsUp,
      })),
    ];

    if (recipients.length === 0) return;

    const roleLabel = volunteerRoleLabels[role];
    const when = formatEventWhen(dates);
    const subject = `Needs a ${roleLabel}: ${eventName}`;

    await sendEmailBatches(
      "declineEventInvitation shortage",
      recipients.map(({ person, reason: why, headsUp }) => ({
        from: organizationSender(organization.name),
        to: person.email,
        subject: headsUp ? `Heads-up: ${subject}` : subject,
        react: EventShortageEmail({
          recipientName: person.firstName,
          eventName,
          organizationName: organization.name,
          logoUrl: organization.logoUrl,
          declinedByName: declinerName,
          roleLabel,
          reason,
          eventDate: when?.date ?? null,
          eventTime: when?.time ?? null,
          viewLink: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/organizations/${organizationId}/events/${eventId}`,
          headsUp,
          footer: reasonLine(why, organization.name, role),
        }),
      })),
    );

    await sendPushNotices(
      "declineEventInvitation shortage",
      recipients.map(({ person, headsUp }) => ({
        email: person.email,
        title: subject,
        subtitle: organization.name,
        body: `${declinerName} declined. ${headsUp ?? reason}`,
        data: { type: "event", organizationId, eventId },
      })),
    );
  } catch (err) {
    console.error(`Failed to notify about a decline on event ${eventId}`, err);
  }
}
