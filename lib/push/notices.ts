import type { PushNotice } from "@/lib/push/send";

/**
 * The push that goes with every "You've been assigned" email — creating an
 * event, inviting into one, re-inviting after a lapse, and smart scheduling's
 * replacement. It opens the Pending list, because a pending invitee can't open
 * the event page yet.
 */
export const assignmentPush = ({
  email,
  eventName,
  eventId,
  organizationName,
  organizationId,
  roleLabel,
  when,
}: {
  email: string;
  eventName: string;
  eventId: string;
  organizationName: string;
  organizationId: string;
  roleLabel: string | null;
  when: string | null;
}): PushNotice => {
  const details = [roleLabel, when].filter(Boolean).join(" · ");

  return {
    email,
    title: `You've been assigned to ${eventName}`,
    subtitle: organizationName,
    body: details
      ? `${details}\nTap to accept or decline.`
      : "Tap to accept or decline.",
    data: { type: "invitation", organizationId, eventId },
  };
};
