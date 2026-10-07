import "server-only";

import { Expo, type ExpoPushMessage } from "expo-server-sdk";

import prisma from "@/lib/prisma";

// Optional: only needed once "Enhanced Security for Push Notifications" is on
// for the project in the Expo dashboard, and then required.
const expo = new Expo({ accessToken: process.env.EXPO_ACCESS_TOKEN });

/**
 * What tapping a notification opens. Mirrors `PushData` in the Expo app
 * (`src/types/push.ts`) — keep the two in sync, and treat it as additive-only:
 * the app decides where each one goes, so a route can move without the server
 * knowing.
 *
 * - `event`: the event page — only for people allowed to open it, a manager or
 *   somebody who has accepted.
 * - `invitation`: the Pending list, where an invitation is answered.
 * - `organization`: the organization's events, for anything with no page left
 *   to open. `tab: "all"` asks for every event rather than the viewer's own —
 *   for a manager told about several at once. Builds that predate it open
 *   the default tab.
 * - `organization-invite`: an invitation to join, which has no organization to
 *   switch to yet.
 * - `chat`: the event's chat — only for people on its team. Builds that predate
 *   it open the organization instead.
 */
export type PushData =
  | { type: "event"; organizationId: string; eventId: string }
  | { type: "invitation"; organizationId: string; eventId: string }
  | { type: "organization"; organizationId: string; tab?: "all" }
  | { type: "organization-invite"; token: string }
  | { type: "chat"; organizationId: string; eventId: string };

/**
 * One notification for one person, addressed by their account email. Where a
 * push goes with an email, it is the address that email goes to, so the two
 * reach exactly the same people; chat and the day-before reminders are push-only.
 */
export type PushNotice = {
  email: string;
  title: string;
  subtitle?: string;
  body: string;
  data: PushData;
  /**
   * Delivered without a sound. Chat only: a follow-up inside a burst, on its
   * own Android channel since a channel, not the message, decides the sound.
   */
  quiet?: boolean;
};

/**
 * Well inside Expo's 4096-byte payload limit even at four bytes a character.
 * A chat message can run to 2000 characters; the chat has the whole thing.
 */
const TITLE_LIMIT = 120;
const BODY_LIMIT = 400;

/** The Android channels the app creates for chat, in `obtainPushToken` (`src/lib/push.ts`). */
const CHAT_CHANNEL = "chat";
const QUIET_CHAT_CHANNEL = "chat-quiet";

/** Cut on characters, not UTF-16 units, so an emoji is never split in half. */
const clip = (text: string, limit: number) => {
  const chars = Array.from(text.trim());

  return chars.length > limit
    ? `${chars.slice(0, limit - 1).join("").trimEnd()}…`
    : chars.join("");
};

/**
 * Sends each notice to every phone its recipient is signed in on.
 *
 * Best effort, like `sendEmailBatches`: the mutation it follows has committed,
 * so nothing here may throw back into it, and a failure is logged rather than
 * swallowed. Someone with no phone registered is simply skipped — they still
 * have the email.
 *
 * A ticket reporting `DeviceNotRegistered` means the app is gone from that
 * phone, and Expo asks senders to stop, so its token is deleted. Every ticket
 * Expo accepted is kept for `checkPushReceipts`, which learns whether it was
 * actually delivered.
 */
export async function sendPushNotices(
  label: string,
  notices: PushNotice[],
): Promise<void> {
  if (notices.length === 0) return;

  try {
    const rows = await prisma.pushToken.findMany({
      where: {
        user: { email: { in: [...new Set(notices.map((notice) => notice.email))] } },
      },
      select: { token: true, user: { select: { email: true } } },
    });

    if (rows.length === 0) return;

    const tokensByEmail = new Map<string, string[]>();

    for (const row of rows) {
      const tokens = tokensByEmail.get(row.user.email) ?? [];
      tokens.push(row.token);
      tokensByEmail.set(row.user.email, tokens);
    }

    const messages = notices.flatMap((notice) =>
      (tokensByEmail.get(notice.email) ?? []).map(
        (token): ExpoPushMessage => ({
          to: token,
          title: clip(notice.title, TITLE_LIMIT),
          subtitle: notice.subtitle,
          body: clip(notice.body, BODY_LIMIT),
          data: notice.data,
          ...(!notice.quiet && { sound: "default" }),
          // Chat has its own Android channel, so it can be silenced without
          // everything else, and one iOS thread per event, so a conversation
          // stacks as one. A build too old to have created the channel shows
          // it in expo-notifications' fallback channel instead.
          ...(notice.data.type === "chat" && {
            channelId: notice.quiet ? QUIET_CHAT_CHANNEL : CHAT_CHANNEL,
            threadId: `chat-${notice.data.eventId}`,
          }),
        }),
      ),
    );

    const gone: string[] = [];
    // Taken by Expo. Whether Apple or Google took them too is a receipt away,
    // read back by `checkPushReceipts`.
    const accepted: { id: string; token: string; label: string }[] = [];

    for (const chunk of expo.chunkPushNotifications(messages)) {
      try {
        // The nth ticket answers the nth message.
        const tickets = await expo.sendPushNotificationsAsync(chunk);

        tickets.forEach((ticket, index) => {
          const token = chunk[index].to as string;

          if (ticket.status === "ok") {
            accepted.push({ id: ticket.id, token, label });
            return;
          }

          if (ticket.details?.error === "DeviceNotRegistered") {
            gone.push(token);
            return;
          }

          console.error(`${label}: push refused`, ticket.details?.error, ticket.message);
        });
      } catch (err) {
        console.error(`${label}: push batch of ${chunk.length} threw`, err);
      }
    }

    if (gone.length > 0) {
      await prisma.pushToken.deleteMany({ where: { token: { in: gone } } });
    }

    if (accepted.length > 0) {
      await prisma.pushReceipt.createMany({ data: accepted, skipDuplicates: true });
    }
  } catch (err) {
    console.error(`${label}: push failed`, err);
  }
}

/** Expo has a receipt ready within about 15 minutes of the send. */
const RECEIPT_READY_MS = 15 * 60 * 1000;

/** And keeps it for a day, so one that isn't back by then never will be. */
const RECEIPT_KEPT_MS = 24 * 60 * 60 * 1000;

/** Receipts read per run. Everything sent is read in time; this bounds one run. */
const RECEIPT_BATCH = 3000;

/**
 * Reads back what Apple and Google made of the pushes Expo accepted.
 *
 * A send's ticket only says Expo took the message. Whatever goes wrong after
 * that — a revoked APNs key, a bad FCM credential, a push Apple throttled —
 * shows up nowhere but the receipt, so without this a broken credential stops
 * every phone on one platform ringing and nothing says so. A phone that has
 * deleted the app is reported here too, and its token goes, as `sendPushNotices`
 * does with a ticket.
 *
 * Run by the hourly cron. Returns how many receipts were read, and how many of
 * those were failures other than a deleted app — the number worth watching.
 */
export async function checkPushReceipts(
  now: Date,
): Promise<{ read: number; failed: number }> {
  const pending = await prisma.pushReceipt.findMany({
    where: { createdAt: { lte: new Date(now.getTime() - RECEIPT_READY_MS) } },
    orderBy: { createdAt: "asc" },
    take: RECEIPT_BATCH,
    select: { id: true, token: true, label: true },
  });

  const byId = new Map(pending.map((row) => [row.id, row]));
  const read: string[] = [];
  const gone: string[] = [];
  let failed = 0;

  for (const ids of expo.chunkPushNotificationReceiptIds([...byId.keys()])) {
    try {
      const receipts = await expo.getPushNotificationReceiptsAsync(ids);

      for (const [id, receipt] of Object.entries(receipts)) {
        const row = byId.get(id);

        if (!row) continue;

        read.push(id);

        if (receipt.status === "ok") continue;

        if (receipt.details?.error === "DeviceNotRegistered") {
          gone.push(row.token);
          continue;
        }

        failed += 1;
        console.error(
          `${row.label}: push not delivered`,
          receipt.details?.error,
          receipt.message,
        );
      }
    } catch (err) {
      // Left for the next run: a receipt stays readable for a day.
      console.error(`push receipts: batch of ${ids.length} threw`, err);
    }
  }

  // Read, or old enough that Expo has let it go.
  await prisma.pushReceipt.deleteMany({
    where: {
      OR: [
        { id: { in: read } },
        { createdAt: { lt: new Date(now.getTime() - RECEIPT_KEPT_MS) } },
      ],
    },
  });

  if (gone.length > 0) {
    await prisma.pushToken.deleteMany({ where: { token: { in: gone } } });
  }

  return { read: read.length, failed };
}
