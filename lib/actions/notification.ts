"use server";

import { updateTag } from "next/cache";

import prisma from "@/lib/prisma";
import { InvitationStatus } from "@/generated/prisma/enums";
import { currentUser } from "@/lib/services/user";

type ActionResponse = { success: true } | { success: false; error: string };

/**
 * How a caller expires cache tags. `updateTag` throws inside a Route Handler,
 * so the mobile routes pass `revalidateTag` in its place.
 */
type TagInvalidator = (tag: string) => void;

/**
 * Clears the badge without touching the rows' meaning.
 *
 * Read state is the only thing a person can change about a notification here —
 * the row itself is owned by `syncEventNotifications` and goes away when the
 * roster is fixed, not when it is acknowledged. So "mark read" quiets the bell
 * and leaves the work visible, which is the right of the two.
 */
export const markAllNotificationsRead = async (
  touch: TagInvalidator = updateTag,
): Promise<ActionResponse> => {
  try {
    const user = await currentUser();

    if (!user) return { success: false, error: "Unauthorized" };

    await prisma.notification.updateMany({
      where: { userId: user.id, unreadAt: { not: null } },
      data: { unreadAt: null },
    });

    // The organization invitations in the bell too. They stay listed until
    // answered, like the rows above.
    await prisma.invitation.updateMany({
      where: {
        email: { equals: user.email, mode: "insensitive" },
        status: InvitationStatus.PENDING,
        seenAt: null,
      },
      data: { seenAt: new Date() },
    });

    touch(`user-${user.id}-notifications`);

    return { success: true };
  } catch {
    return { success: false, error: "Unable to update notifications" };
  }
};

export const markNotificationRead = async (
  notificationId: string,
  touch: TagInvalidator = updateTag,
): Promise<ActionResponse> => {
  try {
    const user = await currentUser();

    if (!user) return { success: false, error: "Unauthorized" };

    // Scoped by userId, not just id: a server action is a public endpoint, and
    // the id alone would let anyone clear anyone's bell.
    await prisma.notification.updateMany({
      where: { id: notificationId, userId: user.id },
      data: { unreadAt: null },
    });

    // Or it's an organization invitation in the bell, scoped by the address it
    // was sent to for the same reason.
    await prisma.invitation.updateMany({
      where: {
        id: notificationId,
        email: { equals: user.email, mode: "insensitive" },
        seenAt: null,
      },
      data: { seenAt: new Date() },
    });

    touch(`user-${user.id}-notifications`);

    return { success: true };
  } catch {
    return { success: false, error: "Unable to update notification" };
  }
};
