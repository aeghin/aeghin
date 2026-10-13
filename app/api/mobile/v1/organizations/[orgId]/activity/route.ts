import {
    getOrganizationActivity,
    getOrganizationActivityPageCount,
} from "@/lib/services/activity";
import { isActivityFilter } from "@/lib/activity-feed";
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
 * GET /api/mobile/v1/organizations/[orgId]/activity?page=1&filter=invites
 *
 * One page of the organization's feed, newest first. Owners and admins only,
 * as on the dashboard. The page is clamped into the real range the way the
 * dashboard's own `fetchActivityPage` clamps it. `filter` is one of the
 * dashboard's chips (`lib/activity-feed.ts`); missing or unknown is "all", so
 * an app from before the chips gets the whole feed as it always did.
 */
export const GET = route<Params>("GET .../activity", async (req, { params }) => {
    const clerkId = await clerkIdOf();

    if (!clerkId) return fail(401, "Unauthorized");

    const { orgId } = await params;

    const membership = await membershipFor(clerkId, orgId);

    if (!membership) return fail(404, "Not Found");

    if (!canManage(membership.role)) return fail(403, "Forbidden");

    const query = new URL(req.url).searchParams;

    const requested = Number(query.get("page") ?? 1);

    const rawFilter = query.get("filter");

    const filter = isActivityFilter(rawFilter) ? rawFilter : "all";

    const totalPages = await getOrganizationActivityPageCount(orgId, filter);

    const page = Math.min(
        Math.max(Math.trunc(requested) || 1, 1),
        Math.max(totalPages, 1),
    );

    const rows = await getOrganizationActivity(orgId, page, filter);

    const items: ActivityItem[] = rows.map((row) => ({
        ...row,
        createdAt: row.createdAt.toISOString(),
    }));

    return json({ items, page, totalPages });
});
