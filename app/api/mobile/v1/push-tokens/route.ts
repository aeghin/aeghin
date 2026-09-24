import { Expo } from "expo-server-sdk";

import prisma from "@/lib/prisma";
import {
    clerkIdOf,
    fail,
    isObject,
    json,
    readJson,
    route,
} from "@/lib/mobile/route";

/** Real tokens run about 41 characters; the format check alone has no ceiling. */
const MAX_TOKEN_LENGTH = 200;

const tokenFrom = (body: unknown): string | null => {
    const token = isObject(body) ? body.token : null;

    return Expo.isExpoPushToken(token) && token.length <= MAX_TOKEN_LENGTH
        ? token
        : null;
};

/**
 * POST /api/mobile/v1/push-tokens { token }
 *
 * Registers this phone for the caller's notifications. Upserted on the token,
 * so a phone somebody else was signed in on moves to the caller instead of
 * ringing for both — and the app can safely repeat it on every launch.
 */
export const POST = route<Record<string, never>>("POST /push-tokens", async (req) => {
    const clerkId = await clerkIdOf();

    if (!clerkId) return fail(401, "Unauthorized");

    const token = tokenFrom(await readJson(req));

    if (!token) return fail(400, "Invalid push token");

    const user = await prisma.user.findUnique({
        where: { clerkId },
        select: { id: true },
    });

    if (!user) return fail(401, "Unauthorized");

    await prisma.pushToken.upsert({
        where: { token },
        update: { userId: user.id },
        create: { token, userId: user.id },
    });

    return json({ success: true });
});

/**
 * DELETE /api/mobile/v1/push-tokens { token }
 *
 * Stops a phone ringing once its owner signs out. Deliberately needs no
 * session: Clerk's sign-out ends it before the app hears about it, so the token
 * itself is the proof. Only that phone and this server know it, and all it can
 * do here is unregister that one phone.
 */
export const DELETE = route<Record<string, never>>("DELETE /push-tokens", async (req) => {
    const token = tokenFrom(await readJson(req));

    if (!token) return fail(400, "Invalid push token");

    await prisma.pushToken.deleteMany({ where: { token } });

    return json({ success: true });
});
