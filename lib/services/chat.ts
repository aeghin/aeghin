import "server-only";

import prisma from "@/lib/prisma";
import { InvitationStatus, OrgRole } from "@/generated/prisma/enums";
import { currentUser } from "@/lib/services/user";
import type { ChatMessage } from "@/lib/realtime/types";

const authorSelect = {
  id: true,
  firstName: true,
  lastName: true,
  userImageUrl: true,
} as const;

export function toChatMessage(m: {
  id: string;
  body: string;
  createdAt: Date;
  author: {
    id: string;
    firstName: string;
    lastName: string;
    userImageUrl: string | null;
  };
}): ChatMessage {
  return {
    id: m.id,
    body: m.body,
    createdAt: m.createdAt.toISOString(),
    author: m.author,
  };
}

/**
 * The single shared authorization gate. Returns the local user + the event's
 * organization when the user may SEE the chat: an ACCEPTED assignment, or an
 * org ADMIN/OWNER previewing it. `canPost` is the narrower right — only accepted
 * assignees write. Intentionally NOT cached — authorization must reflect live
 * status, so a CANCELED/DECLINED user is locked out immediately.
 */
export async function getChatAccess(eventId: string) {
  const user = await currentUser();
  if (!user) return null;

  return getChatAccessForUser(user, eventId);
}

/** The user fields the chat reads — a `User` row, or the part of one that matters. */
export type ChatUser = {
  id: string;
  firstName: string;
  lastName: string;
  userImageUrl: string | null;
};

/**
 * The same gate for a caller already resolved to a `User` row. The mobile
 * routes use this: `currentUser()` redirects to the sign-in page when there is
 * no session, which a JSON client cannot follow.
 */
export async function getChatAccessForUser<U extends ChatUser>(
  user: U,
  eventId: string,
) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: {
      organizationId: true,
      assignments: {
        where: { userId: user.id, status: InvitationStatus.ACCEPTED },
        select: { id: true },
      },
      organization: {
        select: {
          memberships: {
            where: { userId: user.id },
            select: { role: true },
          },
        },
      },
    },
  });

  if (!event) return null;

  const canPost = event.assignments.length > 0;
  const role = event.organization.memberships[0]?.role;
  const canManage = role === OrgRole.ADMIN || role === OrgRole.OWNER;

  if (!canPost && !canManage) return null;

  return { user, organizationId: event.organizationId, canPost };
}

/**
 * Paginated history read (cursor on id, newest-first). NOT cached: realtime
 * freshness is the transport's job; caching live messages would only thrash.
 */
export async function getEventMessages(
  eventId: string,
  opts?: { cursor?: string; take?: number },
): Promise<{ messages: ChatMessage[]; nextCursor: string | null }> {
  const take = opts?.take ?? 30;

  const rows = await prisma.message.findMany({
    where: { eventId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: take + 1,
    ...(opts?.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    include: { author: { select: authorSelect } },
  });

  const hasMore = rows.length > take;
  const page = hasMore ? rows.slice(0, take) : rows;
  const nextCursor = hasMore ? page[page.length - 1].id : null;

  return { messages: page.map(toChatMessage), nextCursor };
}

/**
 * Messages from somebody else since the user last had the chat on screen, or
 * every one of them if they never have. The badge on the phone's event screen.
 */
export async function getUnreadCount(userId: string, eventId: string) {
  const read = await prisma.chatRead.findUnique({
    where: { userId_eventId: { userId, eventId } },
    select: { readAt: true },
  });

  return prisma.message.count({
    where: {
      eventId,
      authorId: { not: userId },
      ...(read ? { createdAt: { gt: read.readAt } } : {}),
    },
  });
}

/**
 * Marks the chat read up to its newest message. One statement, so the phone
 * and a dashboard tab marking at once can't race, and `GREATEST` keeps a
 * slower write from un-reading what a faster one saw. A chat with no messages
 * has nothing to mark.
 */
export async function recordChatRead(userId: string, eventId: string) {
  await prisma.$executeRaw`
    INSERT INTO "ChatRead" ("userId", "eventId", "readAt")
    SELECT ${userId}::text, ${eventId}::text, MAX("createdAt")
    FROM "Message"
    WHERE "eventId" = ${eventId}
    HAVING MAX("createdAt") IS NOT NULL
    ON CONFLICT ("userId", "eventId")
    DO UPDATE SET "readAt" = GREATEST("ChatRead"."readAt", EXCLUDED."readAt")`;
}
