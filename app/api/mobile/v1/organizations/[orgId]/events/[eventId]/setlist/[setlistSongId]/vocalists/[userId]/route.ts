import {
    assignSongVocalist,
    unassignSongVocalist,
} from "@/lib/actions/song-setlist";
import {
    actionFailure,
    clerkIdOf,
    expireTag,
    fail,
    json,
    membershipFor,
    route,
} from "@/lib/mobile/route";

type Params = { orgId: string; eventId: string; setlistSongId: string; userId: string };

/**
 * PUT /api/mobile/v1/organizations/[orgId]/events/[eventId]/setlist/[setlistSongId]/vocalists/[userId]
 *
 * Puts an accepted lead vocalist or BGV on one song. Idempotent, as on the
 * dashboard: assigning twice is a no-op.
 */
export const PUT = route<Params>("PUT .../vocalists/[userId]", async (_req, { params }) => {
    const clerkId = await clerkIdOf();

    if (!clerkId) return fail(401, "Unauthorized");

    const { orgId, setlistSongId, userId } = await params;

    const membership = await membershipFor(clerkId, orgId);

    if (!membership) return fail(404, "Not Found");

    const result = await assignSongVocalist(setlistSongId, userId, expireTag);

    if (!result.success) return actionFailure(result.error);

    return json({ success: true });
});

/** DELETE — takes them off the song. Removing an absent assignment is a no-op. */
export const DELETE = route<Params>("DELETE .../vocalists/[userId]", async (_req, { params }) => {
    const clerkId = await clerkIdOf();

    if (!clerkId) return fail(401, "Unauthorized");

    const { orgId, setlistSongId, userId } = await params;

    const membership = await membershipFor(clerkId, orgId);

    if (!membership) return fail(404, "Not Found");

    const result = await unassignSongVocalist(setlistSongId, userId, expireTag);

    if (!result.success) return actionFailure(result.error);

    return json({ success: true });
});
