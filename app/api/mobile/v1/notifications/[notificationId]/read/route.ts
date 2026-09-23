import { markNotificationRead } from "@/lib/actions/notification";
import {
    actionFailure,
    clerkIdOf,
    expireTag,
    fail,
    json,
    route,
} from "@/lib/mobile/route";

type Params = { notificationId: string };

/**
 * POST /api/mobile/v1/notifications/[notificationId]/read
 *
 * Marks one row read, as tapping it on the dashboard does. The action scopes
 * the write to the caller, so somebody else's id is a no-op rather than a 404 —
 * which also makes a row that resolved before the tap landed harmless.
 */
export const POST = route<Params>("POST /notifications/[id]/read", async (_req, { params }) => {
    const clerkId = await clerkIdOf();

    if (!clerkId) return fail(401, "Unauthorized");

    const { notificationId } = await params;

    const result = await markNotificationRead(notificationId, expireTag);

    if (!result.success) return actionFailure(result.error);

    return json({ success: true });
});
