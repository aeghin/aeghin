import "server-only";

import prisma from "@/lib/prisma";
import { InvitationStatus } from "@/generated/prisma/enums";
import { volunteerRoleLabels } from "@/lib/activity";
import { formatEventShort, formatRehearsal } from "@/lib/email/event-when";
import { sendPushNotices, type PushNotice } from "@/lib/push/send";
import {
  daysBefore,
  inZone,
  isDue,
  wakingSameDay,
  wallClock,
  zonesByEmail,
} from "@/lib/push/timing";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/**
 * How far ahead the reminder query looks. Wide enough for every zone and for
 * the move into waking hours; the exact test is made per person.
 */
const REMINDER_HORIZON_MS = 2 * DAY_MS;

/**
 * The deadlines the nudge query looks at. A nudge is planned a day before the
 * deadline and moved into waking hours, which leaves it 16 to 28 hours out;
 * this is a little wider, for zones and daylight saving.
 */
const NUDGE_DEADLINE_FROM_MS = 12 * HOUR_MS;
const NUDGE_DEADLINE_UNTIL_MS = 30 * HOUR_MS;

/**
 * The least time an invitation must have had before its nudge, so one sent
 * with barely a day to run — a smart-fill replacement inheriting a close
 * deadline — isn't nudged in the same breath it arrived.
 */
const NUDGE_MIN_AGE_MS = 12 * HOUR_MS;

/** Reminder candidates read per query. Every page is read; this only bounds each. */
const REMINDER_PAGE = 500;

/**
 * Most nudges one tick will look at. Only binds on a backlog: the window holds
 * just the invitations coming due, and whatever it leaves waits for the next tick.
 */
const NUDGE_LIMIT = 1000;

const firstStartOf = (dates: { startTime: Date }[]) =>
  new Date(Math.min(...dates.map((date) => date.startTime.getTime())));

/**
 * Reminds everybody who accepted an event, the day before its first block:
 * "Tomorrow: Sunday Service".
 *
 * At the event's own time of day, on each person's phone: a 9am service
 * reminds at 9am the day before, wherever the church is. Kept inside 8am to
 * 8pm — a 6am service reminds at 8am, an 11pm one at 8pm — and always on the
 * day before, so "Tomorrow" stays true. Somebody whose phone hasn't reported a
 * zone (a build older than this) isn't reminded, rather than reminded at
 * whatever hour UTC lands on.
 *
 * Claimed on `reminderSentAt` before sending, so overlapping ticks can't both
 * send it, and sent once per schedule: moving the event clears the claim. One
 * that came due too long ago is skipped rather than sent late, which also
 * covers accepting within the day — they know it's tomorrow.
 *
 * Paged rather than capped: the window holds every accepted spot for the next
 * two days, most not due yet, and a cap would let those crowd out the ones
 * that are.
 *
 * Returns how many were sent.
 */
export async function sendDayBeforeReminders(now: Date): Promise<number> {
  let sent = 0;
  let after: string | undefined;

  for (;;) {
    const rows = await prisma.eventAssignment.findMany({
      where: {
        ...(after ? { id: { gt: after } } : {}),
        status: InvitationStatus.ACCEPTED,
        reminderSentAt: null,
        event: {
          dates: {
            some: {
              startTime: {
                gt: now,
                lte: new Date(now.getTime() + REMINDER_HORIZON_MS),
              },
            },
          },
        },
      },
      select: {
        id: true,
        role: true,
        user: { select: { email: true } },
        event: {
          select: {
            id: true,
            name: true,
            location: true,
            organizationId: true,
            rehearsalStart: true,
            rehearsalEnd: true,
            dates: { select: { startTime: true, endTime: true } },
            organization: { select: { name: true } },
          },
        },
      },
      orderBy: { id: "asc" },
      take: REMINDER_PAGE,
    });

    if (rows.length === 0) return sent;

    const zones = await zonesByEmail(rows.map((row) => row.user.email));

    const due = rows.flatMap((row) => {
      const timeZone = zones.get(row.user.email);

      if (!timeZone || row.event.dates.length === 0) return [];

      try {
        const sendAt = inZone(
          wakingSameDay(daysBefore(firstStartOf(row.event.dates), 1)),
          timeZone,
        );

        return isDue(sendAt, now, timeZone) ? [{ ...row, timeZone }] : [];
      } catch {
        // A zone this runtime can't resolve: no reminder, rather than no tick.
        return [];
      }
    });

    if (due.length > 0) {
      const claimed = await prisma.eventAssignment.updateManyAndReturn({
        where: {
          id: { in: due.map((row) => row.id) },
          status: InvitationStatus.ACCEPTED,
          reminderSentAt: null,
        },
        data: { reminderSentAt: now },
        select: { id: true },
      });

      const claimedIds = new Set(claimed.map((row) => row.id));

      const notices: PushNotice[] = due
        .filter((row) => claimedIds.has(row.id))
        .map(({ event, role, user, timeZone }) => {
          // Only a rehearsal still ahead: most are days earlier, and done by now.
          const rehearsal =
            event.rehearsalStart &&
            inZone(event.rehearsalStart, timeZone).getTime() > now.getTime()
              ? formatRehearsal(event.rehearsalStart, event.rehearsalEnd)
              : null;

          return {
            email: user.email,
            title: `Tomorrow: ${event.name}`,
            subtitle: event.organization.name,
            body: [
              [volunteerRoleLabels[role], formatEventShort(event.dates)]
                .filter(Boolean)
                .join(" · "),
              rehearsal && `Rehearsal ${rehearsal}`,
              event.location,
            ]
              .filter(Boolean)
              .join("\n"),
            data: {
              type: "event",
              organizationId: event.organizationId,
              eventId: event.id,
            },
          };
        });

      await sendPushNotices("day-before reminder", notices);

      sent += notices.length;
    }

    if (rows.length < REMINDER_PAGE) return sent;

    after = rows[rows.length - 1].id;
  }
}

/**
 * Nudges whoever is still sitting on an event invitation, a day before it
 * lapses: "Still need your answer: Sunday Service".
 *
 * Planned 24 hours before the deadline on the invitee's own clock and kept
 * inside 8am to 8pm, so an invitation sent at 11pm is nudged at 8pm, not 11.
 * The push names the deadline itself, in their zone, since the move can put it
 * anywhere from 16 to 28 hours away. No zone, no nudge, as with reminders.
 *
 * Skipped for one that hasn't had `NUDGE_MIN_AGE_MS` to be answered, and for
 * an event already under way, which the Pending list no longer shows. Claimed
 * on `nudgedAt`, which a re-invite clears: a new window earns its own.
 *
 * Returns how many were sent.
 */
export async function sendExpiryNudges(now: Date): Promise<number> {
  const rows = await prisma.eventAssignment.findMany({
    where: {
      status: InvitationStatus.PENDING,
      nudgedAt: null,
      expiresAt: {
        gt: new Date(now.getTime() + NUDGE_DEADLINE_FROM_MS),
        lte: new Date(now.getTime() + NUDGE_DEADLINE_UNTIL_MS),
      },
    },
    select: {
      id: true,
      role: true,
      createdAt: true,
      expiresAt: true,
      user: { select: { email: true } },
      event: {
        select: {
          id: true,
          name: true,
          organizationId: true,
          dates: { select: { startTime: true, endTime: true } },
          organization: { select: { name: true } },
        },
      },
    },
    take: NUDGE_LIMIT,
  });

  if (rows.length === 0) return 0;

  const zones = await zonesByEmail(rows.map((row) => row.user.email));

  const due = rows.flatMap((row) => {
    const timeZone = zones.get(row.user.email);

    if (
      !timeZone ||
      row.event.dates.length === 0 ||
      firstStartOf(row.event.dates).getTime() <= now.getTime()
    ) {
      return [];
    }

    try {
      const sendAt = inZone(
        wakingSameDay(
          wallClock(new Date(row.expiresAt.getTime() - DAY_MS), timeZone),
        ),
        timeZone,
      );

      return isDue(sendAt, now, timeZone) &&
        sendAt.getTime() - row.createdAt.getTime() >= NUDGE_MIN_AGE_MS
        ? [{ ...row, timeZone }]
        : [];
    } catch {
      return [];
    }
  });

  if (due.length === 0) return 0;

  const claimed = await prisma.eventAssignment.updateManyAndReturn({
    where: {
      id: { in: due.map((row) => row.id) },
      status: InvitationStatus.PENDING,
      nudgedAt: null,
      expiresAt: { gt: now },
    },
    data: { nudgedAt: now },
    select: { id: true },
  });

  const claimedIds = new Set(claimed.map((row) => row.id));

  const notices: PushNotice[] = due
    .filter((row) => claimedIds.has(row.id))
    .map(({ event, role, user, expiresAt, timeZone }) => {
      // `expiresAt` is a real instant, so unlike event times it is shown in
      // the invitee's zone: "Sat 10:30 PM".
      const deadline = expiresAt.toLocaleString("en-US", {
        timeZone,
        weekday: "short",
        hour: "numeric",
        minute: "2-digit",
      });

      return {
        email: user.email,
        title: `Still need your answer: ${event.name}`,
        subtitle: event.organization.name,
        body: [
          [volunteerRoleLabels[role], formatEventShort(event.dates)]
            .filter(Boolean)
            .join(" · "),
          `Expires ${deadline}. Tap to accept or decline.`,
        ].join("\n"),
        data: {
          type: "invitation",
          organizationId: event.organizationId,
          eventId: event.id,
        },
      };
    });

  await sendPushNotices("expiry nudge", notices);

  return notices.length;
}
