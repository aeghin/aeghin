import { addEventRoles, removeEventRole } from "@/lib/actions/event";
import { VolunteerRole } from "@/generated/prisma/enums";
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

type Params = { orgId: string; eventId: string };

const isVolunteerRole = (value: unknown): value is VolunteerRole =>
    typeof value === "string" && value in VolunteerRole;

/**
 * POST /api/mobile/v1/organizations/[orgId]/events/[eventId]/roles
 *
 * Adds open slots to the roster: `{ roles: VolunteerRole[] }`.
 */
export const POST = route<Params>("POST .../events/[id]/roles", async (req, { params }) => {
    const clerkId = await clerkIdOf();

    if (!clerkId) return fail(401, "Unauthorized");

    const { orgId, eventId } = await params;

    const membership = await membershipFor(clerkId, orgId);

    if (!membership) return fail(404, "Not Found");

    const body = await readJson(req);

    if (
        !isObject(body) ||
        !Array.isArray(body.roles) ||
        !body.roles.every(isVolunteerRole)
    ) {
        return fail(400, "Expected a list of volunteer roles.");
    }

    const result = await addEventRoles(orgId, eventId, { roles: body.roles }, expireTag);

    if (!result.success) return actionFailure(result.error);

    return json({ success: true });
});

/**
 * DELETE /api/mobile/v1/organizations/[orgId]/events/[eventId]/roles
 *
 * Takes one role off the roster: `{ role: VolunteerRole }`. Only a role
 * nobody is live on can come off; the action names who is in the way.
 */
export const DELETE = route<Params>("DELETE .../events/[id]/roles", async (req, { params }) => {
    const clerkId = await clerkIdOf();

    if (!clerkId) return fail(401, "Unauthorized");

    const { orgId, eventId } = await params;

    const membership = await membershipFor(clerkId, orgId);

    if (!membership) return fail(404, "Not Found");

    const body = await readJson(req);

    if (!isObject(body) || !isVolunteerRole(body.role)) {
        return fail(400, "Expected a volunteer role.");
    }

    const result = await removeEventRole(orgId, eventId, { role: body.role }, expireTag);

    if (!result.success) return actionFailure(result.error);

    return json({ success: true });
});
