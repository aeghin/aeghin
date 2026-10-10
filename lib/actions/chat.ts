"use server";

import { after } from "next/server";

import prisma from "@/lib/prisma";
import {
  sendMessageSchema,
  type SendMessageInput,
} from "@/lib/validations/message";
import {
  getChatAccess,
  getEventMessages,
  recordChatRead,
  toChatMessage,
} from "@/lib/services/chat";
import { publishMessage } from "@/lib/realtime";
import type { ChatMessage } from "@/lib/realtime/types";
import { pushChatMessage } from "@/lib/push/chat";

type SendMessageResult =
  | { success: true; message: ChatMessage }
  | { success: false; error: string };

export async function sendMessage(
  eventId: string,
  input: SendMessageInput,
): Promise<SendMessageResult> {
  try {
    const ctx = await getChatAccess(eventId);
    if (!ctx || !ctx.canPost) return { success: false, error: "Unauthorized" };

    const parsed = sendMessageSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.message };

    const created = await prisma.message.create({
      data: {
        eventId,
        authorId: ctx.user.id,
        organizationId: ctx.organizationId,
        body: parsed.data.body,
      },
      include: {
        author: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            userImageUrl: true,
          },
        },
      },
    });

    const message = toChatMessage(created);

    // Neon is the source of truth; the transport is only fan-out.
    await publishMessage(eventId, message);

    // After the response: the sender's message shouldn't wait on Expo.
    after(() =>
      pushChatMessage({
        eventId,
        authorId: ctx.user.id,
        authorName: `${ctx.user.firstName} ${ctx.user.lastName}`,
        body: message.body,
      }),
    );

    return { success: true, message };
  } catch {
    return { success: false, error: "Failed to send message" };
  }
}

type MessagesPageResult =
  | { success: true; messages: ChatMessage[]; nextCursor: string | null }
  | { success: false; error: string };

/** Client-callable wrapper for scroll-up pagination (gate re-checked). */
export async function fetchOlderMessages(
  eventId: string,
  cursor: string,
): Promise<MessagesPageResult> {
  // View access is enough — previewing admins page back through history too.
  const ctx = await getChatAccess(eventId);
  if (!ctx) return { success: false, error: "Unauthorized" };

  const { messages, nextCursor } = await getEventMessages(eventId, { cursor });
  return { success: true, messages, nextCursor };
}

/**
 * The newest page, for a chat catching up after its page was hidden and its
 * subscription torn down (gate re-checked). Read-only, so it never revalidates.
 */
export async function fetchLatestMessages(
  eventId: string,
): Promise<MessagesPageResult> {
  const ctx = await getChatAccess(eventId);
  if (!ctx) return { success: false, error: "Unauthorized" };

  const { messages, nextCursor } = await getEventMessages(eventId);
  return { success: true, messages, nextCursor };
}

/**
 * The chat panel is on screen, so everything in it so far is read. The same
 * mark the phone's chat screen makes, which is what lets reading here clear
 * the badge on the phone.
 */
export async function markChatRead(eventId: string): Promise<void> {
  const ctx = await getChatAccess(eventId);
  if (!ctx) return;

  await recordChatRead(ctx.user.id, eventId);
}
