import "server-only";

import prisma from "@/lib/prisma";
import { OrgRole } from "@/generated/prisma/enums";
import { teamKey, type StaffingDirectory } from "@/lib/notifications/audience";

type LoadOptions = {
  /**
   * Whether to read the "Also notify" lists at all. The bell only counts what
   * each person owns, so it skips them.
   */
  watchers?: boolean;
};

/**
 * Everybody who can own or be copied in on one organization's staffing
 * alerts, read in one go so a whole batch of alerts can be decided without a
 * query each. Null once the organization is gone.
 *
 * Covers — somebody handling a team on one event only — are not here: they
 * belong to the event, and every caller reads its event anyway.
 */
export async function loadStaffingDirectory(
  organizationId: string,
  { watchers = true }: LoadOptions = {},
): Promise<StaffingDirectory | null> {
  const [organization, managers, leads, teamWatchers, serviceTypes] =
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
      // Only live service types' teams, as Settings shows them: a retired
      // type's events fall to their creator rather than to a lead nobody can
      // see or change any more.
      prisma.teamLead.findMany({
        where: { organizationId, serviceType: { deletedAt: null } },
        select: { serviceTypeId: true, category: true, userId: true },
      }),
      watchers
        ? prisma.teamWatcher.findMany({
            where: { organizationId, serviceType: { deletedAt: null } },
            orderBy: { createdAt: "asc" },
            select: { serviceTypeId: true, category: true, userId: true },
          })
        : Promise.resolve([]),
      prisma.serviceType.findMany({
        where: { organizationId },
        select: { id: true, name: true },
      }),
    ]);

  if (!organization) return null;

  const byTeam = new Map<string, string[]>();

  for (const { serviceTypeId, category, userId } of teamWatchers) {
    const key = teamKey(serviceTypeId, category);

    byTeam.set(key, [...(byTeam.get(key) ?? []), userId]);
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
    leads: new Map(
      leads.map(({ serviceTypeId, category, userId }) => [
        teamKey(serviceTypeId, category),
        userId,
      ]),
    ),
    teamWatchers: byTeam,
    serviceTypeNames: new Map(serviceTypes.map(({ id, name }) => [id, name])),
  };
}

/**
 * A batch of alerts across organizations — a cron tick's — where every
 * organization's directory is read once, on first use.
 */
export function directoriesFor(): (
  organizationId: string,
) => Promise<StaffingDirectory | null> {
  const cache = new Map<string, Promise<StaffingDirectory | null>>();

  return (organizationId) => {
    let load = cache.get(organizationId);

    if (!load) {
      load = loadStaffingDirectory(organizationId);
      cache.set(organizationId, load);
    }

    return load;
  };
}

/**
 * One directory per organization for a batch that touches many events — an
 * organization-wide reconcile, or the cron's — so fifty events cost four
 * queries rather than two hundred. Bell-only, so it skips "Also notify".
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
