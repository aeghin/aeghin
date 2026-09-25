"use server";

import {
  createPlanCheckoutSession,
  createPortalSession,
} from "@/lib/billing/stripe-sessions";
import { isPaidPlan, type OrgPlan, type PaidPlan } from "@/lib/config/plans";
import { currentUser } from "@/lib/services/user";
import { getUserMembershipRole } from "@/lib/services/organization";
import { getOrgPlan } from "@/lib/billing/entitlements";
import { OrgRole } from "@/generated/prisma/enums";

type ActionResult =
  | { success: true; url: string }
  | { success: false; error: string };

async function isOrgOwner(orgId: string): Promise<boolean> {
  const user = await currentUser();
  if (!user) return false;
  const membership = await getUserMembershipRole(user.id, orgId);
  return (
    membership?.role === OrgRole.OWNER
  );
}

const dashboardUrl = (orgId: string) =>
  `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/organizations/${orgId}`;

async function startCheckout(orgId: string, plan: PaidPlan): Promise<ActionResult> {
  if (!(await isOrgOwner(orgId))) {
    return { success: false, error: "Forbidden" };
  }

  try {
    return await createPlanCheckoutSession({
      orgId,
      plan,
      successUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/billing/return?session_id={CHECKOUT_SESSION_ID}`,
      switchedUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/billing/return?subscription_id={SUBSCRIPTION_ID}`,
      cancelUrl: dashboardUrl(orgId),
      originContext: "web",
    });
  } catch (err) {
    console.error("startCheckout failed", err);
    return { success: false, error: "Couldn't open the upgrade page. Please try again." };
  }
}

/** Start a subscription Checkout Session for the AI setlist plan. */
export async function startAiSetlistCheckout(
  orgId: string,
): Promise<ActionResult> {
  return startCheckout(orgId, "premium");
}

/** Start a subscription Checkout Session for the AI setlist PRO plan. */
export async function startAiSetlistProCheckout(
  orgId: string,
): Promise<ActionResult> {
  return startCheckout(orgId, "pro");
}

/**
 * Start a Checkout Session for any paid plan, or switch the org's current plan
 * to it. The plan arrives from the browser, so it's checked first.
 */
export async function startPlanCheckout(
  orgId: string,
  plan: PaidPlan,
): Promise<ActionResult> {
  if (!isPaidPlan(plan)) return { success: false, error: "Unknown plan" };

  return startCheckout(orgId, plan);
}

/** Open the Stripe Customer Portal for self-service subscription management. */
export async function openBillingPortal(orgId: string): Promise<ActionResult> {
  if (!(await isOrgOwner(orgId))) {
    return { success: false, error: "Forbidden" };
  }

  const url = await createPortalSession({ orgId, returnUrl: dashboardUrl(orgId) });

  return url
    ? { success: true, url }
    : { success: false, error: "No billing account yet" };
}

/** Read-only org plan for the navbar (badge + subscribe button). */
export async function getOrgPremiumStatus(
  orgId: string,
): Promise<{ plan: OrgPlan; canSubscribe: boolean }> {
  const user = await currentUser();
  if (!user) return { plan: "free", canSubscribe: false };

  const [plan, membership] = await Promise.all([
    getOrgPlan(orgId),
    getUserMembershipRole(user.id, orgId),
  ]);
  const canSubscribe = membership?.role === OrgRole.OWNER;
  return { plan, canSubscribe };
}
