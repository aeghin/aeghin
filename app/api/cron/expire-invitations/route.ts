import { timingSafeEqual } from "node:crypto";

import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import { InvitationStatus } from "@/generated/prisma/enums";
import { SMART_SCHEDULING_ENTITLEMENTS } from "@/lib/billing/entitlements";
import EventInviteExpiredEmail from "@/components/email/event-invite-expired-template";
import EventLastCallEmail from "@/components/email/event-last-call-template";
import { formatEventWhen } from "@/lib/email/event-when";
import { organizationSender } from "@/lib/email/organization";
import { eventStaffingRecipients } from "@/lib/email/recipients";
import { sendEmailBatches } from "@/lib/email/send";
import {
    LAST_CALL_DAYS,
    lapseBuckets,
    lapseSubject,
    rosterGaps,
} from "@/lib/notifications/staffing";
import { syncEventNotifications } from "@/lib/notifications/sync";
import { sendDayBeforeReminders, sendExpiryNudges } from "@/lib/push/reminders";
import {
    forgetOldPushClaims,
    sendLapsePushes,
    sendLastCallPushes,
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

/**
 * Most events one tick will check. The window is three days wide and an event
 * is looked at twice in its life, so this only binds on a backlog.
 */
const LAST_CALL_LIMIT = 200;

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

        return {
            from: organizationSender(bucket.organizationName),
            to: bucket.recipient.email,
            subject: lapseSubject(bucket.lapsed, bucket.eventName),
            react: EventInviteExpiredEmail({
                recipientName: bucket.recipient.firstName,
                eventName: bucket.eventName,
                organizationName: bucket.organizationName,
                logoUrl: bucket.logoUrl,
                lapsed: bucket.lapsed,
                eventDate: when?.date ?? null,
                eventTime: when?.time ?? null,
                viewLink: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/organizations/${bucket.organizationId}/events/${bucket.eventId}`,
            }),
        };
    });

    await sendEmailBatches("expire-invitations lapsed", messages);

    return {
        emails: messages.length,
        events: new Set(buckets.map((bucket) => bucket.eventId)).size,
    };
};

/**
 * Tells whoever runs an event, about three days out and again about one day
 * out, that it isn't fully staffed — so nobody opens the roster the morning of
 * the service and finds the hole for the first time.
 *
 * "Fully staffed" is the bell's test: every role has somebody who accepted, and
 * nobody is still deciding. The email lists both halves of what is missing,
 * roles with nobody on them and invitations still unanswered, because an invite
 * sent the week of a service may not lapse until after it — and until then
 * nothing else would ever mention it.
 *
 * Each check is claimed on `lastCallStage` before anything is sent, so two
 * overlapping ticks cannot both mail it, and it runs once whatever it finds:
 * fully staffed at three days out means no three-day email at all, rather than
 * one the moment somebody drops out — a dropout sends its own.
 *
 * Event times are floating wall clock pinned to Z (see LIVE_GRACE_MS in
 * lib/notifications/sync.ts), so "three days before" is measured against a
 * start that reads several hours early for an organization west of UTC. The
 * email lands a few hours ahead of the mark rather than on it — fine for mail,
 * which waits to be read. The push can't wait like that, so it doesn't go from
 * here: `sendLastCallPushes` times it on each manager's own clock.
 */
const sendLastCalls = async (now: Date): Promise<NotifyResult> => {

    const events = await prisma.event.findMany({
        where: {
            // Part of Smart Scheduling, which Premium and Pro have and Free and
            // Starter don't. Filtered here rather than skipped below, so those
            // events never crowd the others out of the batch. Their stage is
            // left unclaimed, so an upgrade before the event still gets its email.
            organization: { entitlements: { hasSome: SMART_SCHEDULING_ENTITLEMENTS } },
            lastCallStage: { lt: LAST_CALL_DAYS.length },
            dates: {
                some: {
                    startTime: {
                        gt: now,
                        lte: new Date(now.getTime() + LAST_CALL_DAYS[0] * DAY_MS),
                    },
                },
            },
        },
        select: {
            id: true,
            name: true,
            organizationId: true,
            createdById: true,
            createdAt: true,
            lastCallStage: true,
            rolesNeeded: true,
            dates: { select: { startTime: true, endTime: true } },
            organization: { select: { name: true, logoUrl: true } },
            assignments: {
                select: {
                    role: true,
                    status: true,
                    expiresAt: true,
                    user: { select: { firstName: true, lastName: true } },
                },
            },
        },
        take: LAST_CALL_LIMIT,
    });

    const perEvent = await Promise.all(
        events.map(async (event) => {

            if (event.rolesNeeded.length === 0 || event.dates.length === 0) return [];

            const firstStart = Math.min(
                ...event.dates.map((date) => date.startTime.getTime()),
            );

            // Already underway. The bell and the lapse mail are still running;
            // a heads-up now would only be noise.
            if (firstStart <= now.getTime()) return [];

            // The furthest-along check whose moment has passed. An event first
            // seen inside one day gets the one-day email only, not both at once.
            let stage = 0;

            LAST_CALL_DAYS.forEach((days, index) => {
                if (now.getTime() >= firstStart - days * DAY_MS) stage = index + 1;
            });

            if (stage <= event.lastCallStage) return [];

            const { count } = await prisma.event.updateMany({
                where: { id: event.id, lastCallStage: { lt: stage } },
                data: { lastCallStage: stage },
            });

            if (count === 0) return [];

            // Created after this check's moment had already passed: whoever made
            // a service for tomorrow knows it isn't staffed yet. The stage stays
            // claimed, so the check is spent rather than retried every hour.
            const dueAt = firstStart - LAST_CALL_DAYS[stage - 1] * DAY_MS;

            if (event.createdAt.getTime() > dueAt) return [];

            const { fullyStaffed, unfilledRoles, waitingOn } = rosterGaps(event, now);

            if (fullyStaffed) return [];

            const recipients = await eventStaffingRecipients(
                event.organizationId,
                event.createdById,
            );

            const when = formatEventWhen(event.dates);

            return recipients.map((recipient) => ({
                from: organizationSender(event.organization.name),
                to: recipient.email,
                subject: `Not fully staffed yet: ${event.name}`,
                react: EventLastCallEmail({
                    recipientName: recipient.firstName,
                    eventName: event.name,
                    organizationName: event.organization.name,
                    logoUrl: event.organization.logoUrl,
                    unfilledRoles,
                    waitingOn,
                    eventDate: when?.date ?? null,
                    eventTime: when?.time ?? null,
                    viewLink: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/organizations/${event.organizationId}/events/${event.id}`,
                }),
            }));
        }),
    );

    const messages = perEvent.flat();

    await sendEmailBatches("expire-invitations last call", messages);

    return {
        emails: messages.length,
        events: perEvent.filter((batch) => batch.length > 0).length,
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

        // The pre-event staffing check, in its own try/catch for the same reason.
        let lastCall: NotifyResult = { emails: 0, events: 0 };
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
            lastCall: sendLastCallPushes,
            lapsed: sendLapsePushes,
            reminders: sendDayBeforeReminders,
            nudges: sendExpiryNudges,
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

        try {
            await forgetOldPushClaims(now);
        } catch (err) {
            console.error(
                "GET /api/cron/expire-invitations: clearing old push claims failed —",
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
        // take the rest down.
        for (let i = 0; i < toReconcile.length; i += 10) {
            await Promise.all(
                toReconcile
                    .slice(i, i + 10)
                    .map((eventId) => syncEventNotifications(eventId, expireTag)),
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
            lastCall: lastCall.emails,
            lastCallEvents: lastCall.events,
            lastCallFailed,
            pushed,
            pushesFailed,
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
