"use server";

import prisma from "@/lib/prisma";
import {
  ActivityType,
  InvitationStatus,
  OrgRole,
  UsageKind,
  VolunteerRole,
} from "@/generated/prisma/enums";

import { logActivity } from "@/lib/activity";
import { teamOfRole, volunteerRoleConfig } from "@/lib/config/roles";

import {
  SMART_SCHEDULING_PLAN_ERROR,
  bulkEmailLimitError,
  hasSmartScheduling,
  recordUsage,
  smartSchedulingIncluded,
} from "@/lib/billing/limits";

import {
  AddEventRolesInput,
  addEventRolesSchema,
  CreateEventInput,
  createEventInputSchema,
  InviteToEventInput,
  inviteToEventSchema,
  editEventDetailsSchema,
  EditEventDetailsInput,
  type EventTeamLeadsInput,
  RemoveEventRoleInput,
  removeEventRoleSchema,
} from "@/lib/validations/event";

import type { Prisma } from "@/generated/prisma/client";
import {
  parseRoleSpots,
  roleStanding,
  spotsFor,
  storedRoleSpots,
} from "@/lib/role-spots";

import {
  EventEmailInput,
  eventEmailSchema,
} from "@/lib/validations/event-email";

import EventAssignmentEmail from "@/components/email/event-email-template";
import EventCanceledEmail from "@/components/email/event-canceled-template";
import EventMessageEmail from "@/components/email/event-message-template";
import EventRemovedEmail from "@/components/email/event-removed-template";
import EventUpdatedEmail, { type EventChange } from "@/components/email/event-updated-template";

import {
  eventStartAt,
  formatEventShort,
  formatEventWhen,
  formatRehearsal,
  sameSchedule,
} from "@/lib/email/event-when";
import { organizationSender } from "@/lib/email/organization";
import { sendEmailBatches } from "@/lib/email/send";
import { assignmentPush } from "@/lib/push/notices";
import { sendPushNotices } from "@/lib/push/send";
import { zonesByEmail } from "@/lib/push/timing";
import { notifyDeclineShortage, notifyReplacement } from "@/lib/notifications/declines";
import {
  notifyCoverChanges,
  notifyEventCovers,
  notifyTeamsNeeded,
} from "@/lib/notifications/team-lead";
import {
  clearEventNotifications,
  syncEventNotifications,
} from "@/lib/notifications/sync";

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
import { floatingNow, zoneOrFallback } from "@/lib/time-zone";

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

/** The new event's id, so a caller can open it. */
type CreateEventResult = { success: true; eventId: string } | { success: false; error: string };

/**
 * Holds one event's spot counts for the rest of a transaction, so two writes
 * landing together — two admins inviting at once — can't both read the old
 * count and each raise it by one. Released when the transaction ends.
 */
const lockEventSpots = (tx: Prisma.TransactionClient, eventId: string) =>
  tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${eventId}))`;

/**
 * Every invite is somebody wanted there, never a backup, so an invite past a
 * role's open spots adds a spot. Run inside the invite's own transaction, after
 * its writes and under `lockEventSpots`.
 */
const raiseSpotsToFit = async (
  tx: Prisma.TransactionClient,
  eventId: string,
  role: VolunteerRole,
  now: Date,
) => {
  const [event, filling] = await Promise.all([
    tx.event.findUnique({
      where: { id: eventId },
      select: { rolesNeeded: true, roleSpots: true },
    }),
    tx.eventAssignment.count({
      where: {
        eventId,
        role,
        OR: [
          { status: InvitationStatus.ACCEPTED },
          { status: InvitationStatus.PENDING, expiresAt: { gt: now } },
        ],
      },
    }),
  ]);

  if (!event) return;

  const spots = parseRoleSpots(event.roleSpots);

  if (filling <= spotsFor(spots, role)) return;

  await tx.event.update({
    where: { id: eventId },
    data: { roleSpots: storedRoleSpots({ ...spots, [role]: filling }, event.rolesNeeded) },
  });
};

/**
 * How many of one role's spots nobody has taken: nobody said yes and nobody is
 * deciding. Run inside an invite's transaction, under `lockEventSpots`, so the
 * answer holds until it commits.
 */
const openSpots = async (
  tx: Prisma.TransactionClient,
  eventId: string,
  role: VolunteerRole,
  now: Date,
): Promise<number> => {
  const [event, filling] = await Promise.all([
    tx.event.findUnique({
      where: { id: eventId },
      select: { roleSpots: true },
    }),
    tx.eventAssignment.count({
      where: {
        eventId,
        role,
        OR: [
          { status: InvitationStatus.ACCEPTED },
          { status: InvitationStatus.PENDING, expiresAt: { gt: now } },
        ],
      },
    }),
  ]);

  if (!event) return 0;

  return Math.max(0, spotsFor(parseRoleSpots(event.roleSpots), role) - filling);
};

/**
 * Why an AI card's picks were refused at approval: they're serving another
 * event at that time. The card never picks somebody who is, so each of these
 * was booked after it was built. Names the other event, so the fix is clear.
 */
const conflictError = async (
  clashes: { userId: string; event: { name: string } }[],
): Promise<string> => {
  const eventOf = new Map<string, string>();

  for (const clash of clashes) {
    if (!eventOf.has(clash.userId)) eventOf.set(clash.userId, clash.event.name);
  }

  const users = await prisma.user.findMany({
    where: { id: { in: [...eventOf.keys()] } },
    select: { id: true, firstName: true, lastName: true },
  });

  const names = users
    .map((u) => `${u.firstName} ${u.lastName} (${eventOf.get(u.id)})`)
    .join(", ");

  return `Unable to assign ${names} — they're now serving another event at that time`;
};

/**
 * The event's team picks worth keeping. Each has to be an admin or owner —
 * a member can't send the invites they'd be asked for — and a pick of the
 * team's default is dropped: the service type's own lead, or with no lead the
 * event's creator, whom it falls to anyway. Those change nothing, and should
 * follow Settings if the lead changes later.
 *
 * Null when somebody picked isn't an admin or owner. Not exported, so it
 * isn't a server action anybody can call on its own.
 */
const resolveEventTeamLeads = async (
  picks: EventTeamLeadsInput,
  organizationId: string,
  serviceTypeId: string,
  creatorId: string | null,
): Promise<EventTeamLeadsInput | null> => {
  if (picks.length === 0) return [];

  const [managers, leads] = await Promise.all([
    prisma.membership.findMany({
      where: {
        organizationId,
        userId: { in: picks.map((pick) => pick.userId) },
        role: { not: OrgRole.MEMBER },
      },
      select: { userId: true },
    }),
    prisma.teamLead.findMany({
      where: { serviceTypeId },
      select: { category: true, userId: true },
    }),
  ]);

  const managerIds = new Set(managers.map((manager) => manager.userId));

  if (picks.some((pick) => !managerIds.has(pick.userId))) return null;

  return picks.filter((pick) => {
    const lead = leads.find((entry) => entry.category === pick.team);

    return pick.userId !== (lead ? lead.userId : creatorId);
  });
};

const TEAM_LEAD_PICK_ERROR = "Only an admin or owner can handle a team";

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
  touch: TagInvalidator = updateTag,
): Promise<CreateEventResult> {
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
      roleSpots: requestedSpots,
      expiresAt,
      smartSchedulingEnabled: smartSchedulingRequested,
      rehearsal,
      teamLeads,
      refuseConflicts,
    } = parsed.data;

    // As many as asked for, and never fewer than the people invited into the
    // role: every one of them is wanted there.
    const roleSpots = storedRoleSpots(
      Object.fromEntries(
        rolesNeeded.map((role) => [
          role,
          Math.max(requestedSpots?.[role] ?? 1, new Set(roleAssignments[role] ?? []).size),
        ]),
      ),
      rolesNeeded,
    );

    // The form sends all three blank when there is no rehearsal. The times
    // arrive already composed as floating-UTC instants, like dayTimes.
    const rehearsalColumns =
      rehearsal && rehearsal.date && rehearsal.startTime && rehearsal.endTime
        ? {
            rehearsalStart: new Date(rehearsal.startTime),
            rehearsalEnd: new Date(rehearsal.endTime),
          }
        : { rehearsalStart: null, rehearsalEnd: null };

    const [membership, serviceType] = await Promise.all([
      prisma.membership.findFirst({
        where: { userId: id, organizationId },
        include: { organization: { select: { name: true, logoUrl: true, timeZone: true } } },
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

    // The caller is the creator, so a team with no lead falls to them.
    const covers = await resolveEventTeamLeads(
      teamLeads ?? [],
      organizationId,
      serviceTypeId,
      id,
    );

    if (!covers) return { success: false, error: TEAM_LEAD_PICK_ERROR };

    // Off on Free rather than refused: the dashboard locks the switch there, and
    // an older phone build asking for it shouldn't cost anybody their event.
    const smartSchedulingEnabled =
      smartSchedulingRequested && (await hasSmartScheduling(organizationId));

    const { name: organizationName, logoUrl } = membership.organization;

    const assignedUserIds = Object.values(roleAssignments).flat();

    if (assignedUserIds.length > 0) {
      const assignedUserIdSet = new Set(assignedUserIds);

      // Every assignment has to land in a role the event declared. Zod fills
      // roleAssignments with every role's key, so it's the non-empty ones that
      // count. Catches crafted requests, and a role dropped in step one after
      // it was already staffed in step two.
      const offRoster = Object.entries(roleAssignments)
        .filter(([, userIds]) => userIds.length > 0)
        .map(([role]) => role as VolunteerRole)
        .filter((role) => !rolesNeeded.includes(role));

      if (offRoster.length > 0) {
        const labels = offRoster
          .map((role) => volunteerRoleConfig[role].label)
          .join(", ");

        return {
          success: false,
          error: `Unable to assign into ${labels} — not on this event's roster`,
        };
      }

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

      // From an AI draft, a clash is refused as well.
      if (refuseConflicts) {
        const clashes = (
          await getConflictingAssignments(
            organizationId,
            Object.values(dayTimes).map((times) => ({
              startTime: times.startTime,
              endTime: times.endTime,
            })),
          )
        ).filter((row) => assignedUserIdSet.has(row.userId));

        if (clashes.length > 0) return { success: false, error: await conflictError(clashes) };
      }
    }

     const newEventId = await prisma.$transaction(async (tx) => {
      const event = await tx.event.create({
        data: {
          name,
          description: description || "",
          location,
          rolesNeeded,
          roleSpots,
          smartSchedulingEnabled,
          ...rehearsalColumns,
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

      if (covers.length > 0) {
        await tx.eventTeamLead.createMany({
          data: covers.map((cover) => ({
            eventId: event.id,
            category: cover.team,
            organizationId,
            userId: cover.userId,
          })),
        });
      }

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
        touch(`user-${uid}-events-${organizationId}`)
      };

      // One role per person per event, so each assignee maps to exactly one.
      const roleByUser = new Map(
        Object.entries(roleAssignments).flatMap(([role, userIds]) =>
          userIds.map((uid) => [uid, role as VolunteerRole] as const),
        ),
      );

      const eventDates = Object.values(dayTimes).map((times) => ({
        startTime: new Date(times.startTime),
        endTime: new Date(times.endTime),
      }));

      const fullWhen = formatEventWhen(eventDates);
      const invitedByName = `${users.firstName} ${users.lastName}`;
      // The rows were written a moment ago with this same window.
      const answerBy = new Date(Date.now() + expiresAt * 24 * 60 * 60 * 1000);

      after(async () => {
        await sendEmailBatches(
          "createEvent assignment",
          assignedUsers.flatMap((user) => {
            const role = roleByUser.get(user.id);

            if (!role) return [];

            return [{
              from: organizationSender(organizationName),
              to: user.email,
              subject: `You're invited to serve: ${name}`,
              react: EventAssignmentEmail({
                recipientName: user.firstName,
                eventName: name,
                organizationName: organizationName || "",
                logoUrl,
                roleLabel: volunteerRoleConfig[role].label,
                kind: "invite",
                invitedByName,
                eventDate: fullWhen?.date ?? null,
                eventTime: fullWhen?.time ?? null,
                startsAt: eventStartAt(eventDates, membership.organization.timeZone),
                expiresAt: answerBy,
                viewLink: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/organizations/${organizationId}`,
              }),
            }];
          }),
        );
      });

      const when = formatEventShort(eventDates);

      after(() =>
        sendPushNotices(
          "createEvent assignment",
          assignedUsers.map((user) => {
            const role = roleByUser.get(user.id);

            return assignmentPush({
              email: user.email,
              eventName: name,
              eventId: newEventId,
              organizationName,
              organizationId,
              roleLabel: role ? volunteerRoleConfig[role].label : null,
              when,
              kind: "invite",
              invitedByName,
            });
          }),
        ),
      );
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

    touch(`org-${organizationId}-events`);
    touch(`org-${organizationId}-activity`);
    touch(`event-${newEventId}-org-${organizationId}-activity`);

    revalidatePath(`/dashboard/organizations/${organizationId}`);

    await syncEventNotifications(newEventId, touch);

    // Anybody picked to handle a team on this event hears so once — unless
    // they picked themselves.
    const coversToTell = covers.filter((cover) => cover.userId !== id);

    if (coversToTell.length > 0) {
      after(() =>
        notifyEventCovers({
          organizationId,
          eventId: newEventId,
          covers: coversToTell,
          assignedByName: `${users.firstName} ${users.lastName}`,
        }),
      );
    }

    // Picks apply at once but are never silent: the regular lead of each team
    // handed off hears, and the owners do too when an admin made the pick.
    if (covers.length > 0) {
      after(() =>
        notifyCoverChanges({
          organizationId,
          eventId: newEventId,
          before: [],
          after: covers,
          changedBy: {
            userId: id,
            name: `${users.firstName} ${users.lastName}`,
            role: membership.role,
          },
        }),
      );
    }

    // Each team's lead hears this event needs them — never the creator, and
    // not a cover picked here, who already heard above.
    after(() =>
      notifyTeamsNeeded({
        organizationId,
        eventId: newEventId,
        roles: rolesNeeded,
        actor: { userId: id, name: `${users.firstName} ${users.lastName}` },
        added: false,
        skipCovers: true,
      }),
    );

    return { success: true, eventId: newEventId };

  } catch {
    return { success: false, error: "Unable to create event" };
  }
}


/**
 * How a caller expires the cache tags the two invitation actions touch.
 *
 * `updateTag` is a Server Action-only API — it throws the moment it runs inside
 * a Route Handler, which is where the mobile app's answers arrive. Defaulting
 * to it leaves every dashboard call exactly as it was; the mobile route passes
 * `revalidateTag` instead, and nothing else about the work changes.
 *
 * Deliberately not exported: a "use server" module may only export async
 * functions. The mobile route passes a matching function and TypeScript checks
 * it structurally.
 */
type TagInvalidator = (tag: string) => void;

/**
 * Whether an assignment still puts somebody on the event: accepted, or
 * invited and still inside the window to answer. A lapse reads PENDING until
 * the hourly sweep writes EXPIRED, so the deadline decides, not the status —
 * the same test the bell's `coversRole` makes.
 *
 * Not exported: a "use server" module may only export async functions.
 */
const holdsSpot = (
  assignment: { status: InvitationStatus; expiresAt: Date },
  now: Date,
) =>
  assignment.status === InvitationStatus.ACCEPTED ||
  (assignment.status === InvitationStatus.PENDING && assignment.expiresAt > now);

/**
 * Why a live-invitation lookup missed, in words the volunteer can act on.
 *
 * Both answer actions find their row by `PENDING` + unexpired, so every cause
 * of a miss collapsed into one "Unable to find this event" — which is wrong
 * about the most common cause by far. Someone tapping Accept on an invitation
 * that lapsed an hour ago is not looking at a missing event; they are looking
 * at a stale screen, and the toast should say so.
 *
 * Only ever called on the failure path, so the extra read costs nothing in the
 * normal case. The mobile respond route returns `result.error` verbatim, so the
 * phone picks this up without a change.
 *
 * Not exported: a "use server" module may only export async functions that are
 * meant to be callable from the client.
 */
const explainInviteMiss = async (
  organizationId: string,
  eventId: string,
  userId: string,
): Promise<string> => {

  const row = await prisma.eventAssignment.findUnique({
    where: { eventId_userId: { eventId, userId } },
    select: { status: true, expiresAt: true, organizationId: true },
  });

  // No row, or somebody probing another org's event: say nothing specific.
  if (!row || row.organizationId !== organizationId) {
    return "Unable to find this event";
  }

  // EXPIRED once the sweep has run; still PENDING inside the window before it.
  if (
    row.status === InvitationStatus.EXPIRED ||
    (row.status === InvitationStatus.PENDING && row.expiresAt <= new Date())
  ) {
    return "This invitation has expired. Ask an admin to send a new one.";
  }

  if (row.status === InvitationStatus.ACCEPTED) {
    return "You've already accepted this invitation";
  }

  if (row.status === InvitationStatus.DECLINED) {
    return "You've already declined this invitation";
  }

  if (row.status === InvitationStatus.CANCELED) {
    return "This invitation was withdrawn";
  }

  return "Unable to find this event";
};

export const acceptEventInvitation = async (
  organizationId: string,
  eventId: string,
  touch: TagInvalidator = updateTag,
): Promise<ActionResponse> => {

  try {

    const user = await currentUser();

    if (!user) return { success: false, error: "Unauthorized" };

    const event = await prisma.eventAssignment.findUnique({
      where: {
        eventId_userId: { eventId: eventId, userId: user.id },
        organizationId,
        status: InvitationStatus.PENDING,
        expiresAt: { gt: new Date() }
      },
      include: { event: { select: { name: true } } },
    });

    if (!event) {
      return {
        success: false,
        error: await explainInviteMiss(organizationId, eventId, user.id),
      };
    }

    await prisma.eventAssignment.update({
      where: {
        id: event.id,
        organizationId,
      },
      data: {
        status: InvitationStatus.ACCEPTED
      }
    });

    // The feed recorded every decline and no accept, which made a roster read
    // worse than it was. INVITE_ACCEPTED carries an eventName here to mean the
    // event kind, exactly as INVITE_SENT already distinguishes the two.
    await logActivity({
      organizationId,
      eventId,
      eventName: event.event.name,
      type: ActivityType.INVITE_ACCEPTED,
      actorName: `${user.firstName} ${user.lastName}`,
      targetName: volunteerRoleConfig[event.role].label,
    });

    touch(`user-${user.id}-events-${organizationId}`);
    touch(`event-${eventId}-org-${organizationId}-details`);
    touch(`org-${organizationId}-acceptance-stats`);
    touch(`org-${organizationId}-events`);
    touch(`org-${organizationId}-activity`);
    touch(`event-${eventId}-org-${organizationId}-activity`);

    await syncEventNotifications(eventId, touch);

    // Smart Scheduling's pick, not anybody's: whoever runs the team hears the
    // spot it offered is taken.
    if (event.autoAssigned) {
      after(() =>
        notifyReplacement({
          kind: "accepted",
          organizationId,
          eventId,
          role: event.role,
          inviterId: event.assignedById,
          replacement: {
            userId: user.id,
            firstName: user.firstName,
            lastName: user.lastName,
          },
          decliner: null,
        }),
      );
    }

    return { success: true };

  } catch {

    return { success: false, error: "Failed to accept invite" };

  }

}

/** What both answers read off the assignment before changing it. */
const OPENED_SPOT_SELECT = {
  id: true,
  role: true,
  assignedById: true,
  expiresAt: true,
  event: {
    select: {
      name: true,
      smartSchedulingEnabled: true,
      createdById: true,
      dates: { select: { startTime: true, endTime: true } },
    },
  },
  // Entitlements are read here, before the answer commits, so nothing
  // after it can fail on a plan lookup.
  organization: { select: { name: true, logoUrl: true, entitlements: true, timeZone: true } },
} satisfies Prisma.EventAssignmentSelect;

/** What the decline and the back-out read before they commit, and hand on. */
type OpenedSpot = Prisma.EventAssignmentGetPayload<{ select: typeof OPENED_SPOT_SELECT }>;

/**
 * Said under each activity line a back-out writes. Those lines read "declined",
 * the same as for an invitation turned down, because the activity types are
 * shared with installed apps that can't render a new one.
 */
const BACKED_OUT_NOTE = "Accepted earlier, then couldn't make it";

/**
 * Everything a spot coming open sets off, the same whether somebody declined
 * their invitation or backed out after accepting: Smart Scheduling looks for
 * a replacement, whoever runs the role hears what happened, the activity feed
 * says so, and the bell is reconciled.
 *
 * Runs after the status change has committed, so the caller's answer stands
 * whatever happens here. Not exported: a "use server" module may only export
 * async functions meant to be called from the client.
 */
const refillOpenedSpot = async ({
  organizationId,
  eventId,
  user,
  assignment,
  backedOut,
  touch,
}: {
  organizationId: string;
  eventId: string;
  user: { id: string; firstName: string; lastName: string };
  assignment: OpenedSpot;
  /** They had accepted. Changes the wording, never who hears. */
  backedOut: boolean;
  touch: TagInvalidator;
}): Promise<void> => {

  const declinerName = `${user.firstName} ${user.lastName}`;
  const roleLabel = volunteerRoleConfig[assignment.role].label;
  const eventName = assignment.event.name;
  const note = backedOut ? BACKED_OUT_NOTE : undefined;

  // Every invite is somebody wanted there, so a decline leaves its spot open
  // even when somebody else on the role accepted. Only a spot already covered
  // — an invite sent past the role's count — has nothing to fill and nobody
  // to tell.
  const roster = await prisma.event.findUnique({
    where: { id: eventId },
    select: {
      roleSpots: true,
      assignments: {
        where: { role: assignment.role },
        select: { role: true, status: true, expiresAt: true },
      },
    },
  });

  if (
    roster &&
    roleStanding(assignment.role, parseRoleSpots(roster.roleSpots), roster.assignments, new Date())
      .open === 0
  ) {
    await syncEventNotifications(eventId, touch);

    return;
  }

  /**
   * Tells whoever owns this role that it is still open — whoever covers its
   * team on this event, else the team's lead for the event's service type,
   * else the event's creator — and copies in whoever follows it.
   * Scheduled rather than awaited: the answer has committed and the
   * volunteer is owed it now. The push gets the shorter reason: its title
   * already says the spot is open, and the email has the whole of it.
   */
  const notifyShortage = (reason: string, pushReason: string) => {
    after(() =>
      notifyDeclineShortage({
        organizationId,
        organization: assignment.organization,
        eventId,
        eventName,
        createdById: assignment.event.createdById,
        dates: assignment.event.dates,
        role: assignment.role,
        inviterId: assignment.assignedById,
        declinerName,
        backedOut,
        reason,
        pushReason,
      }),
    );
  };

  // Paused rather than off when the plan doesn't include it: the event keeps
  // its setting, and picks up again if the organization upgrades.
  const autoFillPaused =
    assignment.event.smartSchedulingEnabled &&
    !smartSchedulingIncluded(assignment.organization.entitlements);

  if (!assignment.event.smartSchedulingEnabled || autoFillPaused) {
    await logActivity({
      organizationId,
      eventId,
      eventName,
      type: ActivityType.SMART_FILL_SKIPPED,
      actorName: declinerName,
      targetName: roleLabel,
      detail: note,
    });

    notifyShortage(
      autoFillPaused
        ? "Smart Scheduling is paused because this organization's plan doesn't include it, so no replacement was invited."
        : "Smart Scheduling is off for this event, so no replacement was invited.",
      autoFillPaused
        ? "Smart Scheduling is paused on the current plan."
        : "Smart Scheduling is off for this event.",
    );

    touch(`org-${organizationId}-activity`);
    touch(`event-${eventId}-org-${organizationId}-activity`);

    await syncEventNotifications(eventId, touch);

    return;
  }

  // Smart scheduling: auto-invite the next best available member into the
  // role just vacated. Best-effort and isolated — if anything here fails, the
  // answer the user already committed must still stand.
  try {
    const outcome = await findBestReplacement({
      organizationId,
      eventId,
      declinedRole: assignment.role,
    });

    if (outcome.status === "FOUND") {
      const replacement = outcome.candidate;

      // Keep the slot's original deadline; fall back to a fresh window only
      // if that deadline has already passed.
      const replacementExpiry =
        assignment.expiresAt > new Date()
          ? assignment.expiresAt
          : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      await prisma.eventAssignment.create({
        data: {
          eventId,
          userId: replacement.userId,
          role: assignment.role,
          assignedById: assignment.assignedById,
          organizationId,
          status: InvitationStatus.PENDING,
          autoAssigned: true,
          expiresAt: replacementExpiry,
        },
      });

      await logActivity({
        organizationId,
        eventId,
        eventName,
        type: ActivityType.AUTO_INVITE_SENT,
        actorName: declinerName,
        targetName: `${replacement.firstName} ${replacement.lastName}`,
        detail: note ? `${roleLabel} · ${note}` : roleLabel,
      });

      touch(`user-${replacement.userId}-events-${organizationId}`);
      touch(`event-${eventId}-org-${organizationId}-details`);
      touch(`org-${organizationId}-events`);

      const replacementWhen = formatEventWhen(assignment.event.dates);

      after(async () => {
        await resend.emails.send({
          from: organizationSender(assignment.organization.name),
          to: replacement.email,
          subject: `You're invited to serve: ${assignment.event.name}`,
          react: EventAssignmentEmail({
            recipientName: replacement.firstName,
            eventName: assignment.event.name,
            organizationName: assignment.organization.name,
            logoUrl: assignment.organization.logoUrl,
            roleLabel,
            // Smart Scheduling picked them, not a person — the inherited
            // sender is whoever invited the one who declined.
            kind: "replacement",
            invitedByName: null,
            eventDate: replacementWhen?.date ?? null,
            eventTime: replacementWhen?.time ?? null,
            startsAt: eventStartAt(assignment.event.dates, assignment.organization.timeZone),
            expiresAt: replacementExpiry,
            viewLink: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/organizations/${organizationId}`,
          }),
        });
      });

      after(async () => {
        // The deadline on their phone's clock, like the answer reminders,
        // else the church's.
        const zones = await zonesByEmail([replacement.email]).catch(
          () => new Map<string, string>(),
        );

        await sendPushNotices("declineEventInvitation replacement", [
          assignmentPush({
            email: replacement.email,
            eventName,
            eventId,
            organizationName: assignment.organization.name,
            organizationId,
            roleLabel,
            when: formatEventShort(assignment.event.dates),
            kind: "replacement",
            invitedByName: null,
            deadline: {
              expiresAt: replacementExpiry,
              startsAt: eventStartAt(assignment.event.dates, assignment.organization.timeZone),
              timeZone:
                zones.get(replacement.email) ??
                zoneOrFallback(assignment.organization.timeZone),
            },
          }),
        ]);
      });

      // Whoever runs the team hears what Smart Scheduling did with the spot,
      // though nobody has to act on it.
      after(() =>
        notifyReplacement({
          kind: "invited",
          organizationId,
          eventId,
          role: assignment.role,
          inviterId: assignment.assignedById,
          replacement,
          decliner: { name: declinerName, backedOut },
        }),
      );
    } else if (outcome.status === "NO_QUALIFIED_MEMBERS") {
      await logActivity({
        organizationId,
        eventId,
        eventName,
        type: ActivityType.SMART_FILL_NO_CANDIDATES,
        actorName: declinerName,
        targetName: roleLabel,
        detail: note,
      });

      notifyShortage(
        `Nobody in ${assignment.organization.name} has the ${roleLabel} role, so there was no one to invite.`,
        `Nobody else has the ${roleLabel} role.`,
      );
    } else if (outcome.status === "ALL_UNAVAILABLE") {
      const breakdown = [
        `${outcome.qualified} qualified`,
        outcome.conflicting > 0 && `${outcome.conflicting} double-booked`,
        outcome.blocked > 0 && `${outcome.blocked} on blockout`,
        outcome.alreadyOn > 0 && `${outcome.alreadyOn} already on this event`,
        outcome.alreadyAsked > 0 && `${outcome.alreadyAsked} already asked`,
      ].filter(Boolean);

      await logActivity({
        organizationId,
        eventId,
        eventName,
        type: ActivityType.SMART_FILL_ALL_UNAVAILABLE,
        actorName: declinerName,
        targetName: roleLabel,
        detail: [...breakdown, note].filter(Boolean).join(" · "),
      });

      notifyShortage(
        `Everyone qualified is unavailable — ${breakdown.join(", ")}.`,
        "Everyone qualified is unavailable.",
      );
    } else {
      await logActivity({
        organizationId,
        eventId,
        eventName,
        type: ActivityType.SMART_FILL_FAILED,
        actorName: declinerName,
        targetName: roleLabel,
        detail: note,
      });

      notifyShortage(
        "Smart Scheduling could not look for a replacement. The role needs filling by hand.",
        "Smart Scheduling couldn't look for a replacement.",
      );
    }
  } catch {
    // Swallow: smart-fill is best-effort; the answer already committed.
    await logActivity({
      organizationId,
      eventId,
      eventName,
      type: ActivityType.SMART_FILL_FAILED,
      actorName: declinerName,
      targetName: roleLabel,
      detail: note,
    });

    notifyShortage(
      "Smart Scheduling hit an error looking for a replacement. The role needs filling by hand.",
      "Smart Scheduling couldn't look for a replacement.",
    );
  }

  touch(`org-${organizationId}-activity`);
  touch(`event-${eventId}-org-${organizationId}-activity`);

  // Runs after smart-fill, not before: a replacement invited into the slot
  // closes the hole this opened, and the count has to reflect that.
  await syncEventNotifications(eventId, touch);
};

export const declineEventInvitation = async (
  organizationId: string,
  eventId: string,
  touch: TagInvalidator = updateTag,
): Promise<ActionResponse> => {

  try {

    const user = await currentUser();

    if (!user) return { success: false, error: "Unauthorized" };

    const assignment = await prisma.eventAssignment.findUnique({
      where: {
        eventId_userId: { eventId: eventId, userId: user.id },
        organizationId,
        status: InvitationStatus.PENDING,
        // Matches the guard acceptEventInvitation already applies. Without it a
        // lapsed invite could still be declined, which ran the whole smart-fill
        // path — shortage emails to the admins and a replacement invited — for
        // a slot that had already closed, and counted the lapse against the
        // member's acceptance rate. The hourly sweep flips these to EXPIRED, so
        // this covers the window before the next tick.
        expiresAt: { gt: new Date() },
      },
      select: OPENED_SPOT_SELECT,
    });

    if (!assignment) {
      return {
        success: false,
        error: await explainInviteMiss(organizationId, eventId, user.id),
      };
    }

    // Still pending at the moment of writing, so two taps landing together
    // decline once and ask Smart Scheduling for one replacement, not two.
    const { count } = await prisma.eventAssignment.updateMany({
      where: {
        id: assignment.id,
        organizationId,
        status: InvitationStatus.PENDING,
      },
      data: {
        status: InvitationStatus.DECLINED
      }
    });

    if (count === 0) {
      return {
        success: false,
        error: await explainInviteMiss(organizationId, eventId, user.id),
      };
    }

    touch(`user-${user.id}-events-${organizationId}`);
    touch(`event-${eventId}-org-${organizationId}-details`);
    touch(`org-${organizationId}-acceptance-stats`);
    touch(`org-${organizationId}-events`);

    await refillOpenedSpot({
      organizationId,
      eventId,
      user,
      assignment,
      backedOut: false,
      touch,
    });

    return { success: true };

  } catch {

    return { success: false, error: "Unable to decline Invite" };

  };
};

/**
 * Takes somebody off an event they had accepted: "Can't make it".
 *
 * Their row turns DECLINED, which is what an invitation turned down reads as,
 * so the spot is open again on every count, and then the decline's whole
 * follow-up runs — Smart Scheduling's replacement, "Pianist needed" to whoever
 * runs the role, the activity feed, the bell. The songs they were down to
 * sing on this event's setlist come off with them.
 *
 * Their own, and only until the event starts on the church's clock: after
 * that the spot can't be filled, and the people running it need telling in
 * person. Somebody backed out can be invited again like anyone who declined.
 */
export const withdrawFromEvent = async (
  organizationId: string,
  eventId: string,
  touch: TagInvalidator = updateTag,
): Promise<ActionResponse> => {

  try {

    const user = await currentUser();

    if (!user) return { success: false, error: "Unauthorized" };

    const assignment = await prisma.eventAssignment.findUnique({
      where: {
        eventId_userId: { eventId, userId: user.id },
        organizationId,
        status: InvitationStatus.ACCEPTED,
      },
      select: OPENED_SPOT_SELECT,
    });

    if (!assignment) {
      return {
        success: false,
        error: await explainWithdrawMiss(organizationId, eventId, user.id),
      };
    }

    const now = floatingNow(zoneOrFallback(assignment.organization.timeZone));

    if (assignment.event.dates.some((date) => date.startTime.getTime() <= now.getTime())) {
      return {
        success: false,
        error: "This event has already started. Let whoever runs your team know.",
      };
    }

    const withdrawn = await prisma.$transaction(async (tx) => {
      // Still accepted at the moment of writing, so a second tap is turned
      // away rather than asking Smart Scheduling for a second replacement.
      const { count } = await tx.eventAssignment.updateMany({
        where: {
          id: assignment.id,
          organizationId,
          status: InvitationStatus.ACCEPTED,
        },
        data: { status: InvitationStatus.DECLINED },
      });

      if (count === 0) return false;

      await tx.setlistSongAssignment.deleteMany({
        where: { userId: user.id, setlistSong: { eventId } },
      });

      return true;
    });

    if (!withdrawn) {
      return {
        success: false,
        error: await explainWithdrawMiss(organizationId, eventId, user.id),
      };
    }

    touch(`user-${user.id}-events-${organizationId}`);
    touch(`user-${user.id}-songs-${organizationId}`);
    touch(`event-${eventId}-org-${organizationId}-details`);
    touch(`org-${organizationId}-acceptance-stats`);
    touch(`org-${organizationId}-events`);

    await refillOpenedSpot({
      organizationId,
      eventId,
      user,
      assignment,
      backedOut: true,
      touch,
    });

    return { success: true };

  } catch {

    return { success: false, error: "Unable to take you off this event. Try again." };

  };
};

/** Why "Can't make it" found nothing to take them off, in words they can act on. */
const explainWithdrawMiss = async (
  organizationId: string,
  eventId: string,
  userId: string,
): Promise<string> => {

  const row = await prisma.eventAssignment.findUnique({
    where: { eventId_userId: { eventId, userId } },
    select: { status: true, organizationId: true },
  });

  if (!row || row.organizationId !== organizationId) {
    return "Unable to find this event";
  }

  if (
    row.status === InvitationStatus.DECLINED ||
    row.status === InvitationStatus.CANCELED
  ) {
    return "You're no longer on this event";
  }

  return "You haven't accepted this event";
};

export const cancelUserEventAssignment = async (userId: string, organizationId: string, eventId: string, touch: TagInvalidator = updateTag): Promise<ActionResponse> => {
  
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
        role: true,
        organization: { select: { name: true, logoUrl: true } },
      }
    });

    if (!userMembership) return { success: false, error: "Unable to locate membership" };

    if (userMembership.role === OrgRole.MEMBER) return { success: false, error: "Unauthorized" };

    // Read before the write. The notice depends on what the assignment was,
    // and the update is about to overwrite exactly that — so a blind update
    // would leave no way to tell "took a volunteer off the team" apart from
    // "tidied up a row that was already dead".
    const assignment = await prisma.eventAssignment.findFirst({
      where: { eventId, userId, organizationId },
      select: {
        status: true,
        role: true,
        expiresAt: true,
        user: { select: { email: true, firstName: true } },
        event: {
          select: {
            name: true,
            dates: { select: { startTime: true, endTime: true } },
          },
        },
      },
    });

    if (!assignment) return { success: false, error: "Unable to find this assignment" };

    // Turning this CANCELED would wipe the decline off their record. Only a
    // stale screen gets here: a declined row's menu offers Remove Person.
    if (assignment.status === InvitationStatus.DECLINED) {
      return { success: false, error: "They already declined. Refresh to remove them." };
    }

    // Off the event means off its songs too: the setlist reads its singers
    // without looking at their status, so a row left behind still shows them.
    await prisma.$transaction([
      prisma.eventAssignment.update({
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
      }),
      prisma.setlistSongAssignment.deleteMany({
        where: { userId, setlistSong: { eventId } },
      }),
    ]);

    touch(`user-${userId}-events-${organizationId}`);
    touch(`user-${userId}-songs-${organizationId}`);
    touch(`event-${eventId}-org-${organizationId}-details`);
    touch(`org-${organizationId}-events`);

    // Only someone who still held the spot has lost anything. A volunteer who
    // already declined, was taken off once already, or let the invitation
    // lapse is told nothing — a lapse still reads PENDING until the hourly
    // sweep, so the deadline is what decides.
    const heldTheSpot = holdsSpot(assignment, new Date());

    if (heldTheSpot) {
      const { name: organizationName, logoUrl } = userMembership.organization;
      const when = formatEventWhen(assignment.event.dates);
      // Somebody still deciding was never on the team: their invitation was withdrawn.
      const accepted = assignment.status === InvitationStatus.ACCEPTED;

      after(async () => {
        await resend.emails.send({
          from: organizationSender(organizationName),
          to: assignment.user.email,
          subject: accepted
            ? `Removed: ${assignment.event.name}`
            : `Invitation withdrawn: ${assignment.event.name}`,
          react: EventRemovedEmail({
            recipientName: assignment.user.firstName,
            eventName: assignment.event.name,
            organizationName,
            logoUrl,
            removedByName: `${user.firstName} ${user.lastName}`,
            roleLabel: volunteerRoleConfig[assignment.role].label,
            accepted,
            eventDate: when?.date ?? null,
            eventTime: when?.time ?? null,
            viewLink: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/organizations/${organizationId}`,
          }),
        });
      });

      const shortWhen = formatEventShort(assignment.event.dates);

      // To their organization rather than the event: they can't open it now.
      after(() =>
        sendPushNotices("cancelUserEventAssignment removed", [
          {
            email: assignment.user.email,
            title: accepted
              ? `Removed: ${assignment.event.name}`
              : `Invitation withdrawn: ${assignment.event.name}`,
            subtitle: organizationName,
            body: [
              accepted
                ? `${user.firstName} ${user.lastName} took you off the team.`
                : `${user.firstName} ${user.lastName} withdrew your invitation.`,
              [volunteerRoleConfig[assignment.role].label, shortWhen].filter(Boolean).join(" · "),
            ].join("\n"),
            data: { type: "organization", organizationId },
          },
        ]),
      );
    }

    await syncEventNotifications(eventId, touch);

    return { success: true };

  } catch {

    return { success: false, error: "Something went wrong, try again" };

  };
}


const RESEND_EXPIRY_DAYS = 3;

export const resendEventInvitation = async (
  organizationId: string,
  eventId: string,
  userId: string,
  touch: TagInvalidator = updateTag,
): Promise<ActionResponse> => {

  try {

    const user = await currentUser();

    if (!user) return { success: false, error: "Unauthorized" };

    const [membership, assignment] = await Promise.all([
      prisma.membership.findUnique({
        where: {
          userId_organizationId: { userId: user.id, organizationId },
        },
        select: {
          role: true,
          organization: { select: { name: true, logoUrl: true, timeZone: true } },
        },
      }),
      prisma.eventAssignment.findFirst({
        where: { eventId, userId, organizationId },
        select: {
          status: true,
          role: true,
          expiresAt: true,
          user: { select: { email: true, firstName: true } },
          event: {
            select: {
              name: true,
              dates: { select: { startTime: true, endTime: true } },
            },
          },
        },
      }),
    ]);

    if (!membership) return { success: false, error: "Unable to locate membership" };

    if (membership.role === OrgRole.MEMBER) return { success: false, error: "Unauthorized" };

    if (!assignment) return { success: false, error: "Unable to find this assignment" };

    // EXPIRED once the sweep has run; still PENDING in the window before it.
    const hasLapsed =
      assignment.status === InvitationStatus.EXPIRED ||
      (assignment.status === InvitationStatus.PENDING &&
        assignment.expiresAt <= new Date());

    if (!hasLapsed) return { success: false, error: "That invitation hasn't expired" };

    const targetMembership = await prisma.membership.findUnique({
      where: { userId_organizationId: { userId, organizationId } },
      select: { volunteerRoles: true },
    });

    if (!targetMembership) {
      return { success: false, error: "They're no longer part of this organization" };
    }

    if (!targetMembership.volunteerRoles.includes(assignment.role)) {
      return {
        success: false,
        error: `Unable to reinvite — they no longer have the ${volunteerRoleConfig[assignment.role].label} role`,
      };
    }

    const blockedIds = await getBlockedUserIds(
      organizationId,
      assignment.event.dates,
    );

    if (blockedIds.has(userId)) {
      return {
        success: false,
        error: "Unable to reinvite — they have blockout dates during this event",
      };
    }

    const resentExpiry = new Date(Date.now() + RESEND_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

    // Their spot is usually still open, and this fills it. When somebody else
    // was invited into it meanwhile, they're both wanted, and the role grows.
    await prisma.$transaction(async (tx) => {
      await lockEventSpots(tx, eventId);

      const now = new Date();

      await tx.eventAssignment.update({
        where: {
          eventId_userId: { eventId, userId },
          organizationId,
        },
        data: {
          status: InvitationStatus.PENDING,
          invitedAt: now,
          expiresAt: resentExpiry,
          assignedById: user.id,
          autoAssigned: false,
          // A new window earns its own "still need your answer", and a new
          // yes its own reminders.
          midwayNudgedAt: null,
          nudgedAt: null,
          reminderSentAt: null,
          rehearsalReminderSentAt: null,
        },
      });

      await raiseSpotsToFit(tx, eventId, assignment.role, now);
    });

    touch(`user-${userId}-events-${organizationId}`);
    touch(`event-${eventId}-org-${organizationId}-details`);
    touch(`org-${organizationId}-events`);
    touch(`org-${organizationId}-activity`);

    const { name: organizationName, logoUrl } = membership.organization;
    const resentWhen = formatEventWhen(assignment.event.dates);

    after(async () => {
      await resend.emails.send({
        from: organizationSender(organizationName),
        to: assignment.user.email,
        subject: `You're invited to serve: ${assignment.event.name}`,
        react: EventAssignmentEmail({
          recipientName: assignment.user.firstName,
          eventName: assignment.event.name,
          organizationName: organizationName || "",
          logoUrl,
          roleLabel: volunteerRoleConfig[assignment.role].label,
          kind: "resend",
          invitedByName: `${user.firstName} ${user.lastName}`,
          eventDate: resentWhen?.date ?? null,
          eventTime: resentWhen?.time ?? null,
          startsAt: eventStartAt(assignment.event.dates, membership.organization.timeZone),
          expiresAt: resentExpiry,
          viewLink: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/organizations/${organizationId}`,
        }),
      });
    });

    after(() =>
      sendPushNotices("resendEventInvitation assignment", [
        assignmentPush({
          email: assignment.user.email,
          eventName: assignment.event.name,
          eventId,
          organizationName,
          organizationId,
          roleLabel: volunteerRoleConfig[assignment.role].label,
          when: formatEventShort(assignment.event.dates),
          kind: "resend",
          invitedByName: `${user.firstName} ${user.lastName}`,
        }),
      ]),
    );

    await logActivity({
      organizationId,
      eventId,
      eventName: assignment.event.name,
      type: ActivityType.INVITE_SENT,
      actorName: `${user.firstName} ${user.lastName}`,
      targetName: assignment.event.name,
      detail: `${volunteerRoleConfig[assignment.role].label} · reinvited after expiry`,
    });

    await syncEventNotifications(eventId, touch);

    return { success: true };

  } catch {

    return { success: false, error: "Unable to resend this invite, please try again" };

  };
};


/**
 * Takes a lapsed, declined or removed invitation off the roster, and closes the
 * spot it left open — how an admin says that spot isn't needed anymore. A
 * spot somebody else has since been invited into stays, and a role never drops
 * below one: taking the whole role off is removeEventRole.
 *
 * A lapsed or removed row is deleted: nobody answered it, so it never counted.
 * A declined one is only dismissed, because a decline — "Can't make it"
 * included — stays on the member's acceptance record.
 *
 * Never anybody live. A volunteer who accepted, or is still deciding, comes off
 * through cancelUserEventAssignment, which tells them they've been removed.
 */
export const deleteEventInvite = async (
  organizationId: string,
  eventId: string,
  userId: string,
  touch: TagInvalidator = updateTag,
): Promise<ActionResponse> => {

  try {

    const user = await currentUser();

    if (!user) return { success: false, error: "Unauthorized" };

    const membership = await prisma.membership.findUnique({
      where: {
        userId_organizationId: { userId: user.id, organizationId },
      },
      select: { role: true },
    });

    if (!membership) return { success: false, error: "Unable to locate membership" };

    if (membership.role === OrgRole.MEMBER) return { success: false, error: "Unauthorized" };

    const error = await prisma.$transaction(
      async (tx): Promise<string | null> => {
        await lockEventSpots(tx, eventId);

        const event = await tx.event.findFirst({
          where: { id: eventId, organizationId },
          select: {
            rolesNeeded: true,
            roleSpots: true,
            assignments: {
              where: { dismissedAt: null },
              select: { id: true, userId: true, role: true, status: true, expiresAt: true },
            },
          },
        });

        if (!event) return "Unable to locate event";

        const assignment = event.assignments.find((a) => a.userId === userId);

        if (!assignment) return "Unable to find this assignment";

        const now = new Date();

        // PENDING past its deadline has lapsed, even before the sweep writes EXPIRED.
        const live =
          assignment.status === InvitationStatus.ACCEPTED ||
          (assignment.status === InvitationStatus.PENDING && assignment.expiresAt > now);

        if (live) return "Only a declined, removed or expired invite can be deleted";

        const spots = parseRoleSpots(event.roleSpots);
        const { needed, open } = roleStanding(assignment.role, spots, event.assignments, now);

        if (assignment.status === InvitationStatus.DECLINED) {
          await tx.eventAssignment.update({
            where: { id: assignment.id, organizationId },
            data: { dismissedAt: now },
          });
        } else {
          await tx.eventAssignment.delete({
            where: { id: assignment.id, organizationId },
          });
        }

        if (open > 0 && needed > 1) {
          await tx.event.update({
            where: { id: eventId },
            data: {
              roleSpots: storedRoleSpots(
                { ...spots, [assignment.role]: needed - 1 },
                event.rolesNeeded,
              ),
            },
          });
        }

        return null;
      },
    );

    if (error) return { success: false, error };

    touch(`user-${userId}-events-${organizationId}`);
    touch(`event-${eventId}-org-${organizationId}-details`);
    touch(`org-${organizationId}-events`);

    await syncEventNotifications(eventId, touch);

    return { success: true };

  } catch {

    return { success: false, error: "Unable to remove this invite, please try again" };

  };
};



// Smart scheduling is per-event, so it can be flipped on the event page after
// creation without touching any other event.
export const setEventSmartScheduling = async (
  organizationId: string,
  eventId: string,
  enabled: boolean,
  touch: TagInvalidator = updateTag,
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

    // Switching it off is always allowed, so a Free organization can still
    // clear a setting it kept from a paid plan.
    if (enabled && !(await hasSmartScheduling(organizationId))) {
      return { success: false, error: SMART_SCHEDULING_PLAN_ERROR };
    }

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

    touch(`event-${eventId}-org-${organizationId}-details`);
    touch(`org-${organizationId}-activity`);
    touch(`event-${eventId}-org-${organizationId}-activity`);

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
  touch: TagInvalidator = updateTag,
): Promise<ActionResponse> => {

  try {

    const user = await currentUser();

    if (!user) return { success: false, error: "Unauthorized" };

    const parsed = addEventRolesSchema.safeParse(input);

    if (!parsed.success) return { success: false, error: parsed.error.message };

    const { roles, fillMyself = [] } = parsed.data;

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
          serviceTypeId: true,
          createdById: true,
          teamLeads: { select: { category: true, userId: true } },
          assignments: { where: { dismissedAt: null }, select: { role: true } },
        },
      }),
    ]);

    if (!membership) return { success: false, error: "Unable to locate membership" };

    if (membership.role === OrgRole.MEMBER) return { success: false, error: "Unauthorized" };

    if (!event) return { success: false, error: "Unable to locate event" };

    const merged = [...new Set([...event.rolesNeeded, ...roles])];

    if (merged.length === event.rolesNeeded.length) {
      return { success: false, error: "Those roles are already on this event" };
    }

    // Teams none of the roster's roles were in until now. The create form's
    // "Who handles open spots" never offered them, so the adder can take one
    // on here before its lead is told to staff it — and only these.
    const rosterTeams = new Set(
      [...event.rolesNeeded, ...event.assignments.map((assignment) => assignment.role)].map(
        teamOfRole,
      ),
    );

    const newTeams = new Set(roles.map(teamOfRole).filter((team) => !rosterTeams.has(team)));

    // Saved as this event's cover, as the edit form saves a pick, and through
    // the same check: a team that falls to the adder anyway needs no pick.
    const picks = await resolveEventTeamLeads(
      [...new Set(fillMyself)]
        .filter((team) => newTeams.has(team))
        .map((team) => ({ team, userId: user.id })),
      organizationId,
      event.serviceTypeId,
      event.createdById,
    );

    if (picks === null) return { success: false, error: TEAM_LEAD_PICK_ERROR };

    await prisma.$transaction(async (tx) => {
      await tx.event.update({
        where: { id: eventId },
        data: { rolesNeeded: merged },
      });

      if (picks.length > 0) {
        await tx.eventTeamLead.deleteMany({
          where: { eventId, category: { in: picks.map((pick) => pick.team) } },
        });

        await tx.eventTeamLead.createMany({
          data: picks.map((pick) => ({
            eventId,
            category: pick.team,
            organizationId,
            userId: pick.userId,
          })),
        });
      }
    });

    touch(`event-${eventId}-org-${organizationId}-details`);
    touch(`org-${organizationId}-events`);

    // After the picks, so a team the adder took counts on their bell, not the lead's.
    await syncEventNotifications(eventId, touch);

    // Never silent, like a pick on the edit form: the team's regular lead
    // hears it's covered on this event, and the owners do when an admin took it.
    if (picks.length > 0) {
      const before = event.teamLeads.map((pick) => ({ team: pick.category, userId: pick.userId }));

      after(() =>
        notifyCoverChanges({
          organizationId,
          eventId,
          before,
          after: [
            ...before.filter((pick) => !picks.some((mine) => mine.team === pick.team)),
            ...picks,
          ],
          changedBy: {
            userId: user.id,
            name: `${user.firstName} ${user.lastName}`,
            role: membership.role,
          },
        }),
      );
    }

    // The new roles' leads hear about them, unless they added them themselves
    // or the adder just took the team on — who's in charge is read after the save.
    after(() =>
      notifyTeamsNeeded({
        organizationId,
        eventId,
        roles: roles.filter((role) => !event.rolesNeeded.includes(role)),
        actor: { userId: user.id, name: `${user.firstName} ${user.lastName}` },
        added: true,
        skipCovers: false,
      }),
    );

    return { success: true };

  } catch {

    return { success: false, error: "Unable to add roles, please try again" };

  };
};


// The counterpart to addEventRoles. Only a role nobody is live on can come off —
// pulling a volunteer from an event stays its own explicit act. Canceled and
// lapsed rows are deleted with it, since the roster is the union of rolesNeeded
// and assignment roles and would otherwise keep rendering the role. Declined
// rows are dismissed instead, which every roster read skips, so the decline
// still counts on the member's acceptance record.
export const removeEventRole = async (
  organizationId: string,
  eventId: string,
  input: RemoveEventRoleInput,
  touch: TagInvalidator = updateTag,
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
          roleSpots: true,
          assignments: {
            where: { role, dismissedAt: null },
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

    const remaining = event.rolesNeeded.filter((r) => r !== role);

    await prisma.$transaction([
      prisma.eventAssignment.deleteMany({
        where: { eventId, organizationId, role, status: { not: InvitationStatus.DECLINED } },
      }),
      prisma.eventAssignment.updateMany({
        where: {
          eventId,
          organizationId,
          role,
          status: InvitationStatus.DECLINED,
          dismissedAt: null,
        },
        data: { dismissedAt: now },
      }),
      prisma.event.update({
        where: { id: eventId },
        data: {
          rolesNeeded: remaining,
          roleSpots: storedRoleSpots(parseRoleSpots(event.roleSpots), remaining),
        },
      }),
    ]);

    touch(`event-${eventId}-org-${organizationId}-details`);
    touch(`org-${organizationId}-events`);

    for (const { userId } of event.assignments) {
      touch(`user-${userId}-events-${organizationId}`);
    };

    await syncEventNotifications(eventId, touch);

    return { success: true };

  } catch {

    return { success: false, error: "Unable to remove role, please try again" };

  };
};


type InviteToEventResult =
  | {
      success: true;
      invitedCount: number;
      skippedNames: string[];
      /** Picked, but the role filled up before they could be asked. Only with `onlyOpenSpots`. */
      noSpotNames: string[];
    }
  | { success: false; error: string };

// Invites members into a role on an event that already exists. Mirrors the
// guards createEvent applies at creation time: admin/owner only, blockouts are
// a hard stop, conflicts are the caller's call (warned about in the UI).
export const inviteMembersToEvent = async (
  organizationId: string,
  eventId: string,
  input: InviteToEventInput,
  touch: TagInvalidator = updateTag,
): Promise<InviteToEventResult> => {

  try {

    const user = await currentUser();

    if (!user) return { success: false, error: "Unauthorized" };

    const parsed = inviteToEventSchema.safeParse(input);

    if (!parsed.success) return { success: false, error: parsed.error.message };

    const { role, userIds, expiresAt, onlyOpenSpots, refuseConflicts } = parsed.data;

    const uniqueUserIds = [...new Set(userIds)];

    const [membership, event, roleAssigned] = await Promise.all([
      prisma.membership.findUnique({
        where: {
          userId_organizationId: { userId: user.id, organizationId },
        },
        include: { organization: { select: { name: true, logoUrl: true, timeZone: true } } },
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
      // The other half of the roster union. The assignments above can't answer
      // it — they're narrowed to the people being invited. A dismissed decline
      // left behind by removeEventRole doesn't put the role back.
      prisma.eventAssignment.findFirst({
        where: { eventId, organizationId, role, dismissedAt: null },
        select: { id: true },
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

    // The role has to be on the roster already — addEventRoles is what opens a
    // slot, and letting an invite do it quietly is how an event ends up staffed
    // for a role nobody asked for. Same union removeEventRole draws, so a
    // legacy event whose roster lives in its assignments still invites fine.
    if (!event.rolesNeeded.includes(role) && !roleAssigned) {
      return { success: false, error: "That role isn't on this event" };
    }

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

    // From an AI card, a clash is refused as well.
    if (refuseConflicts) {
      const clashes = (await getConflictingAssignments(organizationId, event.dates, eventId)).filter(
        (row) => uniqueUserIds.includes(row.userId),
      );

      if (clashes.length > 0) return { success: false, error: await conflictError(clashes) };
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

    // In the order they were picked: with only the open spots to fill, the
    // first picks get them.
    const reactivateIds = new Map(toReactivate.map((a) => [a.userId, a.id]));
    const candidates = uniqueUserIds.filter(
      (uid) => toCreate.includes(uid) || reactivateIds.has(uid),
    );

    if (candidates.length === 0) {
      return { success: false, error: "Everyone selected is already on this event" };
    }

    const expiry = new Date(Date.now() + expiresAt * 24 * 60 * 60 * 1000);

    const invitedUserIds = await prisma.$transaction(async (tx) => {
      await lockEventSpots(tx, eventId);

      // Read under the lock, so a lead and their backup approving at once
      // can't both take the last spot.
      const room = onlyOpenSpots
        ? await openSpots(tx, eventId, role, now)
        : candidates.length;

      const asked = candidates.slice(0, room);

      if (asked.length === 0) return asked;

      const creating = asked.filter((uid) => !reactivateIds.has(uid));
      const reactivating = asked.flatMap((uid) => reactivateIds.get(uid) ?? []);

      if (creating.length > 0) {
        await tx.eventAssignment.createMany({
          data: creating.map((uid) => ({
            eventId,
            userId: uid,
            role,
            assignedById: user.id,
            organizationId,
            expiresAt: expiry,
          })),
        });
      }

      if (reactivating.length > 0) {
        await tx.eventAssignment.updateMany({
          where: { id: { in: reactivating }, organizationId },
          data: {
            role,
            status: InvitationStatus.PENDING,
            assignedById: user.id,
            autoAssigned: false,
            invitedAt: now,
            expiresAt: expiry,
            midwayNudgedAt: null,
            nudgedAt: null,
            // Somebody who backed out and is asked again hears the reminders
            // again once they say yes.
            reminderSentAt: null,
            rehearsalReminderSentAt: null,
            // A dismissed decline asked again is back on the roster.
            dismissedAt: null,
          },
        });
      }

      // Only reachable for a legacy event carrying assignments it never
      // declared: the guard above already refused anything off the roster.
      // Persisting the role here is what stops it being legacy twice.
      if (!event.rolesNeeded.includes(role)) {
        await tx.event.update({
          where: { id: eventId },
          data: { rolesNeeded: [...event.rolesNeeded, role] },
        });
      }

      // Into the role's open spots first; anybody past them is another spot.
      await raiseSpotsToFit(tx, eventId, role, now);

      return asked;
    });

    if (invitedUserIds.length === 0) {
      return {
        success: false,
        error: `No ${volunteerRoleConfig[role].label} spots are open anymore`,
      };
    }

    const invitedUsers = await prisma.user.findMany({
      where: { id: { in: invitedUserIds } },
      select: { email: true, firstName: true },
    });

    const { name: organizationName, logoUrl } = membership.organization;
    const fullWhen = formatEventWhen(event.dates);

    after(async () => {
      await sendEmailBatches(
        "inviteMembersToEvent assignment",
        invitedUsers.map((invitee) => ({
          from: organizationSender(organizationName),
          to: invitee.email,
          subject: `You're invited to serve: ${event.name}`,
          react: EventAssignmentEmail({
            recipientName: invitee.firstName,
            eventName: event.name,
            organizationName: organizationName || "",
            logoUrl,
            roleLabel: volunteerRoleConfig[role].label,
            kind: "invite",
            invitedByName: `${user.firstName} ${user.lastName}`,
            eventDate: fullWhen?.date ?? null,
            eventTime: fullWhen?.time ?? null,
            startsAt: eventStartAt(event.dates, membership.organization.timeZone),
            expiresAt: expiry,
            viewLink: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/organizations/${organizationId}`,
          }),
        })),
      );
    });

    const when = formatEventShort(event.dates);

    after(() =>
      sendPushNotices(
        "inviteMembersToEvent assignment",
        invitedUsers.map((invitee) =>
          assignmentPush({
            email: invitee.email,
            eventName: event.name,
            eventId,
            organizationName,
            organizationId,
            roleLabel: volunteerRoleConfig[role].label,
            when,
            kind: "invite",
            invitedByName: `${user.firstName} ${user.lastName}`,
          }),
        ),
      ),
    );

    await logActivity({
      organizationId,
      eventId,
      eventName: event.name,
      type: ActivityType.INVITE_SENT,
      actorName: `${user.firstName} ${user.lastName}`,
      targetName: event.name,
      detail: `${volunteerRoleConfig[role].label} · ${invitedUserIds.length} invited`,
    });

    for (const uid of invitedUserIds) {
      touch(`user-${uid}-events-${organizationId}`);
    };

    touch(`event-${eventId}-org-${organizationId}-details`);
    touch(`org-${organizationId}-events`);
    touch(`org-${organizationId}-activity`);

    // Reusing a row drops whatever ACCEPTED/DECLINED it held, which moves the
    // acceptance numbers those stats are counted from.
    if (invitedUserIds.some((uid) => reactivateIds.has(uid))) {
      touch(`org-${organizationId}-acceptance-stats`);
    }

    await syncEventNotifications(eventId, touch);

    // Picked, but the role filled up before they could be asked.
    const leftOut = candidates.filter((uid) => !invitedUserIds.includes(uid));

    const noSpotNames =
      leftOut.length > 0
        ? (
            await prisma.user.findMany({
              where: { id: { in: leftOut } },
              select: { firstName: true, lastName: true },
            })
          ).map((u) => `${u.firstName} ${u.lastName}`)
        : [];

    return {
      success: true,
      invitedCount: invitedUserIds.length,
      skippedNames,
      noSpotNames,
    };

  } catch {

    return { success: false, error: "Unable to send invites, please try again" };

  };
};


export const deleteEvent = async (organizationId: string, eventId: string, touch: TagInvalidator = updateTag): Promise<ActionResponse> => {

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
        role: true,
        organization: { select: { name: true, logoUrl: true } },
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
        // Addresses included: this roster is who the cancellation notice goes
        // to, and the delete below takes it with the event.
        assignments: {
          select: {
            userId: true,
            role: true,
            status: true,
            expiresAt: true,
            user: { select: { email: true, firstName: true } },
          },
        },
        dates: { select: { startTime: true, endTime: true } },
        // Deleting the event cascades these away, which changes each of those
        // members' top-songs tally — read them while they still exist.
        setlistSongs: {
          select: { setlistSongAssignment: { select: { userId: true } } },
        },
      },
    });

    if (!event) return { success: false, error: "Unable to locate event" };

    // Only people who were counted on hear about it: someone who declined or
    // was removed is not on this event, and telling them it vanished is noise.
    //
    // The deleter is NOT filtered out, even though they just pressed the
    // button. An admin who staffed themselves is on the roster like anyone
    // else, and createEvent already mails them "You've been assigned" for
    // their own assignment — suppressing only the cancellation would be the
    // odd half of that pair.
    const now = new Date();

    const strandedTeam = event.assignments.filter((assignment) =>
      holdsSpot(assignment, now),
    );

    // Before the delete, not after: the cascade removes these rows silently,
    // leaving every watcher's cached bell pointing at an event that is gone.
    await clearEventNotifications(eventId, touch);

    await prisma.event.delete({
      where: {
        id: eventId
      }
    });

    if (strandedTeam.length > 0) {
      const { name: organizationName, logoUrl } = userMembership.organization;
      const canceledByName = `${user.firstName} ${user.lastName}`;
      const when = formatEventWhen(event.dates);

      after(async () => {
        await sendEmailBatches(
          "deleteEvent cancellation",
          strandedTeam.map((assignment) => ({
            from: organizationSender(organizationName),
            to: assignment.user.email,
            subject: `Canceled: ${event.name}`,
            react: EventCanceledEmail({
              recipientName: assignment.user.firstName,
              eventName: event.name,
              organizationName,
              logoUrl,
              canceledByName,
              roleLabel: volunteerRoleConfig[assignment.role].label,
              eventDate: when?.date ?? null,
              eventTime: when?.time ?? null,
              viewLink: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/organizations/${organizationId}`,
            }),
          })),
        );
      });

      const shortWhen = formatEventShort(event.dates);

      after(() =>
        sendPushNotices(
          "deleteEvent cancellation",
          strandedTeam.map((assignment) => ({
            email: assignment.user.email,
            title: `Canceled: ${event.name}`,
            subtitle: organizationName,
            body: [`${canceledByName} canceled this event.`, shortWhen]
              .filter(Boolean)
              .join("\n"),
            data: { type: "organization", organizationId },
          })),
        ),
      );
    }

    await logActivity({
      organizationId,
      type: ActivityType.EVENT_DELETED,
      actorName: `${user.firstName} ${user.lastName}`,
      targetName: event.name,
      detail: event.serviceType.name,
    });

    touch(`org-${organizationId}-events`);
    touch(`event-${eventId}-org-${organizationId}-details`);
    touch(`event-${eventId}-org-${organizationId}-activity`);
    touch(`org-${organizationId}-activity`);

    for (const { userId } of event.assignments) {
      touch(`user-${userId}-events-${organizationId}`);
    };

    const setlistUserIds = new Set(
      event.setlistSongs.flatMap((s) =>
        s.setlistSongAssignment.map((a) => a.userId),
      ),
    );

    for (const userId of setlistUserIds) {
      touch(`user-${userId}-songs-${organizationId}`);
    };

    const affectsAcceptanceStats = event.assignments.some(
      (assignment) =>
        assignment.status === InvitationStatus.ACCEPTED ||
        assignment.status === InvitationStatus.DECLINED,
    );

    if (affectsAcceptanceStats) {
      touch(`org-${organizationId}-acceptance-stats`);
    };

    return { success: true };

  } catch {
    return { success: false, error: "Something went wrong. Try again." };
  }
}

type EmailTeamResult =
  | { success: true; sentCount: number }
  | { success: false; error: string; code?: "EMAIL_LIMIT" };

export const emailAcceptedVolunteers = async (
  organizationId: string,
  eventId: string,
  input: EventEmailInput,
  touch: TagInvalidator = updateTag,
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

    const limitError = await bulkEmailLimitError(organizationId);

    if (limitError) return { success: false, error: limitError, code: "EMAIL_LIMIT" };

    const { name: organizationName, logoUrl } = membership.organization;
    const senderName = `${user.firstName} ${user.lastName}`;
    const viewLink = `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/organizations/${organizationId}/events/${eventId}`;

    const emails = recipients.map(({ user: recipient }) => ({
      from: organizationSender(organizationName),
      to: recipient.email,
      replyTo: user.email,
      subject,
      react: EventMessageEmail({
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

    // Counted only once it has all gone, so a failed send doesn't use one up.
    await recordUsage(organizationId, UsageKind.BULK_EMAIL);

    touch(`org-${organizationId}-usage`);

    return { success: true, sentCount: recipients.length };

  } catch {

    return { success: false, error: "Something went wrong, please try again" };

  };
};

export const editEventDetails = async (
  data: EditEventDetailsInput,
  touch: TagInvalidator = updateTag,
): Promise<ActionResponse> => {
    
    try {

      const user = await currentUser();

      if (!user) return { success: false, error: "Unable to find user" };

      const parsed = editEventDetailsSchema.safeParse(data);

      if (!parsed.success) return { success: false, error: parsed.error.message };

      const {
        eventId,
        organizationId,
        name,
        dayTimes,
        location,
        description,
        rehearsal,
        teamLeads,
      } = parsed.data;

      // undefined means the caller never offered the field — the mobile PATCH
      // body doesn't carry it — so the stored rehearsal is left alone. All-blank
      // is the dashboard dialog clearing it.
      const nextRehearsal =
        rehearsal === undefined
          ? undefined
          : rehearsal.date && rehearsal.startTime && rehearsal.endTime
            ? {
                rehearsalStart: new Date(rehearsal.startTime),
                rehearsalEnd: new Date(rehearsal.endTime),
              }
            : { rehearsalStart: null, rehearsalEnd: null };

      const [membership, event] = await Promise.all([
        prisma.membership.findUnique({
          where: {
            userId_organizationId: {
              userId: user.id,
              organizationId
            }
          },
          select: {
            role: true,
            organization: { select: { name: true, logoUrl: true } },
          }
        }),
        prisma.event.findFirst({
          where: { id: eventId, organizationId },
          // Read before the update lands, so this doubles as the "before" half
          // of the change list, and carries who that list is mailed to.
          select: {
            name: true,
            location: true,
            description: true,
            dates: { select: { startTime: true, endTime: true } },
            rehearsalStart: true,
            rehearsalEnd: true,
            createdById: true,
            serviceTypeId: true,
            teamLeads: { select: { category: true, userId: true } },
            assignments: {
              select: {
                userId: true,
                status: true,
                expiresAt: true,
                user: { select: { email: true, firstName: true } },
              },
            },
          },
        }),
      ]);

      if (!membership) return { success: false, error: "Unable to find membership" };

      if (membership.role === OrgRole.MEMBER) return { success: false, error: "Insufficient permissions" };

      if (!event) return { success: false, error: "Event doesn't exist" };

      // undefined leaves this event's team picks as they are — an older phone
      // build doesn't send them — and an empty list hands every team back to
      // the service type.
      const nextTeamLeads =
        teamLeads === undefined
          ? undefined
          : await resolveEventTeamLeads(
              teamLeads,
              organizationId,
              event.serviceTypeId,
              event.createdById,
            );

      if (nextTeamLeads === null) return { success: false, error: TEAM_LEAD_PICK_ERROR };

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

      const nextDates = Object.values(dayTimes).map((times) => ({
        startTime: new Date(times.startTime),
        endTime: new Date(times.endTime),
      }));

      const scheduleChanged = !sameSchedule(event.dates, nextDates);

      const rehearsalMoved =
        nextRehearsal !== undefined &&
        (event.rehearsalStart?.getTime() !== nextRehearsal.rehearsalStart?.getTime() ||
          event.rehearsalEnd?.getTime() !== nextRehearsal.rehearsalEnd?.getTime());

      await prisma.$transaction(async (tx) => {
        await tx.event.update({
          where: { id: eventId },
          data: {
            name,
            location,
            description: description ?? "",
            ...(nextRehearsal ?? {}),
          },
        });

        // New dates, new countdown: any day-before reminder already sent was
        // about the old ones. The last call needs nothing here — its claims
        // are keyed on the first block's start, so a moved event is new to it.
        if (scheduleChanged) {
          await tx.eventAssignment.updateMany({
            where: { eventId, reminderSentAt: { not: null } },
            data: { reminderSentAt: null },
          });
        }

        // The same for a rehearsal reminder sent about the old rehearsal.
        if (rehearsalMoved) {
          await tx.eventAssignment.updateMany({
            where: { eventId, rehearsalReminderSentAt: { not: null } },
            data: { rehearsalReminderSentAt: null },
          });
        }

        await tx.eventDate.deleteMany({ where: { eventId } });

        await tx.eventDate.createMany({
          data: nextDates.map((date) => ({ eventId, ...date })),
        });

        if (nextTeamLeads !== undefined) {
          await tx.eventTeamLead.deleteMany({ where: { eventId } });

          if (nextTeamLeads.length > 0) {
            await tx.eventTeamLead.createMany({
              data: nextTeamLeads.map((pick) => ({
                eventId,
                category: pick.team,
                organizationId,
                userId: pick.userId,
              })),
            });
          }
        }
      });

      touch(`event-${eventId}-org-${organizationId}-details`);
      touch(`org-${organizationId}-events`);

      for (const { userId } of event.assignments) {
        touch(`user-${userId}-events-${organizationId}`);
      };

      // Against the pre-update snapshot, so this is what actually moved rather
      // than everything the form submitted.
      const changes: EventChange[] = [];

      if (event.name !== name) {
        changes.push({ label: "Name", from: event.name, to: name });
      }

      if (scheduleChanged) {
        const previousWhen = formatEventWhen(event.dates);
        const nextWhen = formatEventWhen(nextDates);

        // Date and time on their own lines, so a phone never breaks a time in half.
        changes.push({
          label: "When",
          from: previousWhen ? `${previousWhen.date}\n${previousWhen.time}` : null,
          to: nextWhen ? `${nextWhen.date}\n${nextWhen.time}` : "",
        });
      }

      if (nextRehearsal) {
        const previousRehearsal = formatRehearsal(
          event.rehearsalStart,
          event.rehearsalEnd,
        );

        const updatedRehearsal = formatRehearsal(
          nextRehearsal.rehearsalStart,
          nextRehearsal.rehearsalEnd,
        );

        if (previousRehearsal !== updatedRehearsal) {
          changes.push({
            label: "Rehearsal",
            from: previousRehearsal,
            to: updatedRehearsal ?? "None",
          });
        }
      }

      if (event.location !== location) {
        changes.push({ label: "Where", from: event.location, to: location });
      }

      // Shown without its before: a rewritten description reads as two walls of
      // prose rather than as a diff.
      const nextDescription = description ?? "";

      if (event.description !== nextDescription) {
        changes.push({
          label: "Details",
          from: null,
          to: nextDescription || "(removed)",
        });
      }

      const now = new Date();

      const roster = event.assignments.filter((assignment) =>
        holdsSpot(assignment, now),
      );

      // A save that moved nothing mails nobody — opening the form and pressing
      // save is not news.
      if (changes.length > 0 && roster.length > 0) {
        const { name: organizationName, logoUrl } = membership.organization;
        const updatedByName = `${user.firstName} ${user.lastName}`;

        after(async () => {
          await sendEmailBatches(
            "editEventDetails update",
            roster.map((assignment) => ({
              from: organizationSender(organizationName),
              to: assignment.user.email,
              subject: `Updated: ${name}`,
              react: EventUpdatedEmail({
                recipientName: assignment.user.firstName,
                eventName: name,
                organizationName,
                logoUrl,
                updatedByName,
                changes,
                accepted: assignment.status === InvitationStatus.ACCEPTED,
                // Someone still deciding can't open the event page yet; their
                // invitation waits on the organization's.
                viewLink:
                  assignment.status === InvitationStatus.ACCEPTED
                    ? `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/organizations/${organizationId}/events/${eventId}`
                    : `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/organizations/${organizationId}`,
              }),
            })),
          );
        });

        const changed = new Intl.ListFormat("en", { type: "conjunction" }).format(
          changes.map((change) =>
            change.label === "When"
              ? "time"
              : change.label === "Where"
                ? "location"
                : change.label.toLowerCase(),
          ),
        );

        const nextWhen = scheduleChanged ? formatEventShort(nextDates) : null;

        after(() =>
          sendPushNotices(
            "editEventDetails update",
            roster.map((assignment) => ({
              email: assignment.user.email,
              title: `Updated: ${name}`,
              subtitle: organizationName,
              body: [`${updatedByName} changed the ${changed}.`, nextWhen && `Now ${nextWhen}`]
                .filter(Boolean)
                .join("\n"),
              // Someone still deciding can't open the event page yet.
              data:
                assignment.status === InvitationStatus.ACCEPTED
                  ? { type: "event", organizationId, eventId }
                  : { type: "invitation", organizationId, eventId },
            })),
          ),
        );
      }

      // Editing an event rewrites its EventDate rows, and those are what decide
      // whether it is still live. Moving a service out of the past earns it a
      // row; moving one into the past retires the rows it had. A new team pick
      // moves whose bell counts that team's open spots.
      await syncEventNotifications(eventId, touch);

      // Only somebody newly picked for a team hears about it, and not when
      // they picked themselves.
      const newlyPicked = (nextTeamLeads ?? []).filter(
        (pick) =>
          pick.userId !== user.id &&
          !event.teamLeads.some(
            (previous) => previous.category === pick.team && previous.userId === pick.userId,
          ),
      );

      if (newlyPicked.length > 0) {
        after(() =>
          notifyEventCovers({
            organizationId,
            eventId,
            covers: newlyPicked,
            assignedByName: `${user.firstName} ${user.lastName}`,
          }),
        );
      }

      // Picks apply at once but are never silent: the regular lead of each
      // team handed off or handed back hears, and the owners do too when an
      // admin made the change. A save that left the picks as they were tells
      // nobody.
      if (nextTeamLeads !== undefined) {
        after(() =>
          notifyCoverChanges({
            organizationId,
            eventId,
            before: event.teamLeads.map((pick) => ({
              team: pick.category,
              userId: pick.userId,
            })),
            after: nextTeamLeads,
            changedBy: {
              userId: user.id,
              name: `${user.firstName} ${user.lastName}`,
              role: membership.role,
            },
          }),
        );
      }

      return { success: true };

    } catch {

      return { success: false, error: "Something went wrong. Please try again." };

    }
};