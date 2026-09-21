import { resendEventInvitation } from "@/lib/actions/event";
import {
    actionFailure,
    clerkIdOf,
    expireTag,
    fail,
    json,
    membershipFor,
    route,
} from "@/lib/mobile/route";

type Params = { orgId: string; eventId: string; userId: string };

/**
 * POST /api/mobile/v1/organizations/[orgId]/events/[eventId]/assignments/[userId]/resend
 *
 * Puts a lapsed invitation back in play: PENDING again, a fresh window, and the
 * assignment email re-sent. The dashboard offers it on the expired row's menu;
 * this is the same action behind it.
 *
 * A sub-route rather than another verb on `[userId]`, which already means
 * "take them off the event" as DELETE. Reopening an invitation is not an edit
 * of the row so much as a thing done to it — the same reading
 * `.../invitations/[id]/resend` and `.../respond` follow here.
 *
 * Every rule past membership is the action's own: it refuses anything that
 * hasn't lapsed, and re-checks the volunteer role and blockout dates, since the
 * row may have sat dead long enough for either to have moved.
 */
export const POST = route<Params>("POST .../assignments/[userId]/resend", async (_req, { params }) => {
    const clerkId = await clerkIdOf();

    if (!clerkId) return fail(401, "Unauthorized");

    const { orgId, eventId, userId } = await params;

    const membership = await membershipFor(clerkId, orgId);

    if (!membership) return fail(404, "Not Found");

    const result = await resendEventInvitation(orgId, eventId, userId, expireTag);

    if (!result.success) return actionFailure(result.error);

    return json({ success: true });
});
