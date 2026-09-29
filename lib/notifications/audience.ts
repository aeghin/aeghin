import {
  OrgRole,
  type RoleCategory as Team,
  type VolunteerRole,
} from "@/generated/prisma/enums";
import { teamLabel, teamOfRole } from "@/lib/config/roles";

/**
 * Who hears about a staffing problem, and on what footing.
 *
 * Every alert has exactly one kind of owner — the person asked to act — and
 * any number of people copied in for a heads-up. Two people asked to act on
 * the same hole is how an event ends up with two drummers, so the owner is
 * found by walking down one list and stopping at the first that exists:
 *
 *   1. the team's lead, for an alert about one role;
 *   2. whoever sent the invitation it is about;
 *   3. the event's creator;
 *   4. the organization's owners, the last resort.
 *
 * Everybody on that list has to still be an admin or owner, since a member
 * cannot staff an event. The owners are never an empty list —
 * `leaveOrganization` refuses to let the last one go — so an alert always
 * reaches somebody who can act.
 *
 * Copied in, and told who has it rather than asked to act: the team's "Also
 * notify" list, anybody watching the event, and the sender when a lead owns
 * the alert instead. Somebody who is both owner and copied in is an owner, and
 * hears once.
 *
 * Pure: `lib/notifications/directory.ts` reads the people, this decides.
 */

export type Person = {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
};

/** Everybody who can own or be copied in on a staffing alert, in one organization. */
export type StaffingDirectory = {
  organizationId: string;
  organizationName: string;
  /** Admins and owners by user id: the only people an alert can reach. */
  managers: Map<string, Person & { role: OrgRole }>;
  /** Each team's lead, by user id. May name somebody no longer a manager. */
  leads: Map<Team, string>;
  /** Each team's "Also notify", by user id. */
  teamWatchers: Map<Team, string[]>;
  /** Each loaded event's watchers, by user id. */
  eventWatchers: Map<string, string[]>;
};

/** Why somebody owns an alert. */
export type OwnerReason = "lead" | "sender" | "creator" | "owner";

/** Why somebody is copied in on one. */
export type CopyReason = "team" | "event" | "sender";

export type Addressee = {
  person: Person;
  reason: OwnerReason | CopyReason;
};

export type Audience = {
  owners: Addressee[];
  copied: Addressee[];
  /**
   * What the copied are told in place of a call to act: "Sam (Band lead) has
   * been asked to fill it."
   */
  headsUp: string;
};

/** A staffing alert about one role on one event. */
export type RoleAlert = {
  eventId: string;
  createdById: string | null;
  role: VolunteerRole;
  /** Who sent the invitation this is about, when it is about one. */
  senderId: string | null;
};

/** A staffing alert about a whole event: the last call, or it filling up. */
export type EventAlert = {
  eventId: string;
  createdById: string | null;
};

const names = new Intl.ListFormat("en", { type: "conjunction" });

const manager = (directory: StaffingDirectory, userId: string | null) =>
  userId ? directory.managers.get(userId) : undefined;

const toPerson = ({ userId, email, firstName, lastName }: Person): Person => ({
  userId,
  email,
  firstName,
  lastName,
});

/** The organization's owners, the list every alert falls back to. */
export const organizationOwners = (directory: StaffingDirectory): Person[] =>
  [...directory.managers.values()]
    .filter((person) => person.role === OrgRole.OWNER)
    .map(toPerson);

/**
 * Who owns an alert about one role, as user ids. A pure function of the
 * directory so the bell can ask it once per open role without a query each.
 */
export function roleOwners(
  directory: StaffingDirectory,
  alert: Omit<RoleAlert, "eventId">,
): { people: Person[]; reason: OwnerReason } {
  const lead = manager(directory, directory.leads.get(teamOfRole(alert.role)) ?? null);

  if (lead) return { people: [toPerson(lead)], reason: "lead" };

  const sender = manager(directory, alert.senderId);

  if (sender) return { people: [toPerson(sender)], reason: "sender" };

  return eventOwners(directory, alert.createdById);
}

/** Who owns an alert about a whole event: its creator, else the owners. */
export function eventOwners(
  directory: StaffingDirectory,
  createdById: string | null,
): { people: Person[]; reason: OwnerReason } {
  const creator = manager(directory, createdById);

  if (creator) return { people: [toPerson(creator)], reason: "creator" };

  return { people: organizationOwners(directory), reason: "owner" };
}

/** "Sam (Band lead) has been asked to fill it." */
function headsUpLine(
  owners: { people: Person[]; reason: OwnerReason },
  team: Team | null,
  task: string,
): string {
  const who = names.format(owners.people.map((person) => person.firstName));
  const plural = owners.people.length > 1;

  const title =
    owners.reason === "lead" && team
      ? ` (${teamLabel(team)} lead)`
      : owners.reason === "owner"
        ? plural
          ? " (owners)"
          : " (owner)"
        : "";

  return `${who}${title} ${plural ? "have" : "has"} been asked to ${task}.`;
}

/** Owners first, then the copied in the order given, each person once. */
function assemble(
  directory: StaffingDirectory,
  owners: { people: Person[]; reason: OwnerReason },
  copies: { userId: string | null; reason: CopyReason }[],
  { team, task }: { team: Team | null; task: string },
): Audience {
  const seen = new Set(owners.people.map((person) => person.userId));
  const copied: Addressee[] = [];

  for (const { userId, reason } of copies) {
    const person = manager(directory, userId);

    if (!person || seen.has(person.userId)) continue;

    seen.add(person.userId);
    copied.push({ person: toPerson(person), reason });
  }

  return {
    owners: owners.people.map((person) => ({ person, reason: owners.reason })),
    copied,
    headsUp: headsUpLine(owners, team, task),
  };
}

/** Everybody told about one role on one event, and on what footing. */
export function roleAudience(
  directory: StaffingDirectory,
  alert: RoleAlert,
): Audience {
  const owners = roleOwners(directory, alert);
  const team = teamOfRole(alert.role);

  return assemble(
    directory,
    owners,
    [
      // Only when somebody else owns it, which `assemble` works out: a sender
      // who is also the owner is already on the list.
      { userId: alert.senderId, reason: "sender" },
      ...(directory.teamWatchers.get(team) ?? []).map((userId) => ({
        userId,
        reason: "team" as const,
      })),
      ...(directory.eventWatchers.get(alert.eventId) ?? []).map((userId) => ({
        userId,
        reason: "event" as const,
      })),
    ],
    { team, task: "fill it" },
  );
}

/** Everybody told about a whole event: its owner, and whoever watches it. */
export function eventAudience(
  directory: StaffingDirectory,
  alert: EventAlert,
): Audience {
  return assemble(
    directory,
    eventOwners(directory, alert.createdById),
    (directory.eventWatchers.get(alert.eventId) ?? []).map((userId) => ({
      userId,
      reason: "event" as const,
    })),
    { team: null, task: "staff it" },
  );
}

/**
 * "You're receiving this because …" — the footer every staffing email ends
 * on, so nobody has to guess why an alert found them.
 */
export function reasonLine(
  reason: Addressee["reason"],
  organizationName: string,
  role?: VolunteerRole,
): string {
  const team = role ? teamLabel(teamOfRole(role)) : null;

  switch (reason) {
    case "lead":
      return team
        ? `You're receiving this because you lead ${team} at ${organizationName}.`
        : `You're receiving this because you lead a team at ${organizationName}.`;
    case "sender":
      return "You're receiving this because you sent the invitation.";
    case "creator":
      return `You're receiving this because you created this event at ${organizationName}.`;
    case "owner":
      return `You're receiving this because you're an owner of ${organizationName}.`;
    case "team":
      return team
        ? `You're receiving this because you're on Also notify for ${team} at ${organizationName}.`
        : `You're receiving this because you're on Also notify for a team at ${organizationName}.`;
    case "event":
      return "You're receiving this because you're watching this event.";
  }
}
