import { emailAcceptedVolunteers } from "@/lib/actions/event";
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

type Params = { orgId: string; eventId: string };

/**
 * POST /api/mobile/v1/organizations/[orgId]/events/[eventId]/email
 *
 * Emails everyone who has accepted: `{ subject, body }`. Sent in the request
 * so the answer is a real delivered-or-failed, as on the dashboard.
 */
export const POST = route<Params>("POST .../events/[id]/email", async (req, { params }) => {
    const clerkId = await clerkIdOf();

    if (!clerkId) return fail(401, "Unauthorized");

    const { orgId, eventId } = await params;

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

    const result = await emailAcceptedVolunteers(orgId, eventId, {
        subject: body.subject,
        body: body.body,
    });

    if (!result.success) return actionFailure(result.error);

    return json({ sentCount: result.sentCount });
});
