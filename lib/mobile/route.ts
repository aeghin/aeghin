import "server-only";

import { auth } from "@clerk/nextjs/server";
import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import { OrgRole } from "@/generated/prisma/enums";
import { PLAN_LIMITS } from "@/lib/config/plans";

/**
 * Shared plumbing for `app/api/mobile/v1/*`.
 *
 * Every mobile response is `private, no-store`: React Native keeps an HTTP
 * cache below `fetch` keyed on URL rather than on the bearer token, so a
 * cached body could outlive a sign-out.
 */
export const NO_STORE = { "Cache-Control": "private, no-store" };

/**
 * Route-handler-safe cache expiry, for the server actions the routes reuse.
 *
 * `{ expire: 0 }`, not `"max"`. Every mobile write is followed within
 * milliseconds by the phone refetching the thing it just changed, and `"max"`
 * is a one-year stale window — so that refetch was *always* served the
 * pre-write cache entry while the revalidation ran behind it. The write landed
 * and the screen redrew as though it had not, which read as the write being
 * rejected. `updateTag` is the read-your-own-writes answer but throws outside
 * a Server Action, and `{ expire: 0 }` is what the docs point at for exactly
 * that case: the next read blocks on a real query instead of taking the stale
 * one. That read is ~25ms against Neon; a wrong answer is worse.
 */
export const expireTag = (tag: string) => {
    revalidateTag(tag, { expire: 0 });
};

export const json = <T>(body: T, status = 200) =>
    NextResponse.json(body, { status, headers: NO_STORE });

export const fail = (status: number, error: string) => json({ error }, status);

/**
 * The phone's wording for a plan-limit refusal. The actions end theirs with
 * "Upgrade to Premium…", which the iOS app can't say while it sells nothing
 * (Guideline 3.1.1), so it gets the rule alone. Only Free has caps.
 */
const LIMIT_MESSAGES: Record<"MEMBER_LIMIT" | "SONG_LIMIT", string> = {
    MEMBER_LIMIT: `Free organizations can have up to ${PLAN_LIMITS.free.members} members, including pending invites.`,
    SONG_LIMIT: `Free organizations can have up to ${PLAN_LIMITS.free.songs} songs in the library.`,
};

/** A plan-limit refusal, with `code` so the app can tell it from other conflicts. */
export const limitFailure = (code: "MEMBER_LIMIT" | "SONG_LIMIT") =>
    json({ error: LIMIT_MESSAGES[code], code }, 409);

/**
 * The monthly group-email allowance, which every plan has. Its action already
 * words the refusal without pointing at an upgrade, so the message passes
 * through as is.
 */
export const emailLimitFailure = (error: string) =>
    json({ error, code: "EMAIL_LIMIT" }, 409);

/** The verified Clerk id, or null when there is no session. */
export const clerkIdOf = async () => (await auth()).userId;

/**
 * The caller's membership in one organization, or null.
 *
 * The token carries a Clerk id and every action needs the database user id —
 * and belonging to the organization is the first thing that has to be true.
 */
export const membershipFor = (clerkId: string, orgId: string) =>
    prisma.membership.findFirst({
        where: { organizationId: orgId, user: { clerkId } },
        select: { userId: true, role: true },
    });

export const canManage = (role: OrgRole) =>
    role === OrgRole.OWNER || role === OrgRole.ADMIN;

/** A body that isn't JSON at all throws rather than returning null. */
export const readJson = (req: Request): Promise<unknown> =>
    req.json().catch(() => null);

export const isObject = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === "object";

/**
 * An action's `{ success: false, error }` as an HTTP status. The actions word
 * their refusals rather than code them, so this reads the wording: a
 * permission problem is a 403, everything else a 400 the app shows verbatim.
 */
export const actionFailure = (error: string) =>
    fail(/unauthori[sz]ed|insufficient|forbidden|reach out to/i.test(error) ? 403 : 400, error);

type Handler<P> = (req: Request, ctx: { params: Promise<P> }) => Promise<Response>;

/** Wraps a handler so an unexpected throw is logged and answered as a 500. */
export const route = <P>(label: string, handler: Handler<P>): Handler<P> =>
    async (req, ctx) => {
        try {
            return await handler(req, ctx);
        } catch (err) {
            console.error(`${label} failed`, err);
            return fail(500, "Internal Server Error");
        }
    };
