import "server-only";

import prisma from "@/lib/prisma";
import { SMART_SCHEDULING_ENTITLEMENTS } from "@/lib/billing/entitlements";
import EventLastCallEmail from "@/components/email/event-last-call-template";
import { formatEventShort, formatEventWhen } from "@/lib/email/event-when";
import { organizationSender } from "@/lib/email/organization";
import { sendEmailBatches } from "@/lib/email/send";
import { eventAudience, reasonLine, type Addressee } from "@/lib/notifications/audience";
import { directoriesFor } from "@/lib/notifications/directory";
import {
  LAST_CALL_DAYS,
  lapseBody,
  lapseBuckets,
  lapseSubject,
  rosterGaps,
  type Lapse,
  type LapseBucket,
} from "@/lib/notifications/staffing";
import type { SendCount } from "@/lib/notifications/unanswered";
import { sendPushNotices, type PushNotice } from "@/lib/push/send";
import {
  daysBefore,
  inZone,
  isDue,
  isDueAt,
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
export async function claimOnce(keys: string[]): Promise<Set<string>> {
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
 * The last call — "Not fully staffed yet", three days and one day out — by
 * email and push together, timed for each manager.
 *
 * Planned on the manager's own clock: the event's time of day, three days and
 * one day before, kept inside 8am to 8pm in the zone their phone reports. The
 * email used to go on the event's floating clock instead, which put a 9am
 * service's at 4am in Chicago, hours ahead of its own push, and after the mark
 * east of UTC. A manager whose phone hasn't reported a zone gets the email
 * alone, at the floating mark, since there's no telling when their night is.
 *
 * Staffing is read when it goes, and each check is claimed per person and
 * spent whatever it finds: fully staffed then means nothing for that check,
 * even if somebody drops out after — a dropout sends its own.
 *
 * Smart Scheduling plans only, and nothing about a service made after the
 * check's moment had passed: whoever made a service for tomorrow knows it
 * isn't staffed yet. It goes to the event's owner — its creator, else the
 * owners. Team leads have already heard about each of their roles as it
 * opened up, so this is the backstop for them, not another alert.
 *
 * Returns how many of each were sent.
 */
export async function sendLastCalls(now: Date): Promise<SendCount> {
  const count: SendCount = { pushes: 0, emails: 0 };
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
      orderBy: { id: "asc" },
      take: LAST_CALL_PAGE,
    });

    if (events.length === 0) return count;

    const directoryFor = directoriesFor();

    const recipients = await Promise.all(
      events.map(async (event) => {
        const directory = await directoryFor(event.organizationId);

        if (!directory) return [];

        return eventAudience(directory, { createdById: event.createdById }).owners;
      }),
    );

    const zones = await zonesByEmail(
      recipients.flat().map(({ person }) => person.email),
    );

    const planned: {
      key: string;
      addressee: Addressee;
      timeZone: string | undefined;
      event: (typeof events)[number];
    }[] = [];

    events.forEach((event, index) => {
      if (event.dates.length === 0) return;

      const firstStart = firstStartOf(event.dates);

      for (const addressee of recipients[index]) {
        const { email } = addressee.person;
        const timeZone = zones.get(email);

        try {
          const start = timeZone ? inZone(firstStart, timeZone) : firstStart;

          // Already under way: the bell and the lapse notices carry on without it.
          if (start.getTime() <= now.getTime()) continue;

          for (const days of LAST_CALL_DAYS) {
            const sendAt = timeZone
              ? inZone(wakingSameDay(daysBefore(firstStart, days)), timeZone)
              : daysBefore(firstStart, days);

            const due = timeZone ? isDue(sendAt, now, timeZone) : isDueAt(sendAt, now);

            if (event.createdAt.getTime() <= sendAt.getTime() && due) {
              planned.push({
                key: `last-call:${event.id}:${days}:${firstStart.getTime()}:${email}`,
                addressee,
                timeZone,
                event,
              });
            }
          }
        } catch {
          // A zone this runtime can't resolve: nothing, rather than no tick.
        }
      }
    });

    const won = await claimOnce(planned.map((item) => item.key));

    const sending = planned.flatMap((item) => {
      if (!won.has(item.key)) return [];

      const gaps = rosterGaps(item.event, now);

      return gaps.fullyStaffed ? [] : [{ ...item, ...gaps }];
    });

    const emails = sending.map(({ addressee, event, unfilledRoles, waitingOn }) => {
      const when = formatEventWhen(event.dates);

      return {
        from: organizationSender(event.organization.name),
        to: addressee.person.email,
        subject: `Not fully staffed yet: ${event.name}`,
        react: EventLastCallEmail({
          recipientName: addressee.person.firstName,
          eventName: event.name,
          organizationName: event.organization.name,
          logoUrl: event.organization.logoUrl,
          unfilledRoles,
          waitingOn,
          eventDate: when?.date ?? null,
          eventTime: when?.time ?? null,
          viewLink: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/organizations/${event.organizationId}/events/${event.id}`,
          footer: reasonLine(addressee.reason, event.organization.name),
        }),
      };
    });

    const notices: PushNotice[] = sending
      .filter((item) => item.timeZone)
      .map(({ addressee, event, unfilledRoles, waitingOn }) => {
        const missing = [
          unfilledRoles.length > 0 && `Open: ${unfilledRoles.join(", ")}`,
          waitingOn.length > 0 &&
            `Waiting on ${waitingOn.length === 1 ? "1 reply" : `${waitingOn.length} replies`}`,
        ].filter(Boolean);

        return {
          email: addressee.person.email,
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
        };
      });

    await sendEmailBatches("last call", emails);
    await sendPushNotices("last call", notices);

    count.emails += emails.length;
    count.pushes += notices.length;

    if (events.length < LAST_CALL_PAGE) return count;

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

  const won = await claimOnce(planned.map((item) => item.key));

  const owed = new Map<LapseBucket, Lapse[]>();

  for (const { key, bucket, lapse } of planned) {
    if (!won.has(key)) continue;

    owed.set(bucket, [...(owed.get(bucket) ?? []), lapse]);
  }

  const notices: PushNotice[] = [...owed].map(([bucket, lapsed]) => {
    const subject = lapseSubject(lapsed, bucket.eventName);

    return {
      email: bucket.recipient.email,
      // A heads-up when none of what this push carries is theirs to act on —
      // judged on these lapses, not the bucket, since some may have gone out
      // on an earlier tick. The email's heading makes the same call.
      title: lapsed.every((lapse) => lapse.headsUp) ? `Heads-up: ${subject}` : subject,
      subtitle: bucket.organizationName,
      body: lapseBody(lapsed, formatEventShort(bucket.dates)),
      data: {
        type: "event",
        organizationId: bucket.organizationId,
        eventId: bucket.eventId,
      },
    };
  });

  await sendPushNotices("lapsed invitation", notices);

  return notices.length;
}
