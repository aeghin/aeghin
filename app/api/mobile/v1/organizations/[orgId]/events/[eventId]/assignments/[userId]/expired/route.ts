import { deleteExpiredEventAssignment } from "@/lib/actions/event";
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
 * DELETE /api/mobile/v1/organizations/[orgId]/events/[eventId]/assignments/[userId]/expired
 *
 * Clears a lapsed invitation off the roster for good, so the role reads as
 * needing someone again.
 *
 * Its own route because `DELETE .../assignments/[userId]` already means
 * "take this volunteer off the event", which keeps the row and marks it
 * CANCELED — a visible dead row, which is the state this one removes. Two
 * different operations, so they don't share a verb.
 *
 * The action refuses anything that hasn't lapsed, which is what stops this
 * being a quiet way to drop a volunteer who accepted: that still goes through
 * DELETE on the parent route, which emails them.
 */
export const DELETE = route<Params>("DELETE .../assignments/[userId]/expired", async (_req, { params }) => {
    const clerkId = await clerkIdOf();

    if (!clerkId) return fail(401, "Unauthorized");

    const { orgId, eventId, userId } = await params;

    const membership = await membershipFor(clerkId, orgId);

    if (!membership) return fail(404, "Not Found");

    const result = await deleteExpiredEventAssignment(orgId, eventId, userId, expireTag);

    if (!result.success) return actionFailure(result.error);

    return json({ success: true });
});
