import { checkMemberAvailability } from "@/lib/actions/event";
import {
    canManage,
    clerkIdOf,
    fail,
    isObject,
    json,
    membershipFor,
    readJson,
    route,
} from "@/lib/mobile/route";

/**
 * Wire contract for "who can't make it". Mirrors `MemberAvailability` in the
 * Expo app (`src/types/event.ts`).
 *
 * Both maps are keyed by user id. A conflict names the event already booked
 * over these hours; a blockout is the member's own declared unavailability.
 * The difference matters: the server refuses an assignment over a blockout
 * outright, while a conflict is the manager's call to make.
 */
type MemberAvailability = {
    conflicts: Record<string, { eventName: string; startTime: string; endTime: string }>;
    blockouts: Record<string, { startDate: string; endDate: string }>;
};

type Day = { date: string; startTime: string; endTime: string };

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const CLOCK = /^\d{2}:\d{2}$/;

const isDay = (value: unknown): value is Day =>
    isObject(value) &&
    typeof value.date === "string" && DAY.test(value.date) &&
    typeof value.startTime === "string" && CLOCK.test(value.startTime) &&
    typeof value.endTime === "string" && CLOCK.test(value.endTime);

/** `"2026-09-27"`, `"10:00"` -> the UTC instant the app stores. */
const instant = (date: string, clock: string) => `${date}T${clock}:00.000Z`;

type Params = { orgId: string };

/**
 * POST /api/mobile/v1/organizations/[orgId]/availability
 *
 * Given the days an event would run, who in the organization is already
 * booked and who has declared themselves unavailable. Owners and admins only,
 * matching the action.
 *
 * `excludeEventId` skips one event's own roster; an existing event checking
 * its own hours would otherwise find everybody on it conflicting with
 * themselves.
 */
export const POST = route<Params>("POST .../availability", async (req, { params }) => {
    const clerkId = await clerkIdOf();

    if (!clerkId) return fail(401, "Unauthorized");

    const { orgId } = await params;

    const membership = await membershipFor(clerkId, orgId);

    if (!membership) return fail(404, "Not Found");

    // The action throws rather than returning on a bad caller, so the gate is
    // checked here where it can be answered as a status.
    if (!canManage(membership.role)) return fail(403, "Forbidden");

    const body = await readJson(req);

    if (!isObject(body) || !Array.isArray(body.days) || !body.days.every(isDay)) {
        return fail(400, "Expected the days the event runs.");
    }

    if (body.excludeEventId !== undefined && typeof body.excludeEventId !== "string") {
        return fail(400, "excludeEventId must be an event id.");
    }

    if (body.days.length === 0) {
        return json<MemberAvailability>({ conflicts: {}, blockouts: {} });
    }

    const availability = await checkMemberAvailability({
        organizationId: orgId,
        dates: body.days.map((day) => ({
            date: day.date,
            startTime: instant(day.date, day.startTime),
            endTime: instant(day.date, day.endTime),
        })),
        excludeEventId: body.excludeEventId,
    });

    return json<MemberAvailability>(availability);
});
