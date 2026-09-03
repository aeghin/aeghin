import prisma from "@/lib/prisma";
import { saveSetlist } from "@/lib/actions/song-setlist";
import { KeyQuality, Pitch } from "@/generated/prisma/enums";
import type { SetlistSong } from "@/lib/types";
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

type Params = { orgId: string; eventId: string };

/** One row of the draft, as the phone's editor sends it. Mirrors `SetlistDraftSong`. */
const isDraftSong = (value: unknown): value is SetlistSong =>
    isObject(value) &&
    typeof value.songId === "string" &&
    typeof value.pitch === "string" && value.pitch in Pitch &&
    typeof value.keyQuality === "string" && value.keyQuality in KeyQuality &&
    typeof value.bpm === "number" && Number.isInteger(value.bpm) && value.bpm > 0 &&
    typeof value.timeSignature === "string" && value.timeSignature.length > 0;

/**
 * PUT /api/mobile/v1/organizations/[orgId]/events/[eventId]/setlist
 *
 * Replaces the event's setlist with `{ songs }`, in order. The action is the
 * dashboard editor's: rows that survive keep their id, so per-song vocalist
 * assignments outlive a reorder or a key change.
 */
export const PUT = route<Params>("PUT .../setlist", async (req, { params }) => {
    const clerkId = await clerkIdOf();

    if (!clerkId) return fail(401, "Unauthorized");

    const { orgId, eventId } = await params;

    const membership = await membershipFor(clerkId, orgId);

    if (!membership) return fail(404, "Not Found");

    // Scoped by organization so an event id from elsewhere reads as missing.
    const event = await prisma.event.findFirst({
        where: { id: eventId, organizationId: orgId },
        select: { id: true },
    });

    if (!event) return fail(404, "Not Found");

    const body = await readJson(req);

    if (!isObject(body) || !Array.isArray(body.songs) || !body.songs.every(isDraftSong)) {
        return fail(400, "Expected a list of setlist songs.");
    }

    const result = await saveSetlist(eventId, body.songs, expireTag);

    if (!result.success) return actionFailure(result.error);

    return json({ success: true });
});
