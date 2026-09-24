export type OrgPlan = "free" | "premium" | "pro";

const MB = 1024 * 1024;
const GB = 1024 * MB;

/** One cap per plan. `null` means no cap; storage is capped on every plan. */
type PlanLimits = {
  members: number | null;
  songs: number | null;
  /** Bytes of song charts and audio. */
  storage: number;
};

/**
 * The only place a plan's numbers live. Enforcement, the dashboard, and the
 * pricing page all read from here, so they can't disagree.
 */
export const PLAN_LIMITS: Record<OrgPlan, PlanLimits> = {
  free: { members: 20, songs: 40, storage: 500 * MB },
  premium: { members: null, songs: null, storage: 5 * GB },
  pro: { members: null, songs: null, storage: 10 * GB },
};

/** Bytes the way the plans describe them: "500 MB", "5 GB", "1.2 GB". */
export function formatStorage(bytes: number): string {
  if (bytes >= GB) return `${Number((bytes / GB).toFixed(1))} GB`;
  if (bytes >= MB) return `${Math.round(bytes / MB)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

/**
 * What each paid plan costs, as shown on the page. Stripe charges the real
 * price — change both together.
 */
export const PLAN_PRICES = {
  premium: "$39.99",
  pro: "$49.99",
};
