import { deleteSongKey, updateSongKey } from "@/lib/actions/song-key";
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
import type { KeyQuality, Pitch } from "@/generated/prisma/enums";

type Params = { orgId: string; entryId: string };

/**
 * PATCH /api/mobile/v1/organizations/[orgId]/song-keys/[entryId]
 *
 * Edits one entry: `{ songId, title, artist, pitch, keyQuality, notes? }`.
 * Addressed by entry id rather than song id, because an entry can outlive the
 * song it pointed at.
 */
export const PATCH = route<Params>("PATCH .../song-keys/[entryId]", async (req, { params }) => {
    const clerkId = await clerkIdOf();

    if (!clerkId) return fail(401, "Unauthorized");

    const { orgId, entryId } = await params;

    const membership = await membershipFor(clerkId, orgId);

    if (!membership) return fail(404, "Not Found");

    const body = await readJson(req);

    if (
        !isObject(body) ||
        (body.songId !== null && typeof body.songId !== "string") ||
        typeof body.title !== "string" ||
        typeof body.artist !== "string" ||
        typeof body.pitch !== "string" ||
        typeof body.keyQuality !== "string" ||
        (body.notes !== undefined && typeof body.notes !== "string")
    ) {
        return fail(400, "Expected a song, a pitch and a key quality.");
    }

    const result = await updateSongKey(
        entryId,
        {
            organizationId: orgId,
            songId: body.songId,
            title: body.title,
            artist: body.artist,
            pitch: body.pitch as Pitch,
            keyQuality: body.keyQuality as KeyQuality,
            notes: body.notes ?? "",
        },
        expireTag,
    );

    if (!result.success) return actionFailure(result.error);

    return json({ success: true });
});

/** DELETE — drops the entry from the caller's journal. */
export const DELETE = route<Params>("DELETE .../song-keys/[entryId]", async (_req, { params }) => {
    const clerkId = await clerkIdOf();

    if (!clerkId) return fail(401, "Unauthorized");

    const { orgId, entryId } = await params;

    const membership = await membershipFor(clerkId, orgId);

    if (!membership) return fail(404, "Not Found");

    const result = await deleteSongKey(entryId, orgId, expireTag);

    if (!result.success) return actionFailure(result.error);

    return json({ success: true });
});
