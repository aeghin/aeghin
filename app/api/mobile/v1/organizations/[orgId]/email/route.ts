import { emailEntireOrganization } from "@/lib/actions/organizations";
import {
    actionFailure,
    clerkIdOf,
    fail,
    isObject,
    json,
    membershipFor,
    readJson,
    route,
} from "@/lib/mobile/route";

type Params = { orgId: string };

/**
 * POST /api/mobile/v1/organizations/[orgId]/email
 *
 * Emails every member: `{ subject, body }`. Owners and admins only.
 *
 * The organization's counterpart to the per-event email beside it — that one
 * writes to whoever accepted one event, this one to the whole roster. Sent in
 * the request rather than after it, so the answer is a real delivered-or-failed
 * and the sender learns how many it reached.
 */
export const POST = route<Params>("POST .../email", async (req, { params }) => {
    const clerkId = await clerkIdOf();

    if (!clerkId) return fail(401, "Unauthorized");

    const { orgId } = await params;

    const membership = await membershipFor(clerkId, orgId);

    if (!membership) return fail(404, "Not Found");

    const body = await readJson(req);

    if (
        !isObject(body) ||
        typeof body.subject !== "string" ||
        typeof body.body !== "string"
    ) {
        return fail(400, "Expected a subject and a message.");
    }

    const result = await emailEntireOrganization(orgId, {
        subject: body.subject,
        body: body.body,
    });

    if (!result.success) return actionFailure(result.error);

    return json({ sentCount: result.sentCount });
});
