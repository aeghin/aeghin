import "server-only";

import prisma from "@/lib/prisma";
import { SMART_SCHEDULING_ENTITLEMENTS } from "@/lib/billing/entitlements";
import { formatEventShort } from "@/lib/email/event-when";
import {
  eventStaffingRecipients,
  type EmailRecipient,
} from "@/lib/email/recipients";
import {
  LAST_CALL_DAYS,
  lapseBuckets,
  lapseSubject,
  rosterGaps,
  type Lapse,
  type LapseBucket,
} from "@/lib/notifications/staffing";
import { sendPushNotices, type PushNotice } from "@/lib/push/send";
import {
  daysBefore,
  inZone,
  isDue,
  wakingNext,
  wakingSameDay,
  wallClock,
  zonesByEmail,
} from "@/lib/push/timing";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/**
 * How far ahead the last-call query looks: a day past the furthest check,
 * which covers every zone and the move into waking hours.
 */
const LAST_CALL_HORIZON_MS = (LAST_CALL_DAYS[0] + 1) * DAY_MS;

/** Events read per last-call query. Every page is read; this only bounds each. */
const LAST_CALL_PAGE = 200;

/**
 * How long a lapse can wait for its push: 9pm to the next 8am, plus a
 * daylight-saving hour and the cron's grace.
 */
const LAPSE_HOLD_MS = 16 * HOUR_MS;

/** How long a claim is kept — far past the longest any key can still come due. */
const CLAIM_TTL_MS = 7 * DAY_MS;

const firstStartOf = (dates: { startTime: Date }[]) =>
  new Date(Math.min(...dates.map((date) => date.startTime.getTime())));

/** Claims each key once, across ticks and overlapping runs; returns the ones this call won. */
async function claim(keys: string[]): Promise<Set<string>> {
  if (keys.length === 0) return new Set();

  const won = await prisma.pushClaim.createManyAndReturn({
    data: keys.map((key) => ({ key })),
    skipDuplicates: true,
    select: { key: true },
  });

  return new Set(won.map((row) => row.key));
}

/** Drops claims old enough that nothing can come due for them again. */
export async function forgetOldPushClaims(now: Date): Promise<number> {
  const { count } = await prisma.pushClaim.deleteMany({
    where: { createdAt: { lt: new Date(now.getTime() - CLAIM_TTL_MS) } },
  });

  return count;
}

/**
 * The last-call push — "Not fully staffed yet", three days and one day out —
 * timed for each manager instead of riding along with the email.
 *
 * The email goes when the cron reaches the mark on the event's floating clock,
 * which for a 9am service is 2am on the West Coast. Mail can wait for morning;
 * a phone ringing can't. So the push is planned on the manager's own clock:
 * the event's time of day, three days and one day before, kept inside 8am to
 * 8pm. Staffing is read when it goes, and each check is spent whatever it
 * finds, as the email's is: fully staffed then means no push for that check,
 * even if somebody drops out after — a dropout sends its own.
 *
 * Same gate as the email: Smart Scheduling plans only, and nothing about a
 * service made after the check's moment had passed. A manager whose phone
 * hasn't reported a zone gets the email alone.
 *
 * Returns how many were sent.
 */
export async function sendLastCallPushes(now: Date): Promise<number> {
  const recipientsByCreator = new Map<string, Promise<EmailRecipient[]>>();

  const recipientsFor = (organizationId: string, createdById: string | null) => {
    const key = `${organizationId}:${createdById ?? ""}`;
    let lookup = recipientsByCreator.get(key);

    if (!lookup) {
      lookup = eventStaffingRecipients(organizationId, createdById);
      recipientsByCreator.set(key, lookup);
    }

    return lookup;
  };

  let sent = 0;
  let after: string | undefined;

  for (;;) {
    const events = await prisma.event.findMany({
      where: {
        ...(after ? { id: { gt: after } } : {}),
        organization: { entitlements: { hasSome: SMART_SCHEDULING_ENTITLEMENTS } },
        rolesNeeded: { isEmpty: false },
        dates: {
          some: {
            startTime: {
              gt: now,
              lte: new Date(now.getTime() + LAST_CALL_HORIZON_MS),
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
        rolesNeeded: true,
        dates: { select: { startTime: true, endTime: true } },
        organization: { select: { name: true } },
        assignments: {
          select: {
            role: true,
            status: true,
            expiresAt: true,
            user: { select: { firstName: true, lastName: true } },
          },
        },
      },
      orderBy: { id: "asc" },
      take: LAST_CALL_PAGE,
    });

    if (events.length === 0) return sent;

    const recipients = await Promise.all(
      events.map((event) => recipientsFor(event.organizationId, event.createdById)),
    );

    const zones = await zonesByEmail(
      recipients.flat().map((recipient) => recipient.email),
    );

    const planned: { key: string; email: string; event: (typeof events)[number] }[] = [];

    events.forEach((event, index) => {
      if (event.dates.length === 0) return;

      const firstStart = firstStartOf(event.dates);

      for (const { email } of recipients[index]) {
        const timeZone = zones.get(email);

        if (!timeZone) continue;

        try {
          // Already under way: the bell and the lapse notices carry on without it.
          if (inZone(firstStart, timeZone).getTime() <= now.getTime()) continue;

          for (const days of LAST_CALL_DAYS) {
            const sendAt = inZone(wakingSameDay(daysBefore(firstStart, days)), timeZone);

            if (
              event.createdAt.getTime() <= sendAt.getTime() &&
              isDue(sendAt, now, timeZone)
            ) {
              planned.push({
                key: `last-call:${event.id}:${days}:${firstStart.getTime()}:${email}`,
                email,
                event,
              });
            }
          }
        } catch {
          // A zone this runtime can't resolve: no push, rather than no tick.
        }
      }
    });

    const won = await claim(planned.map((item) => item.key));

    const notices: PushNotice[] = planned.flatMap(({ key, email, event }) => {
      if (!won.has(key)) return [];

      const { fullyStaffed, unfilledRoles, waitingOn } = rosterGaps(event, now);

      if (fullyStaffed) return [];

      const missing = [
        unfilledRoles.length > 0 && `Open: ${unfilledRoles.join(", ")}`,
        waitingOn.length > 0 &&
          `Waiting on ${waitingOn.length === 1 ? "1 reply" : `${waitingOn.length} replies`}`,
      ].filter(Boolean);

      return [
        {
          email,
          title: `Not fully staffed yet: ${event.name}`,
          subtitle: event.organization.name,
          body: [formatEventShort(event.dates), missing.join(" · ")]
            .filter(Boolean)
            .join("\n"),
          data: {
            type: "event",
            organizationId: event.organizationId,
            eventId: event.id,
          },
        },
      ];
    });

    await sendPushNotices("last call", notices);

    sent += notices.length;

    if (events.length < LAST_CALL_PAGE) return sent;

    after = events[events.length - 1].id;
  }
}

/**
 * The push for a lapsed invitation, held for the manager's waking hours: at
 * once between 8am and 9pm on their phone, otherwise at 8am. The email still
 * goes when the sweep finds the lapse.
 *
 * Reads lapses back from `lapsedAt` rather than being handed them by the
 * sweep, so one held overnight is still there in the morning — and is read
 * against the roster as it is by then, so a role filled in the night isn't
 * pushed about. Each lapse is claimed per person, and whatever one person is
 * owed about one event goes as a single push.
 *
 * Returns how many were sent.
 */
export async function sendLapsePushes(now: Date): Promise<number> {
  const buckets = await lapseBuckets(
    { lapsedAt: { gt: new Date(now.getTime() - LAPSE_HOLD_MS), lte: now } },
    now,
  );

  if (buckets.length === 0) return 0;

  const zones = await zonesByEmail(buckets.map((bucket) => bucket.recipient.email));

  const planned: { key: string; bucket: LapseBucket; lapse: Lapse }[] = [];

  for (const bucket of buckets) {
    const timeZone = zones.get(bucket.recipient.email);

    if (!timeZone) continue;

    for (const lapse of bucket.lapsed) {
      if (!lapse.lapsedAt) continue;

      try {
        const sendAt = inZone(wakingNext(wallClock(lapse.lapsedAt, timeZone)), timeZone);

        if (isDue(sendAt, now, timeZone)) {
          planned.push({
            key: `lapsed:${lapse.assignmentId}:${lapse.lapsedAt.getTime()}:${bucket.recipient.email}`,
            bucket,
            lapse,
          });
        }
      } catch {
        // A zone this runtime can't resolve: no push, rather than no tick.
      }
    }
  }

  const won = await claim(planned.map((item) => item.key));

  const owed = new Map<LapseBucket, Lapse[]>();

  for (const { key, bucket, lapse } of planned) {
    if (!won.has(key)) continue;

    owed.set(bucket, [...(owed.get(bucket) ?? []), lapse]);
  }

  const notices: PushNotice[] = [...owed].map(([bucket, lapsed]) => ({
    email: bucket.recipient.email,
    title: lapseSubject(lapsed, bucket.eventName),
    subtitle: bucket.organizationName,
    body:
      lapsed.length === 1
        ? `${lapsed[0].inviteeName}'s invitation expired without an answer.`
        : `${lapsed.length} invitations expired without an answer.`,
    data: {
      type: "event",
      organizationId: bucket.organizationId,
      eventId: bucket.eventId,
    },
  }));

  await sendPushNotices("lapsed invitation", notices);

  return notices.length;
}
