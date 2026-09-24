import { redirect } from "next/navigation";
import { NextRequest } from "next/server";

import { stripe } from "@/lib/stripe";
import { syncOrgEntitlements } from "@/lib/billing/sync";

/**
 * GET /api/billing/return?session_id=... | ?subscription_id=...
 *
 * Where Stripe sends an owner after paying: from Checkout for a first plan
 * (`session_id`), or from the portal after switching plans (`subscription_id`).
 * Copies the new plan onto the organization before the dashboard renders —
 * Stripe recommends this alongside the webhook, because the webhook can arrive
 * seconds later and until then the page would still show the old plan.
 *
 * No session check: this only mirrors what Stripe reports for an id Stripe
 * issued, and the page it redirects to checks membership itself.
 */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const sessionId = params.get("session_id");
  const subscriptionId = params.get("subscription_id");

  if (!sessionId && !subscriptionId) redirect("/dashboard");

  let orgId: string | null = null;

  try {
    if (sessionId) {
      // Back from Checkout: a first subscription.
      const session = await stripe.checkout.sessions.retrieve(sessionId);

      orgId = session.client_reference_id;

      if (typeof session.customer === "string") {
        await syncOrgEntitlements(session.customer);
      }
    } else if (subscriptionId) {
      // Back from the portal: an existing subscription switched plans.
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);

      if (typeof subscription.customer === "string") {
        orgId = await syncOrgEntitlements(subscription.customer);
      }
    }
  } catch (err) {
    // Best effort: the webhook still lands. Log it and send them on.
    console.error("GET /api/billing/return: sync failed", err);
  }

  redirect(orgId ? `/dashboard/organizations/${orgId}` : "/dashboard");
}
