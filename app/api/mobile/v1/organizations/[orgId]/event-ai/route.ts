import { createAgentUIStreamResponse } from "ai";

import prisma from "@/lib/prisma";
import { UsageKind } from "@/generated/prisma/enums";
import { buildEventDraftAgent } from "@/lib/agents/event/build";
import { trimHistory } from "@/lib/agents/history";
import { aiRunLimitError, recordUsage } from "@/lib/billing/limits";
import {
    canManage,
    clerkIdOf,
    expireTag,
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

    const [org, viewer] = await Promise.all([
        prisma.organization.findUnique({
            where: { id: orgId },
            select: { name: true, entitlements: true },
        }),
        prisma.user.findUnique({
            where: { id: membership.userId },
            select: { firstName: true, lastName: true },
        }),
    ]);

    if (!org || !viewer) return fail(404, "Not Found");

    if (!org.entitlements.includes("ai_pro")) {
        return fail(403, "Upgrade required");
    }

    if (!canManage(membership.role)) return fail(404, "Not Found");

    const body = await readJson(req);

    if (!isObject(body) || !Array.isArray(body.messages)) {
        return fail(400, "Expected messages.");
    }

    // The person drafting creates the event, so a team with no lead is theirs.
    const agent = await buildEventDraftAgent({
        organizationId: orgId,
        organizationName: org.name,
        viewer: {
            userId: membership.userId,
            name: `${viewer.firstName} ${viewer.lastName}`,
            firstName: viewer.firstName,
        },
        today: resolveToday(body.today),
    });

    if (!agent) return fail(422, "No service types");

    // The dashboard's monthly allowance, worded so the phone can show it as is.
    const aiLimit = await aiRunLimitError(orgId);

    if (aiLimit) return fail(429, aiLimit);

    await recordUsage(orgId, UsageKind.AI_RUN);

    expireTag(`org-${orgId}-usage`);

    return createAgentUIStreamResponse({
        agent,
        uiMessages: trimHistory(body.messages),
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
