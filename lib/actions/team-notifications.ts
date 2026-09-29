"use server";

import { updateTag } from "next/cache";
import { after } from "next/server";

import prisma from "@/lib/prisma";
import { OrgRole } from "@/generated/prisma/enums";
import { syncOrganizationNotifications } from "@/lib/notifications/sync";
import { notifyNewTeamLead } from "@/lib/notifications/team-lead";
import { currentUser } from "@/lib/services/user";
import {
  eventWatchSchema,
  teamLeadSchema,
  teamWatcherSchema,
  type EventWatchInput,
  type TeamLeadInput,
  type TeamWatcherInput,
} from "@/lib/validations/team-notifications";

/**
 * Who hears about each team's staffing alerts, and who is asked to act.
 *
 * Owners decide the organization's side of it: who leads each team, and who
 * else is copied in. Everything an admin can change here is about themselves
 * — their own heads-up, the events they watch — so nobody but an owner can
 * move somebody else's alerts.
 *
 * How a caller expires cache tags: `updateTag` throws inside a Route Handler,
 * so the mobile routes pass `revalidateTag`. Not exported: a "use server"
 * module may only export async functions.
 */
type TagInvalidator = (tag: string) => void;

type ActionResponse = { success: true } | { success: false; error: string };

const OWNERS_ONLY = "Only an owner can change this. Please reach out to an owner.";

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

/**
 * Makes somebody a team's lead, or clears it. Owners only.
 *
 * Moves who owns every open role in the team, so the bell is reconciled for
 * the organization straight away; the new lead is told once, unless they are
 * the owner who just picked themselves.
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

    const { organizationId, team, userId } = parsed.data;

    const role = await roleIn(user.id, organizationId);

    if (!role) return { success: false, error: "Unable to find membership" };

    if (role !== OrgRole.OWNER) return { success: false, error: OWNERS_ONLY };

    const previous = await prisma.teamLead.findUnique({
      where: { organizationId_category: { organizationId, category: team } },
      select: { userId: true },
    });

    if (userId === null) {
      await prisma.teamLead.deleteMany({ where: { organizationId, category: team } });
    } else {
      const leadRole = await roleIn(userId, organizationId);

      if (!leadRole || !isManager(leadRole)) {
        return { success: false, error: "A team lead has to be an admin or owner" };
      }

      await prisma.teamLead.upsert({
        where: { organizationId_category: { organizationId, category: team } },
        update: { userId },
        create: { organizationId, category: team, userId },
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
          team,
          userId,
          assignedByName: `${user.firstName} ${user.lastName}`,
        }),
      );
    }

    return { success: true };
  } catch {
    return { success: false, error: "Unable to update the team lead, please try again" };
  }
};

/**
 * Puts somebody on a team's "Also notify", or takes them off. An owner may
 * change anybody; an admin only themselves. Only admins and owners can be on
 * it, since a member can't act on what it says.
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

    const { organizationId, team, userId, watching } = parsed.data;

    const role = await roleIn(user.id, organizationId);

    if (!role) return { success: false, error: "Unable to find membership" };

    if (!isManager(role)) return { success: false, error: "Unauthorized" };

    if (userId !== user.id && role !== OrgRole.OWNER) {
      return { success: false, error: OWNERS_ONLY };
    }

    if (watching) {
      const targetRole = userId === user.id ? role : await roleIn(userId, organizationId);

      if (!targetRole || !isManager(targetRole)) {
        return { success: false, error: "Only admins and owners can be notified about a team" };
      }

      await prisma.teamWatcher.upsert({
        where: {
          organizationId_category_userId: { organizationId, category: team, userId },
        },
        update: {},
        create: { organizationId, category: team, userId },
      });
    } else {
      await prisma.teamWatcher.deleteMany({
        where: { organizationId, category: team, userId },
      });
    }

    touch(`org-${organizationId}-team-notifications`);

    return { success: true };
  } catch {
    return { success: false, error: "Unable to update notifications, please try again" };
  }
};

/**
 * The caller watching one event, or not: a heads-up about every staffing
 * alert on it, whichever team it's in. Admins and owners, for themselves.
 */
export const setEventWatch = async (
  input: EventWatchInput,
  touch: TagInvalidator = updateTag,
): Promise<ActionResponse> => {
  try {
    const user = await currentUser();

    if (!user) return { success: false, error: "Unauthorized" };

    const parsed = eventWatchSchema.safeParse(input);

    if (!parsed.success) return { success: false, error: "Invalid request" };

    const { organizationId, eventId, watching } = parsed.data;

    const role = await roleIn(user.id, organizationId);

    if (!role) return { success: false, error: "Unable to find membership" };

    if (!isManager(role)) return { success: false, error: "Unauthorized" };

    const event = await prisma.event.findFirst({
      where: { id: eventId, organizationId },
      select: { id: true },
    });

    if (!event) return { success: false, error: "Unable to locate event" };

    if (watching) {
      await prisma.eventWatcher.upsert({
        where: { eventId_userId: { eventId, userId: user.id } },
        update: {},
        create: { eventId, organizationId, userId: user.id },
      });
    } else {
      await prisma.eventWatcher.deleteMany({ where: { eventId, userId: user.id } });
    }

    touch(`event-${eventId}-watch-${user.id}`);

    return { success: true };
  } catch {
    return { success: false, error: "Unable to update this event, please try again" };
  }
};
