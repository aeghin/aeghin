import type { PushNotice } from "@/lib/push/send";

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
}): PushNotice => {
  const details = [roleLabel, when].filter(Boolean).join(" · ");

  const who =
    kind === "replacement"
      ? "A spot opened up. "
      : !invitedByName
        ? ""
        : kind === "resend"
          ? `${invitedByName} sent it again. `
          : `${invitedByName} invited you. `;

  const ask = `${who}Tap to accept or decline.`;

  return {
    email,
    title: `You're invited to serve: ${eventName}`,
    subtitle: organizationName,
    body: details ? `${details}\n${ask}` : ask,
    data: { type: "invitation", organizationId, eventId },
  };
};
