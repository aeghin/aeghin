import { cancelUserEventAssignment } from "@/lib/actions/event";
import {
    actionFailure,
    clerkIdOf,
    expireTag,
    fail,
    json,
    membershipFor,
    route,
} from "@/lib/mobile/route";

type Params = { orgId: string; eventId: string; userId: string };

/**
 * DELETE /api/mobile/v1/organizations/[orgId]/events/[eventId]/assignments/[userId]
 *
 * Takes one volunteer off the event. The row stays, marked CANCELED, so the
 * roster still shows who was asked — the same as the dashboard's row menu.
 */
export const DELETE = route<Params>("DELETE .../assignments/[userId]", async (_req, { params }) => {
    const clerkId = await clerkIdOf();

    if (!clerkId) return fail(401, "Unauthorized");

    const { orgId, eventId, userId } = await params;

    const membership = await membershipFor(clerkId, orgId);

    if (!membership) return fail(404, "Not Found");

    const result = await cancelUserEventAssignment(userId, orgId, eventId, expireTag);

    if (!result.success) return actionFailure(result.error);

    return json({ success: true });
});
