import "server-only";

import prisma from "@/lib/prisma";
import { type VolunteerRole } from "@/generated/prisma/enums";
import EventShortageEmail from "@/components/email/event-shortage-template";
import { formatEventWhen } from "@/lib/email/event-when";
import { organizationSender } from "@/lib/email/organization";
import { sendEmailBatches } from "@/lib/email/send";
import { teamOfRole, volunteerRoleConfig } from "@/lib/config/roles";
import { reasonLine, roleAudience } from "@/lib/notifications/audience";
import { loadStaffingDirectory } from "@/lib/notifications/directory";
import { sendPushNotices } from "@/lib/push/send";
import { parseRoleSpots, roleStanding } from "@/lib/role-spots";

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
  inviterId,
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
  /** Who sent the declined invitation: copied in when somebody else is asked. */
  inviterId: string | null;
  declinerName: string;
  /** Why nobody was invited in their place, worded per smart-fill outcome. */
  reason: string;
}): Promise<void> {
  try {
    // Which service's lead has it, whether somebody covers the team on this
    // event only, and whether the decline left a spot open. Every invite is
    // somebody wanted there, so it nearly always does — somebody else on the
    // role accepting doesn't fill this one. The rule the expired-invite email
    // follows too.
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: {
        serviceTypeId: true,
        roleSpots: true,
        teamLeads: {
          where: { category: teamOfRole(role) },
          select: { userId: true },
        },
        assignments: {
          where: { role },
          select: { role: true, status: true, expiresAt: true },
        },
      },
    });

    if (
      !event ||
      roleStanding(role, parseRoleSpots(event.roleSpots), event.assignments, new Date())
        .open === 0
    ) {
      return;
    }

    const directory = await loadStaffingDirectory(organizationId);

    if (!directory) return;

    const audience = roleAudience(directory, {
      serviceTypeId: event.serviceTypeId,
      createdById,
      role,
      coverId: event.teamLeads[0]?.userId ?? null,
      inviterId,
    });

    const serviceTypeName = directory.serviceTypeNames.get(event.serviceTypeId);

    const recipients = [
      ...audience.owners.map((addressee) => ({ ...addressee, headsUp: null })),
      ...audience.copied.map((addressee) => ({
        ...addressee,
        headsUp: audience.headsUp,
      })),
    ];

    if (recipients.length === 0) return;

    const roleLabel = volunteerRoleConfig[role].label;
    const when = formatEventWhen(dates);
    // "Pianist needed", not "Needs a Pianist": half the role labels can't take
    // an "a" — Aux Keys, Usher, BGVs, Choir, Camera, Lighting.
    const subject = `${roleLabel} needed: ${eventName}`;

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
          footer: reasonLine(why, organization.name, role, serviceTypeName),
        }),
      })),
    );

    await sendPushNotices(
      "declineEventInvitation shortage",
      recipients.map(({ person, headsUp }) => ({
        email: person.email,
        // Worded like the email's subject, so a lock screen never asks somebody
        // who's only copied in to go and fill it.
        title: headsUp ? `Heads-up: ${subject}` : subject,
        subtitle: organization.name,
        body: `${declinerName} declined. ${headsUp ?? reason}`,
        data: { type: "event", organizationId, eventId },
      })),
    );
  } catch (err) {
    console.error(`Failed to notify about a decline on event ${eventId}`, err);
  }
}
