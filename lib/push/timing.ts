import "server-only";

import prisma from "@/lib/prisma";
import { inZone, wallClock } from "@/lib/time-zone";

/**
 * When a push the cron schedules may ring, and the zone arithmetic behind it.
 *
 * Event times are floating wall clock pinned to Z (see `lib/email/event-when`):
 * `09:00Z` means 9am wherever the organization is. So each time is worked out
 * on the wall clock first — "the day before, at the same time" is a calendar
 * move, not 24 hours — and only then turned into an instant in the zone of the
 * phone being pushed, which is where its owner is. Somebody whose phone has
 * never reported a zone (usually somebody without the app, who is only
 * emailed) is planned on the organization's zone instead.
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
 * 6am to 11pm on the recipient's own clock. Nothing scheduled goes out outside
 * it. Widened from 8am–9pm on 2026-10-11 at the user's request, so a morning
 * service's reminders and an evening's still land the same day rather than
 * waiting. In minutes after midnight.
 */
const WAKING_FROM = 6 * 60;
const WAKING_UNTIL = 23 * 60;

/**
 * The latest a push is planned for: an hour inside the window, because the
 * cron runs on the hour and one planned for 10pm has to be out before 11.
 * Anything planned later would come due after the window shut and be stale by
 * the morning.
 */
const PLAN_UNTIL = WAKING_UNTIL - 60;

// The zone arithmetic lives in lib/time-zone, shared with the dashboard, which
// compares event times to the organization's clock the same way.
export { inZone, wallClock };

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
 * 6am becomes 6am, after 10pm becomes 10pm. For pushes planned ahead, which can
 * move within the day but mustn't land on another — "Tomorrow" has to stay true.
 */
export function wakingSameDay(floating: Date): Date {
  const minute = minuteOf(floating);

  if (minute < WAKING_FROM) return atMinute(floating, WAKING_FROM);
  if (minute > PLAN_UNTIL) return atMinute(floating, PLAN_UNTIL);

  return floating;
}

/**
 * A wall-clock time, or the next 6am when it falls overnight. For news that
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
 * recently. Somebody missing from the map gets no scheduled pushes, and their
 * scheduled emails are planned on the organization's clock instead.
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
