import { createAgentUIStreamResponse, type UIMessage } from "ai";

import prisma from "@/lib/prisma";
import { createSetlistAgent } from "@/lib/agents/setlist/agent";
import { getOrganizationSongs } from "@/lib/services/songs";
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

type Params = { orgId: string; eventId: string };

/**
 * POST /api/mobile/v1/organizations/[orgId]/events/[eventId]/setlist-ai
 *
 * The setlist agent, streamed as AI SDK UI message chunks — the mobile twin
 * of `app/api/setlist-ai`. Same gates in the same order: a session, an AI
 * plan on the organization (403 otherwise, which the phone reads as "upgrade"),
 * a manager of the organization that owns the event, and a catalog with
 * something in it. The tier decides the model and whether web search is on.
 *
 * Body is `{ messages }`; the ids come from the path, not the payload.
 */
export const POST = route<Params>("POST .../setlist-ai", async (req, { params }) => {
    const clerkId = await clerkIdOf();

    if (!clerkId) return fail(401, "Unauthorized");

    const { orgId, eventId } = await params;

    const membership = await membershipFor(clerkId, orgId);

    if (!membership) return fail(404, "Not Found");

    const org = await prisma.organization.findUnique({
        where: { id: orgId },
        select: { name: true, entitlements: true },
    });

    if (!org) return fail(404, "Not Found");

    const hasPro = org.entitlements.includes("ai_pro");
    const hasPremium = org.entitlements.includes("ai_setlist");

    if (!hasPro && !hasPremium) return fail(403, "Upgrade required");

    if (!canManage(membership.role)) return fail(404, "Not Found");

    const event = await prisma.event.findFirst({
        where: { id: eventId, organizationId: orgId },
        select: { id: true },
    });

    if (!event) return fail(404, "Not Found");

    const body = await readJson(req);

    if (!isObject(body) || !Array.isArray(body.messages)) {
        return fail(400, "Expected messages.");
    }

    const catalog = await getOrganizationSongs(orgId);

    if (catalog.length === 0) return fail(422, "No songs in catalog");

    const agent = createSetlistAgent({
        tier: hasPro ? "pro" : "premium",
        orgName: org.name,
        catalog: catalog.map((s) => ({
            id: s.id,
            title: s.title,
            artist: s.artist,
            bpm: s.bpm,
            timeSignature: s.timeSignature,
            defaultPitch: s.defaultPitch,
            defaultKeyQuality: s.defaultKeyQuality,
            themes: s.themes,
            spotifyUrl: s.spotifyUrl,
            youtubeUrl: s.youtubeUrl,
        })),
    });

    return createAgentUIStreamResponse({
        agent,
        uiMessages: body.messages as UIMessage[],
        timeout: 290_000,
    });
});
