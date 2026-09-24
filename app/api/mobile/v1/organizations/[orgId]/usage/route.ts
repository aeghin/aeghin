import { getPlanUsage } from "@/lib/billing/limits";
import { canManage, clerkIdOf, fail, json, membershipFor, route } from "@/lib/mobile/route";

type Params = { orgId: string };

/**
 * GET /api/mobile/v1/organizations/[orgId]/usage
 *
 * The phone's Plan screen: the organization's use of its plan, the same
 * `PlanUsage` the dashboard's Plan & usage section draws. Owners and admins
 * only, as there — they're the ones who invite, add songs and upload.
 */
export const GET = route<Params>("GET .../usage", async (_req, { params }) => {
    const clerkId = await clerkIdOf();

    if (!clerkId) return fail(401, "Unauthorized");

    const { orgId } = await params;

    const membership = await membershipFor(clerkId, orgId);

    if (!membership) return fail(404, "Not Found");

    if (!canManage(membership.role)) return fail(403, "Forbidden");

    return json(await getPlanUsage(orgId));
});
