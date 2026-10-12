import { inZone } from "@/lib/time-zone";

/**
 * Which events the Events tab shows for a period, and the day each one groups
 * under. The phone's `src/lib/events/schedule.ts` makes the same calls, rule
 * for rule, so the dashboard and the app show the same events in the same
 * places.
 *
 * Every date here is floating, like the event times it is compared with: the
 * organization's wall clock, read through UTC fields. `now` is that clock right
 * now (`floatingNow`), and a block is over once its end has passed there — an
 * event once every one of its blocks is, which is also when the bell and the
 * reminders let it go. Week and month bounds are built with Date.UTC: local
 * midnights would sit hours off the stored times, and differ between the
 * server render and the browser.
 */

export type TimeScope = "week" | "month" | "upcoming" | "past";

type ScopeDate = {
  startTime: Date | string;
  endTime: Date | string;
};

/** Midnight of the floating day `now` falls on. */
export function startOfFloatingDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/** The first and last moment of the month `cursor` shows, as floating times. */
export function monthBounds(cursor: Date): { monthStart: Date; monthEnd: Date } {
  return {
    monthStart: new Date(Date.UTC(cursor.getFullYear(), cursor.getMonth(), 1)),
    monthEnd: new Date(Date.UTC(cursor.getFullYear(), cursor.getMonth() + 1, 0, 23, 59, 59)),
  };
}

/** Midnight a week on from today, which is where This Week stops. */
function weekEndFrom(now: Date): Date {
  const weekEnd = startOfFloatingDay(now);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);
  return weekEnd;
}

/** Over once its end has passed on the organization's clock. */
export function isBlockOver(date: ScopeDate, now: Date): boolean {
  return new Date(date.endTime) < now;
}

/** True only once every one of the event's blocks is over. */
export function isEventPast(dates: ScopeDate[], now: Date): boolean {
  return dates.length > 0 && dates.every((date) => isBlockOver(date, now));
}

/** Whether one block belongs to the chosen period. */
function isBlockInScope(
  date: ScopeDate,
  scope: TimeScope,
  currentMonth: Date,
  now: Date,
): boolean {
  const start = new Date(date.startTime);
  const end = new Date(date.endTime);

  switch (scope) {
    case "week":
      return start <= weekEndFrom(now) && !isBlockOver(date, now);
    case "month": {
      const { monthStart, monthEnd } = monthBounds(currentMonth);
      return start <= monthEnd && end >= monthStart;
    }
    case "upcoming":
      return !isBlockOver(date, now);
    case "past":
      return isBlockOver(date, now);
  }
}

/** Whether any of an event's blocks falls inside the chosen period. */
export function isEventInTimeScope(
  dates: ScopeDate[],
  scope: TimeScope,
  currentMonth: Date,
  now: Date,
): boolean {
  if (dates.length === 0) return false;

  if (scope === "past") {
    return (
      isEventPast(dates, now) &&
      dates.some((date) => isBlockInScope(date, "month", currentMonth, now))
    );
  }

  return dates.some((date) => isBlockInScope(date, scope, currentMonth, now));
}

/**
 * The start of the event's earliest block inside the period — falling back to
 * its true start — so a multi-day event that began before the period, or whose
 * first day is already over, groups under the day it is next on.
 */
export function getAnchorDateInScope(
  dates: ScopeDate[],
  scope: TimeScope,
  currentMonth: Date,
  now: Date,
): Date {
  const inScope = dates.filter((date) => isBlockInScope(date, scope, currentMonth, now));

  return new Date(
    Math.min(...(inScope.length > 0 ? inScope : dates).map((date) => new Date(date.startTime).getTime())),
  );
}

/**
 * The next real instant at which the Events tab would read differently: a
 * block ending, an invitation lapsing, or the church's midnight. `now` is the
 * floating clock at `instant`.
 */
export function nextChange(
  dates: ScopeDate[],
  deadlines: Date[],
  timeZone: string,
  now: Date,
  instant: number,
): number {
  // The soonest block still going, found on the floating clock so that only one
  // time needs turning into an instant. It is over a moment after its end.
  const midnight = startOfFloatingDay(now);
  midnight.setUTCDate(midnight.getUTCDate() + 1);

  let soonestEnd = midnight.getTime();
  for (const date of dates) {
    const end = new Date(date.endTime).getTime();
    if (end >= now.getTime() && end < soonestEnd) soonestEnd = end;
  }

  let next = inZone(new Date(soonestEnd), timeZone).getTime() + 1;
  for (const deadline of deadlines) {
    const at = deadline.getTime();
    if (at > instant && at < next) next = at;
  }

  // Across a daylight-saving change a wall time can name no instant at all.
  return next > instant ? next : instant + 60_000;
}
