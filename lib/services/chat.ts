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
