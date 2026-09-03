import { leaveOrganization } from "@/lib/actions/roles";
import {
    actionFailure,
    clerkIdOf,
    expireTag,
    fail,
    json,
    membershipFor,
    route,
} from "@/lib/mobile/route";

type Params = { orgId: string };

/**
 * POST /api/mobile/v1/organizations/[orgId]/leave
 *
 * The caller leaves the organization. The action refuses the last owner and
 * clears the caller's upcoming assignments and blockouts on the way out.
 */
export const POST = route<Params>("POST .../leave", async (_req, { params }) => {
    const clerkId = await clerkIdOf();

    if (!clerkId) return fail(401, "Unauthorized");

    const { orgId } = await params;

    const membership = await membershipFor(clerkId, orgId);

    if (!membership) return fail(404, "Not Found");

    const result = await leaveOrganization(orgId, expireTag);

    if (!result.success) return actionFailure(result.error);

    return json({ success: true });
});
