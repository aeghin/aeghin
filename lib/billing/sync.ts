import "server-only";

import { revalidateTag } from "next/cache";

import prisma from "@/lib/prisma";
import { stripe } from "@/lib/stripe";

/**
 * Copies a Stripe customer's active entitlements onto their organization.
 *
 * Re-fetched from Stripe rather than trusted from any payload, so running it
 * twice — or from two places at once — writes the same answer. The webhook
 * calls it, and so does the page Checkout returns to, because the webhook can
 * land after the owner is already looking at the dashboard.
 *
 * Callers are Route Handlers, where updateTag throws. `{ expire: 0 }` makes
 * the next read a real query instead of serving the old plan while it
 * revalidates.
 */
export async function syncOrgEntitlements(customerId: string): Promise<string | null> {
  const active = await stripe.entitlements.activeEntitlements.list({
    customer: customerId,
  });

  const lookupKeys = active.data.map((e) => e.lookup_key);

  const org = await prisma.organization.findUnique({
    where: { stripeCustomerId: customerId },
    select: { id: true },
  });

  if (!org) return null;

  await prisma.organization.update({
    where: { id: org.id },
    data: { entitlements: lookupKeys },
  });

  revalidateTag(`org-${org.id}-billing`, { expire: 0 });

  return org.id;
}
