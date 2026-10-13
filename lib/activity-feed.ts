import { ActivityType } from "@/generated/prisma/enums";
import { floatingNow, zoneOrFallback } from "@/lib/time-zone";

/**
 * How the Activity feed is sliced and dated, shared by the server that filters
 * it and the client that draws it. The phone carries the same filter keys and
 * labels (`src/lib/activity.ts`) and sends the key as `?filter=`.
 */

export type ActivityFilter = "all" | "smart" | "invites" | "members" | "events";

export const ACTIVITY_FILTERS: { value: ActivityFilter; label: string; empty: string }[] = [
  { value: "all", label: "All", empty: "Nothing has happened here yet." },
  { value: "smart", label: "Smart Scheduling", empty: "Nothing from Smart Scheduling yet." },
  { value: "invites", label: "Invites", empty: "No invitations yet." },
  { value: "members", label: "Members", empty: "No member changes yet." },
  { value: "events", label: "Events", empty: "No events created or deleted yet." },
];

// A Record rather than a list per filter, so a new ActivityType doesn't build
// until somebody decides which chip it belongs under.
const FILTER_OF: Record<ActivityType, Exclude<ActivityFilter, "all">> = {
  AUTO_INVITE_SENT: "smart",
  SMART_FILL_SKIPPED: "smart",
  SMART_FILL_NO_CANDIDATES: "smart",
  SMART_FILL_ALL_UNAVAILABLE: "smart",
  SMART_FILL_FAILED: "smart",
  SMART_SCHEDULING_ENABLED: "smart",
  SMART_SCHEDULING_DISABLED: "smart",
  INVITE_SENT: "invites",
  INVITE_ACCEPTED: "invites",
  INVITE_DECLINED: "invites",
  INVITE_CANCELED: "invites",
  MEMBER_REMOVED: "members",
  MEMBER_LEFT: "members",
  ROLE_CHANGED: "members",
  EVENT_CREATED: "events",
  EVENT_DELETED: "events",
};

export const isActivityFilter = (value: unknown): value is ActivityFilter =>
  ACTIVITY_FILTERS.some((filter) => filter.value === value);

/** The activity types one chip shows. Never called with "all", which is no narrowing. */
export const activityFilterTypes = (filter: Exclude<ActivityFilter, "all">): ActivityType[] =>
  (Object.keys(FILTER_OF) as ActivityType[]).filter((type) => FILTER_OF[type] === filter);

const DAY_MS = 86_400_000;

/** Midnight of a floating time's own day. */
const dayStart = (floating: Date) =>
  Date.UTC(floating.getUTCFullYear(), floating.getUTCMonth(), floating.getUTCDate());

/**
 * Whole days between an entry and now on the organization's clock: 0 today,
 * 1 yesterday. A row stamped a moment ahead of this clock counts as today.
 */
export const activityDaysAgo = (createdAt: Date, now: Date, timeZone: string): number =>
  Math.max(
    0,
    Math.round(
      (dayStart(floatingNow(timeZone, now)) - dayStart(floatingNow(timeZone, createdAt))) /
        DAY_MS,
    ),
  );

/** The heading a row files under. "This week" is the last seven days, as the Events filter means it. */
export const activityGroupLabel = (daysAgo: number): string =>
  daysAgo === 0
    ? "Today"
    : daysAgo === 1
      ? "Yesterday"
      : daysAgo < 7
        ? "Earlier this week"
        : "Earlier";

/**
 * The stamp under a row: the clock time where the heading already names the
 * day ("9:14 AM"), the date where it doesn't ("Sun, Oct 11"), with the year
 * once it isn't this one.
 */
export const formatActivityStamp = (
  createdAt: Date,
  daysAgo: number,
  now: Date,
  timeZone: string,
): string => {
  const zone = zoneOrFallback(timeZone);

  if (daysAgo <= 1) {
    return createdAt.toLocaleTimeString("en-US", {
      timeZone: zone,
      hour: "numeric",
      minute: "2-digit",
    });
  }

  const sameYear =
    floatingNow(timeZone, createdAt).getUTCFullYear() ===
    floatingNow(timeZone, now).getUTCFullYear();

  return createdAt.toLocaleDateString("en-US", {
    timeZone: zone,
    weekday: "short",
    month: "short",
    day: "numeric",
    year: sameYear ? undefined : "numeric",
  });
};
