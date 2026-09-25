import "server-only";

import prisma from "@/lib/prisma";
import { InvitationStatus } from "@/generated/prisma/enums";
import { presentUserIds } from "@/lib/realtime";
import { sendPushNotices } from "@/lib/push/send";

/**
 * How long a phone stays quiet about one event's chat after it last rang for
 * it. A burst of messages is one notification: the first rings, and the rest
 * are waiting in the chat when it's opened.
 */
const CHAT_PUSH_WINDOW_MS = 10 * 60 * 1000;

/**
 * Tells the rest of an event's team about a new chat message.
 *
 * The team is whoever has accepted, which is who can post. Admins previewing
 * the chat aren't pushed, since it isn't their conversation. Also skipped: the
 * author, anybody with the chat open on the web right now (the app hides its
 * own banner while that chat is on screen), and anybody this chat already rang
 * inside the window.
 *
 * Recipients are claimed on `chatPushedAt` before anything is sent, so two
 * messages landing together can't both ring the same phone.
 *
 * Best effort, like `sendPushNotices`: the message is saved and already out
 * over the realtime channel, so nothing here may throw back into the send.
 */
export async function pushChatMessage({
  eventId,
  authorId,
  authorName,
  body,
}: {
  eventId: string;
  authorId: string;
  authorName: string;
  body: string;
}): Promise<void> {
  try {
    // Fails open: if presence can't be read, nobody is skipped for it.
    const watching = await presentUserIds(eventId).catch(() => []);
    const now = new Date();

    const claimed = await prisma.eventAssignment.updateManyAndReturn({
      where: {
        eventId,
        status: InvitationStatus.ACCEPTED,
        userId: { notIn: [authorId, ...watching] },
        OR: [
          { chatPushedAt: null },
          { chatPushedAt: { lt: new Date(now.getTime() - CHAT_PUSH_WINDOW_MS) } },
        ],
      },
      data: { chatPushedAt: now },
      select: {
        user: { select: { email: true } },
        event: {
          select: {
            name: true,
            organizationId: true,
            organization: { select: { name: true } },
          },
        },
      },
    });

    if (claimed.length === 0) return;

    const { event } = claimed[0];

    await sendPushNotices(
      "chat message",
      claimed.map(({ user }) => ({
        email: user.email,
        title: event.name,
        subtitle: event.organization.name,
        body: `${authorName}: ${body}`,
        data: { type: "chat", organizationId: event.organizationId, eventId },
      })),
    );
  } catch (err) {
    console.error("chat message: push failed", err);
  }
}
