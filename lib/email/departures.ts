import "server-only";

import prisma from "@/lib/prisma";
import { InvitationStatus, type VolunteerRole } from "@/generated/prisma/enums";
import { volunteerRoleLabels } from "@/lib/activity";
import EventDepartureEmail, {
  type VacatedSpot,
} from "@/components/email/event-departure-template";
import { formatEventWhen } from "@/lib/email/event-when";
import { organizationSender } from "@/lib/email/organization";
import {
  eventStaffingRecipients,
  type EmailRecipient,
} from "@/lib/email/recipients";
import { sendEmailBatches } from "@/lib/email/send";
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
 * One email per recipient, listing every event of theirs this leaves short,
 * so a creator who runs four upcoming services hears once, not four times.
 * Recipients are the same creator-then-owners rule every other staffing email
 * uses, resolved after the departure — so a creator who is the one leaving
 * falls through to the owners.
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

    const [organization, events] = await Promise.all([
      prisma.organization.findUnique({
        where: { id: organizationId },
        select: { name: true, logoUrl: true },
      }),
      prisma.event.findMany({
        where: {
          id: { in: [...new Set(held.map((spot) => spot.eventId))] },
          organizationId,
        },
        select: {
          id: true,
          name: true,
          createdById: true,
          dates: { select: { startTime: true, endTime: true } },
          // Whoever is still confirmed, after the departure.
          assignments: {
            where: { status: InvitationStatus.ACCEPTED },
            select: { role: true },
          },
        },
      }),
    ]);

    if (!organization) return;

    const eventById = new Map(events.map((event) => [event.id, event]));

    // Soonest first, so the list reads in the order it needs dealing with.
    const firstStart = (eventId: string) => {
      const dates = eventById.get(eventId)?.dates ?? [];
      return Math.min(...dates.map((date) => date.startTime.getTime()));
    };

    const ordered = [...held].sort(
      (a, b) => firstStart(a.eventId) - firstStart(b.eventId),
    );

    // One lookup per creator, not per spot: most of a member's spots are on
    // events the same person made.
    const recipientsByCreator = new Map<string, Promise<EmailRecipient[]>>();

    const recipientsFor = (createdById: string | null) => {
      const key = createdById ?? "";
      const cached = recipientsByCreator.get(key);

      if (cached) return cached;

      const lookup = eventStaffingRecipients(organizationId, createdById);
      recipientsByCreator.set(key, lookup);
      return lookup;
    };

    // `eventIds` runs parallel to `vacated`, for where the push opens.
    const byRecipient = new Map<
      string,
      { recipient: EmailRecipient; vacated: VacatedSpot[]; eventIds: string[] }
    >();

    for (const spot of ordered) {
      const event = eventById.get(spot.eventId);

      if (!event) continue;

      if (event.assignments.some((assignment) => assignment.role === spot.role)) {
        continue;
      }

      const when = formatEventWhen(event.dates);
      const recipients = await recipientsFor(event.createdById);

      for (const recipient of recipients) {
        const entry = byRecipient.get(recipient.email) ?? {
          recipient,
          vacated: [],
          eventIds: [],
        };

        entry.vacated.push({
          eventName: event.name,
          roleLabel: volunteerRoleLabels[spot.role],
          when: when ? `${when.date} · ${when.time}` : null,
          viewLink: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/organizations/${organizationId}/events/${event.id}`,
        });

        entry.eventIds.push(event.id);

        byRecipient.set(recipient.email, entry);
      }
    }

    const subjectFor = (vacated: VacatedSpot[]) =>
      vacated.length === 1
        ? `Needs a ${vacated[0].roleLabel}: ${vacated[0].eventName}`
        : `${vacated.length} upcoming events need people`;

    const messages = [...byRecipient.values()].map(({ recipient, vacated }) => ({
      from: organizationSender(organization.name),
      to: recipient.email,
      subject: subjectFor(vacated),
      react: EventDepartureEmail({
        recipientName: recipient.firstName,
        organizationName: organization.name,
        logoUrl: organization.logoUrl,
        departedName,
        reason,
        vacated,
      }),
    }));

    await sendEmailBatches("departure shortage", messages);

    const departed =
      reason === "left"
        ? "left"
        : reason === "removed"
          ? "was removed"
          : "deleted their account";

    await sendPushNotices(
      "departure shortage",
      [...byRecipient.values()].map(({ recipient, vacated, eventIds }) => ({
        email: recipient.email,
        title: subjectFor(vacated),
        subtitle: organization.name,
        body:
          vacated.length === 1
            ? `${departedName} ${departed}. Nobody else is confirmed as ${vacated[0].roleLabel}.`
            : `${departedName} ${departed}, leaving ${vacated.length} upcoming events short.`,
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
