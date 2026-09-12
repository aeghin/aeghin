import { saveSongKey } from "@/lib/actions/song-key";
import { getUserSongKeys } from "@/lib/services/song-keys";
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

/**
 * Wire contract for one journal entry. Mirrors `SongKey` in the Expo app
 * (`src/types/song.ts`). `title` and `artist` are already resolved — the live
 * song's when it still exists, the snapshot's otherwise — so the phone renders
 * them without knowing which.
 *
 * The `library*` fields and the links are flattened off the song the entry
 * points at, the way the web row reads them off `entry.song`. They are null
 * for a freehand entry and for one whose song row is gone. The phone cannot
 * join these itself: its library list drops retired songs, and the journal
 * deliberately keeps them.
 */
type SongKey = {
    id: string;
    songId: string | null;
    title: string;
    artist: string;
    pitch: string;
    keyQuality: string;
    notes: string | null;
    updatedAt: string;
    /** The library's own key, for the "library Bb" line under a differing entry. */
    libraryPitch: string | null;
    libraryKeyQuality: string | null;
    spotifyUrl: string | null;
    youtubeUrl: string | null;
};

type Params = { orgId: string };

/**
 * GET /api/mobile/v1/organizations/[orgId]/song-keys
 *
 * The caller's own key journal for this organization — the same rows the
 * dashboard's My Keys tab shows.
 */
export const GET = route<Params>("GET .../song-keys", async (_req, { params }) => {
    const clerkId = await clerkIdOf();

    if (!clerkId) return fail(401, "Unauthorized");

    const { orgId } = await params;

    const membership = await membershipFor(clerkId, orgId);

    if (!membership) return fail(404, "Not Found");

    const rows = await getUserSongKeys(membership.userId, orgId);

    const songKeys: SongKey[] = rows.map((row) => ({
        id: row.id,
        songId: row.songId,
        title: row.song?.title ?? row.title,
        artist: row.song?.artist ?? row.artist,
        pitch: row.pitch,
        keyQuality: row.keyQuality,
        notes: row.notes,
        updatedAt: row.updatedAt.toISOString(),
        libraryPitch: row.song?.defaultPitch ?? null,
        libraryKeyQuality: row.song?.defaultKeyQuality ?? null,
        spotifyUrl: row.song?.spotifyUrl ?? null,
        youtubeUrl: row.song?.youtubeUrl ?? null,
    }));

    return json({ songKeys });
});

/**
 * POST /api/mobile/v1/organizations/[orgId]/song-keys
 *
 * Adds one: `{ songId, title, artist, pitch, keyQuality, notes? }`. Upserts on
 * songId, so posting a song already journalled rewrites its key rather than
 * doubling it. The enums are validated in the action's schema, so the body
 * check only has to confirm the shape.
 */
export const POST = route<Params>("POST .../song-keys", async (req, { params }) => {
    const clerkId = await clerkIdOf();

    if (!clerkId) return fail(401, "Unauthorized");

    const { orgId } = await params;

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

    const result = await saveSongKey(
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

    return json({ success: true }, 201);
});
