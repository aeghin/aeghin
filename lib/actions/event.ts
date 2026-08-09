"use server";

import prisma from "@/lib/prisma";
import {
  ActivityType,
  InvitationStatus,
  OrgRole,
  VolunteerRole,
} from "@/generated/prisma/enums";

import { logActivity, volunteerRoleLabels } from "@/lib/activity";

import {
  AddEventRolesInput,
  addEventRolesSchema,
  CreateEventInput,
  createEventInputSchema,
  InviteToEventInput,
  inviteToEventSchema,
  editEventDetailsSchema,
  EditEventDetailsInput,
  RemoveEventRoleInput,
  removeEventRoleSchema
} from "@/lib/validations/event";

import {
  EventEmailInput,
  eventEmailSchema,
} from "@/lib/validations/event-email";

import EventAssignmentEmail from "@/components/email/event-email-template";
import EventMessageEmail from "@/components/email/event-message-template";

import {
  findBestReplacement,
  getConflictingAssignments,
  getConflictingUserIds,
} from "@/lib/services/scheduling";

import {
  getBlockedUserIds,
  getBlockoutsForDates,
} from "@/lib/services/blockouts";

import { Resend } from "resend";
import { revalidatePath, updateTag } from "next/cache";

import { currentUser } from "@/lib/services/user";

import { after } from "next/server";

const resend = new Resend(process.env.RESEND_EMAIL_API_KEY);

type CheckMemberAvailabilityInput = {
  organizationId: string;
  dates: {
    date: string;
    startTime: string;
    endTime: string;
  }[];
  // Set when checking availability for an event that already exists, so the
  // event's own roster doesn't come back as conflicting with itself.
  excludeEventId?: string;
};

export type MemberConflict = {
  eventName: string;
  startTime: string;
  endTime: string;
};

export type MemberBlockout = {
  startDate: string;
  endDate: string;
};

export type MemberAvailability = {
  conflicts: Record<string, MemberConflict>;
  blockouts: Record<string, MemberBlockout>;
};

type ActionResponse = { success: true } | { success: false; error: string };

export const checkMemberAvailability = async ({
  organizationId,
  dates,
  excludeEventId,
}: CheckMemberAvailabilityInput): Promise<MemberAvailability> => {
  
  const user = await currentUser();

  if (!user) throw new Error("Unauthorized");

  const { id } = user;

  const membership = await prisma.membership.findFirst({
    where: {
      userId: id,
      organizationId,
    },
    select: { role: true },
  });

  if (!membership || membership.role === OrgRole.MEMBER) {
    throw new Error("Unauthorized");
  }

  const [conflictingAssignments, blockoutRows] = await Promise.all([
    getConflictingAssignments(organizationId, dates, excludeEventId),
    getBlockoutsForDates(organizationId, dates),
  ]);

  const conflicts: Record<string, MemberConflict> = {};

  for (const assignment of conflictingAssignments) {
    if (!conflicts[assignment.userId]) {
      const overlappingDate = assignment.event.dates.find((eventDate) => {
        return dates.some(({ startTime, endTime }) => {
          const newStart = new Date(startTime);
          const newEnd = new Date(endTime);
          return eventDate.startTime < newEnd && eventDate.endTime > newStart;
        });
      });

      const displayDate = overlappingDate || assignment.event.dates[0];

      conflicts[assignment.userId] = {
        eventName: assignment.event.name,
        startTime: displayDate.startTime.toISOString(),
        endTime: displayDate.endTime.toISOString(),
      };
    }
  }

  const blockouts: Record<string, MemberBlockout> = {};

  for (const blockout of blockoutRows) {
    if (!blockouts[blockout.userId]) {
      blockouts[blockout.userId] = {
        startDate: blockout.startDate.toISOString(),
        endDate: blockout.endDate.toISOString(),
      };
    }
  }

  return { conflicts, blockouts };
};

export async function createEvent(
  input: CreateEventInput,
  organizationId: string,
): Promise<ActionResponse> {
  try {
    
    const users = await currentUser();

    if (!users) return { success: false, error: "Unauthorized" };

    const { id } = users;

    const parsed = createEventInputSchema.safeParse(input);

    if (!parsed.success) return { success: false, error: parsed.error.message };

    const {
      serviceTypeId,
      name,
      dayTimes,
      location,
      description,
      roleAssignments,
      rolesNeeded,
      expiresAt,
      smartSchedulingEnabled
    } = parsed.data;

    const [membership, serviceType] = await Promise.all([
      prisma.membership.findFirst({
        where: { userId: id, organizationId },
        include: { organization: { select: { name: true, logoUrl: true } } },
      }),
      prisma.serviceType.findFirst({
        where: { id: serviceTypeId, organizationId, deletedAt: null },
      }),
    ]);

    if (!membership) return { success: false, error: "Unable to find user" };

    if (membership.role !== OrgRole.OWNER && membership.role !== OrgRole.ADMIN) {
      return {
        success: false,
        error: "Unauthorized, please reach out to your Admin",
      };
    }

    if (!serviceType) return { success: false, error: "Invalid Service Type" };

    const { name: organizationName, logoUrl } = membership.organization;

    const assignedUserIds = Object.values(roleAssignments).flat();

    if (assignedUserIds.length > 0) {
      const assignedUserIdSet = new Set(assignedUserIds);

      const memberships = await prisma.membership.findMany({
        where: {
          organizationId,
          userId: { in: assignedUserIds },
        },
        select: { userId: true, volunteerRoles: true },
      });

      if (memberships.length !== assignedUserIdSet.size) {
        return { success: false, error: "One or more assigned users are not members of this organization" };
      }

      // The picker only lists members holding the role, so this catches crafted
      // requests and the window where a role is revoked while the form is open.
      const rolesByUser = new Map(
        memberships.map((m) => [m.userId, m.volunteerRoles]),
      );

      const unqualifiedIds = new Set<string>();

      for (const [role, userIds] of Object.entries(roleAssignments)) {
        for (const uid of userIds) {
          if (!rolesByUser.get(uid)?.includes(role as VolunteerRole)) {
            unqualifiedIds.add(uid);
          }
        }
      }

      if (unqualifiedIds.size > 0) {
        const unqualifiedUsers = await prisma.user.findMany({
          where: { id: { in: [...unqualifiedIds] } },
          select: { firstName: true, lastName: true },
        });

        const names = unqualifiedUsers
          .map((u) => `${u.firstName} ${u.lastName}`)
          .join(", ");

        return {
          success: false,
          error: `Unable to assign ${names} — they don't have the required volunteer role`,
        };
      }

      // Hard block: members with a blockout on any event day can't be assigned.
      const blockoutRows = await getBlockoutsForDates(
        organizationId,
        Object.values(dayTimes).map((times) => ({
          startTime: times.startTime,
          endTime: times.endTime,
        })),
      );

      const blockedIds = new Set(
        blockoutRows
          .map((b) => b.userId)
          .filter((uid) => assignedUserIdSet.has(uid)),
      );

      if (blockedIds.size > 0) {
        const blockedUsers = await prisma.user.findMany({
          where: { id: { in: [...blockedIds] } },
          select: { firstName: true, lastName: true },
        });

        const names = blockedUsers
          .map((u) => `${u.firstName} ${u.lastName}`)
          .join(", ");

        return {
          success: false,
          error: `Unable to assign ${names} — they have blockout dates during this event`,
        };
      }
    }

     const newEventId = await prisma.$transaction(async (tx) => {
      const event = await tx.event.create({
        data: {
          name,
          description: description || "",
          location,
          rolesNeeded,
          smartSchedulingEnabled,
          createdById: id,
          serviceTypeId,
          organizationId,
        },
      });

      await tx.eventDate.createMany({
        data: Object.entries(dayTimes).map(([, times]) => ({
          eventId: event.id,
          startTime: new Date(times.startTime),
          endTime: new Date(times.endTime),
        })),
      });

      if (assignedUserIds.length > 0) {
        await tx.eventAssignment.createMany({
          data: Object.entries(roleAssignments).flatMap(([role, userIds]) =>
            userIds.map((uid) => ({
              eventId: event.id,
              userId: uid,
              role: role as VolunteerRole,
              assignedById: id,
              organizationId,
              expiresAt: new Date(Date.now() + expiresAt * 24 * 60 * 60 * 1000)
            })),
          ),
        });
      }

      return event.id;
    });

    if (assignedUserIds.length > 0) {
      const assignedUsers = await prisma.user.findMany({
        where: { id: { in: assignedUserIds } },
        select: { id: true, email: true, firstName: true },
      });

      for (const uid of new Set(assignedUserIds)) {
        updateTag(`user-${uid}-events-${organizationId}`)
      };

      after(async () => {await Promise.allSettled(
        assignedUsers.map((user) =>
          resend.emails.send({
            from: "Aeghin <support@aeghin.com>",
            to: user.email,
            subject: `You've been assigned to ${name}`,
            react: EventAssignmentEmail({
              recipientName: user.firstName,
              eventName: name,
              organizationName: organizationName || "",
              logoUrl,
              viewLink: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/organizations/${organizationId}`,
            }),
          }),
        ),
      );
  });
};

    await logActivity({
      organizationId,
      eventId: newEventId,
      eventName: name,
      type: ActivityType.EVENT_CREATED,
      actorName: `${users.firstName} ${users.lastName}`,
      targetName: name,
      detail: serviceType.name,
    });

    if (smartSchedulingEnabled) {
      await logActivity({
        organizationId,
        eventId: newEventId,
        eventName: name,
        type: ActivityType.SMART_SCHEDULING_ENABLED,
        actorName: `${users.firstName} ${users.lastName}`,
      });
    }

    updateTag(`org-${organizationId}-events`);
    updateTag(`org-${organizationId}-activity`);
    updateTag(`event-${newEventId}-org-${organizationId}-activity`);

    revalidatePath(`/dashboard/organizations/${organizationId}`);

    return { success: true };

  } catch {
    return { success: false, error: "Unable to create event" };
  }
}


export const acceptEventInvitation = async (organizationId: string, eventId: string): Promise<ActionResponse> => {

  try {

    const user = await currentUser();

    if (!user) return { success: false, error: "Unauthorized" };

    const event = await prisma.eventAssignment.findUnique({
      where: {
        eventId_userId: { eventId: eventId, userId: user.id },
        organizationId,
        status: InvitationStatus.PENDING,
        expiresAt: { gt: new Date() }
      }
    });

    if (!event) return { success: false, error: "Unable to find this event" };

    await prisma.eventAssignment.update({
      where: {
        id: event.id,
        organizationId,
      },
      data: {
        status: InvitationStatus.ACCEPTED
      }
    });

    updateTag(`user-${user.id}-events-${organizationId}`);
    updateTag(`event-${eventId}-org-${organizationId}-details`);
    updateTag(`org-${organizationId}-acceptance-stats`);

    return { success: true };

  } catch {

    return { success: false, error: "Failed to accept invite" };

  }

}

export const declineEventInvitation = async (organizationId: string, eventId: string): Promise<ActionResponse> => {

  try {

    const user = await currentUser();

    if (!user) return { success: false, error: "Unauthorized" };

    const assignment = await prisma.eventAssignment.findUnique({
      where: {
        eventId_userId: { eventId: eventId, userId: user.id },
        organizationId,
        status: InvitationStatus.PENDING,
      },
      select: {
        id: true,
        role: true,
        assignedById: true,
        expiresAt: true,
        event: { select: { name: true, smartSchedulingEnabled: true } },
        organization: { select: { name: true, logoUrl: true } },
      },
    });

    if (!assignment) return { success: false, error: "Unable to find this event" };

    await prisma.eventAssignment.update({
      where: {
        id: assignment.id,
        organizationId,
      },
      data: {
        status: InvitationStatus.DECLINED
      }
    });

    updateTag(`user-${user.id}-events-${organizationId}`);
    updateTag(`event-${eventId}-org-${organizationId}-details`);
    updateTag(`org-${organizationId}-acceptance-stats`);

    const declinerName = `${user.firstName} ${user.lastName}`;
    const roleLabel = volunteerRoleLabels[assignment.role];
    const eventName = assignment.event.name;

    if (!assignment.event.smartSchedulingEnabled) {
      await logActivity({
        organizationId,
        eventId,
        eventName,
        type: ActivityType.SMART_FILL_SKIPPED,
        actorName: declinerName,
        targetName: roleLabel,
      });

      updateTag(`org-${organizationId}-activity`);
      updateTag(`event-${eventId}-org-${organizationId}-activity`);

      return { success: true };
    }

    // Smart scheduling: auto-invite the next best available member into the
    // role just vacated. Best-effort and isolated — if anything here fails, the
    // decline the user already committed must still succeed.
    try {
      const outcome = await findBestReplacement({
        organizationId,
        eventId,
        declinedRole: assignment.role,
      });

      if (outcome.status === "FOUND") {
        const replacement = outcome.candidate;

        await prisma.eventAssignment.create({
          data: {
            eventId,
            userId: replacement.userId,
            role: assignment.role,
            assignedById: assignment.assignedById,
            organizationId,
            status: InvitationStatus.PENDING,
            autoAssigned: true,
            // Keep the slot's original deadline; fall back to a fresh window
            // only if that deadline has already passed.
            expiresAt:
              assignment.expiresAt > new Date()
                ? assignment.expiresAt
                : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          },
        });

        await logActivity({
          organizationId,
          eventId,
          eventName,
          type: ActivityType.AUTO_INVITE_SENT,
          actorName: declinerName,
          targetName: `${replacement.firstName} ${replacement.lastName}`,
          detail: roleLabel,
        });

        updateTag(`user-${replacement.userId}-events-${organizationId}`);
        updateTag(`event-${eventId}-org-${organizationId}-details`);

        after(async () => {
          await resend.emails.send({
            from: "Aeghin <support@aeghin.com>",
            to: replacement.email,
            subject: `You've been assigned to ${assignment.event.name}`,
            react: EventAssignmentEmail({
              recipientName: replacement.firstName,
              eventName: assignment.event.name,
              organizationName: assignment.organization.name,
              logoUrl: assignment.organization.logoUrl,
              viewLink: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/organizations/${organizationId}`,
            }),
          });
        });
      } else if (outcome.status === "NO_QUALIFIED_MEMBERS") {
        await logActivity({
          organizationId,
          eventId,
          eventName,
          type: ActivityType.SMART_FILL_NO_CANDIDATES,
          actorName: declinerName,
          targetName: roleLabel,
        });
      } else if (outcome.status === "ALL_UNAVAILABLE") {
        const breakdown = [
          `${outcome.qualified} qualified`,
          outcome.conflicting > 0 && `${outcome.conflicting} double-booked`,
          outcome.blocked > 0 && `${outcome.blocked} on blockout`,
          outcome.alreadyAssigned > 0 &&
            `${outcome.alreadyAssigned} already on this event`,
        ].filter(Boolean);

        await logActivity({
          organizationId,
          eventId,
          eventName,
          type: ActivityType.SMART_FILL_ALL_UNAVAILABLE,
          actorName: declinerName,
          targetName: roleLabel,
          detail: breakdown.join(" · "),
        });
      } else {
        await logActivity({
          organizationId,
          eventId,
          eventName,
          type: ActivityType.SMART_FILL_FAILED,
          actorName: declinerName,
          targetName: roleLabel,
        });
      }
    } catch {
      // Swallow: smart-fill is best-effort; the decline already committed.
      await logActivity({
        organizationId,
        eventId,
        eventName,
        type: ActivityType.SMART_FILL_FAILED,
        actorName: declinerName,
        targetName: roleLabel,
      });
    }

    updateTag(`org-${organizationId}-activity`);
    updateTag(`event-${eventId}-org-${organizationId}-activity`);

    return { success: true };

  } catch {

    return { success: false, error: "Unable to decline Invite" };

  };
};

export const cancelUserEventAssignment = async (userId: string, organizationId: string, eventId: string): Promise<ActionResponse> => {
  
  try {

    const user = await currentUser();

    if (!user) return { success: false, error: "Unauthorized" };

    const userMembership = await prisma.membership.findUnique({
      where: {
        userId_organizationId: {
          userId: user.id, 
          organizationId,
        }
      },
      select: {
        role: true
      }
    });

    if (!userMembership) return { success: false, error: "Unable to locate membership" };

    if (userMembership.role === OrgRole.MEMBER) return { success: false, error: "Unauthorized" };

    await prisma.eventAssignment.update({
      where: {
        eventId_userId: {
          eventId,
          userId
        },
        organizationId
      },
      data: {
        status: InvitationStatus.CANCELED
      }
    }); 

    updateTag(`user-${userId}-events-${organizationId}`);
    updateTag(`event-${eventId}-org-${organizationId}-details`);

    return { success: true };

  } catch {

    return { success: false, error: "Something went wrong, try again" };

  };
}


// Smart scheduling is per-event, so it can be flipped on the event page after
// creation without touching any other event.
export const setEventSmartScheduling = async (
  organizationId: string,
  eventId: string,
  enabled: boolean,
): Promise<ActionResponse> => {

  try {

    const user = await currentUser();

    if (!user) return { success: false, error: "Unauthorized" };

    const membership = await prisma.membership.findUnique({
      where: {
        userId_organizationId: {
          userId: user.id,
          organizationId,
        }
      },
      select: {
        role: true
      }
    });

    if (!membership) return { success: false, error: "Unable to locate membership" };

    if (membership.role === OrgRole.MEMBER) return { success: false, error: "Unauthorized" };

    const updatedEvent = await prisma.event.update({
      where: {
        id: eventId,
        organizationId,
      },
      data: {
        smartSchedulingEnabled: enabled
      },
      select: {
        name: true
      }
    });

    await logActivity({
      organizationId,
      eventId,
      eventName: updatedEvent.name,
      type: enabled
        ? ActivityType.SMART_SCHEDULING_ENABLED
        : ActivityType.SMART_SCHEDULING_DISABLED,
      actorName: `${user.firstName} ${user.lastName}`,
    });

    updateTag(`event-${eventId}-org-${organizationId}-details`);
    updateTag(`org-${organizationId}-activity`);
    updateTag(`event-${eventId}-org-${organizationId}-activity`);

    return { success: true };

  } catch {

    return { success: false, error: "Something went wrong, try again" };

  };
}


// Adds roles to an event's roster without assigning anyone — an open slot the
// Team card can render and invite into later.
export const addEventRoles = async (
  organizationId: string,
  eventId: string,
  input: AddEventRolesInput,
): Promise<ActionResponse> => {

  try {

    const user = await currentUser();

    if (!user) return { success: false, error: "Unauthorized" };

    const parsed = addEventRolesSchema.safeParse(input);

    if (!parsed.success) return { success: false, error: parsed.error.message };

    const { roles } = parsed.data;

    const [membership, event] = await Promise.all([
      prisma.membership.findUnique({
        where: {
          userId_organizationId: { userId: user.id, organizationId },
        },
        select: { role: true },
      }),
      prisma.event.findFirst({
        where: { id: eventId, organizationId },
        select: { rolesNeeded: true },
      }),
    ]);

    if (!membership) return { success: false, error: "Unable to locate membership" };

    if (membership.role === OrgRole.MEMBER) return { success: false, error: "Unauthorized" };

    if (!event) return { success: false, error: "Unable to locate event" };

    const merged = [...new Set([...event.rolesNeeded, ...roles])];

    if (merged.length === event.rolesNeeded.length) {
      return { success: false, error: "Those roles are already on this event" };
    }

    await prisma.event.update({
      where: { id: eventId },
      data: { rolesNeeded: merged },
    });

    updateTag(`event-${eventId}-org-${organizationId}-details`);
    updateTag(`org-${organizationId}-events`);

    return { success: true };

  } catch {

    return { success: false, error: "Unable to add roles, please try again" };

  };
};


// The counterpart to addEventRoles. Only a role nobody is live on can come off —
// pulling a volunteer from an event stays its own explicit act. Dead rows
// (declined, canceled, lapsed) are deleted with it, since the roster is the union
// of rolesNeeded and assignment roles and would otherwise keep rendering the role.
export const removeEventRole = async (
  organizationId: string,
  eventId: string,
  input: RemoveEventRoleInput,
): Promise<ActionResponse> => {

  try {

    const user = await currentUser();

    if (!user) return { success: false, error: "Unauthorized" };

    const parsed = removeEventRoleSchema.safeParse(input);

    if (!parsed.success) return { success: false, error: parsed.error.message };

    const { role } = parsed.data;

    const [membership, event] = await Promise.all([
      prisma.membership.findUnique({
        where: {
          userId_organizationId: { userId: user.id, organizationId },
        },
        select: { role: true },
      }),
      prisma.event.findFirst({
        where: { id: eventId, organizationId },
        select: {
          rolesNeeded: true,
          assignments: {
            where: { role },
            select: {
              userId: true,
              status: true,
              expiresAt: true,
              user: { select: { firstName: true, lastName: true } },
            },
          },
        },
      }),
    ]);

    if (!membership) return { success: false, error: "Unable to locate membership" };

    if (membership.role === OrgRole.MEMBER) return { success: false, error: "Unauthorized" };

    if (!event) return { success: false, error: "Unable to locate event" };

    // Mirrors the roster union the Team card renders from, so a legacy event
    // carrying assignments the role was never declared for is still removable.
    const onRoster =
      event.rolesNeeded.includes(role) || event.assignments.length > 0;

    if (!onRoster) return { success: false, error: "That role isn't on this event" };

    const now = new Date();

    const live = event.assignments.filter(
      (a) =>
        a.status === InvitationStatus.ACCEPTED ||
        (a.status === InvitationStatus.PENDING && a.expiresAt > now),
    );

    if (live.length > 0) {
      const names = live
        .map((a) => `${a.user.firstName} ${a.user.lastName}`)
        .join(", ");

      return {
        success: false,
        error: `Remove ${names} from this role first`,
      };
    }

    await prisma.$transaction([
      prisma.eventAssignment.deleteMany({
        where: { eventId, organizationId, role },
      }),
      prisma.event.update({
        where: { id: eventId },
        data: { rolesNeeded: event.rolesNeeded.filter((r) => r !== role) },
      }),
    ]);

    updateTag(`event-${eventId}-org-${organizationId}-details`);
    updateTag(`org-${organizationId}-events`);

    for (const { userId } of event.assignments) {
      updateTag(`user-${userId}-events-${organizationId}`);
    };

    // Dropping declined rows moves the denominator the acceptance rate counts from.
    if (event.assignments.some((a) => a.status === InvitationStatus.DECLINED)) {
      updateTag(`org-${organizationId}-acceptance-stats`);
    }

    return { success: true };

  } catch {

    return { success: false, error: "Unable to remove role, please try again" };

  };
};


type InviteToEventResult =
  | { success: true; invitedCount: number; skippedNames: string[] }
  | { success: false; error: string };

// Invites members into a role on an event that already exists. Mirrors the
// guards createEvent applies at creation time: admin/owner only, blockouts are
// a hard stop, conflicts are the caller's call (warned about in the UI).
export const inviteMembersToEvent = async (
  organizationId: string,
  eventId: string,
  input: InviteToEventInput,
): Promise<InviteToEventResult> => {

  try {

    const user = await currentUser();

    if (!user) return { success: false, error: "Unauthorized" };

    const parsed = inviteToEventSchema.safeParse(input);

    if (!parsed.success) return { success: false, error: parsed.error.message };

    const { role, userIds, expiresAt } = parsed.data;

    const uniqueUserIds = [...new Set(userIds)];

    const [membership, event] = await Promise.all([
      prisma.membership.findUnique({
        where: {
          userId_organizationId: { userId: user.id, organizationId },
        },
        include: { organization: { select: { name: true, logoUrl: true } } },
      }),
      prisma.event.findFirst({
        where: { id: eventId, organizationId },
        select: {
          name: true,
          rolesNeeded: true,
          dates: { select: { startTime: true, endTime: true } },
          assignments: {
            where: { userId: { in: uniqueUserIds } },
            select: {
              id: true,
              userId: true,
              status: true,
              expiresAt: true,
              user: { select: { firstName: true, lastName: true } },
            },
          },
        },
      }),
    ]);

    if (!membership) return { success: false, error: "Unable to locate membership" };

    if (membership.role !== OrgRole.OWNER && membership.role !== OrgRole.ADMIN) {
      return {
        success: false,
        error: "Unauthorized, please reach out to your Admin",
      };
    }

    if (!event) return { success: false, error: "Unable to locate event" };

    const memberships = await prisma.membership.findMany({
      where: {
        organizationId,
        userId: { in: uniqueUserIds },
      },
      select: { userId: true, volunteerRoles: true },
    });

    if (memberships.length !== uniqueUserIds.length) {
      return { success: false, error: "One or more members are not part of this organization" };
    }

    // The picker only lists members holding the role, so this catches crafted
    // requests and the window where a role is revoked mid-invite.
    const unqualified = memberships.filter(
      (m) => !m.volunteerRoles.includes(role),
    );

    if (unqualified.length > 0) {
      const unqualifiedUsers = await prisma.user.findMany({
        where: { id: { in: unqualified.map((m) => m.userId) } },
        select: { firstName: true, lastName: true },
      });

      const names = unqualifiedUsers
        .map((u) => `${u.firstName} ${u.lastName}`)
        .join(", ");

      return {
        success: false,
        error: `Unable to assign ${names} — they don't have the required volunteer role`,
      };
    }

    // Hard block: members with a blockout on any event day can't be assigned.
    const blockoutRows = await getBlockoutsForDates(organizationId, event.dates);

    const blockedIds = new Set(
      blockoutRows
        .map((b) => b.userId)
        .filter((uid) => uniqueUserIds.includes(uid)),
    );

    if (blockedIds.size > 0) {
      const blockedUsers = await prisma.user.findMany({
        where: { id: { in: [...blockedIds] } },
        select: { firstName: true, lastName: true },
      });

      const names = blockedUsers
        .map((u) => `${u.firstName} ${u.lastName}`)
        .join(", ");

      return {
        success: false,
        error: `Unable to assign ${names} — they have blockout dates during this event`,
      };
    }

    // A member holds at most one role per event (unique eventId+userId), so
    // anyone still live on the roster is skipped rather than re-roled. Declined,
    // removed, and lapsed rows are reused — a second row would violate it. A
    // lapsed invite can no longer be accepted, so re-inviting is the only way
    // to unstick it.
    const existingByUser = new Map(event.assignments.map((a) => [a.userId, a]));

    const now = new Date();

    const skippedNames: string[] = [];
    const toCreate: string[] = [];
    const toReactivate: { id: string; userId: string }[] = [];

    for (const uid of uniqueUserIds) {
      const existing = existingByUser.get(uid);

      if (!existing) {
        toCreate.push(uid);
        continue;
      }

      const isLive =
        existing.status === InvitationStatus.ACCEPTED ||
        (existing.status === InvitationStatus.PENDING &&
          existing.expiresAt > now);

      if (isLive) {
        skippedNames.push(`${existing.user.firstName} ${existing.user.lastName}`);
        continue;
      }

      toReactivate.push({ id: existing.id, userId: uid });
    }

    const invitedUserIds = [...toCreate, ...toReactivate.map((a) => a.userId)];

    if (invitedUserIds.length === 0) {
      return { success: false, error: "Everyone selected is already on this event" };
    }

    const expiry = new Date(Date.now() + expiresAt * 24 * 60 * 60 * 1000);

    await prisma.$transaction(async (tx) => {
      if (toCreate.length > 0) {
        await tx.eventAssignment.createMany({
          data: toCreate.map((uid) => ({
            eventId,
            userId: uid,
            role,
            assignedById: user.id,
            organizationId,
            expiresAt: expiry,
          })),
        });
      }

      if (toReactivate.length > 0) {
        await tx.eventAssignment.updateMany({
          where: { id: { in: toReactivate.map((a) => a.id) }, organizationId },
          data: {
            role,
            status: InvitationStatus.PENDING,
            assignedById: user.id,
            autoAssigned: false,
            expiresAt: expiry,
          },
        });
      }

      // Inviting into a role means the event needs it — keep the roster honest
      // for events created before rolesNeeded was persisted.
      if (!event.rolesNeeded.includes(role)) {
        await tx.event.update({
          where: { id: eventId },
          data: { rolesNeeded: [...event.rolesNeeded, role] },
        });
      }
    });

    const invitedUsers = await prisma.user.findMany({
      where: { id: { in: invitedUserIds } },
      select: { email: true, firstName: true },
    });

    const { name: organizationName, logoUrl } = membership.organization;

    after(async () => {
      await Promise.allSettled(
        invitedUsers.map((invitee) =>
          resend.emails.send({
            from: "Aeghin <support@aeghin.com>",
            to: invitee.email,
            subject: `You've been assigned to ${event.name}`,
            react: EventAssignmentEmail({
              recipientName: invitee.firstName,
              eventName: event.name,
              organizationName: organizationName || "",
              logoUrl,
              viewLink: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/organizations/${organizationId}`,
            }),
          }),
        ),
      );
    });

    await logActivity({
      organizationId,
      eventId,
      eventName: event.name,
      type: ActivityType.INVITE_SENT,
      actorName: `${user.firstName} ${user.lastName}`,
      targetName: event.name,
      detail: `${volunteerRoleLabels[role]} · ${invitedUserIds.length} invited`,
    });

    for (const uid of invitedUserIds) {
      updateTag(`user-${uid}-events-${organizationId}`);
    };

    updateTag(`event-${eventId}-org-${organizationId}-details`);
    updateTag(`org-${organizationId}-events`);
    updateTag(`org-${organizationId}-activity`);

    // Reusing a row drops whatever ACCEPTED/DECLINED it held, which moves the
    // acceptance numbers those stats are counted from.
    if (toReactivate.length > 0) {
      updateTag(`org-${organizationId}-acceptance-stats`);
    }

    return { success: true, invitedCount: invitedUserIds.length, skippedNames };

  } catch {

    return { success: false, error: "Unable to send invites, please try again" };

  };
};


export const deleteEvent = async (organizationId: string, eventId: string): Promise<ActionResponse> => {

  try {


    const user = await currentUser();

    if (!user) return { success: false, error: "Unable to find user." };

    if (!organizationId || !eventId) return { success: false, error: "No data provided." };

    const userMembership = await prisma.membership.findUnique({
      where: {
        userId_organizationId: {
          userId: user.id,
          organizationId
        }
      },
      select: {
        role: true
      }
    });

    if (!userMembership) return { success: false, error: "No user membership found with this organization" };

    if (userMembership.role === OrgRole.MEMBER) return { success: false, error: "Insufficient permissions." };

    const event = await prisma.event.findFirst({
      where: {
        id: eventId,
        organizationId,
      },
      select: {
        name: true,
        serviceType: { select: { name: true } },
        assignments: {
          select: { userId: true, status: true },
        },
        // Deleting the event cascades these away, which changes each of those
        // members' top-songs tally — read them while they still exist.
        setlistSongs: {
          select: { setlistSongAssignment: { select: { userId: true } } },
        },
      },
    });

    if (!event) return { success: false, error: "Unable to locate event" };

    await prisma.event.delete({
      where: {
        id: eventId
      }
    });

    await logActivity({
      organizationId,
      type: ActivityType.EVENT_DELETED,
      actorName: `${user.firstName} ${user.lastName}`,
      targetName: event.name,
      detail: event.serviceType.name,
    });

    updateTag(`org-${organizationId}-events`);
    updateTag(`event-${eventId}-org-${organizationId}-details`);
    updateTag(`event-${eventId}-org-${organizationId}-activity`);
    updateTag(`org-${organizationId}-activity`);

    for (const { userId } of event.assignments) {
      updateTag(`user-${userId}-events-${organizationId}`);
    };

    const setlistUserIds = new Set(
      event.setlistSongs.flatMap((s) =>
        s.setlistSongAssignment.map((a) => a.userId),
      ),
    );

    for (const userId of setlistUserIds) {
      updateTag(`user-${userId}-songs-${organizationId}`);
    };

    const affectsAcceptanceStats = event.assignments.some(
      (assignment) =>
        assignment.status === InvitationStatus.ACCEPTED ||
        assignment.status === InvitationStatus.DECLINED,
    );

    if (affectsAcceptanceStats) {
      updateTag(`org-${organizationId}-acceptance-stats`);
    };

    return { success: true };

  } catch {
    return { success: false, error: "Something went wrong. Try again." };
  }
}

type EmailTeamResult =
  | { success: true; sentCount: number }
  | { success: false; error: string };

export const emailAcceptedVolunteers = async (
  organizationId: string,
  eventId: string,
  input: EventEmailInput,
): Promise<EmailTeamResult> => {

  try {

    const user = await currentUser();

    if (!user) return { success: false, error: "Unauthorized" };

    const parsed = eventEmailSchema.safeParse(input);

    if (!parsed.success) return { success: false, error: parsed.error.message };

    const { subject, body } = parsed.data;

    const membership = await prisma.membership.findUnique({
      where: {
        userId_organizationId: { userId: user.id, organizationId },
      },
      include: { organization: { select: { name: true, logoUrl: true } } },
    });

    if (!membership) return { success: false, error: "Unable to find membership" };

    if (membership.role !== OrgRole.OWNER && membership.role !== OrgRole.ADMIN) {
      return {
        success: false,
        error: "Unauthorized, please reach out to your Admin",
      };
    }

    const event = await prisma.event.findFirst({
      where: { id: eventId, organizationId },
      select: {
        name: true,
        assignments: {
          where: {
            status: InvitationStatus.ACCEPTED,
          },
          select: {
            user: { select: { email: true, firstName: true } },
          },
        },
      },
    });

    if (!event) return { success: false, error: "Unable to locate event" };

    const recipients = event.assignments;

    if (recipients.length === 0) {
      return { success: false, error: "No accepted volunteers to email" };
    }

    const { name: organizationName, logoUrl } = membership.organization;
    const senderName = `${user.firstName} ${user.lastName}`;
    const viewLink = `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/organizations/${organizationId}/events/${eventId}`;

    const emails = recipients.map(({ user: recipient }) => ({
      from: `${organizationName} <support@aeghin.com>`,
      to: recipient.email,
      replyTo: user.email,
      subject,
      react: EventMessageEmail({
        recipientName: recipient.firstName,
        senderName,
        organizationName,
        logoUrl,
        eventName: event.name,
        body,
        viewLink,
      }),
    }));

    // Sent in the request (not after()) so the sender gets a real
    // delivered/failed answer. batch.send caps at 100 emails per call.
    for (let i = 0; i < emails.length; i += 100) {
      const { error } = await resend.batch.send(emails.slice(i, i + 100));

      if (error) {
        return { success: false, error: "Unable to send message, please try again" };
      }
    }

    return { success: true, sentCount: recipients.length };

  } catch {

    return { success: false, error: "Something went wrong, please try again" };

  };
};

export const editEventDetails = async (data: EditEventDetailsInput): Promise<ActionResponse> => {
    
    try {

      const user = await currentUser();

      if (!user) return { success: false, error: "Unable to find user" };

      const parsed = editEventDetailsSchema.safeParse(data);

      if (!parsed.success) return { success: false, error: parsed.error.message };

      const { eventId, organizationId, name, dayTimes, location, description } = parsed.data;

      const [membership, event] = await Promise.all([
        prisma.membership.findUnique({
          where: {
            userId_organizationId: {
              userId: user.id,
              organizationId
            }
          },
          select: {
            role: true
          }
        }),
        prisma.event.findFirst({
          where: { id: eventId, organizationId },
          select: { assignments: { select: { userId: true, status: true } } },
        }),
      ]);

      if (!membership) return { success: false, error: "Unable to find membership" };

      if (membership.role === OrgRole.MEMBER) return { success: false, error: "Insufficient permissions" };

      if (!event) return { success: false, error: "Event doesn't exist" };

      if (Object.keys(dayTimes).length === 0) {
        return { success: false, error: "An event needs at least one day" };
      }

      const activeUserIds = event.assignments
        .filter((a) => a.status !== InvitationStatus.DECLINED)
        .map((a) => a.userId);

      if (activeUserIds.length > 0) {
        const dates = Object.values(dayTimes).map((times) => ({
          startTime: times.startTime,
          endTime: times.endTime,
        }));

        const [blockedIds, conflictingIds] = await Promise.all([
          getBlockedUserIds(organizationId, dates),
          getConflictingUserIds(organizationId, dates, eventId),
        ]);

        const affectedIds = activeUserIds.filter(
          (uid) => blockedIds.has(uid) || conflictingIds.has(uid),
        );

        if (affectedIds.length > 0) {
          const affectedUsers = await prisma.user.findMany({
            where: { id: { in: affectedIds } },
            select: { firstName: true, lastName: true },
          });

          const names = affectedUsers
            .map((u) => `${u.firstName} ${u.lastName}`)
            .join(", ");

          return {
            success: false,
            error: `These dates don't work for ${names}. Remove them from the event or choose different dates.`,
          };
        }
      }

      await prisma.$transaction(async (tx) => {
        await tx.event.update({
          where: { id: eventId },
          data: {
            name,
            location,
            description: description ?? "",
          },
        });


        await tx.eventDate.deleteMany({ where: { eventId } });

        await tx.eventDate.createMany({
          data: Object.values(dayTimes).map((times) => ({
            eventId,
            startTime: new Date(times.startTime),
            endTime: new Date(times.endTime),
          })),
        });
      });

      updateTag(`event-${eventId}-org-${organizationId}-details`);
      updateTag(`org-${organizationId}-events`);

      for (const { userId } of event.assignments) {
        updateTag(`user-${userId}-events-${organizationId}`);
      };

      return { success: true };

    } catch {

      return { success: false, error: "Something went wrong. Please try again." };

    }
};