import "server-only";

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

/**
 * A subscription Checkout Session for one AI plan. The dashboard and the
 * phone share this and differ only in where Stripe sends the person after.
 */
export async function createAiCheckoutSession(opts: {
  orgId: string;
  plan: AiPlan;
  successUrl: string;
  cancelUrl: string;
  originContext?: "web" | "mobile_app";
}): Promise<string | null> {
  const price = process.env[PRICE_ENV[opts.plan]];
  if (!price) throw new Error(`${PRICE_ENV[opts.plan]} is not set`);

  const customerId = await getOrCreateCustomer(opts.orgId);

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price, quantity: 1 }],
    client_reference_id: opts.orgId,
    success_url: opts.successUrl,
    cancel_url: opts.cancelUrl,
    ...(opts.originContext ? { origin_context: opts.originContext } : {}),
  });

  return session.url ?? null;
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
