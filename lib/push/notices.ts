import type { PushNotice } from "@/lib/push/send";
import { shortDeadline } from "@/lib/push/timing";

/**
 * When a Smart Scheduling pick's answer is due, as the invitation email's
 * `answerBy` decides it. A deadline is never cut short for the event, so an
 * event inside the window comes first.
 */
const answerBy = ({
  expiresAt,
  startsAt,
  timeZone,
}: {
  expiresAt: Date;
  startsAt: Date | null;
  timeZone: string;
}) =>
  startsAt && startsAt.getTime() > Date.now() && startsAt < expiresAt
    ? "Please answer before it starts."
    : `Please answer by ${shortDeadline(expiresAt, timeZone)}.`;

/**
 * The push that goes with every event invitation email — creating an event,
 * inviting into one, re-inviting after a lapse, and smart scheduling's
 * replacement. Worded like the email: who sent it, or no one for a Smart
 * Scheduling pick. It opens the Pending list, because a pending invitee can't
 * open the event page yet.
 */
export const assignmentPush = ({
  email,
  eventName,
  eventId,
  organizationName,
  organizationId,
  roleLabel,
  when,
  kind,
  invitedByName,
  deadline,
}: {
  email: string;
  eventName: string;
  eventId: string;
  organizationName: string;
  organizationId: string;
  roleLabel: string | null;
  when: string | null;
  /** As on `EventAssignmentEmail`: a first invitation, a resend, or a Smart Scheduling pick. */
  kind: "invite" | "resend" | "replacement";
  /** Full name of whoever sent it. Null once they're gone from the organization. */
  invitedByName: string | null;
  /**
   * A Smart Scheduling pick's answer window, on the clock it's read on. Its
   * deadline is whatever was left of the declined invitation's, often too
   * short for a reminder, so this push says when the answer is due.
   */
  deadline?: { expiresAt: Date; startsAt: Date | null; timeZone: string };
}): PushNotice => {
  const details = [roleLabel, when].filter(Boolean).join(" · ");

  // The title asks, and tapping is how it's answered, so the message doesn't
  // say "Tap to accept or decline" unless there's nothing else to say.
  const who = !invitedByName
    ? null
    : kind === "resend"
      ? `${invitedByName} sent it again.`
      : `${invitedByName} invited you.`;

  // A pick is told it's needed, not that a spot is free: "a spot opened up"
  // read as something to take or leave.
  const ask =
    kind === "replacement"
      ? `You're needed to fill in.${deadline ? ` ${answerBy(deadline)}` : ""}`
      : who;

  return {
    email,
    title: `Can you serve at ${eventName}?`,
    subtitle: organizationName,
    body: [details, ask].filter(Boolean).join("\n") || "Tap to accept or decline.",
    data: { type: "invitation", organizationId, eventId },
  };
};
