import { deleteServiceType, editServiceType } from "@/lib/actions/service-type";
import { serviceTypeSchema } from "@/lib/validations/service-types";
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

type Params = { orgId: string; serviceTypeId: string };

/**
 * PATCH /api/mobile/v1/organizations/[orgId]/service-types/[serviceTypeId]
 *
 * Renames or recolours one: `{ name, color }`. Owners and admins only.
 */
export const PATCH = route<Params>("PATCH .../service-types/[id]", async (req, { params }) => {
    const clerkId = await clerkIdOf();

    if (!clerkId) return fail(401, "Unauthorized");

    const { orgId, serviceTypeId } = await params;

    const membership = await membershipFor(clerkId, orgId);

    if (!membership) return fail(404, "Not Found");

    const body = await readJson(req);

    if (!isObject(body)) return fail(400, "Expected a service type.");

    const parsed = serviceTypeSchema.safeParse(body);

    if (!parsed.success) {
        return fail(400, parsed.error.issues[0]?.message ?? "Invalid service type.");
    }

    const result = await editServiceType(
        { ...parsed.data, organizationId: orgId, serviceTypeId },
        expireTag,
    );

    if (!result.success) return actionFailure(result.error);

    return json({ success: true });
});

/**
 * DELETE /api/mobile/v1/organizations/[orgId]/service-types/[serviceTypeId]
 *
 * Soft-deletes one. Events already using it keep their rows.
 */
export const DELETE = route<Params>("DELETE .../service-types/[id]", async (_req, { params }) => {
    const clerkId = await clerkIdOf();

    if (!clerkId) return fail(401, "Unauthorized");

    const { orgId, serviceTypeId } = await params;

    const membership = await membershipFor(clerkId, orgId);

    if (!membership) return fail(404, "Not Found");

    const result = await deleteServiceType(orgId, serviceTypeId, expireTag);

    if (!result.success) return actionFailure(result.error);

    return json({ success: true });
});
