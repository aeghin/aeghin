import { createAgentUIStreamResponse, type UIMessage } from "ai";

import prisma from "@/lib/prisma";
import {
    createEventDraftAgent,
    type EventAgentDeps,
} from "@/lib/agents/event/agent";
import { getOrgEventTemplates } from "@/lib/services/event-templates";
import { getOrgMembersWithUser } from "@/lib/services/organization";
import { getEligibilityByRole } from "@/lib/services/scheduling";
import { getOrgServiceTypes } from "@/lib/services/service-types";
import {
    canManage,
    clerkIdOf,
    fail,
    isObject,
    membershipFor,
    readJson,
    route,
} from "@/lib/mobile/route";

export const maxDuration = 300;

type Params = { orgId: string };

const DAY_MS = 24 * 60 * 60 * 1000;

const toDateOnly = (d: Date) => d.toISOString().slice(0, 10);

/**
 * The phone reports its own calendar day, because "next Sunday" is relative to
 * where the user is, not to the server. Clamped to a day either side of UTC now
 * so a crafted value can't send the agent drafting in another year.
 */
function resolveToday(candidate: unknown): string {
    const now = new Date();

    if (typeof candidate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(candidate)) {
        return toDateOnly(now);
    }

    const min = toDateOnly(new Date(now.getTime() - DAY_MS));
    const max = toDateOnly(new Date(now.getTime() + DAY_MS));

    if (candidate < min) return min;
    if (candidate > max) return max;

    return candidate;
}

/**
 * POST /api/mobile/v1/organizations/[orgId]/event-ai
 *
 * The event-draft agent, streamed as AI SDK UI message chunks — the mobile
 * twin of `app/api/event-ai`. Same gates in the same order: a session, an
 * `ai_pro` entitlement on the organization (403, which the phone reads as
 * "upgrade"), a manager of that organization, and at least one service type to
 * file an event under.
 *
 * Body is `{ messages, today }`; the organization comes from the path, not the
 * payload. The agent only ever proposes — creating the event is a second,
 * deliberate call to the create route, made after somebody has read the draft.
 */
export const POST = route<Params>("POST .../event-ai", async (req, { params }) => {
    const clerkId = await clerkIdOf();

    if (!clerkId) return fail(401, "Unauthorized");

    const { orgId } = await params;

    const membership = await membershipFor(clerkId, orgId);

    if (!membership) return fail(404, "Not Found");

    const org = await prisma.organization.findUnique({
        where: { id: orgId },
        select: { name: true, entitlements: true },
    });

    if (!org) return fail(404, "Not Found");

    if (!org.entitlements.includes("ai_pro")) {
        return fail(403, "Upgrade required");
    }

    if (!canManage(membership.role)) return fail(404, "Not Found");

    const body = await readJson(req);

    if (!isObject(body) || !Array.isArray(body.messages)) {
        return fail(400, "Expected messages.");
    }

    const [serviceTypes, templates, members] = await Promise.all([
        getOrgServiceTypes(orgId),
        getOrgEventTemplates(orgId),
        getOrgMembersWithUser(orgId),
    ]);

    if (serviceTypes.length === 0) return fail(422, "No service types");

    // The one place calendar date + clock time become the stored floating-UTC
    // instants. The agent never sees a timezone.
    const deps: EventAgentDeps = {
        checkAvailability: ({ days, roles, maxPerRole }) =>
            getEligibilityByRole({
                organizationId: orgId,
                dates: days.map((d) => ({
                    startTime: `${d.date}T${d.startTime}:00Z`,
                    endTime: `${d.date}T${d.endTime}:00Z`,
                })),
                roles,
                ...(maxPerRole === undefined ? {} : { maxPerRole }),
            }),
    };

    const agent = createEventDraftAgent({
        orgName: org.name,
        today: resolveToday(body.today),
        serviceTypes,
        templates: templates.map((t) => ({
            name: t.name,
            dayOfWeek: t.dayOfWeek,
            location: t.location,
            description: t.description,
            days: t.days,
            rolesNeeded: t.rolesNeeded,
            expiresInDays: t.expiresInDays,
            smartSchedulingEnabled: t.smartSchedulingEnabled,
            serviceTypeId: t.serviceTypeId,
        })),
        roster: members.map((m) => ({
            userId: m.userId,
            name: `${m.user.firstName} ${m.user.lastName}`,
            volunteerRoles: m.volunteerRoles,
        })),
        deps,
    });

    return createAgentUIStreamResponse({
        agent,
        uiMessages: body.messages as UIMessage[],
        timeout: 290_000,
        // The headers are already sent by the time the agent can fail, so
        // `route`'s try/catch never sees it. Without this the SDK's default
        // turns any mid-stream failure into the string "An error occurred."
        // and logs nothing at all — the phone says something went wrong and
        // the server says nothing, which is indistinguishable from the model
        // simply going quiet. The client still shows its own wording; the
        // return value is only what rides the stream.
        onError: (error) => {
            console.error("POST .../event-ai stream failed", error);
            return "The assistant stopped before it finished. Please try again.";
        },
    });
});
