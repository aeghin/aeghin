import { stripe } from "@/lib/stripe";
import { syncOrgEntitlements } from "@/lib/billing/sync";
import { NextRequest } from "next/server";
import type Stripe from "stripe";

export async function POST(req: NextRequest) {
  const body = await req.text(); // RAW body required for signature verification
  const signature = req.headers.get("stripe-signature");
  if (!signature) return new Response("Missing signature", { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!,
    );
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }

  // A single event covers grant, upgrade/downgrade, cancel, and lapse.
  if (event.type === "entitlements.active_entitlement_summary.updated") {
    const summary = event.data.object as { customer: string };

    await syncOrgEntitlements(summary.customer);
  }

  return new Response("ok", { status: 200 });
}
