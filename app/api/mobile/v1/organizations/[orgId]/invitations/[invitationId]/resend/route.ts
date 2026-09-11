import prisma from "@/lib/prisma";
import { resendInvitation } from "@/lib/actions/invitation";
import {
    actionFailure,
    clerkIdOf,
    expireTag,
    fail,
    json,
    membershipFor,
    route,
} from "@/lib/mobile/route";

type Params = { orgId: string; invitationId: string };

/**
 * POST /api/mobile/v1/organizations/[orgId]/invitations/[invitationId]/resend
 *
 * Sends the invitation again: a fresh token, seven more days, status back to
 * PENDING, and the email re-delivered. The dashboard offers it on a pending
 * invitation ("Resend") and on a canceled one ("Send New Invitation"); this is
 * the same action behind both, so the phone can offer the same two.
 *
 * A sub-route rather than a second verb on `[invitationId]`, which already
 * means "cancel" as DELETE — resending is not an edit of the row so much as a
 * thing done to it, the way `.../leave` and `.../respond` read elsewhere here.
 *
 * The action keys on email; the phone keys on id, so the row is looked up —
 * scoped to the organization, so an id from elsewhere reads as missing — first.
 * Every permission rule past that point is the action's own.
 */
export const POST = route<Params>("POST .../invitations/[id]/resend", async (_req, { params }) => {
    const clerkId = await clerkIdOf();

    if (!clerkId) return fail(401, "Unauthorized");

    const { orgId, invitationId } = await params;

    const membership = await membershipFor(clerkId, orgId);

    if (!membership) return fail(404, "Not Found");

    const invitation = await prisma.invitation.findFirst({
        where: { id: invitationId, organizationId: orgId },
        select: { email: true },
    });

    if (!invitation) return fail(404, "Not Found");

    const result = await resendInvitation(orgId, invitation.email, expireTag);

    if (!result.success) {
        // The one refusal worth rewording: the action's "User is member" is a
        // sentence about the invitation, not to the person reading it.
        if (result.error === "User is member") {
            return fail(409, "That person has already joined.");
        }
        return actionFailure(result.error);
    }

    return json({ success: true });
});
