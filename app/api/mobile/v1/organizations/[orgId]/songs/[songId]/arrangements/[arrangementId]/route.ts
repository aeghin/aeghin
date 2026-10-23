import prisma from "@/lib/prisma";
import {
    deleteSongArrangement,
    updateSongArrangement,
} from "@/lib/actions/song-arrangement";
import type { songArrangementInput } from "@/lib/validations/song";
import {
    actionFailure,
    canManage,
    clerkIdOf,
    expireTag,
    fail,
    isObject,
    json,
    membershipFor,
    readJson,
    route,
} from "@/lib/mobile/route";

type Params = { orgId: string; songId: string; arrangementId: string };

/**
 * Both handlers open the same way: signed in, an owner or admin, and the
 * arrangement one of this song's. The actions scope by organization, which is
 * the security boundary; the lookup is what makes the song in the path mean
 * something rather than ride along ignored.
 */
const authorize = async ({ orgId, songId, arrangementId }: Params) => {
    const clerkId = await clerkIdOf();

    if (!clerkId) return fail(401, "Unauthorized");

    const membership = await membershipFor(clerkId, orgId);

    if (!membership) return fail(404, "Not Found");

    if (!canManage(membership.role)) return fail(403, "Forbidden");

    const arrangement = await prisma.songArrangement.findFirst({
        where: {
            id: arrangementId,
            songId,
            song: { organizationId: orgId, deletedAt: null },
        },
        select: { id: true },
    });

    if (!arrangement) return fail(404, "Arrangement not found.");

    return null;
};

/**
 * PATCH /api/mobile/v1/organizations/[orgId]/songs/[songId]/arrangements/[arrangementId]
 *
 * Renames an arrangement or changes its links. The body is the whole of it, as
 * the add route takes it. Every setlist that plays it follows.
 */
export const PATCH = route<Params>(
    "PATCH .../songs/[id]/arrangements/[id]",
    async (req, { params }) => {
        const ids = await params;

        const denied = await authorize(ids);

        if (denied) return denied;

        const body = await readJson(req);

        if (!isObject(body)) return fail(400, "Expected an arrangement.");

        const result = await updateSongArrangement(
            ids.orgId,
            ids.arrangementId,
            body as songArrangementInput,
            expireTag,
        );

        if (!result.success) return actionFailure(result.error);

        return json({ success: true });
    },
);

/**
 * DELETE /api/mobile/v1/organizations/[orgId]/songs/[songId]/arrangements/[arrangementId]
 *
 * Deletes an arrangement and its files. Refused while an upcoming setlist plays
 * it, naming those events, which is why the phone shows the server's own words.
 */
export const DELETE = route<Params>(
    "DELETE .../songs/[id]/arrangements/[id]",
    async (_req, { params }) => {
        const ids = await params;

        const denied = await authorize(ids);

        if (denied) return denied;

        const result = await deleteSongArrangement(ids.orgId, ids.arrangementId, expireTag);

        if (!result.success) return actionFailure(result.error);

        return json({ success: true });
    },
);
