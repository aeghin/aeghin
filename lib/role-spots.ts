import { InvitationStatus, type VolunteerRole } from "@/generated/prisma/enums";
import { volunteerRoleConfig } from "@/lib/config/roles";

/**
 * How many people each role on an event needs. Every invite is somebody wanted
 * there, never a backup, so a role can need several: three BGVs, two guitarists.
 *
 * Stored as `Event.roleSpots` (and `EventTemplate.roleSpots`) holding only the
 * roles that need more than one — `{"BGVS": 3}`. A role missing from it needs
 * one, which is every role on every event made before counts existed.
 *
 * One rule for every reader — the meter, the bell, every staffing email and
 * push, auto-fill — so none of them can disagree about whether a spot is open.
 * The phone mirrors this in `src/lib/events/spots.ts`; keep the two in step.
 */
export type RoleSpots = Partial<Record<VolunteerRole, number>>;

/** The most people one role on one event can need. */
export const MAX_SPOTS = 20;

const isRole = (key: string): key is VolunteerRole => key in volunteerRoleConfig;

/** Reads a stored map, dropping anything that isn't a role needing a whole number above one. */
export function parseRoleSpots(value: unknown): RoleSpots {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  const spots: RoleSpots = {};

  for (const [key, count] of Object.entries(value)) {
    if (isRole(key) && typeof count === "number" && Number.isInteger(count) && count > 1) {
      spots[key] = Math.min(count, MAX_SPOTS);
    }
  }

  return spots;
}

/** How many people one role needs. */
export const spotsFor = (spots: RoleSpots, role: VolunteerRole): number => spots[role] ?? 1;

/** The map worth storing: roles still on the event, counts above one. */
export function storedRoleSpots(spots: RoleSpots, roles: readonly VolunteerRole[]): RoleSpots {
  const stored: RoleSpots = {};

  for (const role of new Set(roles)) {
    const count = Math.min(spots[role] ?? 1, MAX_SPOTS);

    if (count > 1) stored[role] = count;
  }

  return stored;
}

/** "BGVs ×3", or just "Pianist" for one. */
export const spotLabel = (role: VolunteerRole, count: number): string =>
  count > 1 ? `${volunteerRoleConfig[role].label} ×${count}` : volunteerRoleConfig[role].label;

type Answer = {
  role: VolunteerRole;
  status: InvitationStatus;
  expiresAt: Date;
};

/** Where one role stands against how many it needs. */
export type RoleStanding = {
  role: VolunteerRole;
  needed: number;
  accepted: number;
  /** Invited and still inside their window to answer. */
  deciding: number;
  declined: number;
  /** Spots nobody has said yes to and nobody is deciding on. */
  open: number;
};

/**
 * One role's standing. A lapsed invitation counts as nobody deciding even before
 * the hourly sweep writes EXPIRED — the window an admin most needs to see it.
 */
export function roleStanding(
  role: VolunteerRole,
  spots: RoleSpots,
  assignments: readonly Answer[],
  now: Date,
): RoleStanding {
  let accepted = 0;
  let deciding = 0;
  let declined = 0;

  for (const assignment of assignments) {
    if (assignment.role !== role) continue;

    if (assignment.status === InvitationStatus.ACCEPTED) {
      accepted += 1;
    } else if (assignment.status === InvitationStatus.PENDING && assignment.expiresAt > now) {
      deciding += 1;
    } else if (assignment.status === InvitationStatus.DECLINED) {
      declined += 1;
    }
  }

  const needed = spotsFor(spots, role);

  return {
    role,
    needed,
    accepted,
    deciding,
    declined,
    open: Math.max(0, needed - accepted - deciding),
  };
}

/** Every role the event needs, each against its count. */
export const rosterStandings = (
  rolesNeeded: readonly VolunteerRole[],
  spots: RoleSpots,
  assignments: readonly Answer[],
  now: Date,
): RoleStanding[] =>
  [...new Set(rolesNeeded)].map((role) => roleStanding(role, spots, assignments, now));

/**
 * Every spot has somebody who said yes, and nobody is still deciding — the
 * organization's rule: three BGVs invited, one accepted, is not fully staffed
 * until the other two answer.
 */
export const isFullyStaffed = (standings: readonly RoleStanding[]): boolean =>
  standings.length > 0 &&
  standings.every((standing) => standing.accepted >= standing.needed && standing.deciding === 0);
