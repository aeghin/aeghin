import {
    getOrganizationActivity,
    getOrganizationActivityPageCount,
} from "@/lib/services/activity";
import type { ActivityType } from "@/generated/prisma/enums";
import {
    canManage,
    clerkIdOf,
    fail,
    json,
    membershipFor,
    route,
} from "@/lib/mobile/route";

/**
 * Wire contract for the activity feed. Mirrors `ActivityItem` in the Expo
 * app (`src/types/activity.ts`) — keep the two in sync.
 */
type ActivityItem = {
    id: string;
    type: ActivityType;
    actorName: string | null;
    targetName: string | null;
    detail: string | null;
    eventId: string | null;
    eventName: string | null;
    createdAt: string;
};

type Params = { orgId: string };

/**
 * GET /api/mobile/v1/organizations/[orgId]/activity?page=1
 *
 * One page of the organization's feed, newest first. Owners and admins only,
 * as on the dashboard. The page is clamped into the real range the way the
 * dashboard's own `fetchActivityPage` clamps it.
 */
export const GET = route<Params>("GET .../activity", async (req, { params }) => {
    const clerkId = await clerkIdOf();

    if (!clerkId) return fail(401, "Unauthorized");

    const { orgId } = await params;

    const membership = await membershipFor(clerkId, orgId);

    if (!membership) return fail(404, "Not Found");

    if (!canManage(membership.role)) return fail(403, "Forbidden");

    const requested = Number(new URL(req.url).searchParams.get("page") ?? 1);

    const totalPages = await getOrganizationActivityPageCount(orgId);

    const page = Math.min(
        Math.max(Math.trunc(requested) || 1, 1),
        Math.max(totalPages, 1),
    );

    const rows = await getOrganizationActivity(orgId, page);

    const items: ActivityItem[] = rows.map((row) => ({
        ...row,
        createdAt: row.createdAt.toISOString(),
    }));

    return json({ items, page, totalPages });
});
