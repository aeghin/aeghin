import { deleteBlockoutDate } from "@/lib/actions/blockout";
import {
    actionFailure,
    clerkIdOf,
    expireTag,
    fail,
    json,
    membershipFor,
    route,
} from "@/lib/mobile/route";

type Params = { orgId: string; blockoutId: string };

/**
 * DELETE /api/mobile/v1/organizations/[orgId]/blockouts/[blockoutId]
 *
 * Removes one of the caller's own blockouts. The action scopes the delete to
 * the caller, so somebody else's id reads as missing.
 */
export const DELETE = route<Params>("DELETE .../blockouts/[id]", async (_req, { params }) => {
    const clerkId = await clerkIdOf();

    if (!clerkId) return fail(401, "Unauthorized");

    const { orgId, blockoutId } = await params;

    const membership = await membershipFor(clerkId, orgId);

    if (!membership) return fail(404, "Not Found");

    const result = await deleteBlockoutDate(blockoutId, orgId, expireTag);

    if (!result.success) return actionFailure(result.error);

    return json({ success: true });
});
