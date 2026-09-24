import { redirect } from "next/navigation";
import { NextRequest } from "next/server";

import { stripe } from "@/lib/stripe";
import { syncOrgEntitlements } from "@/lib/billing/sync";

/**
 * GET /api/billing/return?session_id=...
 *
 * Where Checkout sends an owner after paying. Copies the new plan onto the
 * organization before the dashboard renders — Stripe recommends this alongside
 * the webhook, because the webhook can arrive seconds later and until then the
 * page would still show Free limits to someone who just paid.
 *
 * No session check: this only mirrors what Stripe reports for a session id
 * Stripe issued, and the page it redirects to checks membership itself.
 */
export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get("session_id");

  if (!sessionId) redirect("/dashboard");

  let orgId: string | null = null;

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    orgId = session.client_reference_id;

    if (typeof session.customer === "string") {
      await syncOrgEntitlements(session.customer);
    }
  } catch (err) {
    // Best effort: the webhook still lands. Log it and send them on.
    console.error("GET /api/billing/return: sync failed", err);
  }

  redirect(orgId ? `/dashboard/organizations/${orgId}` : "/dashboard");
}
