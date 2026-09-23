import { markAllNotificationsRead } from "@/lib/actions/notification";
import {
    actionFailure,
    clerkIdOf,
    expireTag,
    fail,
    json,
    route,
} from "@/lib/mobile/route";

/**
 * POST /api/mobile/v1/notifications/read
 *
 * "Mark all read". Clears the badge and leaves every row in place — a row goes
 * when the roster is fixed, not when it is seen.
 *
 * The token is checked here rather than left to the action: the action reaches
 * for the caller through `currentUser`, which redirects when nobody is there.
 */
export const POST = route<Record<string, never>>("POST /notifications/read", async () => {
    const clerkId = await clerkIdOf();

    if (!clerkId) return fail(401, "Unauthorized");

    const result = await markAllNotificationsRead(expireTag);

    if (!result.success) return actionFailure(result.error);

    return json({ success: true });
});
