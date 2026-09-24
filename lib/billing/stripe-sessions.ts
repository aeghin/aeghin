import "server-only";

import type Stripe from "stripe";

import { stripe } from "@/lib/stripe";
import prisma from "@/lib/prisma";

export type AiPlan = "premium" | "pro";

const PRICE_ENV: Record<AiPlan, string> = {
  premium: "STRIPE_AI_SETLIST_PRICE_ID",
  pro: "STRIPE_AI_PRO_PRICE_ID",
};

/** Reuse the org's Stripe Customer, or create + persist one on first use. */
export async function getOrCreateCustomer(orgId: string): Promise<string> {
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { stripeCustomerId: true, name: true },
  });
  if (!org) throw new Error("Organization not found");
  if (org.stripeCustomerId) return org.stripeCustomerId;

  const customer = await stripe.customers.create({
    name: org.name,
    metadata: { orgId },
  });
  await prisma.organization.update({
    where: { id: orgId },
    data: { stripeCustomerId: customer.id },
  });
  return customer.id;
}

export type PlanSessionResult =
  | { success: true; url: string }
  | { success: false; error: string };

/**
 * Subscription statuses that mean the org still has a plan, paid up or not.
 * Stripe's own "one subscription per customer" setting counts the same set.
 */
const LIVE_STATUSES: Stripe.Subscription.Status[] = ["active", "trialing", "past_due", "unpaid", "paused"];

/** The subscription the customer already has, or null. */
async function findLiveSubscription(customerId: string): Promise<Stripe.Subscription | null> {
  const subscriptions = await stripe.subscriptions.list({
    customer: customerId,
    status: "all",
    limit: 10,
  });

  return subscriptions.data.find((s) => LIVE_STATUSES.includes(s.status)) ?? null;
}

/**
 * Where to send an owner who picked a plan. The dashboard and the phone share
 * this and differ only in where Stripe sends the person after.
 *
 * One subscription per organization. Checkout always starts a new one, so an
 * org that already has a plan changes that plan instead — sending it through
 * Checkout is how a Premium org ended up paying for Premium and Pro at once.
 */
export async function createAiCheckoutSession(opts: {
  orgId: string;
  plan: AiPlan;
  /** After Checkout starts a first subscription. */
  successUrl: string;
  /** After the portal switches an existing plan. `{SUBSCRIPTION_ID}` is filled in here — the portal has no placeholder of its own. */
  switchedUrl: string;
  cancelUrl: string;
  originContext?: "web" | "mobile_app";
}): Promise<PlanSessionResult> {
  const price = process.env[PRICE_ENV[opts.plan]];
  if (!price) throw new Error(`${PRICE_ENV[opts.plan]} is not set`);

  const customerId = await getOrCreateCustomer(opts.orgId);
  const current = await findLiveSubscription(customerId);

  if (current) {
    const item = current.items.data[0];

    if (item.price.id === price) {
      return { success: false, error: "This organization is already on that plan." };
    }

    // Behind on payment: the portal home, where the card can be fixed, rather
    // than a switch Stripe couldn't charge for.
    if (current.status !== "active" && current.status !== "trialing") {
      const portal = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: opts.cancelUrl,
      });
      return { success: true, url: portal.url };
    }

    // Stripe's confirm page shows the prorated charge and takes the payment.
    const portal = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: opts.cancelUrl,
      flow_data: {
        type: "subscription_update_confirm",
        subscription_update_confirm: {
          subscription: current.id,
          items: [{ id: item.id, price, quantity: 1 }],
        },
        after_completion: {
          type: "redirect",
          redirect: { return_url: opts.switchedUrl.replace("{SUBSCRIPTION_ID}", current.id) },
        },
      },
    });

    return { success: true, url: portal.url };
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price, quantity: 1 }],
    client_reference_id: opts.orgId,
    success_url: opts.successUrl,
    cancel_url: opts.cancelUrl,
    ...(opts.originContext ? { origin_context: opts.originContext } : {}),
  });

  return session.url
    ? { success: true, url: session.url }
    : { success: false, error: "Could not start checkout" };
}

/** The Customer Portal, or null when the org has never had a billing account. */
export async function createPortalSession(opts: {
  orgId: string;
  returnUrl: string;
}): Promise<string | null> {
  const org = await prisma.organization.findUnique({
    where: { id: opts.orgId },
    select: { stripeCustomerId: true },
  });
  if (!org?.stripeCustomerId) return null;

  const portal = await stripe.billingPortal.sessions.create({
    customer: org.stripeCustomerId,
    return_url: opts.returnUrl,
  });

  return portal.url;
}
