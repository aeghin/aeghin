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

/** The longest IANA names run about 30 characters. */
const MAX_TIME_ZONE_LENGTH = 64;

const tokenFrom = (body: unknown): string | null => {
    const token = isObject(body) ? body.token : null;

    return Expo.isExpoPushToken(token) && token.length <= MAX_TOKEN_LENGTH
        ? token
        : null;
};

/** A zone this server's `Intl` can resolve, or null — never one it would throw on later. */
const timeZoneFrom = (body: unknown): string | null => {
    const timeZone = isObject(body) ? body.timeZone : null;

    if (typeof timeZone !== "string" || timeZone.length > MAX_TIME_ZONE_LENGTH) return null;

    try {
        new Intl.DateTimeFormat("en-US", { timeZone });
        return timeZone;
    } catch {
        return null;
    }
};

/**
 * POST /api/mobile/v1/push-tokens { token, timeZone? }
 *
 * Registers this phone for the caller's notifications. Upserted on the token,
 * so a phone somebody else was signed in on moves to the caller instead of
 * ringing for both — and the app can safely repeat it on every launch.
 *
 * `timeZone` is the phone's own zone, which is what times the day-before
 * reminder. Optional because older builds don't send it; a missing or unknown
 * one leaves whatever was stored before.
 */
export const POST = route<Record<string, never>>("POST /push-tokens", async (req) => {
    const clerkId = await clerkIdOf();

    if (!clerkId) return fail(401, "Unauthorized");

    const body = await readJson(req);
    const token = tokenFrom(body);

    if (!token) return fail(400, "Invalid push token");

    const timeZone = timeZoneFrom(body);

    const user = await prisma.user.findUnique({
        where: { clerkId },
        select: { id: true },
    });

    if (!user) return fail(401, "Unauthorized");

    await prisma.pushToken.upsert({
        where: { token },
        update: { userId: user.id, timeZone: timeZone ?? undefined },
        create: { token, userId: user.id, timeZone },
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
