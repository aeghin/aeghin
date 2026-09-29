import "server-only";

import prisma from "@/lib/prisma";
import { OrgRole, type RoleCategory as Team } from "@/generated/prisma/enums";
import type { StaffingDirectory } from "@/lib/notifications/audience";

type LoadOptions = {
  /** Events whose watchers to read. None by default. */
  eventIds?: string[];
  /**
   * Whether to read anybody copied in at all. The bell only counts what each
   * person owns, so it skips both watcher tables.
   */
  watchers?: boolean;
};

/**
 * Everybody who can own or be copied in on one organization's staffing
 * alerts, read in one go so a whole batch of alerts can be decided without a
 * query each. Null once the organization is gone.
 */
export async function loadStaffingDirectory(
  organizationId: string,
  { eventIds = [], watchers = true }: LoadOptions = {},
): Promise<StaffingDirectory | null> {
  const [organization, managers, leads, teamWatchers, eventWatchers] =
    await Promise.all([
      prisma.organization.findUnique({
        where: { id: organizationId },
        select: { name: true },
      }),
      prisma.membership.findMany({
        where: { organizationId, role: { not: OrgRole.MEMBER } },
        // Oldest first, so "Lisa and Mike" reads the same way every time.
        orderBy: { createdAt: "asc" },
        select: {
          role: true,
          user: {
            select: { id: true, email: true, firstName: true, lastName: true },
          },
        },
      }),
      prisma.teamLead.findMany({
        where: { organizationId },
        select: { category: true, userId: true },
      }),
      watchers
        ? prisma.teamWatcher.findMany({
            where: { organizationId },
            orderBy: { createdAt: "asc" },
            select: { category: true, userId: true },
          })
        : Promise.resolve([]),
      watchers && eventIds.length > 0
        ? prisma.eventWatcher.findMany({
            where: { organizationId, eventId: { in: eventIds } },
            orderBy: { createdAt: "asc" },
            select: { eventId: true, userId: true },
          })
        : Promise.resolve([]),
    ]);

  if (!organization) return null;

  const byTeam = new Map<Team, string[]>();

  for (const { category, userId } of teamWatchers) {
    byTeam.set(category, [...(byTeam.get(category) ?? []), userId]);
  }

  const byEvent = new Map<string, string[]>();

  for (const { eventId, userId } of eventWatchers) {
    byEvent.set(eventId, [...(byEvent.get(eventId) ?? []), userId]);
  }

  return {
    organizationId,
    organizationName: organization.name,
    managers: new Map(
      managers.map(({ role, user }) => [
        user.id,
        {
          userId: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role,
        },
      ]),
    ),
    leads: new Map(leads.map(({ category, userId }) => [category, userId])),
    teamWatchers: byTeam,
    eventWatchers: byEvent,
  };
}

/**
 * A batch of alerts across organizations — a cron tick's — keyed on what each
 * is about: every organization's directory is read once, on first use, with
 * the watchers of every event of theirs in the batch.
 */
export function directoriesFor(
  events: { organizationId: string; eventId: string }[],
): (organizationId: string) => Promise<StaffingDirectory | null> {
  const eventIds = new Map<string, Set<string>>();

  for (const { organizationId, eventId } of events) {
    eventIds.set(
      organizationId,
      (eventIds.get(organizationId) ?? new Set()).add(eventId),
    );
  }

  const cache = new Map<string, Promise<StaffingDirectory | null>>();

  return (organizationId) => {
    let load = cache.get(organizationId);

    if (!load) {
      load = loadStaffingDirectory(organizationId, {
        eventIds: [...(eventIds.get(organizationId) ?? [])],
      });
      cache.set(organizationId, load);
    }

    return load;
  };
}

/**
 * One directory per organization for a batch that touches many events — an
 * organization-wide reconcile, or the cron's — so fifty events cost three
 * queries rather than a hundred and fifty. Bell-only, so it skips watchers.
 */
export type BellDirectories = Map<string, Promise<StaffingDirectory | null>>;

export const bellDirectory = (
  organizationId: string,
  cache?: BellDirectories,
): Promise<StaffingDirectory | null> => {
  const cached = cache?.get(organizationId);

  if (cached) return cached;

  const load = loadStaffingDirectory(organizationId, { watchers: false });
  cache?.set(organizationId, load);

  return load;
};
