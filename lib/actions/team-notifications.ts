"use server";

import { updateTag } from "next/cache";
import { after } from "next/server";

import prisma from "@/lib/prisma";
import { OrgRole } from "@/generated/prisma/enums";
import { syncOrganizationNotifications } from "@/lib/notifications/sync";
import {
  notifyFormerTeamLead,
  notifyNewTeamLead,
  notifyNewTeamWatcher,
} from "@/lib/notifications/team-lead";
import { currentUser } from "@/lib/services/user";
import {
  teamLeadSchema,
  teamWatcherSchema,
  type TeamLeadInput,
  type TeamWatcherInput,
} from "@/lib/validations/team-notifications";

/**
 * Who handles each team's open spots on each service type, and who else hears
 * about them. Owners only: this is the standing arrangement for every event.
 * Admins can still hand a team to somebody else on one event, from the create
 * and edit event forms (`resolveEventTeamLeads` in lib/actions/event.ts).
 *
 * How a caller expires cache tags: `updateTag` throws inside a Route Handler,
 * so the mobile routes pass `revalidateTag`. Not exported: a "use server"
 * module may only export async functions.
 */
type TagInvalidator = (tag: string) => void;

type ActionResponse = { success: true } | { success: false; error: string };

const OWNERS_ONLY = "Only owners can change staffing alerts.";

const isManager = (role: OrgRole) =>
  role === OrgRole.OWNER || role === OrgRole.ADMIN;

/** The caller's role in the organization, or null. */
const roleIn = async (userId: string, organizationId: string) =>
  (
    await prisma.membership.findUnique({
      where: { userId_organizationId: { userId, organizationId } },
      select: { role: true },
    })
  )?.role ?? null;

/** Whether a service type is one of the organization's live ones. */
const liveServiceType = async (serviceTypeId: string, organizationId: string) =>
  (await prisma.serviceType.count({
    where: { id: serviceTypeId, organizationId, deletedAt: null },
  })) > 0;

/**
 * Makes somebody a team's lead for one service type, or clears it.
 *
 * Moves who owns every open role in that team on that service type's events,
 * so the bell is reconciled for the organization straight away; the new lead
 * is told once, unless they picked themselves.
 */
export const setTeamLead = async (
  input: TeamLeadInput,
  touch: TagInvalidator = updateTag,
): Promise<ActionResponse> => {
  try {
    const user = await currentUser();

    if (!user) return { success: false, error: "Unauthorized" };

    const parsed = teamLeadSchema.safeParse(input);

    if (!parsed.success) return { success: false, error: "Invalid request" };

    const { organizationId, serviceTypeId, team, userId } = parsed.data;

    const role = await roleIn(user.id, organizationId);

    if (!role) return { success: false, error: "Unable to find membership" };

    if (role !== OrgRole.OWNER) return { success: false, error: OWNERS_ONLY };

    if (!(await liveServiceType(serviceTypeId, organizationId))) {
      return { success: false, error: "Unable to find that service type" };
    }

    const previous = await prisma.teamLead.findUnique({
      where: { serviceTypeId_category: { serviceTypeId, category: team } },
      select: { userId: true },
    });

    if (userId === null) {
      await prisma.teamLead.deleteMany({ where: { serviceTypeId, category: team } });
    } else {
      const leadRole = await roleIn(userId, organizationId);

      if (!leadRole || !isManager(leadRole)) {
        return { success: false, error: "A team lead has to be an admin or owner" };
      }

      await prisma.teamLead.upsert({
        where: { serviceTypeId_category: { serviceTypeId, category: team } },
        update: { userId },
        create: { organizationId, serviceTypeId, category: team, userId },
      });
    }

    touch(`org-${organizationId}-team-notifications`);

    // Every open role in the team just changed hands, and the bell counts
    // what each person owns.
    await syncOrganizationNotifications(organizationId, touch);

    if (userId && userId !== previous?.userId && userId !== user.id) {
      after(() =>
        notifyNewTeamLead({
          organizationId,
          serviceTypeId,
          team,
          userId,
          assignedByName: `${user.firstName} ${user.lastName}`,
        }),
      );
    }

    // And whoever led it before hears that it's moved on, unless they moved it.
    if (previous && previous.userId !== userId && previous.userId !== user.id) {
      after(() =>
        notifyFormerTeamLead({
          organizationId,
          serviceTypeId,
          team,
          formerLeadId: previous.userId,
          newLeadId: userId,
          changedByName: `${user.firstName} ${user.lastName}`,
        }),
      );
    }

    return { success: true };
  } catch {
    return { success: false, error: "Unable to update the team lead, please try again" };
  }
};

/**
 * Puts somebody on a team's "Also notify" for one service type, or takes them
 * off. Only admins and owners can be on it, since a member can't act on what
 * it says. Somebody newly put on it is told once, unless they added themselves.
 *
 * The bell is left alone: being copied in never earns a bell row.
 */
export const setTeamWatcher = async (
  input: TeamWatcherInput,
  touch: TagInvalidator = updateTag,
): Promise<ActionResponse> => {
  try {
    const user = await currentUser();

    if (!user) return { success: false, error: "Unauthorized" };

    const parsed = teamWatcherSchema.safeParse(input);

    if (!parsed.success) return { success: false, error: "Invalid request" };

    const { organizationId, serviceTypeId, team, userId, watching } = parsed.data;

    const role = await roleIn(user.id, organizationId);

    if (!role) return { success: false, error: "Unable to find membership" };

    if (role !== OrgRole.OWNER) return { success: false, error: OWNERS_ONLY };

    if (!(await liveServiceType(serviceTypeId, organizationId))) {
      return { success: false, error: "Unable to find that service type" };
    }

    // Whether this put them on it, rather than finding them there already.
    let added = false;

    if (watching) {
      const targetRole = userId === user.id ? role : await roleIn(userId, organizationId);

      if (!targetRole || !isManager(targetRole)) {
        return { success: false, error: "Only admins and owners can be notified about a team" };
      }

      const key = { serviceTypeId, category: team, userId };

      added =
        (await prisma.teamWatcher.findUnique({
          where: { serviceTypeId_category_userId: key },
          select: { id: true },
        })) === null;

      await prisma.teamWatcher.upsert({
        where: { serviceTypeId_category_userId: key },
        update: {},
        create: { organizationId, ...key },
      });
    } else {
      await prisma.teamWatcher.deleteMany({
        where: { serviceTypeId, category: team, userId },
      });
    }

    touch(`org-${organizationId}-team-notifications`);

    if (added && userId !== user.id) {
      after(() =>
        notifyNewTeamWatcher({
          organizationId,
          serviceTypeId,
          team,
          userId,
          addedByName: `${user.firstName} ${user.lastName}`,
        }),
      );
    }

    return { success: true };
  } catch {
    return { success: false, error: "Unable to update notifications, please try again" };
  }
};
