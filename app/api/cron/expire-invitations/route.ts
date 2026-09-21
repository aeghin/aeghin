import { timingSafeEqual } from "node:crypto";

import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import { InvitationStatus } from "@/generated/prisma/enums";
import { volunteerRoleLabels } from "@/lib/activity";
import EventInviteExpiredEmail, {
    type LapsedInvite,
} from "@/components/email/event-invite-expired-template";
import { formatEventWhen } from "@/lib/email/event-when";
import { organizationSender } from "@/lib/email/organization";
import {
    eventStaffingRecipients,
    inviteSenderRecipients,
    type EmailRecipient,
} from "@/lib/email/recipients";
import { sendEmailBatches } from "@/lib/email/send";

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

/**
 * How recently an invitation must have lapsed for anyone to be mailed about it.
 *
 * The sweep is the only writer of EXPIRED, so any interruption — a paused cron,
 * a rolled-back deploy, CRON_SECRET going missing — leaves lapses piling up as
 * PENDING, and the tick that resumes would mail every one of them at once.
 * SWEEP_LIMIT and `hasMore` exist because that backlog is expected to be
 * possible; this is the same guard applied to the mail.
 *
 * Comfortably wider than the hourly schedule, so an ordinary tick — where a
 * lapse is at most an hour old — never notices it. Older rows are still swept
 * and still turn EXPIRED in the UI; they just stop generating mail about a
 * deadline that passed long enough ago that nobody can act on it any faster
 * for having been told.
 */
const NOTIFY_WINDOW_HOURS = 6;

type NotifyResult = { emails: number; events: number };

/**
 * Tells whoever asked that an event invitation went unanswered.
 *
 * A decline already emails the person managing the event; a lapse left the
 * identical hole and told nobody. The `PENDING -> EXPIRED` transition is what
 * makes this safe to do from a cron with no extra state: a flipped row can
 * never be selected again, so nobody is mailed twice about the same invitation.
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

    // The rows the update actually flipped, not the ones it selected. Somebody
    // who accepted in the gap between the two falls out of `updateMany` but is
    // still in `staleAssignments` — mailing their admin that they never
    // answered would be plainly wrong. Cache tags can afford to over-fire
    // (above); email cannot.
    //
    // Restricted to events that have not happened yet — a past event is not
    // something anyone can go and staff — and to lapses inside
    // NOTIFY_WINDOW_HOURS, so a backlog is swept quietly rather than mailed.
    const lapsed = await prisma.eventAssignment.findMany({
        where: {
            id: { in: sweptIds },
            status: InvitationStatus.EXPIRED,
            event: { dates: { some: { endTime: { gte: now } } } },
            expiresAt: {
                gte: new Date(now.getTime() - NOTIFY_WINDOW_HOURS * 60 * 60 * 1000),
            },
        },
        select: {
            role: true,
            assignedById: true,
            organizationId: true,
            user: { select: { firstName: true, lastName: true } },
            event: {
                select: {
                    id: true,
                    name: true,
                    createdById: true,
                    dates: { select: { startTime: true, endTime: true } },
                },
            },
            organization: { select: { name: true, logoUrl: true } },
        },
    });

    if (lapsed.length === 0) return { emails: 0, events: 0 };

    // A role somebody has since accepted is not a gap. Two admins inviting two
    // pianists, or a smart-fill replacement that stuck, both end here — and
    // "needs a Pianist" about an event with a confirmed pianist is the kind of
    // wrong that stops people reading the mail.
    const staffed = await prisma.eventAssignment.groupBy({
        by: ["eventId", "role"],
        where: {
            eventId: { in: [...new Set(lapsed.map((row) => row.event.id))] },
            status: InvitationStatus.ACCEPTED,
        },
        _count: { _all: true },
    });

    const filled = new Set(staffed.map((row) => `${row.eventId}:${row.role}`));

    const open = lapsed.filter(
        (row) => !filled.has(`${row.event.id}:${row.role}`),
    );

    if (open.length === 0) return { emails: 0, events: 0 };

    // Matched as organization+user pairs, so a membership in a different
    // organization can never resolve a sender.
    const senderPairs = new Map(
        open
            .filter((row) => row.assignedById !== null)
            .map((row) => [
                `${row.organizationId}:${row.assignedById}`,
                {
                    organizationId: row.organizationId,
                    userId: row.assignedById as string,
                },
            ]),
    );

    const senders = await inviteSenderRecipients([...senderPairs.values()]);

    type Bucket = {
        recipient: EmailRecipient;
        organizationId: string;
        organizationName: string;
        logoUrl: string | null;
        eventId: string;
        eventName: string;
        dates: { startTime: Date; endTime: Date }[];
        lapsed: LapsedInvite[];
    };

    // One email per recipient per event: an admin who invited five people to
    // one event hears once, listing five roles, and hears only about the
    // invitations they sent.
    const buckets = new Map<string, Bucket>();
    const orphaned = new Map<string, typeof open>();

    const entryFor = (row: (typeof open)[number]): LapsedInvite => ({
        inviteeName: `${row.user.firstName} ${row.user.lastName}`,
        roleLabel: volunteerRoleLabels[row.role],
    });

    const add = (recipient: EmailRecipient, row: (typeof open)[number], entries: LapsedInvite[]) => {
        const key = `${row.event.id}:${recipient.email}`;
        const existing = buckets.get(key);

        if (existing) {
            existing.lapsed.push(...entries);
            return;
        }

        buckets.set(key, {
            recipient,
            organizationId: row.organizationId,
            organizationName: row.organization.name,
            logoUrl: row.organization.logoUrl,
            eventId: row.event.id,
            eventName: row.event.name,
            dates: row.event.dates,
            lapsed: [...entries],
        });
    };

    for (const row of open) {
        const sender = row.assignedById
            ? senders.get(`${row.organizationId}:${row.assignedById}`)
            : undefined;

        if (sender) {
            add(sender, row, [entryFor(row)]);
            continue;
        }

        const pending = orphaned.get(row.event.id) ?? [];
        pending.push(row);
        orphaned.set(row.event.id, pending);
    }

    // Sender deleted, gone from the organization, or demoted to MEMBER. Falls
    // through to the event's creator and then the owners, which is never an
    // empty list — so a lapsed invitation always reaches somebody who can act.
    // Merged into any bucket that already exists, so an owner who also sent one
    // of these gets a single email rather than two.
    for (const rows of orphaned.values()) {
        const recipients = await eventStaffingRecipients(
            rows[0].organizationId,
            rows[0].event.createdById,
        );

        const entries = rows.map(entryFor);

        for (const recipient of recipients) {
            add(recipient, rows[0], entries);
        }
    }

    const messages = [...buckets.values()].map((bucket) => {
        const when = formatEventWhen(bucket.dates);
        const roles = [...new Set(bucket.lapsed.map((item) => item.roleLabel))];

        return {
            from: organizationSender(bucket.organizationName),
            to: bucket.recipient.email,
            subject:
                roles.length === 1
                    ? `Needs a ${roles[0]}: ${bucket.eventName}`
                    : `Needs ${roles.length} roles filled: ${bucket.eventName}`,
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
        events: new Set([...buckets.values()].map((b) => b.eventId)).size,
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

        // After the tags, so cache correctness never waits on a mail provider,
        // and in its own try/catch: the sweep has committed, and a notifier
        // that throws must not report the whole run as failed.
        let notified: NotifyResult = { emails: 0, events: 0 };
        let notifyFailed = false;

        try {
            notified = await notifyLapsedAssignments(
                staleAssignments.map((row) => row.id),
                now,
            );
        } catch (err) {
            notifyFailed = true;
            console.error(
                "GET /api/cron/expire-invitations: notifying lapsed invitations failed —",
                err,
            );
        }

        return NextResponse.json({
            sweptAt: now.toISOString(),
            assignments: assignmentResult.count,
            invitations: invitationResult.count,
            tagsExpired: tags.size,
            notified: notified.emails,
            notifiedEvents: notified.events,
            notifyFailed,
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
