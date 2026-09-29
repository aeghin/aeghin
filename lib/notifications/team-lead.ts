import "server-only";

import prisma from "@/lib/prisma";
import type { RoleCategory as Team } from "@/generated/prisma/enums";
import EventCoverEmail from "@/components/email/event-cover-template";
import TeamLeadEmail from "@/components/email/team-lead-template";
import { volunteerRoleLabels } from "@/lib/activity";
import { roleToCategory, teamLabel, teamOfRole } from "@/lib/config/roles";
import { formatEventShort, formatEventWhen } from "@/lib/email/event-when";
import { organizationSender } from "@/lib/email/organization";
import { sendEmailBatches } from "@/lib/email/send";
import { sendPushNotices } from "@/lib/push/send";

/** Every role in one team, e.g. "Pianist, Aux Keys, Bassist". */
const rolesOf = (team: Team) =>
  (Object.keys(roleToCategory) as (keyof typeof roleToCategory)[])
    .filter((role) => teamOfRole(role) === team)
    .map((role) => volunteerRoleLabels[role])
    .join(", ");

const names = new Intl.ListFormat("en", { type: "conjunction" });

/**
 * Tells somebody, once, that they now lead a team for one service type — so
 * the first decline they're asked to fill doesn't arrive out of nowhere.
 *
 * Best effort: the lead is already set, and a failure is logged rather than
 * surfaced to whoever set it.
 */
export async function notifyNewTeamLead({
  organizationId,
  serviceTypeId,
  team,
  userId,
  assignedByName,
}: {
  organizationId: string;
  serviceTypeId: string;
  team: Team;
  userId: string;
  assignedByName: string;
}): Promise<void> {
  try {
    const [lead, organization, serviceType] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, firstName: true },
      }),
      prisma.organization.findUnique({
        where: { id: organizationId },
        select: { name: true, logoUrl: true },
      }),
      prisma.serviceType.findUnique({
        where: { id: serviceTypeId },
        select: { name: true },
      }),
    ]);

    if (!lead || !organization || !serviceType) return;

    const label = teamLabel(team);

    await sendEmailBatches("team lead assigned", [
      {
        from: organizationSender(organization.name),
        to: lead.email,
        subject: `You're now the ${label} lead for ${serviceType.name}`,
        react: TeamLeadEmail({
          recipientName: lead.firstName,
          organizationName: organization.name,
          logoUrl: organization.logoUrl,
          teamLabel: label,
          serviceTypeName: serviceType.name,
          roleLabels: rolesOf(team),
          assignedByName,
          settingsLink: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/organizations/${organizationId}?tab=settings`,
        }),
      },
    ]);

    await sendPushNotices("team lead assigned", [
      {
        email: lead.email,
        title: `You're the ${label} lead for ${serviceType.name}`,
        subtitle: organization.name,
        body: `${assignedByName} made you the ${label} lead for ${serviceType.name}. You'll now get its ${label} staffing alerts.`,
        data: { type: "organization", organizationId },
      },
    ]);
  } catch (err) {
    console.error(`Failed to tell a new ${team} lead in org ${organizationId}`, err);
  }
}

/**
 * Tells whoever was just picked to handle a team on one event, in place of
 * the service type's lead, so the first alert about it isn't a surprise. One
 * message per person, however many teams they cover.
 *
 * Best effort, like `notifyNewTeamLead`: the event is already saved.
 */
export async function notifyEventCovers({
  organizationId,
  eventId,
  covers,
  assignedByName,
}: {
  organizationId: string;
  eventId: string;
  covers: { team: Team; userId: string }[];
  assignedByName: string;
}): Promise<void> {
  try {
    if (covers.length === 0) return;

    const [event, organization, people] = await Promise.all([
      prisma.event.findUnique({
        where: { id: eventId },
        select: {
          name: true,
          dates: { select: { startTime: true, endTime: true } },
          serviceType: {
            select: {
              teamLeads: {
                select: {
                  category: true,
                  membership: { select: { user: { select: { firstName: true } } } },
                },
              },
            },
          },
        },
      }),
      prisma.organization.findUnique({
        where: { id: organizationId },
        select: { name: true, logoUrl: true },
      }),
      prisma.user.findMany({
        where: { id: { in: [...new Set(covers.map((cover) => cover.userId))] } },
        select: { id: true, email: true, firstName: true },
      }),
    ]);

    if (!event || !organization) return;

    const when = formatEventWhen(event.dates);
    const short = formatEventShort(event.dates);
    const viewLink = `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/organizations/${organizationId}/events/${eventId}`;

    const messages = people.map((person) => {
      const teams = covers
        .filter((cover) => cover.userId === person.id)
        .map((cover) => cover.team);

      const labels = names.format(teams.map(teamLabel));

      // Whose place they're taking, when the service type has a lead.
      const regulars = teams.flatMap((team) => {
        const lead = event.serviceType.teamLeads.find((row) => row.category === team);

        return lead ? [lead.membership.user.firstName] : [];
      });

      return { person, teams, labels, regulars };
    });

    await sendEmailBatches(
      "event team cover",
      messages.map(({ person, teams, labels, regulars }) => ({
        from: organizationSender(organization.name),
        to: person.email,
        subject: `You're covering ${labels} for ${event.name}`,
        react: EventCoverEmail({
          recipientName: person.firstName,
          organizationName: organization.name,
          logoUrl: organization.logoUrl,
          eventName: event.name,
          eventDate: when?.date ?? null,
          eventTime: when?.time ?? null,
          teamLabels: labels,
          roleLabels: teams.map(rolesOf).join(", "),
          regularLeadNames: regulars.length > 0 ? names.format([...new Set(regulars)]) : null,
          assignedByName,
          viewLink,
        }),
      })),
    );

    await sendPushNotices(
      "event team cover",
      messages.map(({ person, labels }) => ({
        email: person.email,
        title: `You're covering ${labels}`,
        subtitle: organization.name,
        body: [
          `${assignedByName} asked you to handle ${labels} for ${event.name}. You'll be asked to fill any spot that opens up on it.`,
          short,
        ]
          .filter(Boolean)
          .join("\n"),
        data: { type: "event", organizationId, eventId },
      })),
    );
  } catch (err) {
    console.error(`Failed to tell covers on event ${eventId}`, err);
  }
}
