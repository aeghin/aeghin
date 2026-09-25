export type OrgPlan = "free" | "starter" | "premium" | "pro";

/** The plans an organization can pay for. */
export type PaidPlan = "starter" | "premium" | "pro";

/** Whether a value from a request names a paid plan. */
export function isPaidPlan(value: unknown): value is PaidPlan {
  return value === "starter" || value === "premium" || value === "pro";
}

const MB = 1024 * 1024;
const GB = 1024 * MB;

/**
 * What each plan allows. `null` means no cap; storage and the monthly
 * allowances are capped on every plan.
 */
type PlanLimits = {
  members: number | null;
  songs: number | null;
  /** Service types in use. Deleted ones stay for past events and don't count. */
  serviceTypes: number | null;
  /** Bytes of song charts and audio. */
  storage: number;
  /** Message All and Email Team sends a calendar month. Automatic emails never count. */
  bulkEmails: number;
  /** Messages to the setlist and event AI a calendar month. Free and Starter have no AI at all. */
  aiRuns: number;
  /** Auto-filling declines, and the last-call emails before an event that isn't staffed. */
  smartScheduling: boolean;
};

/**
 * The only place a plan's numbers live. Enforcement, the dashboard, and the
 * pricing page all read from here, so they can't disagree.
 */
export const PLAN_LIMITS: Record<OrgPlan, PlanLimits> = {
  free: { members: 30, songs: 40, serviceTypes: 2, storage: 500 * MB, bulkEmails: 10, aiRuns: 0, smartScheduling: false },
  starter: { members: 60, songs: 80, serviceTypes: 4, storage: 2 * GB, bulkEmails: 20, aiRuns: 0, smartScheduling: false },
  premium: { members: null, songs: null, serviceTypes: null, storage: 5 * GB, bulkEmails: 40, aiRuns: 200, smartScheduling: true },
  pro: { members: null, songs: null, serviceTypes: null, storage: 10 * GB, bulkEmails: 80, aiRuns: 200, smartScheduling: true },
};

export const PLAN_NAMES: Record<OrgPlan, string> = { free: "Free", starter: "Starter", premium: "Premium", pro: "Pro" };

/** The plan an upgrade goes to next. Pro is the top. */
export const NEXT_PLAN: Record<OrgPlan, PaidPlan | null> = {
  free: "starter",
  starter: "premium",
  premium: "pro",
  pro: null,
};

/** Bytes the way the plans describe them: "500 MB", "5 GB", "1.2 GB". */
export function formatStorage(bytes: number): string {
  if (bytes >= GB) return `${Number((bytes / GB).toFixed(1))} GB`;
  if (bytes >= MB) return `${Math.round(bytes / MB)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

/**
 * The calendar month the monthly allowances count in, in UTC like every other
 * time here: from `start` until `resetsAt`, midnight on the 1st of the next.
 */
export function usageMonth(now: Date = new Date()): { start: Date; resetsAt: Date } {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();

  return {
    start: new Date(Date.UTC(year, month, 1)),
    resetsAt: new Date(Date.UTC(year, month + 1, 1)),
  };
}

/** "October 1" — the day this month's allowances start over. */
export function formatResetDate(resetsAt: Date): string {
  return resetsAt.toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" });
}

/**
 * What each paid plan costs, as shown on the page. Stripe charges the real
 * price — change both together.
 */
export const PLAN_PRICES = {
  starter: "$24.99",
  premium: "$39.99",
  pro: "$59.99",
};
