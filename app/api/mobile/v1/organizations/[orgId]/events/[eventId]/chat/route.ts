import prisma from "@/lib/prisma";
import { sendMessage } from "@/lib/actions/chat";
import { getChatAccessForUser, getEventMessages } from "@/lib/services/chat";
import type { ChatMessage } from "@/lib/realtime/types";
import {
    actionFailure,
    clerkIdOf,
    fail,
    isObject,
    json,
    readJson,
    route,
} from "@/lib/mobile/route";

/**
 * Wire contract for the event chat. Mirrors `ChatPage` in the Expo app
 * (`src/types/chat.ts`) — keep the two in sync, additive-only.
 *
 * `viewer` rides along with the first page so the phone knows, in one round
 * trip, whether it may post and what to enter presence as. The same gate the
 * dashboard's page applies: a manager may read, only an accepted assignee
 * writes.
 */
type ChatPage = {
    messages: ChatMessage[];
    nextCursor: string | null;
    viewer: {
        userId: string;
        canPost: boolean;
        firstName: string;
        lastName: string;
        userImageUrl: string | null;
    };
};

type Params = { orgId: string; eventId: string };

/** The caller's standing on this event, or the response that says why not. */
async function access(orgId: string, eventId: string) {
    const clerkId = await clerkIdOf();

    if (!clerkId) return fail(401, "Unauthorized");

    const user = await prisma.user.findUnique({ where: { clerkId } });

    if (!user) return fail(401, "Unauthorized");

    const ctx = await getChatAccessForUser(user, eventId);

    // Non-member, no access, and no such event all read the same, and an
    // event id lifted from another organization reads as missing too.
    if (!ctx || ctx.organizationId !== orgId) return fail(404, "Not Found");

    return ctx;
}

/**
 * GET /api/mobile/v1/organizations/[orgId]/events/[eventId]/chat?cursor=
 *
 * One page of history, newest first, plus the caller's standing. Pass the
 * previous page's `nextCursor` to page back.
 */
export const GET = route<Params>("GET .../chat", async (req, { params }) => {
    const { orgId, eventId } = await params;

    const gate = await access(orgId, eventId);
    if (gate instanceof Response) return gate;

    const { user, canPost } = gate;

    const cursor = new URL(req.url).searchParams.get("cursor") ?? undefined;

    const { messages, nextCursor } = await getEventMessages(eventId, { cursor });

    const page: ChatPage = {
        messages,
        nextCursor,
        viewer: {
            userId: user.id,
            canPost,
            firstName: user.firstName,
            lastName: user.lastName,
            userImageUrl: user.userImageUrl,
        },
    };

    return json(page);
});

/**
 * POST /api/mobile/v1/organizations/[orgId]/events/[eventId]/chat
 *
 * Sends `{ body }`. The action persists it and fans it out over Ably, so the
 * phone sees its own message echoed on the channel as well as in this answer.
 */
export const POST = route<Params>("POST .../chat", async (req, { params }) => {
    const { orgId, eventId } = await params;

    const gate = await access(orgId, eventId);
    if (gate instanceof Response) return gate;

    if (!gate.canPost) {
        return fail(403, "Only assigned volunteers can post in this chat.");
    }

    const body = await readJson(req);

    if (!isObject(body) || typeof body.body !== "string") {
        return fail(400, "Expected a message body.");
    }

    const result = await sendMessage(eventId, { body: body.body });

    if (!result.success) return actionFailure(result.error);

    return json({ message: result.message }, 201);
});
