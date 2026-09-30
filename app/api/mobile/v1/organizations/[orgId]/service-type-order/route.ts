import { setServiceTypeOrder } from "@/lib/actions/service-type";
import {
    actionFailure,
    clerkIdOf,
    expireTag,
    fail,
    isObject,
    json,
    membershipFor,
    readJson,
    route,
} from "@/lib/mobile/route";

type Params = { orgId: string };

/**
 * PUT /api/mobile/v1/organizations/[orgId]/service-type-order
 *
 * Saves the caller's own order for the service-type pills on Events:
 * `{ serviceTypeIds }`, first to last. Any member may; it is theirs alone, and
 * comes back on `GET /organizations` as `serviceTypeOrder`.
 */
export const PUT = route<Params>("PUT .../service-type-order", async (req, { params }) => {
    const clerkId = await clerkIdOf();

    if (!clerkId) return fail(401, "Unauthorized");

    const { orgId } = await params;

    const membership = await membershipFor(clerkId, orgId);

    if (!membership) return fail(404, "Not Found");

    const body = await readJson(req);

    if (!isObject(body) || !Array.isArray(body.serviceTypeIds)) {
        return fail(400, "Expected serviceTypeIds.");
    }

    const result = await setServiceTypeOrder(orgId, body.serviceTypeIds, expireTag);

    if (!result.success) return actionFailure(result.error);

    return json({ success: true });
});
