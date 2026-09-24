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
 *   to open.
 * - `organization-invite`: an invitation to join, which has no organization to
 *   switch to yet.
 */
export type PushData =
  | { type: "event"; organizationId: string; eventId: string }
  | { type: "invitation"; organizationId: string; eventId: string }
  | { type: "organization"; organizationId: string }
  | { type: "organization-invite"; token: string };

/**
 * One notification for one person, addressed by the same email the matching
 * email goes to — so every push reaches exactly the people that mail does.
 */
export type PushNotice = {
  email: string;
  title: string;
  subtitle?: string;
  body: string;
  data: PushData;
};

/**
 * Well inside Expo's 4096-byte payload limit even at four bytes a character.
 * Team and organization messages can run to 5000 characters; the email carries
 * the whole thing.
 */
const TITLE_LIMIT = 120;
const BODY_LIMIT = 400;

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
 * phone, and Expo asks senders to stop, so its token is deleted.
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
          sound: "default",
        }),
      ),
    );

    const gone: string[] = [];

    for (const chunk of expo.chunkPushNotifications(messages)) {
      try {
        // The nth ticket answers the nth message.
        const tickets = await expo.sendPushNotificationsAsync(chunk);

        tickets.forEach((ticket, index) => {
          if (ticket.status === "ok") return;

          if (ticket.details?.error === "DeviceNotRegistered") {
            gone.push(chunk[index].to as string);
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
  } catch (err) {
    console.error(`${label}: push failed`, err);
  }
}
