import { createBlockoutDate } from "@/lib/actions/blockout";
import { getUserBlockouts } from "@/lib/services/blockouts";
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

/**
 * Wire contract for the caller's blockouts. Mirrors `Blockout` in the Expo
 * app (`src/types/organization.ts`). Dates are calendar days stored at UTC
 * midnight, so the phone reads them in UTC the way it reads event times.
 */
type Blockout = {
    id: string;
    startDate: string;
    endDate: string;
};

type Params = { orgId: string };

/**
 * GET /api/mobile/v1/organizations/[orgId]/blockouts
 *
 * The caller's own blockouts in this organization — current and upcoming,
 * the same window the dashboard's tab shows.
 */
export const GET = route<Params>("GET .../blockouts", async (_req, { params }) => {
    const clerkId = await clerkIdOf();

    if (!clerkId) return fail(401, "Unauthorized");

    const { orgId } = await params;

    const membership = await membershipFor(clerkId, orgId);

    if (!membership) return fail(404, "Not Found");

    const rows = await getUserBlockouts(membership.userId, orgId);

    const blockouts: Blockout[] = rows.map((row) => ({
        id: row.id,
        startDate: row.startDate.toISOString(),
        endDate: row.endDate.toISOString(),
    }));

    return json({ blockouts });
});

/**
 * POST /api/mobile/v1/organizations/[orgId]/blockouts
 *
 * Adds one: `{ startDate: "YYYY-MM-DD", endDate: "YYYY-MM-DD" }`.
 */
export const POST = route<Params>("POST .../blockouts", async (req, { params }) => {
    const clerkId = await clerkIdOf();

    if (!clerkId) return fail(401, "Unauthorized");

    const { orgId } = await params;

    const membership = await membershipFor(clerkId, orgId);

    if (!membership) return fail(404, "Not Found");

    const body = await readJson(req);

    if (
        !isObject(body) ||
        typeof body.startDate !== "string" ||
        typeof body.endDate !== "string"
    ) {
        return fail(400, "Expected a start and end date.");
    }

    const result = await createBlockoutDate(
        { organizationId: orgId, startDate: body.startDate, endDate: body.endDate },
        expireTag,
    );

    if (!result.success) return actionFailure(result.error);

    return json({ success: true }, 201);
});
