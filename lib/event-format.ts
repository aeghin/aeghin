/**
 * How event dates read on the Events tab — the phone's
 * `src/lib/events/format.ts`, rule for rule. Event times are the church's wall
 * clock written in UTC, so everything here reads UTC fields.
 */

type DateBlock = {
  startTime: Date | string;
  endTime: Date | string;
};

const UTC = "UTC";

const pad = (value: number) => String(value).padStart(2, "0");

/** `"2026-10-18"` — the calendar day a floating time falls on. */
export function dayKey(value: Date | string): string {
  const date = new Date(value);
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

/** A day key back to its midnight. */
export function keyToDate(key: string): Date {
  return new Date(`${key}T00:00:00.000Z`);
}

/** `"Sun, Oct 18"`. */
export function formatShortDate(value: Date | string): string {
  return new Date(value).toLocaleDateString("en-US", {
    timeZone: UTC,
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

/** `"Oct 18"`. */
export function formatDayMonth(value: Date | string): string {
  return new Date(value).toLocaleDateString("en-US", {
    timeZone: UTC,
    month: "short",
    day: "numeric",
  });
}

/** `"9:00 AM"`. */
export function formatTime(value: Date | string): string {
  return new Date(value).toLocaleTimeString("en-US", {
    timeZone: UTC,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

const startOf = (date: DateBlock) => new Date(date.startTime).getTime();
const endOf = (date: DateBlock) => new Date(date.endTime).getTime();

function sortByStart<T extends DateBlock>(dates: T[]): T[] {
  return [...dates].sort((a, b) => startOf(a) - startOf(b));
}

function firstAndLast(dates: DateBlock[]) {
  if (dates.length === 0) return null;
  return {
    first: sortByStart(dates)[0],
    last: [...dates].sort((a, b) => endOf(a) - endOf(b))[dates.length - 1],
  };
}

/** True when the event's blocks don't all land on one calendar day. */
export function isMultiDay(dates: DateBlock[]): boolean {
  const span = firstAndLast(dates);
  return span !== null && dayKey(span.first.startTime) !== dayKey(span.last.endTime);
}

/** `"Sun, Oct 18"`, `"Oct 18 – 19"`, or `"Oct 30 – Nov 2"`. */
export function formatDateRange(dates: DateBlock[]): string {
  const span = firstAndLast(dates);
  if (!span) return "";

  if (!isMultiDay(dates)) return formatShortDate(span.first.startTime);

  const start = new Date(span.first.startTime);
  const end = new Date(span.last.endTime);

  return start.getUTCMonth() === end.getUTCMonth()
    ? `${formatDayMonth(start)} – ${end.getUTCDate()}`
    : `${formatDayMonth(start)} – ${formatDayMonth(end)}`;
}

/** `"9:00 AM – 11:00 AM"` for the earliest block. */
export function formatTimeRange(dates: DateBlock[]): string {
  const first = sortByStart(dates)[0];
  if (!first) return "";
  return `${formatTime(first.startTime)} – ${formatTime(first.endTime)}`;
}

/**
 * The hours a card shows for the day it stands on, so an event already under
 * way reads that day's hours, not its first day's. A second block that day
 * adds "+1", and once `now` passes a block the next one takes its place.
 */
export function formatTimeOn(dates: DateBlock[], key: string, now?: Date): string {
  const sameDay = sortByStart(dates).filter((date) => dayKey(date.startTime) === key);
  const ahead = now ? sameDay.filter((date) => endOf(date) >= now.getTime()) : sameDay;
  const showing = ahead.length > 0 ? ahead : sameDay;
  const block = showing[0] ?? sortByStart(dates)[0];
  if (!block) return "";

  const range = `${formatTime(block.startTime)} – ${formatTime(block.endTime)}`;
  return showing.length > 1 ? `${range} +${showing.length - 1}` : range;
}

/** `"Thu, Oct 15 · 7:00 PM – 9:00 PM"`, dated because it rarely falls on the service day. */
export function formatRehearsal(
  start: Date | string | null | undefined,
  end: Date | string | null | undefined,
): string | null {
  if (!start) return null;

  const when = `${formatShortDate(start)} · ${formatTime(start)}`;
  return end ? `${when} – ${formatTime(end)}` : when;
}

/** The three lines of a date tile — `OCT` / `18` / `SUN`. */
export function formatDateTile(value: Date | string) {
  const date = new Date(value);
  const part = (options: Intl.DateTimeFormatOptions) =>
    date.toLocaleString("en-US", { timeZone: UTC, ...options });

  return {
    month: part({ month: "short" }).toUpperCase(),
    day: String(date.getUTCDate()),
    weekday: part({ weekday: "short" }).toUpperCase(),
  };
}
