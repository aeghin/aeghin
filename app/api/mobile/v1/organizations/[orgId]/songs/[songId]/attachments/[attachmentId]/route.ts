import prisma from "@/lib/prisma";
import { deleteSongAttachment } from "@/lib/actions/song";
import {
    canManage,
    clerkIdOf,
    expireTag,
    fail,
    json,
    membershipFor,
    route,
} from "@/lib/mobile/route";

type Params = { orgId: string; songId: string; attachmentId: string };

/**
 * DELETE /api/mobile/v1/organizations/[orgId]/songs/[songId]/attachments/[attachmentId]
 *
 * Removes one chart or track, from UploadThing as well as from the database —
 * the action does both, in that order. Owners and admins only.
 */
export const DELETE = route<Params>(
    "DELETE .../songs/[id]/attachments/[id]",
    async (_req, { params }) => {
        const clerkId = await clerkIdOf();

        if (!clerkId) return fail(401, "Unauthorized");

        const { orgId, songId, attachmentId } = await params;

        const membership = await membershipFor(clerkId, orgId);

        if (!membership) return fail(404, "Not Found");

        if (!canManage(membership.role)) return fail(403, "Forbidden");

        // The action scopes by organization, which is the security boundary;
        // this is what makes the song in the path mean something rather than
        // ride along ignored.
        const attachment = await prisma.songAttachment.findFirst({
            where: { id: attachmentId, songId, song: { organizationId: orgId } },
            select: { id: true },
        });

        if (!attachment) return fail(404, "Attachment not found.");

        const result = await deleteSongAttachment(attachmentId, orgId, expireTag);

        if (!result.success) {
            return fail(
                /unauthori[sz]ed/i.test(result.error) ? 403
                    : /not found/i.test(result.error) ? 404
                    : 400,
                result.error,
            );
        }

        return json({ success: true });
    },
);
