import "server-only";

import prisma from "@/lib/prisma";
import { OrgRole } from "@/generated/prisma/enums";

export type EmailRecipient = { email: string; firstName: string };

/**
 * Who hears that an event has been left short.
 *
 * The event's creator, when they are still someone who could act on it. Three
 * things can make them not: `Event.createdById` is nullable and `SetNull`, so
 * it empties when the account is deleted; the creator may have left the
 * organization; and they may have been demoted to MEMBER, who cannot staff an
 * event anyway.
 *
 * In any of those cases this falls back to the organization's owners, which is
 * never an empty list — `leaveOrganization` refuses to let the last owner go,
 * and `assignOwnerRole` is the only way out of that. So the result is one
 * person in the ordinary case and never nobody, which is the property that
 * matters: a hole in the roster that notifies no one is the bug being fixed.
 */
export async function eventStaffingRecipients(
  organizationId: string,
  createdById: string | null,
): Promise<EmailRecipient[]> {
  if (createdById) {
    const creator = await prisma.membership.findUnique({
      where: {
        userId_organizationId: { userId: createdById, organizationId },
      },
      select: {
        role: true,
        user: { select: { email: true, firstName: true } },
      },
    });

    if (creator && creator.role !== OrgRole.MEMBER) {
      return [creator.user];
    }
  }

  const owners = await prisma.membership.findMany({
    where: { organizationId, role: OrgRole.OWNER },
    select: { user: { select: { email: true, firstName: true } } },
  });

  return owners.map((owner) => owner.user);
}

/**
 * The admins who sent lapsed invitations, when they can still act on them.
 *
 * `EventAssignment.assignedById` is nullable and `SetNull`, so it empties when
 * that account is deleted; the sender may also have left the organization, or
 * been demoted to MEMBER, who cannot staff an event anyway. Any of those means
 * there is nobody to tell, and the caller falls back to
 * `eventStaffingRecipients`.
 *
 * One query for the whole sweep rather than one per row: the pairs come from
 * every organization the tick touched, so they are matched as pairs — a
 * membership in the wrong organization must not resolve a sender.
 *
 * Keyed `organizationId:userId`.
 */
export async function inviteSenderRecipients(
  pairs: { organizationId: string; userId: string }[],
): Promise<Map<string, EmailRecipient>> {
  if (pairs.length === 0) return new Map();

  const rows = await prisma.membership.findMany({
    where: {
      OR: pairs.map(({ organizationId, userId }) => ({
        organizationId,
        userId,
      })),
      role: { not: OrgRole.MEMBER },
    },
    select: {
      userId: true,
      organizationId: true,
      user: { select: { email: true, firstName: true } },
    },
  });

  return new Map(
    rows.map((row) => [`${row.organizationId}:${row.userId}`, row.user]),
  );
}

/**
 * The same escalation as `eventStaffingRecipients`, as user ids.
 *
 * Notifications need who, not where — but the rule for who is responsible for
 * an event's roster must not exist twice, or the bell and the email will
 * eventually disagree about whose problem a hole is. So this mirrors that
 * function exactly: the creator while they can still act on it, and the owners
 * when they cannot.
 */
export async function eventStaffingWatcherIds(
  organizationId: string,
  createdById: string | null,
): Promise<string[]> {
  if (createdById) {
    const creator = await prisma.membership.findUnique({
      where: {
        userId_organizationId: { userId: createdById, organizationId },
      },
      select: { role: true, userId: true },
    });

    if (creator && creator.role !== OrgRole.MEMBER) {
      return [creator.userId];
    }
  }

  const owners = await prisma.membership.findMany({
    where: { organizationId, role: OrgRole.OWNER },
    select: { userId: true },
  });

  return owners.map((owner) => owner.userId);
}
