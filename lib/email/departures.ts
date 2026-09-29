import "server-only";

import prisma from "@/lib/prisma";
import { InvitationStatus, type VolunteerRole } from "@/generated/prisma/enums";
import { volunteerRoleLabels } from "@/lib/activity";
import { teamOfRole } from "@/lib/config/roles";
import EventDepartureEmail, {
  type VacatedSpot,
} from "@/components/email/event-departure-template";
import { formatEventWhen } from "@/lib/email/event-when";
import { organizationSender } from "@/lib/email/organization";
import { sendEmailBatches } from "@/lib/email/send";
import {
  reasonLine,
  roleAudience,
  type Addressee,
  type Person,
} from "@/lib/notifications/audience";
import { loadStaffingDirectory } from "@/lib/notifications/directory";
import { sendPushNotices } from "@/lib/push/send";

/**
 * An assignment on an upcoming event, as the caller read it before deleting it.
 * Any status: which ones actually left somebody short is decided here.
 */
export type DepartingSpot = {
  eventId: string;
  role: VolunteerRole;
  status: InvitationStatus;
  expiresAt: Date;
  /** Who invited them: copied in when somebody else is asked to refill it. */
  assignedById: string | null;
};

/** How they went. Finishes the sentence "{name} …" in the email. */
export type DepartureReason = "left" | "removed" | "deleted";

/**
 * Tells whoever runs each event a departing member leaves short.
 *
 * Leaving, being removed and deleting an account all take a person's upcoming
 * spots with them — the rows are deleted, not declined — so none of the
 * decline or expiry mail ever fires for them. Before this, the only trace was
 * a count in the bell.
 *
 * One email per recipient, listing every spot of theirs this leaves short, so
 * a creator who runs four upcoming services hears once, not four times. Each
 * spot is owned the way every staffing alert is (lib/notifications/audience.ts)
 * — whoever covers its team on the event, else the team's lead for the
 * event's service type, else the event's creator, else the owners — with
 * whoever invited the person who left, and the team's "Also notify", copied
 * in. Resolved after the departure, so somebody who is the one leaving falls
 * through to the next in line.
 *
 * A role somebody else has already confirmed is skipped: the same rule the
 * decline and expired-invite emails follow, and the reason a departure can
 * send nothing at all.
 *
 * Best effort, like the other staffing mail: the departure has committed, so a
 * failure is logged and never becomes the caller's error.
 */
export async function notifyDeparture({
  organizationId,
  departedName,
  reason,
  spots,
}: {
  organizationId: string;
  departedName: string;
  reason: DepartureReason;
  spots: DepartingSpot[];
}): Promise<void> {
  try {
    // Only a spot they still held leaves anybody short. A decline or a lapse
    // already sent its own mail when it happened.
    const now = new Date();

    const held = spots.filter(
      (spot) =>
        spot.status === InvitationStatus.ACCEPTED ||
        (spot.status === InvitationStatus.PENDING && spot.expiresAt > now),
    );

    if (held.length === 0) return;

    const eventIds = [...new Set(held.map((spot) => spot.eventId))];

    const [directory, organization, events] = await Promise.all([
      loadStaffingDirectory(organizationId),
      prisma.organization.findUnique({
        where: { id: organizationId },
        select: { logoUrl: true },
      }),
      prisma.event.findMany({
        where: { id: { in: eventIds }, organizationId },
        select: {
          id: true,
          name: true,
          createdById: true,
          serviceTypeId: true,
          dates: { select: { startTime: true, endTime: true } },
          teamLeads: { select: { category: true, userId: true } },
          // Whoever is still confirmed, after the departure.
          assignments: {
            where: { status: InvitationStatus.ACCEPTED },
            select: { role: true },
          },
        },
      }),
    ]);

    if (!directory) return;

    const organizationName = directory.organizationName;
    const eventById = new Map(events.map((event) => [event.id, event]));

    // Soonest first, so the list reads in the order it needs dealing with.
    const firstStart = (eventId: string) => {
      const dates = eventById.get(eventId)?.dates ?? [];
      return Math.min(...dates.map((date) => date.startTime.getTime()));
    };

    const ordered = [...held].sort(
      (a, b) => firstStart(a.eventId) - firstStart(b.eventId),
    );

    // `eventIds` runs parallel to `vacated`, for where the push opens.
    const byRecipient = new Map<
      string,
      {
        recipient: Person;
        footer: string;
        owns: boolean;
        vacated: VacatedSpot[];
        eventIds: string[];
      }
    >();

    const add = (
      { person, reason }: Addressee,
      spot: VacatedSpot,
      eventId: string,
      role: VolunteerRole,
      serviceTypeName: string | null,
    ) => {
      const footer = reasonLine(reason, organizationName, role, serviceTypeName);
      const entry = byRecipient.get(person.email);

      if (!entry) {
        byRecipient.set(person.email, {
          recipient: person,
          footer,
          owns: !spot.headsUp,
          vacated: [spot],
          eventIds: [eventId],
        });
        return;
      }

      entry.vacated.push(spot);
      entry.eventIds.push(eventId);

      // The footer names the reason they own something, when they do.
      if (!spot.headsUp && !entry.owns) {
        entry.owns = true;
        entry.footer = footer;
      }
    };

    for (const spot of ordered) {
      const event = eventById.get(spot.eventId);

      if (!event) continue;

      if (event.assignments.some((assignment) => assignment.role === spot.role)) {
        continue;
      }

      const when = formatEventWhen(event.dates);

      const vacated: VacatedSpot = {
        eventName: event.name,
        roleLabel: volunteerRoleLabels[spot.role],
        when: when ? `${when.date} · ${when.time}` : null,
        viewLink: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/organizations/${organizationId}/events/${event.id}`,
      };

      const audience = roleAudience(directory, {
        serviceTypeId: event.serviceTypeId,
        createdById: event.createdById,
        role: spot.role,
        coverId:
          event.teamLeads.find((cover) => cover.category === teamOfRole(spot.role))
            ?.userId ?? null,
        inviterId: spot.assignedById,
      });

      const serviceTypeName =
        directory.serviceTypeNames.get(event.serviceTypeId) ?? null;

      for (const owner of audience.owners) {
        add(owner, vacated, event.id, spot.role, serviceTypeName);
      }

      for (const copied of audience.copied) {
        add(
          copied,
          { ...vacated, headsUp: audience.headsUp },
          event.id,
          spot.role,
          serviceTypeName,
        );
      }
    }

    const subjectFor = (vacated: VacatedSpot[]) =>
      vacated.length === 1
        ? `Needs a ${vacated[0].roleLabel}: ${vacated[0].eventName}`
        : `${vacated.length} upcoming events need people`;

    const messages = [...byRecipient.values()].map(
      ({ recipient, footer, owns, vacated }) => ({
        from: organizationSender(organizationName),
        to: recipient.email,
        subject: owns ? subjectFor(vacated) : `Heads-up: ${subjectFor(vacated)}`,
        react: EventDepartureEmail({
          recipientName: recipient.firstName,
          organizationName,
          logoUrl: organization?.logoUrl ?? null,
          departedName,
          reason,
          vacated,
          footer,
        }),
      }),
    );

    await sendEmailBatches("departure shortage", messages);

    const departed =
      reason === "left"
        ? "left"
        : reason === "removed"
          ? "was removed"
          : "deleted their account";

    await sendPushNotices(
      "departure shortage",
      [...byRecipient.values()].map(({ recipient, owns, vacated, eventIds }) => ({
        email: recipient.email,
        title: subjectFor(vacated),
        subtitle: organizationName,
        body:
          vacated.length === 1
            ? `${departedName} ${departed}. ${vacated[0].headsUp ?? `Nobody else is confirmed as ${vacated[0].roleLabel}.`}`
            : `${departedName} ${departed}, leaving ${vacated.length} upcoming events short.${owns ? "" : " Others have been asked to fill them."}`,
        data:
          eventIds.length === 1
            ? { type: "event", organizationId, eventId: eventIds[0] }
            : { type: "organization", organizationId },
      })),
    );
  } catch (err) {
    console.error(
      `Failed to notify about a departure from org ${organizationId}`,
      err,
    );
  }
}
