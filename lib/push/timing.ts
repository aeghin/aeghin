import "server-only";

import prisma from "@/lib/prisma";

/**
 * When a push the cron schedules may ring, and the zone arithmetic behind it.
 *
 * Event times are floating wall clock pinned to Z (see `lib/email/event-when`):
 * `09:00Z` means 9am wherever the organization is. So each time is worked out
 * on the wall clock first — "the day before, at the same time" is a calendar
 * move, not 24 hours — and only then turned into an instant in the zone of the
 * phone being pushed, which is where its owner is.
 *
 * Pushes somebody causes by doing something — a chat message, an answer, an
 * edit — don't come through here: they go out when it happens.
 */

const HOUR_MS = 60 * 60 * 1000;

/**
 * How late a tick may be and still send what came due before it. The cron is
 * hourly, so this rides out two missed ticks; anything older is dropped rather
 * than delivered hours late.
 */
const GRACE_MS = 3 * HOUR_MS;

/**
 * The phone's own 8am to 9pm — the same window US rules set for calls and
 * texts. Nothing scheduled rings outside it. In minutes after midnight.
 */
const WAKING_FROM = 8 * 60;
const WAKING_UNTIL = 21 * 60;

/**
 * The latest a push is planned for: an hour inside the window, because the
 * cron runs on the hour and one planned for 8pm has to be out before 9.
 */
const PLAN_UNTIL = WAKING_UNTIL - 60;

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
 * The real instant a floating wall-clock time names in `timeZone`. Two passes,
 * so a time on either side of a daylight-saving change gets its own offset.
 */
export function inZone(floating: Date, timeZone: string): Date {
  const wall = floating.getTime();
  const guess = wall - offsetAt(wall, timeZone);

  return new Date(wall - offsetAt(guess, timeZone));
}

/** What the clock in `timeZone` reads at `instant`, as a floating time. */
export function wallClock(instant: Date, timeZone: string): Date {
  return new Date(instant.getTime() + offsetAt(instant.getTime(), timeZone));
}

const minuteOf = (floating: Date) =>
  floating.getUTCHours() * 60 + floating.getUTCMinutes();

const atMinute = (floating: Date, minute: number, days = 0) =>
  new Date(
    Date.UTC(
      floating.getUTCFullYear(),
      floating.getUTCMonth(),
      floating.getUTCDate() + days,
      0,
      minute,
    ),
  );

/** The same clock time, `days` calendar days earlier. */
export const daysBefore = (floating: Date, days: number) =>
  new Date(
    Date.UTC(
      floating.getUTCFullYear(),
      floating.getUTCMonth(),
      floating.getUTCDate() - days,
      floating.getUTCHours(),
      floating.getUTCMinutes(),
    ),
  );

/**
 * A wall-clock time kept on its own day but moved inside waking hours: before
 * 8am becomes 8am, after 8pm becomes 8pm. For pushes planned ahead, which can
 * move within the day but mustn't land on another — "Tomorrow" has to stay true.
 */
export function wakingSameDay(floating: Date): Date {
  const minute = minuteOf(floating);

  if (minute < WAKING_FROM) return atMinute(floating, WAKING_FROM);
  if (minute > PLAN_UNTIL) return atMinute(floating, PLAN_UNTIL);

  return floating;
}

/**
 * A wall-clock time, or the next 8am when it falls overnight. For news that
 * can't go out before it happens: a lapse at 11pm waits for the morning.
 */
export function wakingNext(floating: Date): Date {
  const minute = minuteOf(floating);

  if (minute < WAKING_FROM) return atMinute(floating, WAKING_FROM);
  if (minute >= WAKING_UNTIL) return atMinute(floating, WAKING_FROM, 1);

  return floating;
}

/**
 * Whether a push planned for `sendAt` goes out on this tick: it has come due,
 * not so long ago that it's stale, and it's waking hours in `timeZone` right
 * now — which also stops a tick running hours late from sending into the night.
 */
export function isDue(sendAt: Date, now: Date, timeZone: string): boolean {
  const minute = minuteOf(wallClock(now, timeZone));

  return (
    sendAt.getTime() <= now.getTime() &&
    sendAt.getTime() > now.getTime() - GRACE_MS &&
    minute >= WAKING_FROM &&
    minute < WAKING_UNTIL
  );
}

/**
 * Each person's zone, from whichever of their phones reported one most
 * recently. Somebody missing from the map gets no scheduled pushes: without a
 * zone there's no knowing whether it's night where they are.
 */
export async function zonesByEmail(emails: string[]): Promise<Map<string, string>> {
  const zones = new Map<string, string>();

  if (emails.length === 0) return zones;

  const tokens = await prisma.pushToken.findMany({
    where: {
      timeZone: { not: null },
      user: { email: { in: [...new Set(emails)] } },
    },
    orderBy: { updatedAt: "desc" },
    select: { timeZone: true, user: { select: { email: true } } },
  });

  for (const { timeZone, user } of tokens) {
    if (timeZone && !zones.has(user.email)) zones.set(user.email, timeZone);
  }

  return zones;
}
