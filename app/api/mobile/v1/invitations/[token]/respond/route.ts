import { acceptOrgInvite, declineOrgInvite } from "@/lib/actions/invitation";
import {
    clerkIdOf,
    expireTag,
    fail,
    isObject,
    json,
    readJson,
    route,
} from "@/lib/mobile/route";

type RespondAction = "accept" | "decline";

type Params = { token: string };

const isRespondAction = (value: unknown): value is RespondAction =>
    value === "accept" || value === "decline";

/**
 * POST /api/mobile/v1/invitations/[token]/respond
 *
 * Answers an organization invitation: `{ action: "accept" | "decline" }`.
 *
 * The work belongs to the same two actions the web's invite page calls, so
 * accepting here creates the membership with the invited volunteer roles and
 * writes the activity entry exactly as it does there. Both refuse an
 * invitation that has lapsed, been answered already, or was addressed to
 * somebody else, and their wording is what the app shows.
 *
 * Accepting answers with `orgId` so the phone can drop straight into the
 * organization it just joined.
 */
export const POST = route<Params>("POST /invitations/[token]/respond", async (req, { params }) => {
    const clerkId = await clerkIdOf();

    if (!clerkId) return fail(401, "Unauthorized");

    const { token } = await params;

    const body = await readJson(req);

    if (!isObject(body) || !isRespondAction(body.action)) {
        return fail(400, 'Expected an action of "accept" or "decline".');
    }

    const result =
        body.action === "accept"
            ? await acceptOrgInvite(token, expireTag)
            : await declineOrgInvite(token, expireTag);

    if (!result.success) {
        // Every cause is a conflict rather than a fault: the invitation
        // expired, somebody answered it already, or it is not theirs.
        console.error(`POST /invitations/${token}/respond: ${body.action} failed —`, result.error);
        return fail(409, result.error);
    }

    return json({
        status: body.action === "accept" ? "ACCEPTED" : "DECLINED",
        orgId: result.orgId ?? null,
    });
});
