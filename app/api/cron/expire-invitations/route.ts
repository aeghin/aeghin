import { timingSafeEqual } from "node:crypto";

import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import { InvitationStatus } from "@/generated/prisma/enums";

/**
 * Hourly sweep that turns lapsed invitations into `EXPIRED` rows.
 *
 * Expiry used to be derived at every read site, which meant a dozen places
 * each comparing `expiresAt` to their own idea of "now" — and disagreeing. The
 * roster rendered a three-week-dead invite as live amber "Pending", the org
 * card counted lapsed invites forever, and the events dashboard compared
 * against local midnight so it kept offering Accept for up to a day after the
 * server had stopped honouring it. Storing the transition collapses all of
 * that into one status the display layer already knows how to render.
 *
 * This is deliberately the *only* writer of `EXPIRED`. Nothing about a lapse is
 * logged to the activity feed: an invitation nobody answered is an absence of
 * an event, and the feed already reads as noise when it narrates non-actions.
 *
 * Being a cron makes it eventually consistent, so it is not the correctness
 * boundary — `acceptEventInvitation` and `declineEventInvitation` still check
 * `expiresAt` themselves for the window between a lapse and the next tick.
 */

/**
 * Rows per table per run.
 *
 * The first tick backfills every invitation that has ever lapsed, which is
 * unbounded in a way the steady state never is. A cap keeps that first run
 * inside the function's timeout; `hasMore` in the response says whether the
 * next hour still has work, so a backlog is visible rather than silent.
 */
const SWEEP_LIMIT = 2000;

/**
 * Vercel Cron sends `Authorization: Bearer $CRON_SECRET` on every invocation
 * once that variable is set on the project. Compared in constant time because
 * this is a bearer token on a public path — the route is outside `proxy.ts`'s
 * matcher, so Clerk never sees it and this check is the only gate.
 */
const authorized = (req: Request) => {
    const secret = process.env.CRON_SECRET;

    if (!secret) {
        // Fail closed, but loudly: a 401 with no explanation on a cron that has
        // simply never been configured is a miserable thing to debug.
        console.error(
            "GET /api/cron/expire-invitations: CRON_SECRET is not set — refusing every caller.",
        );
        return false;
    }

    const header = req.headers.get("authorization");

    if (!header) return false;

    const expected = Buffer.from(`Bearer ${secret}`);
    const actual = Buffer.from(header);

    // timingSafeEqual throws on a length mismatch, so the lengths are compared
    // first. That leaks the token's length and nothing else.
    return expected.length === actual.length && timingSafeEqual(expected, actual);
};

/**
 * `{ expire: 0 }` rather than `"max"`, for the reason `lib/mobile/route.ts`
 * spells out and the docs point at for external callers.
 *
 * `"max"` is stale-while-revalidate: the first visitor after a sweep would be
 * served the pre-sweep entry and see the lapsed invite still sitting there as
 * "Pending" — which is the exact bug this route exists to fix. `{ expire: 0 }`
 * makes that next read a blocking query instead. Nobody is waiting on this the
 * way the phone waits on a write, so the cost is one ~25ms query per tag,
 * spread over whenever someone actually opens the page.
 */
const expireTag = (tag: string) => {
    revalidateTag(tag, { expire: 0 });
};

export async function GET(req: Request) {

    if (!authorized(req)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {

        // One timestamp for the whole sweep, reused by the update guards below
        // so a row cannot be selected under one "now" and updated under another.
        const now = new Date();

        const staleAssignments = await prisma.eventAssignment.findMany({
            where: {
                status: InvitationStatus.PENDING,
                expiresAt: { lt: now },
            },
            select: {
                id: true,
                userId: true,
                eventId: true,
                organizationId: true,
            },
            take: SWEEP_LIMIT,
        });

        const staleInvitations = await prisma.invitation.findMany({
            where: {
                status: InvitationStatus.PENDING,
                expiresAt: { lt: now },
            },
            select: {
                id: true,
                organizationId: true,
            },
            take: SWEEP_LIMIT,
        });

        // `updateMany` reports a count but not which rows it touched, hence the
        // select above. Re-asserting the predicate here closes the gap between
        // the two: somebody who accepted in between is no longer PENDING, so
        // their row falls out of the update rather than being overwritten.
        const assignmentResult =
            staleAssignments.length > 0
                ? await prisma.eventAssignment.updateMany({
                    where: {
                        id: { in: staleAssignments.map((row) => row.id) },
                        status: InvitationStatus.PENDING,
                        expiresAt: { lt: now },
                    },
                    data: { status: InvitationStatus.EXPIRED },
                })
                : { count: 0 };

        const invitationResult =
            staleInvitations.length > 0
                ? await prisma.invitation.updateMany({
                    where: {
                        id: { in: staleInvitations.map((row) => row.id) },
                        status: InvitationStatus.PENDING,
                        expiresAt: { lt: now },
                    },
                    data: { status: InvitationStatus.EXPIRED },
                })
                : { count: 0 };

        // Tags are collected from the selected rows rather than the updated
        // ones, so a row that slipped out of the update gets its cache cleared
        // anyway. Over-invalidating is a wasted query; under-invalidating is
        // the bug. Deduped because one event, org or member usually accounts
        // for several rows.
        const tags = new Set<string>();

        for (const row of staleAssignments) {
            tags.add(`user-${row.userId}-events-${row.organizationId}`);
            tags.add(`event-${row.eventId}-org-${row.organizationId}-details`);
            tags.add(`org-${row.organizationId}-events`);
        }

        for (const row of staleInvitations) {
            tags.add(`invitations-${row.organizationId}-list`);
            // The org card's "N pending" badge is a `_count` inside
            // getUserOrganizations, which tags every org it returns with
            // `org-<id>-list-entry` — so one tag per org clears it for every
            // member, rather than a fan-out over each of them.
            tags.add(`org-${row.organizationId}-list-entry`);
        }

        for (const tag of tags) {
            expireTag(tag);
        }

        // Acceptance stats are deliberately absent: lib/services/member.ts
        // counts only ACCEPTED and DECLINED, so a lapse moves neither the
        // numerator nor the denominator and the tag would be noise.

        return NextResponse.json({
            sweptAt: now.toISOString(),
            assignments: assignmentResult.count,
            invitations: invitationResult.count,
            tagsExpired: tags.size,
            // A full page on either table means there is very likely more
            // behind it; the next tick picks it up.
            hasMore:
                staleAssignments.length === SWEEP_LIMIT ||
                staleInvitations.length === SWEEP_LIMIT,
        });

    } catch (err) {

        console.error("GET /api/cron/expire-invitations failed —", err);

        return NextResponse.json(
            { error: "Sweep failed" },
            { status: 500 },
        );

    }
}
