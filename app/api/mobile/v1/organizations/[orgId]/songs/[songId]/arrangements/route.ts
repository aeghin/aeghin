import { addSongArrangement } from "@/lib/actions/song-arrangement";
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

type Params = { orgId: string; songId: string };

/**
 * POST /api/mobile/v1/organizations/[orgId]/songs/[songId]/arrangements
 *
 * Adds a named version of a library song, `{ name, useSongLinks, spotifyUrl,
 * youtubeUrl }` as the dashboard's form sends it. Its files go up afterwards,
 * through the song's attachments route with its id. The action validates the
 * body, scopes the song to the organization and refuses a name the song
 * already has. Owners and admins only.
 */
export const POST = route<Params>("POST .../songs/[id]/arrangements", async (req, { params }) => {
    const clerkId = await clerkIdOf();

    if (!clerkId) return fail(401, "Unauthorized");

    const { orgId, songId } = await params;

    const membership = await membershipFor(clerkId, orgId);

    if (!membership) return fail(404, "Not Found");

    if (!canManage(membership.role)) return fail(403, "Forbidden");

    const body = await readJson(req);

    if (!isObject(body)) return fail(400, "Expected an arrangement.");

    const result = await addSongArrangement(
        orgId,
        songId,
        body as songArrangementInput,
        expireTag,
    );

    if (!result.success) return actionFailure(result.error);

    return json({ success: true }, 201);
});
