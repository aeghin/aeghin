import prisma from "@/lib/prisma";
import { cancelOrgInvite } from "@/lib/actions/invitation";
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
 * DELETE /api/mobile/v1/organizations/[orgId]/invitations/[invitationId]
 *
 * Cancels a pending invitation. The action keys on email; the phone keys on
 * id, so the row is looked up — scoped to the organization — first.
 */
export const DELETE = route<Params>("DELETE .../invitations/[id]", async (_req, { params }) => {
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

    const result = await cancelOrgInvite(orgId, invitation.email, expireTag);

    if (!result.success) return actionFailure(result.error);

    return json({ success: true });
});
