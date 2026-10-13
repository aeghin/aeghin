import { dayKey, keyToDate } from "@/lib/event-format";

/**
 * The Blockouts page's calendars and ranges. Every day here is a floating
 * calendar day — a blockout is stored at its UTC midnight, an event in its
 * church's wall clock pinned to Z — so all of it reads UTC parts. The phone
 * mirrors this in `src/lib/blockouts.ts`.
 */

const DAY_MS = 86_400_000;

/** Every day from `start` to `end`, both included, as day keys. */
export function daysCovered(start: Date | string, end: Date | string): string[] {
  const first = keyToDate(dayKey(start)).getTime();
  const last = keyToDate(dayKey(end)).getTime();
  const days: string[] = [];

  for (let at = first; at <= last; at += DAY_MS) days.push(dayKey(new Date(at)));

  return days;
}

/**
 * The days one block of an event is on. A block ending exactly at midnight
 * ends on the day before, so a 7–midnight service doesn't spill into the next.
 */
export function eventBlockDays(startTime: Date | string, endTime: Date | string): string[] {
  const start = new Date(startTime).getTime();
  const end = Math.max(start, new Date(endTime).getTime() - 1);

  return daysCovered(new Date(start), new Date(end));
}

/** `"2026-10"` stepped by whole months. */
export function shiftMonth(month: string, delta: number): string {
  const [year, index] = month.split("-").map(Number);
  return dayKey(new Date(Date.UTC(year, index - 1 + delta, 1))).slice(0, 7);
}

/** `"October 2026"`. */
export function formatMonth(month: string): string {
  return keyToDate(`${month}-01`).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "long",
    year: "numeric",
  });
}

/**
 * A month laid out Sunday first: blanks before the 1st, then a day key per
 * day — what a seven-column grid draws straight through.
 */
export function monthGrid(month: string): (string | null)[] {
  const first = keyToDate(`${month}-01`);
  const lead = first.getUTCDay();
  const length = new Date(
    Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0),
  ).getUTCDate();

  return [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`),
  ];
}

/** `"Fri, Oct 30"`, with the year once it isn't `thisYear`. */
function formatDay(date: Date, thisYear: number): string {
  return date.toLocaleDateString("en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(date.getUTCFullYear() === thisYear ? {} : { year: "numeric" }),
  });
}

/** `"Sat, Oct 24"` or `"Fri, Oct 30 – Mon, Nov 2"`. `today` is a day key on the church's clock. */
export function formatBlockoutRange(start: Date, end: Date, today: string): string {
  const thisYear = Number(today.slice(0, 4));

  return dayKey(start) === dayKey(end)
    ? formatDay(start, thisYear)
    : `${formatDay(start, thisYear)} – ${formatDay(end, thisYear)}`;
}

/** How many days a blockout covers, its last day included. */
export const blockoutDayCount = (start: Date, end: Date): number =>
  daysCovered(start, end).length;
