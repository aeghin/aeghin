import prisma from "@/lib/prisma";
import { SERVICE_TYPE_COLORS } from "@/lib/config/service-colors";
import { createEventTemplate } from "@/lib/actions/event-template";
import { eventTemplateSchema } from "@/lib/validations/event-template";
import type { VolunteerRole } from "@/generated/prisma/enums";
import {
    canManage,
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
 * Wire contract for the templates screen. Mirrors `EventTemplate` in the Expo
 * app (`src/types/event.ts`) — keep the two in sync, and treat it as
 * additive-only: installed apps cannot be force-updated.
 *
 * `days` is the dashboard's `EventTemplateDay` rows flattened and already in
 * `dayOffset` order, so the phone reads position from the array rather than
 * from a field. The offsets are contiguous by construction — the action writes
 * `dayOffset: index` — which is what lets a template become a date range.
 */
type ServiceTypeColor =
    | "indigo"
    | "amber"
    | "emerald"
    | "pink"
    | "violet"
    | "red"
    | "blue"
    | "cyan";

type EventTemplateDay = {
    /** `"09:00"`, a wall clock rather than an instant: a template has no date. */
    startTime: string;
    endTime: string;
};

type EventTemplate = {
    id: string;
    name: string;
    description: string;
    location: string;
    /** `0` Sunday … `6` Saturday, matching `Date.getDay()`. */
    dayOfWeek: number;
    days: EventTemplateDay[];
    rolesNeeded: VolunteerRole[];
    /** Days an invitee gets to answer on events built from this: 3, 5 or 7. */
    expiresInDays: number;
    smartSchedulingEnabled: boolean;
    serviceTypeId: string;
    serviceType: { id: string; name: string; color: ServiceTypeColor };
};

// The column is a plain string, so a colour written before the palette settled
// would reach a client with no swatch for it. Both apps fall back to indigo.
const isServiceTypeColor = (color: string): color is ServiceTypeColor =>
    SERVICE_TYPE_COLORS.some((swatch) => swatch === color);

type Params = { orgId: string };

/**
 * GET /api/mobile/v1/organizations/[orgId]/templates
 *
 * One organization's event templates, in the dashboard's order — by weekday,
 * then by name. Owners and admins only, matching the tab: a template is a
 * scheduling tool, and only they can create the events it seeds.
 *
 * The query is inlined rather than taken from `getOrgEventTemplates`, which is
 * a `"use cache"` reader keyed only on the organization and checks no caller.
 */
export const GET = route<Params>("GET .../templates", async (_req, { params }) => {
    const clerkId = await clerkIdOf();

    if (!clerkId) return fail(401, "Unauthorized");

    const { orgId } = await params;

    const membership = await membershipFor(clerkId, orgId);

    if (!membership) return fail(404, "Not Found");

    if (!canManage(membership.role)) return fail(403, "Forbidden");

    const rows = await prisma.eventTemplate.findMany({
        where: { organizationId: orgId },
        orderBy: [{ dayOfWeek: "asc" }, { name: "asc" }],
        select: {
            id: true,
            name: true,
            description: true,
            location: true,
            dayOfWeek: true,
            days: {
                orderBy: { dayOffset: "asc" },
                select: { startTime: true, endTime: true },
            },
            rolesNeeded: true,
            expiresInDays: true,
            smartSchedulingEnabled: true,
            serviceTypeId: true,
            serviceType: { select: { id: true, name: true, color: true } },
        },
    });

    const templates: EventTemplate[] = rows.map((row) => ({
        ...row,
        serviceType: {
            ...row.serviceType,
            color: isServiceTypeColor(row.serviceType.color)
                ? row.serviceType.color
                : "indigo",
        },
    }));

    return json({ templates });
});

/**
 * POST /api/mobile/v1/organizations/[orgId]/templates
 *
 * Saves one. Owners and admins only. The organization comes from the path
 * rather than the body, so a template can only ever be written to the
 * organization the caller was just checked against.
 */
export const POST = route<Params>("POST .../templates", async (req, { params }) => {
    const clerkId = await clerkIdOf();

    if (!clerkId) return fail(401, "Unauthorized");

    const { orgId } = await params;

    const membership = await membershipFor(clerkId, orgId);

    if (!membership) return fail(404, "Not Found");

    const body = await readJson(req);

    if (!isObject(body)) return fail(400, "Expected a template.");

    const parsed = eventTemplateSchema.safeParse({ ...body, organizationId: orgId });

    if (!parsed.success) {
        return fail(400, parsed.error.issues[0]?.message ?? "Invalid template.");
    }

    const result = await createEventTemplate(parsed.data, expireTag);

    if (!result.success) {
        return fail(
            /unauthori[sz]ed/i.test(result.error) ? 403
                : /already exists/i.test(result.error) ? 409
                : 400,
            result.error,
        );
    }

    return json({ success: true }, 201);
});
