/**
 * Time zones, and the arithmetic between an organization's wall clock and real
 * instants.
 *
 * Event times are stored as floating wall clock pinned to Z: `10:00Z` means
 * 10am wherever the organization is, and is displayed with `timeZone: "UTC"` so
 * the digits come back as they were typed. That is right for showing a time and
 * wrong for comparing one to the real clock — for a church in Chicago, `10:00Z`
 * reads five hours earlier than the service actually starts. So anything that
 * asks "has this happened yet" goes through here, against the organization's
 * own zone (`Organization.timeZone`), which is the one place a floating time
 * can be turned into an instant.
 *
 * No `server-only`: the dashboard's client components read the same clock.
 */

const HOUR_MS = 60 * 60 * 1000;

/**
 * What an organization is on when nothing better is known. UTC is what every
 * comparison here assumed before organizations had a zone, so falling back to
 * it changes nothing — and the organization's settings show it, so an owner can
 * see it's wrong and fix it.
 */
export const FALLBACK_TIME_ZONE = "UTC";

/** The furthest any zone sits behind UTC, for widening a query before the exact test. */
export const MAX_BEHIND_UTC_MS = 12 * HOUR_MS;

const MAX_TIME_ZONE_LENGTH = 64;

const partsFormatters = new Map<string, Intl.DateTimeFormat>();

/** The formatter `offsetAt` reads parts from, built once per zone. Throws on an unknown zone. */
const partsFormatter = (timeZone: string) => {
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

  return format;
};

/** Whether `value` is a zone this runtime's `Intl` can resolve, e.g. "America/Chicago". */
export function isTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_TIME_ZONE_LENGTH) {
    return false;
  }

  try {
    partsFormatter(value);
    return true;
  } catch {
    return false;
  }
}

/** `timeZone` when it resolves, else the fallback — for reads that must never throw. */
export const zoneOrFallback = (timeZone: string | null | undefined): string =>
  isTimeZone(timeZone) ? timeZone : FALLBACK_TIME_ZONE;

/** How far `timeZone` runs ahead of UTC at `instant`, in ms. */
const offsetAt = (instant: number, timeZone: string) => {
  const parts: Record<string, number> = {};

  for (const { type, value } of partsFormatter(timeZone).formatToParts(instant)) {
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

/**
 * What the organization's clock reads right now, as a floating time — the thing
 * a stored event time is compared against. `endTime >= floatingNow(zone)` is
 * "not over yet" at the church, where `endTime >= new Date()` would call a
 * 10am–noon service in Chicago over at 7am.
 */
export const floatingNow = (timeZone: string, now: Date = new Date()): Date =>
  wallClock(now, zoneOrFallback(timeZone));

/** Whether an event with these dates has any block still to finish on the organization's clock. */
export const hasDateAhead = (
  dates: { endTime: Date | string }[],
  timeZone: string,
  now: Date = new Date(),
): boolean => {
  const floating = floatingNow(timeZone, now).getTime();

  return dates.some((date) => new Date(date.endTime).getTime() >= floating);
};

/**
 * A real instant — when something was sent, created, answered — as a calendar
 * date on the organization's clock: "Oct 10, 2026". For server-rendered pages,
 * where the runtime's own zone is UTC and would roll an evening over to the
 * next day.
 */
export const formatDateInZone = (instant: Date | string, timeZone: string): string =>
  new Date(instant).toLocaleDateString("en-US", {
    timeZone: zoneOrFallback(timeZone),
    month: "short",
    day: "numeric",
    year: "numeric",
  });

/**
 * A real instant with its time, on the organization's clock, zone named: "Oct
 * 10, 2026, 7:30 PM CDT". The same on the server and in the browser, so a
 * hover title can't hydrate to a different hour than it rendered with.
 */
export const formatDateTimeInZone = (instant: Date | string, timeZone: string): string =>
  new Date(instant).toLocaleString("en-US", {
    timeZone: zoneOrFallback(timeZone),
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });

/**
 * "America/Chicago" as "Central Time (America/Chicago)", for showing which zone
 * an organization is on. The generic name doesn't move with daylight saving, so
 * this needs no clock and renders the same on the server and in the browser.
 */
export function timeZoneLabel(timeZone: string): string {
  const zone = zoneOrFallback(timeZone);

  if (zone === "UTC") return "UTC";

  const name = zone.replaceAll("_", " ");

  try {
    const generic = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      timeZoneName: "longGeneric",
    })
      .formatToParts(0)
      .find((part) => part.type === "timeZoneName")?.value;

    return generic && generic !== zone ? `${generic} (${name})` : name;
  } catch {
    return name;
  }
}
