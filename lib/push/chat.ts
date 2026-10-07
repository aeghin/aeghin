import "server-only";

import prisma from "@/lib/prisma";
import { InvitationStatus } from "@/generated/prisma/enums";
import { presentUserIds } from "@/lib/realtime";
import { sendPushNotices } from "@/lib/push/send";

/**
 * How long a phone stays silent about one event's chat after it last rang for
 * it. Every message is still delivered; inside the window it arrives without a
 * sound, so a burst is one ring and the rest stack quietly beneath it.
 */
const CHAT_RING_WINDOW_MS = 60 * 1000;

/**
 * Tells the rest of an event's team about a new chat message.
 *
 * The team is whoever has accepted, which is who can post. Admins previewing
 * the chat aren't pushed, since it isn't their conversation. Also skipped: the
 * author, and anybody looking at the chat right now — both clients hold
 * presence only while the chat is on screen.
 *
 * Everyone else is pushed. Those whose phone hasn't rung inside the window are
 * claimed on `chatPushedAt` first and ring; the rest get it silently. The
 * claim is what stops two messages landing together from both ringing.
 *
 * Posting clears the author's own claim: they're in the conversation now, so
 * the reply to them should ring.
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

    await prisma.eventAssignment.updateMany({
      where: { eventId, userId: authorId, chatPushedAt: { not: null } },
      data: { chatPushedAt: null },
    });

    const team = {
      eventId,
      status: InvitationStatus.ACCEPTED,
      userId: { notIn: [authorId, ...watching] },
    };

    const ringing = await prisma.eventAssignment.updateManyAndReturn({
      where: {
        ...team,
        OR: [
          { chatPushedAt: null },
          { chatPushedAt: { lt: new Date(now.getTime() - CHAT_RING_WINDOW_MS) } },
        ],
      },
      data: { chatPushedAt: now },
      select: { userId: true },
    });

    const recipients = await prisma.eventAssignment.findMany({
      where: team,
      select: {
        userId: true,
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

    if (recipients.length === 0) return;

    const { event } = recipients[0];
    const rings = new Set(ringing.map(({ userId }) => userId));

    await sendPushNotices(
      "chat message",
      recipients.map(({ userId, user }) => ({
        email: user.email,
        title: event.name,
        subtitle: event.organization.name,
        body: `${authorName}: ${body}`,
        data: { type: "chat", organizationId: event.organizationId, eventId },
        quiet: !rings.has(userId),
      })),
    );
  } catch (err) {
    console.error("chat message: push failed", err);
  }
}
