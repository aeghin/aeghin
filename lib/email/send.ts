import "server-only";

import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_EMAIL_API_KEY);

/** One message, as `resend.batch.send` spells it. */
type BatchEmail = Parameters<typeof resend.batch.send>[0][number];

/** Resend carries at most this many messages in a single batch request. */
const BATCH_LIMIT = 100;

/**
 * Sends one email per recipient, in as few requests as possible.
 *
 * Resend allows 10 requests a second per team, and `batch.send` carries 100
 * messages in one request — so a roster is chunked rather than fanned out.
 * Sent one request per person, a 21-volunteer event spends most of them on
 * 429s, and the `Promise.allSettled` this replaces swallowed every one of
 * those rejections: the volunteers who never heard left no trace anywhere.
 *
 * Still best effort — the mutation this follows has already committed, so a
 * failure must not surface as an error to the caller. It is logged, though.
 * Silence was the bug.
 */
export async function sendEmailBatches(
  label: string,
  emails: BatchEmail[],
): Promise<void> {
  for (let index = 0; index < emails.length; index += BATCH_LIMIT) {
    const chunk = emails.slice(index, index + BATCH_LIMIT);

    try {
      const { error } = await resend.batch.send(chunk);

      if (error) {
        console.error(`${label}: batch of ${chunk.length} failed`, error);
      }
    } catch (err) {
      console.error(`${label}: batch of ${chunk.length} threw`, err);
    }
  }
}
