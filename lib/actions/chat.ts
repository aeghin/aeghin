"use server";

import prisma from "@/lib/prisma";
import {
  sendMessageSchema,
  type SendMessageInput,
} from "@/lib/validations/message";
import {
  getChatAccess,
  getEventMessages,
  toChatMessage,
} from "@/lib/services/chat";
import { publishMessage } from "@/lib/realtime";
import type { ChatMessage } from "@/lib/realtime/types";

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

    return { success: true, message };
  } catch {
    return { success: false, error: "Failed to send message" };
  }
}

type OlderMessagesResult =
  | { success: true; messages: ChatMessage[]; nextCursor: string | null }
  | { success: false; error: string };

/** Client-callable wrapper for scroll-up pagination (gate re-checked). */
export async function fetchOlderMessages(
  eventId: string,
  cursor: string,
): Promise<OlderMessagesResult> {
  // View access is enough — previewing admins page back through history too.
  const ctx = await getChatAccess(eventId);
  if (!ctx) return { success: false, error: "Unauthorized" };

  const { messages, nextCursor } = await getEventMessages(eventId, { cursor });
  return { success: true, messages, nextCursor };
}
