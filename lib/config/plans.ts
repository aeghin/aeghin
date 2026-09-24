export type OrgPlan = "free" | "premium" | "pro";

/** One cap per plan. `null` means no cap. */
type PlanLimits = {
  members: number | null;
  songs: number | null;
};

/**
 * The only place a plan's numbers live. Enforcement, the dashboard, and the
 * pricing page all read from here, so they can't disagree.
 */
export const PLAN_LIMITS: Record<OrgPlan, PlanLimits> = {
  free: { members: 20, songs: 40 },
  premium: { members: null, songs: null },
  pro: { members: null, songs: null },
};

/**
 * What each paid plan costs, as shown on the page. Stripe charges the real
 * price — change both together.
 */
export const PLAN_PRICES = {
  premium: "$39.99",
  pro: "$49.99",
};
