import "server-only";

import prisma from "@/lib/prisma";
import { InvitationStatus } from "@/generated/prisma/enums";
import { PLAN_LIMITS, type OrgPlan } from "@/lib/config/plans";
import { getOrgPlan, planFromEntitlements } from "@/lib/billing/entitlements";
import { getOrgMemberCountById } from "@/lib/services/organization";
import { getOrgPendingInvitationCount } from "@/lib/services/invitation";

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

  return { members, pendingInvites, limit: PLAN_LIMITS[plan].members };
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

  const next = isOwner
    ? "Upgrade to Premium to add more."
    : "Ask an owner to upgrade to Premium to add more.";

  return `Free organizations can have up to ${limit} songs in the library. ${next}`;
}

/** Why one more person can't be invited, or null when there's room. */
export async function inviteLimitError(
  organizationId: string,
  opts: { isOwner: boolean; exceptEmail?: string },
): Promise<string | null> {
  const { members, pendingInvites, limit } = await getMemberSeats(organizationId, opts.exceptEmail);

  if (limit === null || members + pendingInvites < limit) return null;

  // Only an owner can upgrade, so an admin is told who to ask.
  const next = opts.isOwner
    ? "Upgrade to Premium to invite more."
    : "Ask an owner to upgrade to Premium to invite more.";

  return `Free organizations can have up to ${limit} members, including pending invites. ${next}`;
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
    limit,
    members,
    pendingInvites,
    left: Math.max(0, limit - members - pendingInvites),
  };
}
