import { createAgentUIStreamResponse } from "ai";

import prisma from "@/lib/prisma";
import { UsageKind, type RoleCategory as Team } from "@/generated/prisma/enums";
import { buildTeamFillAgent } from "@/lib/agents/team/build";
import { trimHistory } from "@/lib/agents/history";
import { aiRunLimitError, recordUsage } from "@/lib/billing/limits";
import { TEAM_ORDER } from "@/lib/config/roles";
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

type Params = { orgId: string; eventId: string };

/**
 * POST /api/mobile/v1/organizations/[orgId]/events/[eventId]/team-ai
 *
 * Fill with AI, streamed as AI SDK UI message chunks — the mobile twin of
 * `app/api/team-ai`. The phone's event-ai gates in the same order: a
 * session, an `ai_pro` entitlement on the organization (403, which the phone
 * reads as "upgrade"), a manager of that organization, and then a team of
 * theirs on an event that isn't over.
 *
 * Body is `{ messages, teams? }`; `teams` narrows it to the ones the screen
 * has picked. The agent only ever proposes — the invitations go through the
 * invitations route, after somebody has read the card.
 */
export const POST = route<Params>("POST .../team-ai", async (req, { params }) => {
    const clerkId = await clerkIdOf();

    if (!clerkId) return fail(401, "Unauthorized");

    const { orgId, eventId } = await params;

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

    const teams = Array.isArray(body.teams)
        ? body.teams.filter((team): team is Team => TEAM_ORDER.includes(team))
        : undefined;

    const built = await buildTeamFillAgent({
        organizationId: orgId,
        organizationName: org.name,
        eventId,
        viewer: {
            userId: membership.userId,
            name: `${viewer.firstName} ${viewer.lastName}`,
            firstName: viewer.firstName,
        },
        teams,
    });

    if ("refusal" in built) {
        switch (built.refusal) {
            case "not-found":
                return fail(404, "Not Found");
            case "over":
                return fail(409, "This event is over.");
            case "not-yours":
                return fail(403, "Only whoever's in charge of a team, or its backup, can fill it with AI.");
        }
    }

    // The dashboard's monthly allowance, worded so the phone can show it as is.
    const aiLimit = await aiRunLimitError(orgId);

    if (aiLimit) return fail(429, aiLimit);

    await recordUsage(orgId, UsageKind.AI_RUN);

    expireTag(`org-${orgId}-usage`);

    return createAgentUIStreamResponse({
        agent: built.agent,
        uiMessages: trimHistory(body.messages),
        timeout: 290_000,
        // The headers are already sent by the time the agent can fail, so
        // `route`'s try/catch never sees it — this is what reaches the logs.
        onError: (error) => {
            console.error("POST .../team-ai stream failed", error);
            return "The assistant stopped before it finished. Please try again.";
        },
    });
});
