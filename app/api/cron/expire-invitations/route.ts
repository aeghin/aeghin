import { timingSafeEqual } from "node:crypto";

import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import { InvitationStatus } from "@/generated/prisma/enums";
import EventInviteExpiredEmail from "@/components/email/event-invite-expired-template";
import { formatEventWhen } from "@/lib/email/event-when";
import { organizationSender } from "@/lib/email/organization";
import { sendEmailBatches } from "@/lib/email/send";
import type { BellDirectories } from "@/lib/notifications/directory";
import { lapseBuckets, lapseSubject } from "@/lib/notifications/staffing";
import { syncEventNotifications } from "@/lib/notifications/sync";
import {
    sendAnswerReminders,
    sendClosedInviteNotices,
    sendNoAnswerAlerts,
    type SendCount,
} from "@/lib/notifications/unanswered";
import { sendDayBeforeReminders } from "@/lib/push/reminders";
import { checkPushReceipts } from "@/lib/push/send";
import {
    forgetOldPushClaims,
    sendLapsePushes,
    sendLastCalls,
} from "@/lib/push/staffing";

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
 * Seconds this tick may run for. 60 is the ceiling every Vercel plan allows, so
 * it is safe to deploy anywhere; raise it if this project is on a plan with a
 * larger budget. Without it the route takes the platform default, which is well
 * under what a backlog sweep plus its follow-up work can need.
 */
export const maxDuration = 60;

/**
 * Most events one tick will reconcile notifications for.
 *
 * The set is every event near enough in time to matter, plus whatever the sweep
 * touched and whatever already holds rows, so in a busy season it is not small.
 * It is taken soonest first, so when this binds it is the far-future events
 * that wait — and those are kept right by the roster actions anyway, each of
 * which reconciles its own event. At ~120ms a reconcile, ten at a time, the
 * whole cap is a few seconds.
 */
const RECONCILE_LIMIT = 300;

const DAY_MS = 24 * 60 * 60 * 1000;

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

type NotifyResult = { emails: number; events: number };

/**
 * Emails whoever asked that an event invitation went unanswered.
 *
 * A decline already emails the person managing the event; a lapse left the
 * identical hole and told nobody. The `PENDING -> EXPIRED` transition is what
 * makes this safe to do from a cron with no extra state: a flipped row can
 * never be selected again, so nobody is mailed twice about the same invitation.
 * Who hears, and about what, is `lapseBuckets`, shared with the push that
 * `sendLapsePushes` holds for the manager's waking hours.
 *
 * Best effort by construction. The rows are already committed as `EXPIRED`
 * before this runs, so a send that fails is never retried — `sendEmailBatches`
 * logs it, and the counts returned here surface in the cron's own response.
 * The alternative, mailing before the flip, double-mails on any retry.
 */
const notifyLapsedAssignments = async (
    sweptIds: string[],
    now: Date,
): Promise<NotifyResult> => {

    if (sweptIds.length === 0) return { emails: 0, events: 0 };

    // The rows the update actually flipped, not the ones it selected.
    const buckets = await lapseBuckets({ id: { in: sweptIds } }, now);

    const messages = buckets.map((bucket) => {
        const when = formatEventWhen(bucket.dates);
        const subject = lapseSubject(bucket.lapsed, bucket.eventName);

        return {
            from: organizationSender(bucket.organizationName),
            to: bucket.recipient.email,
            subject: bucket.owns ? subject : `Heads-up: ${subject}`,
            react: EventInviteExpiredEmail({
                recipientName: bucket.recipient.firstName,
                eventName: bucket.eventName,
                organizationName: bucket.organizationName,
                logoUrl: bucket.logoUrl,
                lapsed: bucket.lapsed,
                eventDate: when?.date ?? null,
                eventTime: when?.time ?? null,
                viewLink: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/organizations/${bucket.organizationId}/events/${bucket.eventId}`,
                footer: bucket.footer,
            }),
        };
    });

    await sendEmailBatches("expire-invitations lapsed", messages);

    return {
        emails: messages.length,
        events: new Set(buckets.map((bucket) => bucket.eventId)).size,
    };
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

        // The rows this actually flipped, not the ones selected a moment
        // earlier. Re-asserting the predicate closes the gap between the two:
        // somebody who accepted in between is no longer PENDING, so their row
        // falls out of the update rather than being overwritten. And because
        // `PENDING -> EXPIRED` is exclusive at the database, a row comes back to
        // exactly one caller — so two overlapping ticks cannot both mail it.
        //
        // The select above stays regardless: the tags below want every row the
        // sweep considered, not only the ones it flipped.
        const flippedAssignments =
            staleAssignments.length > 0
                ? await prisma.eventAssignment.updateManyAndReturn({
                    where: {
                        id: { in: staleAssignments.map((row) => row.id) },
                        status: InvitationStatus.PENDING,
                        expiresAt: { lt: now },
                    },
                    // `lapsedAt` is what the push reads back, if it waits for morning.
                    data: { status: InvitationStatus.EXPIRED, lapsedAt: now },
                    select: { id: true },
                })
                : [];

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

        // After the tags, so cache correctness never waits on a mail provider,
        // and in its own try/catch: the sweep has committed, and a notifier
        // that throws must not report the whole run as failed.
        let notified: NotifyResult = { emails: 0, events: 0 };
        let notifyFailed = false;

        try {
            notified = await notifyLapsedAssignments(
                flippedAssignments.map((row) => row.id),
                now,
            );
        } catch (err) {
            notifyFailed = true;
            console.error(
                "GET /api/cron/expire-invitations: notifying lapsed invitations failed —",
                err,
            );
        }

        // The pre-event staffing check, in its own try/catch for the same
        // reason. Email and push go together, timed on each manager's clock
        // (lib/push/staffing.ts).
        let lastCall: SendCount = { pushes: 0, emails: 0 };
        let lastCallFailed = false;

        try {
            lastCall = await sendLastCalls(now);
        } catch (err) {
            lastCallFailed = true;
            console.error(
                "GET /api/cron/expire-invitations: last-call check failed —",
                err,
            );
        }

        // The pushes this cron schedules itself. Each is timed on its
        // recipient's own clock and only rings between 8am and 9pm there
        // (lib/push/timing.ts), so none of them wake anybody; each claims what
        // it sends first, so a slow tick overlapping the next can't double it.
        // After the sweep, so a lapse it just found in waking hours goes now.
        const pushPasses = {
            lapsed: sendLapsePushes,
            reminders: sendDayBeforeReminders,
        };

        const pushed: Partial<Record<keyof typeof pushPasses, number>> = {};
        const pushesFailed: string[] = [];

        for (const [name, send] of Object.entries(pushPasses)) {
            try {
                pushed[name as keyof typeof pushPasses] = await send(now);
            } catch (err) {
                pushesFailed.push(name);
                console.error(
                    `GET /api/cron/expire-invitations: ${name} pushes failed —`,
                    err,
                );
            }
        }

        // An unanswered invitation, from both ends: the invitee's reminders,
        // the managers' "no answer yet" the day before it closes, and the
        // invitee's notice once it has. Email and push go together, timed
        // like the pushes above (lib/notifications/unanswered.ts). After the
        // sweep, so an invitation it just closed is told about now.
        const answerPasses = {
            reminders: sendAnswerReminders,
            noAnswer: sendNoAnswerAlerts,
            closed: sendClosedInviteNotices,
        };

        const unanswered: Partial<Record<keyof typeof answerPasses, SendCount>> = {};
        const unansweredFailed: string[] = [];

        for (const [name, send] of Object.entries(answerPasses)) {
            try {
                unanswered[name as keyof typeof answerPasses] = await send(now);
            } catch (err) {
                unansweredFailed.push(name);
                console.error(
                    `GET /api/cron/expire-invitations: ${name} notices failed —`,
                    err,
                );
            }
        }

        try {
            await forgetOldPushClaims(now);
        } catch (err) {
            console.error(
                "GET /api/cron/expire-invitations: clearing old push claims failed —",
                err,
            );
        }

        // Whether Apple and Google delivered what Expo accepted. `failed`
        // above zero is the first sign of a bad APNs key or FCM credential,
        // which nothing else would ever report.
        let receipts: { read: number; failed: number } | null = null;

        try {
            receipts = await checkPushReceipts(now);
        } catch (err) {
            console.error(
                "GET /api/cron/expire-invitations: reading push receipts failed —",
                err,
            );
        }

        // The bell, last. It is the one piece of this tick that can afford to be
        // late: a reconcile is idempotent and the next tick heals whatever this
        // one misses, where the mail above cannot be retried — those rows are
        // EXPIRED now and never selected again. So if anything here runs long,
        // it is the bell that waits, not the mail.
        //
        // Three sets, deduped, most urgent first:
        //
        //   - the sweep's own events, whose counts just moved;
        //   - events near enough in time to matter, soonest first, which is how
        //     the bell fills after a deploy without a backfill, and how an event
        //     that has simply finished gets its rows retired;
        //   - events that still hold rows, which catches anything the horizon
        //     missed — rows on a service further back than it, say, after the
        //     cron has been down.
        const horizon = new Date(now.getTime() - 2 * DAY_MS);

        const [upcomingDates, rowHolders] = await Promise.all([
            // Several blocks per event are possible, hence the headroom before
            // deduping down to events.
            prisma.eventDate.findMany({
                where: { endTime: { gte: horizon } },
                orderBy: { startTime: "asc" },
                select: { eventId: true },
                take: RECONCILE_LIMIT * 2,
            }),
            // Grouped in SQL. `distinct` would read every row and dedupe in
            // memory.
            prisma.notification.groupBy({
                by: ["eventId"],
                orderBy: { eventId: "asc" },
                take: RECONCILE_LIMIT,
            }),
        ]);

        const eventIds = [
            ...new Set([
                ...staleAssignments.map((row) => row.eventId),
                ...upcomingDates.map((row) => row.eventId),
                ...rowHolders.map((row) => row.eventId),
            ]),
        ];

        const toReconcile = eventIds.slice(0, RECONCILE_LIMIT);
        const reconcileSkipped = eventIds.length - toReconcile.length;

        if (reconcileSkipped > 0) {
            console.warn(
                `GET /api/cron/expire-invitations: reconcile capped at ${RECONCILE_LIMIT}; ${reconcileSkipped} event(s) left for their next roster change.`,
            );
        }

        // Bounded batches, so a backlog cannot turn into hundreds of round trips
        // at once. Each call swallows its own failures, so one bad event cannot
        // take the rest down. Events of one organization share one read of
        // who runs its teams.
        const directories: BellDirectories = new Map();

        for (let i = 0; i < toReconcile.length; i += 10) {
            await Promise.all(
                toReconcile
                    .slice(i, i + 10)
                    .map((eventId) => syncEventNotifications(eventId, expireTag, directories)),
            );
        }

        return NextResponse.json({
            sweptAt: now.toISOString(),
            assignments: flippedAssignments.length,
            invitations: invitationResult.count,
            tagsExpired: tags.size,
            notified: notified.emails,
            notifiedEvents: notified.events,
            notifyFailed,
            lastCall,
            lastCallFailed,
            pushed,
            pushesFailed,
            unanswered,
            unansweredFailed,
            receipts,
            reconciled: toReconcile.length,
            reconcileSkipped,
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
