import { getTeamBlockouts } from "@/lib/services/blockouts";
import {
    canManage,
    clerkIdOf,
    fail,
    json,
    membershipFor,
    route,
} from "@/lib/mobile/route";

/**
 * Wire contract for the team's blockouts. Mirrors `TeamBlockout` in the Expo
 * app (`src/types/organization.ts`). Days are calendar days at UTC midnight,
 * the last one included, as the caller's own blockouts are.
 */
type TeamBlockout = {
    startDate: string;
    endDate: string;
    people: {
        userId: string;
        firstName: string;
        lastName: string;
        userImageUrl: string | null;
        /** The caller, whom the phone names "You" — it only knows its Clerk id. */
        isYou: boolean;
    }[];
    /** Events this stretch leaves with an open spot nobody free can take. */
    gaps: { eventId: string; text: string }[];
};

type Params = { orgId: string };

/**
 * GET /api/mobile/v1/organizations/[orgId]/blockouts/team
 *
 * Who's away in the next 60 days, grouped by identical stretches — the
 * dashboard's Team blockouts card. Owners and admins only.
 */
export const GET = route<Params>("GET .../blockouts/team", async (_req, { params }) => {
    const clerkId = await clerkIdOf();

    if (!clerkId) return fail(401, "Unauthorized");

    const { orgId } = await params;

    const membership = await membershipFor(clerkId, orgId);

    if (!membership) return fail(404, "Not Found");

    if (!canManage(membership.role)) return fail(403, "Forbidden");

    const rows = await getTeamBlockouts(orgId);

    const team: TeamBlockout[] = rows.map((row) => ({
        ...row,
        startDate: row.startDate.toISOString(),
        endDate: row.endDate.toISOString(),
        people: row.people.map((person) => ({
            ...person,
            isYou: person.userId === membership.userId,
        })),
    }));

    return json({ team });
});
