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
 *   1. whoever covers the role's team on this event only;
 *   2. the team's lead for the event's service type;
 *   3. the event's creator;
 *   4. the organization's owners, the last resort.
 *
 * Everybody on that list has to still be an admin or owner, since a member
 * cannot staff an event. The owners are never an empty list —
 * `leaveOrganization` refuses to let the last one go — so an alert always
 * reaches somebody who can act.
 *
 * Copied in, and told who has it rather than asked to act: the team's "Also
 * notify" for the event's service type, and whoever sent the invitation when
 * somebody else is asked. Somebody who is both owner and copied in is an
 * owner, and hears once.
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
  /**
   * Each service type's team leads, keyed by `teamKey`. May name somebody no
   * longer a manager.
   */
  leads: Map<string, string>;
  /** Each service type's team "Also notify", keyed by `teamKey`. */
  teamWatchers: Map<string, string[]>;
  /** Service type names by id, for the footer's "you lead Band for Worship". */
  serviceTypeNames: Map<string, string>;
};

/** One team on one service type: the key a lead or an "Also notify" hangs off. */
export const teamKey = (serviceTypeId: string, team: Team) =>
  `${serviceTypeId}:${team}`;

/** Why somebody owns an alert. */
export type OwnerReason = "cover" | "lead" | "creator" | "owner";

/** Why somebody is copied in on one. */
export type CopyReason = "team" | "sender";

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

/** What decides who owns an alert about one role. */
export type RoleOwnerInput = {
  serviceTypeId: string;
  createdById: string | null;
  role: VolunteerRole;
  /** Who covers this role's team on this event only, when somebody does. */
  coverId: string | null;
};

/** A staffing alert about one role on one event. */
export type RoleAlert = {
  serviceTypeId: string;
  createdById: string | null;
  role: VolunteerRole;
  /** Who covers this role's team on this event only, when somebody does. */
  coverId: string | null;
  /** Who sent the invitation this is about: copied in when somebody else is asked. */
  inviterId: string | null;
};

/** A staffing alert about a whole event: the last call, or it filling up. */
export type EventAlert = {
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
  alert: RoleOwnerInput,
): { people: Person[]; reason: OwnerReason } {
  const cover = manager(directory, alert.coverId);

  if (cover) return { people: [toPerson(cover)], reason: "cover" };

  const lead = manager(
    directory,
    directory.leads.get(teamKey(alert.serviceTypeId, teamOfRole(alert.role))) ?? null,
  );

  if (lead) return { people: [toPerson(lead)], reason: "lead" };

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
      : owners.reason === "cover" && team
        ? ` (covering ${teamLabel(team)})`
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
      { userId: alert.inviterId, reason: "sender" },
      ...(directory.teamWatchers.get(teamKey(alert.serviceTypeId, team)) ?? []).map(
        (userId) => ({ userId, reason: "team" as const }),
      ),
    ],
    { team, task: "fill it" },
  );
}

/**
 * Everybody told about a whole event: its creator, else the owners. Team
 * leads have already heard about each of their roles as it opened up, so
 * nobody is copied in.
 */
export function eventAudience(
  directory: StaffingDirectory,
  alert: EventAlert,
): Audience {
  return assemble(directory, eventOwners(directory, alert.createdById), [], {
    team: null,
    task: "staff it",
  });
}

/**
 * "You're receiving this because …" — the footer every staffing email ends
 * on, so nobody has to guess why an alert found them. `serviceTypeName` names
 * which service a lead or "Also notify" is for, when the organization runs
 * more than one.
 */
export function reasonLine(
  reason: Addressee["reason"],
  organizationName: string,
  role?: VolunteerRole,
  serviceTypeName?: string | null,
): string {
  const team = role ? teamLabel(teamOfRole(role)) : null;
  const service = serviceTypeName ? ` for ${serviceTypeName}` : "";

  switch (reason) {
    case "cover":
      return team
        ? `You're receiving this because you're covering ${team} for this event.`
        : "You're receiving this because you're covering a team for this event.";
    case "lead":
      return team
        ? `You're receiving this because you lead ${team}${service} at ${organizationName}.`
        : `You're receiving this because you lead a team at ${organizationName}.`;
    case "sender":
      return "You're receiving this because you sent the invitation.";
    case "creator":
      return `You're receiving this because you created this event at ${organizationName}.`;
    case "owner":
      return `You're receiving this because you're an owner of ${organizationName}.`;
    case "team":
      return team
        ? `You're receiving this because you're on Also notify for ${team}${service} at ${organizationName}.`
        : `You're receiving this because you're on Also notify for a team at ${organizationName}.`;
  }
}
