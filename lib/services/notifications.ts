import "server-only";

import prisma from "@/lib/prisma";
import { cacheLife, cacheTag } from "next/cache";
import { InvitationStatus } from "@/generated/prisma/enums";
import type { InvitationNotice, NotificationFeed } from "@/lib/types";

/** The bell is a glance, not an inbox — anything past this belongs in the app. */
const FEED_LIMIT = 15;

/**
 * Every organization's notifications for one person, newest first.
 *
 * Not scoped to an organization, because the bell lives in the global navbar
 * and someone serving two churches wants one place to look. The row carries its
 * organization's name so the list stays readable when it spans both.
 *
 * Cached against `user-<id>-notifications`, the tag `syncEventNotifications`
 * expires for exactly the people whose rows it moved.
 */
export const getUserNotifications = async (
  userId: string,
): Promise<NotificationFeed> => {
  "use cache";

  cacheLife("minutes");
  cacheTag(`user-${userId}-notifications`);

  const [rows, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { userId },
      // Unread first, then most recently moved. Postgres sorts NULLs first on
      // DESC, which would bury the unread ones under everything already read.
      orderBy: [
        { unreadAt: { sort: "desc", nulls: "last" } },
        { updatedAt: "desc" },
      ],
      take: FEED_LIMIT,
      select: {
        id: true,
        category: true,
        count: true,
        unreadAt: true,
        updatedAt: true,
        eventId: true,
        organizationId: true,
        event: { select: { name: true } },
        organization: { select: { name: true } },
      },
    }),
    // Counted rather than derived from the page above, so the badge stays true
    // for someone sitting on more unread rows than the bell shows.
    prisma.notification.count({ where: { userId, unreadAt: { not: null } } }),
  ]);

  return {
    items: rows.map((row) => ({
      id: row.id,
      category: row.category,
      count: row.count,
      unread: row.unreadAt !== null,
      eventId: row.eventId,
      eventName: row.event.name,
      organizationId: row.organizationId,
      organizationName: row.organization.name,
      updatedAt: row.updatedAt,
    })),
    unreadCount,
  };
};


/**
 * The organization invitations waiting on this address, for the top of the
 * bell: pending and not yet lapsed, newest first.
 *
 * Read fresh rather than cached. An invitation leaves the bell when it is
 * answered, withdrawn or lapses, and only the read itself is sure to know.
 * Matched case-insensitively, as the invite and its answer are: rows written
 * before the schema lowercased emails are still out there.
 */
export const getInvitationNotices = async (email: string): Promise<InvitationNotice[]> => {
  const rows = await prisma.invitation.findMany({
    where: {
      email: { equals: email, mode: "insensitive" },
      status: InvitationStatus.PENDING,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      token: true,
      seenAt: true,
      createdAt: true,
      invitedBy: { select: { firstName: true, lastName: true } },
      organization: { select: { name: true } },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    token: row.token,
    organizationName: row.organization.name,
    invitedByName: `${row.invitedBy.firstName} ${row.invitedBy.lastName}`.trim(),
    unread: row.seenAt === null,
    createdAt: row.createdAt,
  }));
};
