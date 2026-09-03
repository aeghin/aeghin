"use server";

import {
  createAiCheckoutSession,
  createPortalSession,
  type AiPlan,
} from "@/lib/billing/stripe-sessions";
import { currentUser } from "@/lib/services/user";
import { getUserMembershipRole } from "@/lib/services/organization";
import { getAiSetlistAccess, getAiProAccess } from "@/lib/billing/entitlements";
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

async function startCheckout(orgId: string, plan: AiPlan): Promise<ActionResult> {
  if (!(await isOrgOwner(orgId))) {
    return { success: false, error: "Forbidden" };
  }

  const url = await createAiCheckoutSession({
    orgId,
    plan,
    successUrl: `${dashboardUrl(orgId)}?upgraded=1`,
    cancelUrl: dashboardUrl(orgId),
    originContext: "web",
  });

  return url
    ? { success: true, url }
    : { success: false, error: "Could not start checkout" };
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

/** Read-only org premium status for the navbar (badge + subscribe button). */
export async function getOrgPremiumStatus(
  orgId: string,
): Promise<{ hasPremium: boolean; hasPro: boolean; canSubscribe: boolean }> {
  const user = await currentUser();
  if (!user) return { hasPremium: false, hasPro: false, canSubscribe: false };

  const [hasPremium, hasPro, membership] = await Promise.all([
    getAiSetlistAccess({ userId: user.id, orgId }),
    getAiProAccess({ userId: user.id, orgId }),
    getUserMembershipRole(user.id, orgId),
  ]);
  const canSubscribe = membership?.role === OrgRole.OWNER;
  return { hasPremium, hasPro, canSubscribe };
}
