import "server-only";

import prisma from "@/lib/prisma";
import { InvitationStatus } from "@/generated/prisma/enums";
import { volunteerRoleLabels } from "@/lib/activity";
import { formatEventShort, formatRehearsal } from "@/lib/email/event-when";
import { sendPushNotices, type PushNotice } from "@/lib/push/send";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/**
 * How late a tick may be and still send what came due before it. The cron is
 * hourly, so this rides out two missed ticks; anything older is dropped rather
 * than delivered hours late.
 */
const GRACE_MS = 3 * HOUR_MS;

/**
 * The furthest a stored event time sits from the instant it names: UTC−12 to
 * UTC+14. Widens the reminder query so every zone is in it; the exact test is
 * made per person.
 */
const ZONE_SPREAD_MS = 14 * HOUR_MS;

/** How long before the first block the reminder goes out. */
const REMINDER_LEAD_MS = DAY_MS;

/** How long before an invitation lapses the nudge goes out. */
const NUDGE_LEAD_MS = DAY_MS;

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

const partsFormatters = new Map<string, Intl.DateTimeFormat>();

/** How far `timeZone` runs ahead of UTC at `instant`, in ms. */
const offsetAt = (instant: number, timeZone: string) => {
  let format = partsFormatters.get(timeZone);

  if (!format) {
    format = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    });
    partsFormatters.set(timeZone, format);
  }

  const parts: Record<string, number> = {};

  for (const { type, value } of format.formatToParts(instant)) {
    parts[type] = Number(value);
  }

  const wall = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );

  return wall - Math.floor(instant / 1000) * 1000;
};

/**
 * The real instant a stored event time names in `timeZone`.
 *
 * Event times are floating wall clock pinned to Z (see `lib/email/event-when`),
 * so `09:00Z` means 9am wherever the organization is. Read in the zone of the
 * phone being reminded, which is where its owner is. Two passes, so a time on
 * either side of a daylight-saving change gets its own offset.
 */
export function inZone(floating: Date, timeZone: string): Date {
  const wall = floating.getTime();
  const guess = wall - offsetAt(wall, timeZone);

  return new Date(wall - offsetAt(guess, timeZone));
}

/** Each user's zone, from whichever of their phones reported one most recently. */
const zonesFor = async (userIds: string[]) => {
  const tokens = await prisma.pushToken.findMany({
    where: { userId: { in: userIds }, timeZone: { not: null } },
    orderBy: { updatedAt: "desc" },
    select: { userId: true, timeZone: true },
  });

  const zones = new Map<string, string>();

  for (const { userId, timeZone } of tokens) {
    if (timeZone && !zones.has(userId)) zones.set(userId, timeZone);
  }

  return zones;
};

const firstStartOf = (dates: { startTime: Date }[]) =>
  Math.min(...dates.map((date) => date.startTime.getTime()));

/**
 * Reminds everybody who accepted an event, a day before its first block:
 * "Tomorrow: Sunday Service".
 *
 * Timed in each person's own zone, as their phone last reported it, so a 9am
 * service reminds at 9am the day before wherever the church is. Somebody whose
 * phone hasn't reported one (a build older than this) isn't reminded at all,
 * rather than at whatever hour UTC happens to land on.
 *
 * Claimed on `reminderSentAt` before sending, so overlapping ticks can't both
 * send it, and sent once per schedule: moving the event clears the claim. One
 * that came due more than `GRACE_MS` ago is skipped rather than sent late,
 * which also covers accepting within the day — they know it's tomorrow.
 *
 * Paged rather than capped: the window holds every accepted spot for the next
 * day and a half, most not due yet, and a cap would let those crowd out the
 * ones that are.
 *
 * Returns how many were sent.
 */
export async function sendDayBeforeReminders(now: Date): Promise<number> {
  const target = now.getTime() + REMINDER_LEAD_MS;
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
                gt: new Date(target - GRACE_MS - ZONE_SPREAD_MS),
                lte: new Date(target + ZONE_SPREAD_MS),
              },
            },
          },
        },
      },
      select: {
        id: true,
        userId: true,
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

    const zones = await zonesFor([...new Set(rows.map((row) => row.userId))]);

    const due = rows.flatMap((row) => {
      const timeZone = zones.get(row.userId);

      if (!timeZone || row.event.dates.length === 0) return [];

      try {
        const dueAt =
          inZone(new Date(firstStartOf(row.event.dates)), timeZone).getTime() -
          REMINDER_LEAD_MS;

        return dueAt <= now.getTime() && dueAt > now.getTime() - GRACE_MS
          ? [{ ...row, timeZone }]
          : [];
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
 * `expiresAt` is a real instant, so this needs no zone: it lands at the time
 * of day the invitation was sent. Skipped for one that hasn't had
 * `NUDGE_MIN_AGE_MS` to be answered, and for an event already under way, which
 * the Pending list no longer shows.
 *
 * Claimed on `nudgedAt`, which a re-invite clears: a new window earns its own.
 *
 * Returns how many were sent.
 */
export async function sendExpiryNudges(now: Date): Promise<number> {
  const target = now.getTime() + NUDGE_LEAD_MS;

  const rows = await prisma.eventAssignment.findMany({
    where: {
      status: InvitationStatus.PENDING,
      nudgedAt: null,
      expiresAt: { gt: new Date(target - GRACE_MS), lte: new Date(target) },
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

  const due = rows.filter(
    (row) =>
      row.expiresAt.getTime() - NUDGE_LEAD_MS - row.createdAt.getTime() >=
        NUDGE_MIN_AGE_MS &&
      row.event.dates.length > 0 &&
      firstStartOf(row.event.dates) > now.getTime(),
  );

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
    .map(({ event, role, user }) => ({
      email: user.email,
      title: `Still need your answer: ${event.name}`,
      subtitle: event.organization.name,
      body: [
        [volunteerRoleLabels[role], formatEventShort(event.dates)]
          .filter(Boolean)
          .join(" · "),
        "Your invitation expires in a day. Tap to accept or decline.",
      ].join("\n"),
      data: {
        type: "invitation",
        organizationId: event.organizationId,
        eventId: event.id,
      },
    }));

  await sendPushNotices("expiry nudge", notices);

  return notices.length;
}
