import prisma from "@/lib/prisma";
import { getMemberAcceptance, getMemberTopSongs } from "@/lib/services/member";
import {
    clerkIdOf,
    fail,
    json,
    membershipFor,
    route,
} from "@/lib/mobile/route";

/**
 * Wire contract for the member profile's two cards. Mirrors `MemberStats` in
 * the Expo app (`src/types/organization.ts`) — keep the two in sync, and treat
 * it as additive-only.
 *
 * `invited` is `accepted + declined`, not everything ever sent: an invitation
 * still waiting has not been answered either way, so counting it would make
 * every rate look worse the busier the schedule got.
 */
type RangeStats = {
    invited: number;
    accepted: number;
    declined: number;
};

type MemberSong = {
    title: string;
    artist: string;
    count: number;
};

type MemberStats = {
    all: RangeStats;
    /** The same, for the current calendar year. */
    year: RangeStats;
    /** The five they have sung most, most first. */
    songs: MemberSong[];
};

type Params = { orgId: string; userId: string };

/**
 * GET /api/mobile/v1/organizations/[orgId]/members/[userId]/stats
 *
 * How often this member says yes, and what they sing most.
 *
 * `userId` is the database id the members list ships as `id`, not a Clerk id.
 * Any member of the organization may read it — the roster is already theirs to
 * see, and this is the same page the dashboard links to from it.
 *
 * The two readers are `"use cache"` and take no caller, so both memberships
 * are checked here first: the caller's, and the subject's. Without the second
 * a member id from another organization would be answered with that person's
 * real numbers.
 */
export const GET = route<Params>("GET .../members/[id]/stats", async (_req, { params }) => {
    const clerkId = await clerkIdOf();

    if (!clerkId) return fail(401, "Unauthorized");

    const { orgId, userId } = await params;

    const membership = await membershipFor(clerkId, orgId);

    if (!membership) return fail(404, "Not Found");

    const subject = await prisma.membership.findUnique({
        where: { userId_organizationId: { userId, organizationId: orgId } },
        select: { id: true },
    });

    if (!subject) return fail(404, "Not Found");

    const [all, year, songs] = await Promise.all([
        getMemberAcceptance(userId, orgId),
        getMemberAcceptance(userId, orgId, new Date().getUTCFullYear()),
        getMemberTopSongs(userId, orgId),
    ]);

    return json<{ stats: MemberStats }>({ stats: { all, year, songs } });
});
