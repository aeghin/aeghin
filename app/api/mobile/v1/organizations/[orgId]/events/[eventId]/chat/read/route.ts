import prisma from "@/lib/prisma";
import { getChatAccessForUser, recordChatRead } from "@/lib/services/chat";
import { clerkIdOf, fail, json, route } from "@/lib/mobile/route";

type Params = { orgId: string; eventId: string };

/**
 * POST /api/mobile/v1/organizations/[orgId]/events/[eventId]/chat/read
 *
 * The chat is on the caller's screen, so everything in it so far is read and
 * the badge on the event screen goes back to nothing. The phone sends it as
 * messages arrive and again on the way out; the dashboard's panel makes the
 * same mark through `markChatRead`.
 */
export const POST = route<Params>("POST .../chat/read", async (_req, { params }) => {
    const clerkId = await clerkIdOf();

    if (!clerkId) return fail(401, "Unauthorized");

    const { orgId, eventId } = await params;

    const user = await prisma.user.findUnique({ where: { clerkId } });

    if (!user) return fail(401, "Unauthorized");

    const ctx = await getChatAccessForUser(user, eventId);

    if (!ctx || ctx.organizationId !== orgId) return fail(404, "Not Found");

    await recordChatRead(user.id, eventId);

    return json({ unreadCount: 0 });
});
