import * as Ably from "ably";

import prisma from "@/lib/prisma";
import { channelName } from "@/lib/realtime/channels";
import { getChatAccessForUser } from "@/lib/services/chat";
import { clerkIdOf, fail, json, route } from "@/lib/mobile/route";

type Params = { orgId: string; eventId: string };

/**
 * GET /api/mobile/v1/organizations/[orgId]/events/[eventId]/chat/token
 *
 * A signed Ably `TokenRequest` for this one event's channel — the mobile twin
 * of `app/api/realtime/ably/token`. The phone hands it to Ably from an
 * `authCallback`, which is how it gets to attach a fresh Clerk bearer token
 * to every renewal.
 *
 * Capability-scoped to THIS event's channel. `subscribe` already permits
 * reading the presence set; `presence` is what grants ENTERing it — so a
 * preview-only manager watches the room without joining it.
 */
export const GET = route<Params>("GET .../chat/token", async (_req, { params }) => {
    const clerkId = await clerkIdOf();

    if (!clerkId) return fail(401, "Unauthorized");

    const { orgId, eventId } = await params;

    const user = await prisma.user.findUnique({ where: { clerkId } });

    if (!user) return fail(401, "Unauthorized");

    const ctx = await getChatAccessForUser(user, eventId);

    if (!ctx || ctx.organizationId !== orgId) return fail(404, "Not Found");

    const rest = new Ably.Rest({ key: process.env.ABLY_API_KEY! });

    const tokenRequest = await rest.auth.createTokenRequest({
        clientId: user.id,
        capability: JSON.stringify({
            [channelName(eventId)]: ctx.canPost
                ? ["subscribe", "presence"]
                : ["subscribe"],
        }),
    });

    return json(tokenRequest);
});
