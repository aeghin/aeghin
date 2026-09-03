import {
    assignOwnerRole,
    removeMember,
    updateUserRole,
    updateVolunteerRoles,
} from "@/lib/actions/roles";
import { OrgRole, VolunteerRole } from "@/generated/prisma/enums";
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

type Params = { orgId: string; userId: string };

const isOrgRole = (value: unknown): value is OrgRole =>
    typeof value === "string" && value in OrgRole;

const isVolunteerRole = (value: unknown): value is VolunteerRole =>
    typeof value === "string" && value in VolunteerRole;

/**
 * PATCH /api/mobile/v1/organizations/[orgId]/members/[userId]
 *
 * One change to one member, as the dashboard's row menu offers them:
 *
 * - `{ role: "ADMIN" | "MEMBER" }` promotes or demotes (owners and admins,
 *   with an admin limited to members).
 * - `{ role: "OWNER" }` grants ownership — owners only.
 * - `{ toggleVolunteerRole: VolunteerRole }` adds the role if the member
 *   lacks it and removes it otherwise.
 *
 * Every rule is the action's; this only picks which one to call.
 */
export const PATCH = route<Params>("PATCH .../members/[userId]", async (req, { params }) => {
    const clerkId = await clerkIdOf();

    if (!clerkId) return fail(401, "Unauthorized");

    const { orgId, userId } = await params;

    const membership = await membershipFor(clerkId, orgId);

    if (!membership) return fail(404, "Not Found");

    const body = await readJson(req);

    if (!isObject(body)) return fail(400, "Expected a change.");

    if (isVolunteerRole(body.toggleVolunteerRole)) {
        const result = await updateVolunteerRoles(
            userId,
            orgId,
            body.toggleVolunteerRole,
            expireTag,
        );
        if (!result.success) return actionFailure(result.error);
        return json({ success: true });
    }

    if (isOrgRole(body.role)) {
        const result =
            body.role === OrgRole.OWNER
                ? await assignOwnerRole({ organizationId: orgId, userId }, expireTag)
                : await updateUserRole(
                    { organizationId: orgId, userId, role: body.role },
                    expireTag,
                );
        if (!result.success) return actionFailure(result.error);
        return json({ success: true, role: body.role });
    }

    return fail(400, "Expected a role or a volunteer role to toggle.");
});

/**
 * DELETE /api/mobile/v1/organizations/[orgId]/members/[userId]
 *
 * Removes a member. Their upcoming assignments, blockouts and any invitation
 * row go with them, and the action refuses to remove an owner or yourself.
 */
export const DELETE = route<Params>("DELETE .../members/[userId]", async (_req, { params }) => {
    const clerkId = await clerkIdOf();

    if (!clerkId) return fail(401, "Unauthorized");

    const { orgId, userId } = await params;

    const membership = await membershipFor(clerkId, orgId);

    if (!membership) return fail(404, "Not Found");

    const result = await removeMember(userId, orgId, expireTag);

    if (!result.success) return actionFailure(result.error);

    return json({ success: true });
});
