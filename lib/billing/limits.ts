import "server-only";

import prisma from "@/lib/prisma";
import { InvitationStatus, UsageKind } from "@/generated/prisma/enums";
import {
  NEXT_PLAN,
  PLAN_LIMITS,
  PLAN_NAMES,
  formatResetDate,
  formatStorage,
  usageMonth,
  type OrgPlan,
  type PaidPlan,
} from "@/lib/config/plans";
import { getOrgPlan, planFromEntitlements } from "@/lib/billing/entitlements";
import { getOrgMemberCountById } from "@/lib/services/organization";
import { getOrgPendingInvitationCount } from "@/lib/services/invitation";
import { getOrganizationSongs } from "@/lib/services/songs";
import { getOrgServiceTypes } from "@/lib/services/service-types";
import { getOrgUsageCount } from "@/lib/services/usage";

/**
 * The org's plan, read live rather than cached: a write is about to be allowed
 * on it, and a church that paid a minute ago must not hit a stale plan.
 */
async function getLivePlan(organizationId: string): Promise<OrgPlan> {
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { entitlements: true },
  });

  return planFromEntitlements(organization?.entitlements ?? []);
}

type MemberSeats = {
  plan: OrgPlan;
  members: number;
  pendingInvites: number;
  limit: number | null;
};

/**
 * Seats in use, read live rather than cached: a write is about to be allowed on
 * this number, and a church that paid a minute ago must not hit a stale plan.
 *
 * A pending invite holds a seat because accepting it creates a member.
 * `exceptEmail` leaves that address's own invite out, so re-sending one that is
 * already waiting doesn't count the person twice.
 */
async function getMemberSeats(
  organizationId: string,
  exceptEmail?: string,
): Promise<MemberSeats> {
  const [plan, members, pendingInvites] = await Promise.all([
    getLivePlan(organizationId),
    prisma.membership.count({ where: { organizationId } }),
    prisma.invitation.count({
      where: {
        organizationId,
        status: InvitationStatus.PENDING,
        // Lapsed but not yet swept to EXPIRED: it can't be accepted, so it holds no seat.
        expiresAt: { gt: new Date() },
        ...(exceptEmail ? { email: { not: exceptEmail } } : {}),
      },
    }),
  ]);

  return { plan, members, pendingInvites, limit: PLAN_LIMITS[plan].members };
}

/**
 * What a dashboard refusal says after the rule: the plan that lifts the limit,
 * or who to ask for it, since only an owner can upgrade.
 */
function upgradeSentence(plan: OrgPlan, isOwner: boolean, action: string): string {
  const next = NEXT_PLAN[plan];

  if (next === null) return "";

  return isOwner
    ? `Upgrade to ${PLAN_NAMES[next]} to ${action}.`
    : `Ask an owner to upgrade to ${PLAN_NAMES[next]} to ${action}.`;
}

/** Why one more song can't be added to the library, or null when there's room. */
export async function songLimitError(
  organizationId: string,
  isOwner: boolean,
): Promise<string | null> {
  const [plan, songs] = await Promise.all([
    getLivePlan(organizationId),
    // Deleted songs are out of the library, so they don't hold a spot.
    prisma.song.count({ where: { organizationId, deletedAt: null } }),
  ]);

  const limit = PLAN_LIMITS[plan].songs;

  if (limit === null || songs < limit) return null;

  return `${PLAN_NAMES[plan]} organizations can have up to ${limit} songs in the library. ${upgradeSentence(plan, isOwner, "add more")}`;
}

/** Why one more service type can't be added, or null when there's room. */
export async function serviceTypeLimitError(
  organizationId: string,
  isOwner: boolean,
): Promise<string | null> {
  const [plan, serviceTypes] = await Promise.all([
    getLivePlan(organizationId),
    // Deleted ones stay on their past events but are out of use, so they don't hold a spot.
    prisma.serviceType.count({ where: { organizationId, deletedAt: null } }),
  ]);

  const limit = PLAN_LIMITS[plan].serviceTypes;

  if (limit === null || serviceTypes < limit) return null;

  return `${PLAN_NAMES[plan]} organizations can have up to ${limit} service types. ${upgradeSentence(plan, isOwner, "add more")}`;
}

/**
 * Bytes of charts and audio on the library's songs, read live. Files a deleted
 * song keeps for past setlists are out of sight and out of reach, so they don't
 * count.
 */
export async function getStorageUsed(organizationId: string): Promise<number> {
  const { _sum } = await prisma.songAttachment.aggregate({
    where: { song: { organizationId, deletedAt: null } },
    _sum: { size: true },
  });

  return _sum.size ?? 0;
}

/**
 * Why an upload of `incoming` bytes doesn't fit, or null when it does. Neutral
 * on purpose: the iPhone shows this too, and it can't point anyone at an upgrade.
 */
export async function storageLimitError(
  organizationId: string,
  incoming: number,
): Promise<string | null> {
  const [plan, used] = await Promise.all([
    getLivePlan(organizationId),
    getStorageUsed(organizationId),
  ]);

  const limit = PLAN_LIMITS[plan].storage;

  if (used + incoming <= limit) return null;

  const left = limit > used ? formatStorage(limit - used) : "none";

  return `Not enough storage. This upload is ${formatStorage(incoming)}, and ${left} of this organization's ${formatStorage(limit)} is left.`;
}

/** This calendar month's uses of one allowance, read live. */
async function getMonthlyUses(organizationId: string, kind: UsageKind): Promise<number> {
  return prisma.usageEvent.count({
    where: { organizationId, kind, createdAt: { gte: usageMonth().start } },
  });
}

/**
 * Counts one use of a monthly allowance. Best-effort, like the activity feed:
 * a failed write must not make a sent email look unsent, or turn away an AI
 * request the plan still allows.
 */
export async function recordUsage(organizationId: string, kind: UsageKind): Promise<void> {
  try {
    await prisma.usageEvent.create({ data: { organizationId, kind } });
  } catch (err) {
    console.error("Failed to record usage", err);
  }
}

/**
 * Why one more Message All or Email Team send can't go out this month, or null
 * when there's room. Neutral on purpose: the iPhone shows it word for word, and
 * the dashboard puts the upgrade beside it rather than in it.
 */
export async function bulkEmailLimitError(organizationId: string): Promise<string | null> {
  const [plan, sent] = await Promise.all([
    getLivePlan(organizationId),
    getMonthlyUses(organizationId, UsageKind.BULK_EMAIL),
  ]);

  const limit = PLAN_LIMITS[plan].bulkEmails;

  if (sent < limit) return null;

  const resets = formatResetDate(usageMonth().resetsAt);

  return `${PLAN_NAMES[plan]} organizations can send ${limit} group emails a month, and this month's are used up. The count starts over on ${resets}.`;
}

/**
 * Why the AI can't take another message this month, or null when there's room.
 * Every plan with AI gets the same allowance, so there is nothing to upgrade to —
 * only a date to wait for.
 */
export async function aiRunLimitError(organizationId: string): Promise<string | null> {
  const [plan, used] = await Promise.all([
    getLivePlan(organizationId),
    getMonthlyUses(organizationId, UsageKind.AI_RUN),
  ]);

  const limit = PLAN_LIMITS[plan].aiRuns;

  // The routes' cached entitlement read said paid and the live one says Free.
  // Worded like their own refusal, so every panel reads it the same way.
  if (limit === 0) return "Upgrade required";

  if (used < limit) return null;

  const resets = formatResetDate(usageMonth().resetsAt);

  return `This organization has used all ${limit} of this month's AI requests. The count starts over on ${resets}.`;
}

/** Whether a plan with these entitlements includes Smart Scheduling. */
export function smartSchedulingIncluded(entitlements: string[]): boolean {
  return PLAN_LIMITS[planFromEntitlements(entitlements)].smartScheduling;
}

/**
 * Whether the org's plan includes Smart Scheduling, read live: it decides
 * whether auto-fill can be switched on right now.
 */
export async function hasSmartScheduling(organizationId: string): Promise<boolean> {
  return PLAN_LIMITS[await getLivePlan(organizationId)].smartScheduling;
}

/** Why auto-fill can't be switched on. Neutral, because the iPhone shows it too. */
export const SMART_SCHEDULING_PLAN_ERROR = "Smart Scheduling isn't included in this organization's plan.";

/** Why one more person can't be invited, or null when there's room. */
export async function inviteLimitError(
  organizationId: string,
  opts: { isOwner: boolean; exceptEmail?: string },
): Promise<string | null> {
  const { plan, members, pendingInvites, limit } = await getMemberSeats(organizationId, opts.exceptEmail);

  if (limit === null || members + pendingInvites < limit) return null;

  return `${PLAN_NAMES[plan]} organizations can have up to ${limit} members, including pending invites. ${upgradeSentence(plan, opts.isOwner, "invite more")}`;
}

/**
 * Why an invitation can't be accepted right now, or null. Counts members only —
 * the invite being accepted is one of the pending ones. This is what stops an
 * org from sending 200 invites on Premium, cancelling, and having them all
 * land on Free.
 */
export async function joinLimitError(
  organizationId: string,
  organizationName: string,
): Promise<string | null> {
  const { members, limit } = await getMemberSeats(organizationId);

  if (limit === null || members < limit) return null;

  return `${organizationName} has reached its ${limit}-member limit. Let the person who invited you know. Once they make room, you can accept this invitation.`;
}

/** What the dashboard shows about seats. */
export type SeatUsage = {
  plan: OrgPlan;
  limit: number;
  members: number;
  pendingInvites: number;
  left: number;
};

/**
 * The same numbers for display, through cached reads that every invite, accept,
 * cancel and removal already expires. Null when the plan has no cap. Never
 * enforce with this.
 */
export async function getSeatUsage(organizationId: string): Promise<SeatUsage | null> {
  const [plan, members, pendingInvites] = await Promise.all([
    getOrgPlan(organizationId),
    getOrgMemberCountById(organizationId),
    getOrgPendingInvitationCount(organizationId),
  ]);

  const limit = PLAN_LIMITS[plan].members;

  if (limit === null) return null;

  return {
    plan,
    limit,
    members,
    pendingInvites,
    left: Math.max(0, limit - members - pendingInvites),
  };
}

/** What the Message All and Email Team dialogs show about this month's sends. */
export type EmailAllowance = {
  sent: number;
  limit: number;
  /** "October 1" */
  resetsOn: string;
  /** Where a full allowance can upgrade to; null on Pro. */
  upgradeTo: PaidPlan | null;
};

/**
 * This month's group emails against the plan's allowance, for display —
 * through cached reads that every send and plan change expires. Never enforce
 * with this.
 */
export async function getEmailAllowance(organizationId: string): Promise<EmailAllowance> {
  const { start, resetsAt } = usageMonth();

  const [plan, sent] = await Promise.all([
    getOrgPlan(organizationId),
    getOrgUsageCount(organizationId, UsageKind.BULK_EMAIL, start.toISOString()),
  ]);

  return {
    sent,
    limit: PLAN_LIMITS[plan].bulkEmails,
    resetsOn: formatResetDate(resetsAt),
    upgradeTo: NEXT_PLAN[plan],
  };
}

/**
 * What the Plan & usage screens show. Mirrored by `PlanUsage` in the Expo app
 * (`src/types/billing.ts`), which reads it from `GET .../usage`.
 */
export type PlanUsage = {
  plan: OrgPlan;
  members: { used: number; pending: number; limit: number | null };
  songs: { used: number; limit: number | null };
  serviceTypes: { used: number; limit: number | null };
  storage: { used: number; limit: number };
  /** Group emails sent this calendar month. */
  bulkEmails: { used: number; limit: number };
  /** AI messages this calendar month. A limit of 0 means the plan has no AI. */
  aiRuns: { used: number; limit: number };
  /** When the monthly counts start over: midnight UTC on the 1st, as ISO. */
  resetsAt: string;
};

/**
 * An organization's use of its plan, for display — through cached reads every
 * write already expires; the library read is the one the song screen uses.
 * Never enforce with this.
 */
export async function getPlanUsage(organizationId: string): Promise<PlanUsage> {
  const { start, resetsAt } = usageMonth();

  const [plan, members, pending, songs, serviceTypes, bulkEmails, aiRuns] = await Promise.all([
    getOrgPlan(organizationId),
    getOrgMemberCountById(organizationId),
    getOrgPendingInvitationCount(organizationId),
    getOrganizationSongs(organizationId),
    getOrgServiceTypes(organizationId),
    getOrgUsageCount(organizationId, UsageKind.BULK_EMAIL, start.toISOString()),
    getOrgUsageCount(organizationId, UsageKind.AI_RUN, start.toISOString()),
  ]);

  const limits = PLAN_LIMITS[plan];

  return {
    plan,
    members: { used: members, pending, limit: limits.members },
    songs: { used: songs.length, limit: limits.songs },
    serviceTypes: { used: serviceTypes.length, limit: limits.serviceTypes },
    storage: {
      used: songs.reduce(
        (total, song) => total + song.attachments.reduce((sum, file) => sum + file.size, 0),
        0,
      ),
      limit: limits.storage,
    },
    bulkEmails: { used: bulkEmails, limit: limits.bulkEmails },
    aiRuns: { used: aiRuns, limit: limits.aiRuns },
    resetsAt: resetsAt.toISOString(),
  };
}
