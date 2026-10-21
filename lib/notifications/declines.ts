import "server-only";

import prisma from "@/lib/prisma";
import { type VolunteerRole } from "@/generated/prisma/enums";
import EventReplacementEmail from "@/components/email/event-replacement-template";
import EventShortageEmail from "@/components/email/event-shortage-template";
import { formatEventShort, formatEventWhen } from "@/lib/email/event-when";
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
  backedOut,
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
  /** They had accepted and then said they can't make it. */
  backedOut: boolean;
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

    // A team lead who declines or backs out of their own team is still the one
    // asked to fill it: finding their replacement is their job.
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
          backedOut,
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
        body: `${declinerName} ${backedOut ? "can't make it anymore" : "declined"}. ${headsUp ?? reason}`,
        data: { type: "event", organizationId, eventId },
      })),
    );
  } catch (err) {
    console.error(`Failed to notify about a decline on event ${eventId}`, err);
  }
}

/**
 * Tells whoever runs a role's team what Smart Scheduling did with a declined
 * spot: that it invited somebody in the decliner's place (`invited`), and later
 * that the somebody said yes (`accepted`). The same people "Pianist needed"
 * reaches, on the same footing — whoever covers the team on this event, else
 * the team's lead for the service type, else the creator, then the owners, with
 * the sender and Also notify copied in.
 *
 * Nobody is asked to act, which is why this is separate from
 * `notifyDeclineShortage`. The replacement is left out even when they run the
 * team: they have their own invitation. The one who declined or backed out is
 * not — a lead who leaves their own team still owns filling it.
 *
 * Best effort: the answer has committed, so a failure is logged and never
 * becomes the caller's error.
 */
export async function notifyReplacement({
  kind,
  organizationId,
  eventId,
  role,
  inviterId,
  replacement,
  decliner,
}: {
  kind: "invited" | "accepted";
  organizationId: string;
  eventId: string;
  role: VolunteerRole;
  /** Who sent the declined invitation, which the replacement's row inherits. */
  inviterId: string | null;
  replacement: { userId: string; firstName: string; lastName: string };
  /** Who declined. Only known on the decline itself. */
  decliner: { name: string; backedOut: boolean } | null;
}): Promise<void> {
  try {
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: {
        name: true,
        createdById: true,
        serviceTypeId: true,
        dates: { select: { startTime: true, endTime: true } },
        teamLeads: {
          where: { category: teamOfRole(role) },
          select: { userId: true },
        },
        organization: { select: { name: true, logoUrl: true } },
      },
    });

    if (!event) return;

    const directory = await loadStaffingDirectory(organizationId);

    if (!directory) return;

    const audience = roleAudience(directory, {
      serviceTypeId: event.serviceTypeId,
      createdById: event.createdById,
      role,
      coverId: event.teamLeads[0]?.userId ?? null,
      inviterId,
    });

    const recipients = [...audience.owners, ...audience.copied].filter(
      ({ person }) => person.userId !== replacement.userId,
    );

    if (recipients.length === 0) return;

    const { organization } = event;
    const roleLabel = volunteerRoleConfig[role].label;
    const replacementName = `${replacement.firstName} ${replacement.lastName}`;
    const serviceTypeName = directory.serviceTypeNames.get(event.serviceTypeId);
    const when = formatEventWhen(event.dates);
    const label = kind === "invited" ? "replacement invited" : "replacement accepted";

    const subject =
      kind === "invited"
        ? `${roleLabel} replacement invited: ${event.name}`
        : `${roleLabel} filled: ${event.name}`;

    await sendEmailBatches(
      label,
      recipients.map(({ person, reason }) => ({
        from: organizationSender(organization.name),
        to: person.email,
        subject,
        react: EventReplacementEmail({
          kind,
          recipientName: person.firstName,
          eventName: event.name,
          organizationName: organization.name,
          logoUrl: organization.logoUrl,
          roleLabel,
          replacementName,
          replacementFirstName: replacement.firstName,
          declinedByName: decliner?.name ?? null,
          backedOut: decliner?.backedOut ?? false,
          eventDate: when?.date ?? null,
          eventTime: when?.time ?? null,
          viewLink: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/organizations/${organizationId}/events/${eventId}`,
          footer: reasonLine(reason, organization.name, role, serviceTypeName),
        }),
      })),
    );

    const happened =
      kind === "invited"
        ? `${decliner?.name ?? "Somebody"} ${decliner?.backedOut ? "can't make it anymore" : "declined"}. Smart Scheduling invited ${replacementName} in their place.`
        : `${replacementName} accepted the invitation Smart Scheduling sent.`;

    await sendPushNotices(
      label,
      recipients.map(({ person }) => ({
        email: person.email,
        title: subject,
        subtitle: organization.name,
        body: [happened, formatEventShort(event.dates)].filter(Boolean).join("\n"),
        data: { type: "event", organizationId, eventId },
      })),
    );
  } catch (err) {
    console.error(`Failed to tell the team about a replacement on event ${eventId}`, err);
  }
}
