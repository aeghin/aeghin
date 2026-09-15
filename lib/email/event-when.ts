/**
 * The "when" lines an event email shows.
 *
 * Pinned to UTC, because that is how event times are stored: the create form
 * appends `Z` to the wall-clock time the admin typed, so an event at 9am is
 * written `09:00Z` wherever the organization actually is. Formatting these in
 * the server's own zone — UTC on Vercel, something else in local dev — would
 * move a Sunday morning service to Saturday night for anyone west of
 * Greenwich. The dashboard's event details card pins UTC for the same reason.
 */

type EventWhenDate = { startTime: Date; endTime: Date };

export type EventWhen = {
  /** `"Saturday, August 30, 2026"`, or `"Sat, Aug 30 – Mon, Sep 1, 2026"`. */
  date: string;
  /** `"9:00 AM – 11:00 AM"` — the earliest block, which is what a summary shows. */
  time: string;
};

const asDate = (value: Date, options: Intl.DateTimeFormatOptions) =>
  value.toLocaleDateString("en-US", { timeZone: "UTC", ...options });

const asTime = (value: Date) =>
  value.toLocaleTimeString("en-US", {
    timeZone: "UTC",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

const shortDate = (value: Date) =>
  asDate(value, { weekday: "short", month: "short", day: "numeric" });

/**
 * Null when the event has no dates at all — a shape the schema allows, so the
 * templates treat the whole "when" block as optional rather than printing
 * "Invalid Date".
 *
 * One EventDate row per calendar day, so `length > 1` is exactly "multi-day",
 * which is the same test the dashboard's card makes.
 */
export function formatEventWhen(dates: EventWhenDate[]): EventWhen | null {
  if (dates.length === 0) return null;

  const sorted = [...dates].sort(
    (a, b) => a.startTime.getTime() - b.startTime.getTime(),
  );

  const first = sorted[0];
  const last = sorted[sorted.length - 1];

  return {
    date:
      sorted.length > 1
        ? `${shortDate(first.startTime)} – ${shortDate(last.startTime)}, ${last.startTime.getUTCFullYear()}`
        : asDate(first.startTime, {
            weekday: "long",
            month: "long",
            day: "numeric",
            year: "numeric",
          }),
    time: `${asTime(first.startTime)} – ${asTime(first.endTime)}`,
  };
}

/**
 * Whether two schedules describe the same blocks.
 *
 * Compared by value and independently of order, because `editEventDetails`
 * deletes and recreates every EventDate row on each save: the rows are always
 * new, even when the times did not move. Comparing rows instead would mail the
 * whole team "the time changed" every time somebody fixed a typo in the
 * location, and a team that gets that stops reading the mail.
 */
export function sameSchedule(
  before: EventWhenDate[],
  next: EventWhenDate[],
): boolean {
  if (before.length !== next.length) return false;

  const keys = (blocks: EventWhenDate[]) =>
    blocks
      .map((block) => `${block.startTime.getTime()}-${block.endTime.getTime()}`)
      .sort();

  const a = keys(before);
  const b = keys(next);

  return a.every((key, index) => key === b[index]);
}
