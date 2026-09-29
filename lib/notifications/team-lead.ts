import "server-only";

import prisma from "@/lib/prisma";
import { OrgRole, type RoleCategory as Team } from "@/generated/prisma/enums";
import EventCoverEmail from "@/components/email/event-cover-template";
import EventTeamHandoffEmail, {
  type TeamHandoff,
} from "@/components/email/event-team-handoff-template";
import TeamAlertsChangeEmail from "@/components/email/team-alerts-change-template";
import TeamLeadEmail from "@/components/email/team-lead-template";
import { volunteerRoleLabels } from "@/lib/activity";
import { roleToCategory, TEAM_ORDER, teamLabel, teamOfRole } from "@/lib/config/roles";
import { formatEventShort, formatEventWhen } from "@/lib/email/event-when";
import { organizationSender } from "@/lib/email/organization";
import { sendEmailBatches } from "@/lib/email/send";
import {
  organizationOwners,
  teamKey,
  type Person,
} from "@/lib/notifications/audience";
import { loadStaffingDirectory } from "@/lib/notifications/directory";
import { sendPushNotices, type PushNotice } from "@/lib/push/send";

/** Every role in one team, e.g. "Pianist, Aux Keys, Bassist". */
const rolesOf = (team: Team) =>
  (Object.keys(roleToCategory) as (keyof typeof roleToCategory)[])
    .filter((role) => teamOfRole(role) === team)
    .map((role) => volunteerRoleLabels[role])
    .join(", ");

const names = new Intl.ListFormat("en", { type: "conjunction" });

/** "Band or Vocals", for "when a Band or Vocals role opens up". */
const eitherOf = new Intl.ListFormat("en", { type: "disjunction" });

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
          // The events, where the team's open spots show up — not Settings,
          // which only owners can change.
          eventsLink: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/organizations/${organizationId}`,
        }),
      },
    ]);

    await sendPushNotices("team lead assigned", [
      {
        email: lead.email,
        title: `You're the ${label} lead for ${serviceType.name}`,
        subtitle: organization.name,
        body: `${assignedByName} made you the ${label} lead for ${serviceType.name}. You'll now get its ${label} staffing alerts.`,
        // Every event, where each one's staffing shows — the lead's own
        // schedule may not hold any of them.
        data: { type: "organization", organizationId, tab: "all" },
      },
    ]);
  } catch (err) {
    console.error(`Failed to tell a new ${team} lead in org ${organizationId}`, err);
  }
}

/**
 * Tells somebody they've been put on a team's "Also notify" for one service
 * type, so their first heads-up doesn't arrive out of nowhere — and who is
 * asked to act, so a heads-up never reads as a request.
 *
 * Best effort, like `notifyNewTeamLead`.
 */
export async function notifyNewTeamWatcher({
  organizationId,
  serviceTypeId,
  team,
  userId,
  addedByName,
}: {
  organizationId: string;
  serviceTypeId: string;
  team: Team;
  userId: string;
  addedByName: string;
}): Promise<void> {
  try {
    const [person, organization, serviceType] = await Promise.all([
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
        select: {
          name: true,
          teamLeads: {
            where: { category: team },
            select: {
              userId: true,
              membership: {
                select: {
                  role: true,
                  user: { select: { firstName: true, lastName: true } },
                },
              },
            },
          },
        },
      }),
    ]);

    if (!person || !organization || !serviceType) return;

    const leadRow = serviceType.teamLeads[0];

    // Their own team's lead is asked already, and hears nothing from this.
    if (leadRow?.userId === userId) return;

    // A lead who has been made a member no longer counts, as the alerts decide it.
    const lead =
      leadRow && leadRow.membership.role !== OrgRole.MEMBER
        ? `${leadRow.membership.user.firstName} ${leadRow.membership.user.lastName}`
        : null;

    const label = teamLabel(team);
    const asked = lead ?? "the event's creator";

    await sendEmailBatches("team watcher added", [
      {
        from: organizationSender(organization.name),
        to: person.email,
        subject: `You'll get heads-ups about ${label} for ${serviceType.name}`,
        react: TeamAlertsChangeEmail({
          recipientName: person.firstName,
          organizationName: organization.name,
          logoUrl: organization.logoUrl,
          heading: `Heads-Ups for ${label}`,
          serviceTypeName: serviceType.name,
          changedByName: addedByName,
          message: `${addedByName} added you to Also notify for ${label} on ${serviceType.name}. When one of ${label}'s roles opens up — somebody declines, an invitation expires, or a member leaves — ${asked} is asked to fill it, and you'll get a heads-up saying so. You don't need to act on it.`,
          teamLabel: label,
          roleLabels: rolesOf(team),
          eventsLink: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/organizations/${organizationId}`,
          footer: `You're receiving this because ${addedByName} added you to Also notify at ${organization.name}.`,
        }),
      },
    ]);

    await sendPushNotices("team watcher added", [
      {
        email: person.email,
        title: `Also notify: ${label} for ${serviceType.name}`,
        subtitle: organization.name,
        body: `${addedByName} added you. When one of ${label}'s roles opens up, ${asked} is asked to fill it and you'll get a heads-up.`,
        data: { type: "organization", organizationId, tab: "all" },
      },
    ]);
  } catch (err) {
    console.error(`Failed to tell a new ${team} watcher in org ${organizationId}`, err);
  }
}

/**
 * Tells somebody they no longer lead a team for one service type — replaced,
 * or the lead cleared — so they know its open spots won't come to them now.
 *
 * Only while they're still an admin or owner: one who was made a member had
 * already stopped hearing about it. Best effort, like `notifyNewTeamLead`.
 */
export async function notifyFormerTeamLead({
  organizationId,
  serviceTypeId,
  team,
  formerLeadId,
  newLeadId,
  changedByName,
}: {
  organizationId: string;
  serviceTypeId: string;
  team: Team;
  formerLeadId: string;
  /** Who leads it now, or null when the lead was cleared. */
  newLeadId: string | null;
  changedByName: string;
}): Promise<void> {
  try {
    const [membership, organization, serviceType, newLead, stillWatching] =
      await Promise.all([
        prisma.membership.findUnique({
          where: { userId_organizationId: { userId: formerLeadId, organizationId } },
          select: { role: true, user: { select: { email: true, firstName: true } } },
        }),
        prisma.organization.findUnique({
          where: { id: organizationId },
          select: { name: true, logoUrl: true },
        }),
        prisma.serviceType.findUnique({
          where: { id: serviceTypeId },
          select: { name: true },
        }),
        newLeadId
          ? prisma.user.findUnique({
              where: { id: newLeadId },
              select: { firstName: true, lastName: true },
            })
          : null,
        // Also notify can outlast being the lead, and then its heads-ups carry on.
        prisma.teamWatcher.findUnique({
          where: {
            serviceTypeId_category_userId: {
              serviceTypeId,
              category: team,
              userId: formerLeadId,
            },
          },
          select: { id: true },
        }),
      ]);

    if (!membership || membership.role === OrgRole.MEMBER) return;
    if (!organization || !serviceType) return;

    const label = teamLabel(team);

    const change = newLead
      ? `${changedByName} made ${newLead.firstName} ${newLead.lastName} the ${label} lead for ${serviceType.name}`
      : `${changedByName} cleared the ${label} lead for ${serviceType.name}`;

    const consequence = [
      `you won't be asked to fill ${label}'s open spots on its events anymore`,
      newLead ? "" : " — each event's creator is, until there's a new lead",
    ].join("");

    const watching = stillWatching
      ? ` You're still on Also notify, so you'll keep getting a heads-up when one opens up.`
      : "";

    await sendEmailBatches("team lead replaced", [
      {
        from: organizationSender(organization.name),
        to: membership.user.email,
        subject: `You're no longer the ${label} lead for ${serviceType.name}`,
        react: TeamAlertsChangeEmail({
          recipientName: membership.user.firstName,
          organizationName: organization.name,
          logoUrl: organization.logoUrl,
          heading: `No Longer ${label} Lead`,
          serviceTypeName: serviceType.name,
          changedByName,
          message: `${change}, so ${consequence}.${watching}`,
          teamLabel: label,
          roleLabels: rolesOf(team),
          eventsLink: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/organizations/${organizationId}`,
          footer: `You're receiving this because you were the ${label} lead for ${serviceType.name} at ${organization.name}.`,
        }),
      },
    ]);

    await sendPushNotices("team lead replaced", [
      {
        email: membership.user.email,
        title: `No longer ${label} lead: ${serviceType.name}`,
        subtitle: organization.name,
        body: `${change}. You won't be asked to fill its open spots anymore.${watching}`,
        data: { type: "organization", organizationId },
      },
    ]);
  } catch (err) {
    console.error(`Failed to tell a former ${team} lead in org ${organizationId}`, err);
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
          teamChoice: eitherOf.format(teams.map(teamLabel)),
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

/** A manager, as the staffing directory holds them. */
type Manager = Person & { role: OrgRole };

/** One team whose handling changed on one event. */
type CoverChange = {
  team: Team;
  /** Who covered it before, or null when it followed the service type. */
  from: Manager | null;
  /** Who covers it now, or null when it's back with the service type. */
  cover: Manager | null;
  /** The service type's lead for the team, while they're still a manager. */
  lead: Manager | null;
};

/** Keeps the parts of a sentence that apply. */
const present = (parts: (string | false)[]) =>
  parts.filter((part): part is string => part !== false);

/**
 * Keeps the people a team's picks move alerts away from, or back to, in the
 * loop when an event hands a team to somebody else. A pick on the event forms
 * covers that one event only; the lead stays the default for every other.
 *
 * - The team's regular lead, whenever this event's picks move their team away
 *   from them or back to them.
 * - Whoever was covering it, when they're taken off or replaced.
 * - When an admin made the change, every owner, with a heads-up listing each
 *   one: who is asked is the owners' to set, and any of them can change it
 *   back from the event's edit form. An owner hears through that heads-up
 *   rather than twice.
 *
 * Nobody hears about a change they made themselves, and each person gets one
 * message however many of their teams moved. The new cover hears separately,
 * from `notifyEventCovers`.
 *
 * Best effort, like `notifyEventCovers`: the event is already saved.
 */
export async function notifyCoverChanges({
  organizationId,
  eventId,
  before,
  after,
  changedBy,
}: {
  organizationId: string;
  eventId: string;
  /** The event's picks before the save; none for a new event. */
  before: { team: Team; userId: string }[];
  /** Its picks after the save. */
  after: { team: Team; userId: string }[];
  /** Who saved it, and as what. */
  changedBy: { userId: string; name: string; role: OrgRole };
}): Promise<void> {
  try {
    const [directory, event, organization] = await Promise.all([
      loadStaffingDirectory(organizationId, { watchers: false }),
      prisma.event.findUnique({
        where: { id: eventId },
        select: {
          name: true,
          serviceTypeId: true,
          createdById: true,
          dates: { select: { startTime: true, endTime: true } },
        },
      }),
      prisma.organization.findUnique({
        where: { id: organizationId },
        select: { logoUrl: true },
      }),
    ]);

    if (!directory || !event) return;

    // Only a manager's pick counts, as the alerts decide it — a cover who has
    // since been made a member was already being skipped.
    const coverOf = (picks: { team: Team; userId: string }[], team: Team) => {
      const userId = picks.find((pick) => pick.team === team)?.userId;

      return userId ? directory.managers.get(userId) ?? null : null;
    };

    const changes: CoverChange[] = TEAM_ORDER.flatMap((team) => {
      const from = coverOf(before, team);
      const cover = coverOf(after, team);

      if ((from?.userId ?? null) === (cover?.userId ?? null)) return [];

      const leadId = directory.leads.get(teamKey(event.serviceTypeId, team));

      return [
        {
          team,
          from,
          cover,
          lead: leadId ? directory.managers.get(leadId) ?? null : null,
        },
      ];
    });

    if (changes.length === 0) return;

    const byAdmin = changedBy.role === OrgRole.ADMIN;

    const fullName = (person: Person) => `${person.firstName} ${person.lastName}`;
    const list = (items: { team: Team }[]) =>
      names.format(items.map(({ team }) => teamLabel(team)));
    const creator = event.createdById
      ? directory.managers.get(event.createdById)
      : undefined;

    const handoffFor = ({ team, cover, lead }: CoverChange): TeamHandoff => ({
      teamLabel: teamLabel(team),
      handler: cover
        ? `${fullName(cover)} · this event only`
        : lead
          ? `Back to ${fullName(lead)}, the lead`
          : creator
            ? `Back to ${fullName(creator)}, the event's creator`
            : "Back to the owners",
    });

    const handoffs = changes.map(handoffFor);

    const organizationName = directory.organizationName;
    const serviceTypeName = directory.serviceTypeNames.get(event.serviceTypeId);
    const when = formatEventWhen(event.dates);
    const short = formatEventShort(event.dates);
    const viewLink = `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/organizations/${organizationId}/events/${eventId}`;

    const email = (
      to: Person,
      subject: string,
      heading: string,
      message: string,
      teams: TeamHandoff[],
      footer: string,
    ) => ({
      from: organizationSender(organizationName),
      to: to.email,
      subject,
      react: EventTeamHandoffEmail({
        recipientName: to.firstName,
        organizationName,
        logoUrl: organization?.logoUrl ?? null,
        heading,
        changedByName: changedBy.name,
        message,
        eventName: event.name,
        eventDate: when?.date ?? null,
        eventTime: when?.time ?? null,
        handoffs: teams,
        viewLink,
        footer,
      }),
    });

    // What moved for each person: teams they lead that went to somebody else
    // or came back, and covers they were taken off.
    const byPerson = new Map<
      string,
      {
        person: Manager;
        off: (CoverChange & { cover: Manager })[];
        back: CoverChange[];
        dropped: CoverChange[];
      }
    >();

    const entryFor = (person: Manager) => {
      const entry = byPerson.get(person.userId) ?? { person, off: [], back: [], dropped: [] };
      byPerson.set(person.userId, entry);
      return entry;
    };

    // Not about their own change, and not an owner the heads-up tells.
    const hears = (person: Manager) =>
      person.userId !== changedBy.userId && !(byAdmin && person.role === OrgRole.OWNER);

    for (const change of changes) {
      const { team, from, cover, lead } = change;

      if (lead && hears(lead)) {
        if (!from && cover && cover.userId !== lead.userId) {
          entryFor(lead).off.push({ ...change, cover });
        } else if (from && !cover && from.userId !== lead.userId) {
          entryFor(lead).back.push(change);
        }
      }

      // Off it now — unless it has simply come back to them as its lead.
      if (from && hears(from) && !(from.userId === lead?.userId && !cover)) {
        entryFor(from).dropped.push({ team, from, cover, lead });
      }
    }

    const notices = [...byPerson.values()].map(({ person, off, back, dropped }) => {
      // "handed Band to Kevin Ng", "took Band", "handed Vocals back to you",
      // "took you off Hospitality".
      const what = names.format([
        ...off.map(({ team, cover }) =>
          cover.userId === changedBy.userId
            ? `took ${teamLabel(team)}`
            : `handed ${teamLabel(team)} to ${fullName(cover)}`,
        ),
        ...back.map(({ team }) => `handed ${teamLabel(team)} back to you`),
        ...dropped.map(({ team }) => `took you off ${teamLabel(team)}`),
      ]);

      const effects = (long: boolean) =>
        present([
          off.length > 0 &&
            `You won't get ${list(off)} alerts for this event${long ? " — they're back with you from the next one" : ""}.`,
          back.length > 0 && `${list(back)} alerts for this event come to you again.`,
          dropped.length > 0 && `You won't get ${list(dropped)} alerts for this event anymore.`,
        ]);

      const kinds = [off, back, dropped].filter((items) => items.length > 0).length;

      const [heading, headline] =
        kinds > 1
          ? ["Your Teams Changed", "Your teams changed"]
          : off.length > 0
            ? [`${list(off)} Handed Off`, `${list(off)} handed off`]
            : back.length > 0
              ? [`${list(back)} Back With You`, `${list(back)} back with you`]
              : [`No Longer Covering ${list(dropped)}`, `No longer covering ${list(dropped)}`];

      const led = [...off, ...back];

      return {
        person,
        heading,
        headline,
        message: [`${changedBy.name} ${what} for ${event.name}.`, ...effects(true)].join(" "),
        pushBody: [`${changedBy.name} ${what}.`, ...effects(false)].join(" "),
        teams: [
          ...off.map(handoffFor),
          ...back.map(({ team }) => ({ teamLabel: teamLabel(team), handler: "Back with you" })),
          ...dropped.map(handoffFor),
        ],
        footer: `You're receiving this because ${names.format(
          present([
            led.length > 0 &&
              `you lead ${list(led)}${serviceTypeName ? ` for ${serviceTypeName}` : ""} at ${organizationName}`,
            dropped.length > 0 && `you were covering ${list(dropped)} for this event`,
          ]),
        )}.`,
      };
    });

    // Every owner when an admin made the change, unless the only change is
    // them now covering — the cover notice already tells them that.
    const owners = byAdmin
      ? organizationOwners(directory).filter(
          (owner) =>
            owner.userId !== changedBy.userId &&
            !changes.every((change) => change.cover?.userId === owner.userId),
        )
      : [];

    const labels = list(changes);
    const plural = changes.length > 1;

    await sendEmailBatches("team cover change", [
      ...notices.map(({ person, heading, headline, message, teams, footer }) =>
        email(person, `${headline} for ${event.name}`, heading, message, teams, footer),
      ),
      ...owners.map((owner) =>
        email(
          owner,
          `Heads-up: ${plural ? "team changes" : "team change"} for ${event.name}`,
          plural ? "Heads-up: Team Changes" : "Heads-up: Team Change",
          `${changedBy.name}, an admin, changed who handles ${labels} for this event. You can change it back from the event's edit form.`,
          handoffs,
          `You're receiving this because you're an owner of ${organizationName}.`,
        ),
      ),
    ]);

    await sendPushNotices("team cover change", [
      ...notices.map(
        ({ person, headline, pushBody }): PushNotice => ({
          email: person.email,
          title: `${headline}: ${event.name}`,
          subtitle: organizationName,
          body: [pushBody, short].filter(Boolean).join("\n"),
          data: { type: "event", organizationId, eventId },
        }),
      ),
      ...owners.map(
        (owner): PushNotice => ({
          email: owner.email,
          title: `Heads-up: ${plural ? "team changes" : "team change"} for ${event.name}`,
          subtitle: organizationName,
          body: [
            `${changedBy.name} changed who handles ${labels} for this event.`,
            ...handoffs.map(({ teamLabel: team, handler }) => `${team}: ${handler}`),
          ].join("\n"),
          data: { type: "event", organizationId, eventId },
        }),
      ),
    ]);
  } catch (err) {
    console.error(`Failed to tell about team picks on event ${eventId}`, err);
  }
}
