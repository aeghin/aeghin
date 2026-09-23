import prisma from "@/lib/prisma";
import type { NotificationCategory } from "@/generated/prisma/enums";
import { getUserNotifications } from "@/lib/services/notifications";
import { clerkIdOf, fail, json, route } from "@/lib/mobile/route";

/**
 * Wire contract for one bell row. Mirrors `NotificationItem` in the Expo app
 * (`src/types/notification.ts`) — keep the two in sync, and treat it as
 * additive-only.
 */
type NotificationItem = {
    id: string;
    category: NotificationCategory;
    count: number;
    unread: boolean;
    eventId: string;
    eventName: string;
    organizationId: string;
    organizationName: string;
    updatedAt: string;
};

/**
 * GET /api/mobile/v1/notifications
 *
 * The caller's bell: every organization's rows, unread first, plus the unread
 * count for the badge. The same cached read the dashboard navbar renders, so
 * the ordering, the cap and the count cannot drift between the two.
 *
 * Not scoped to an organization, for the reason the web bell isn't: someone
 * serving two churches gets one place to look, and the phone switches to the
 * row's organization when it is tapped.
 */
export const GET = route<Record<string, never>>("GET /notifications", async () => {
    const clerkId = await clerkIdOf();

    if (!clerkId) return fail(401, "Unauthorized");

    const user = await prisma.user.findUnique({
        where: { clerkId },
        select: { id: true },
    });

    if (!user) return fail(401, "Unauthorized");

    const feed = await getUserNotifications(user.id);

    const items: NotificationItem[] = feed.items.map((item) => ({
        ...item,
        updatedAt: item.updatedAt.toISOString(),
    }));

    return json({ items, unreadCount: feed.unreadCount });
});
