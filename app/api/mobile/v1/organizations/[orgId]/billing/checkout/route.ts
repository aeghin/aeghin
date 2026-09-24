import { OrgRole } from "@/generated/prisma/enums";
import { createAiCheckoutSession, type AiPlan } from "@/lib/billing/stripe-sessions";
import {
    clerkIdOf,
    fail,
    isObject,
    json,
    membershipFor,
    readJson,
    route,
} from "@/lib/mobile/route";

type Params = { orgId: string };

const isPlan = (value: unknown): value is AiPlan => value === "premium" || value === "pro";

/** Where Stripe sends the phone afterwards: a page that deep-links back into the app. */
const returnUrl = (status: "success" | "cancel" | "portal") =>
    `${process.env.NEXT_PUBLIC_APP_URL}/mobile/billing/return?status=${status}`;

/**
 * POST /api/mobile/v1/organizations/[orgId]/billing/checkout
 *
 * Starts a subscription Checkout Session: `{ plan: "premium" | "pro" }` →
 * `{ url }` — or, for an org that already has a plan, Stripe's confirm page
 * for switching it, so nobody ends up with two subscriptions. A 409 means it's
 * already on that plan. Owners only, as on the dashboard. The phone opens the URL in an
 * auth session and Stripe returns through `/mobile/billing/return`, which
 * hands off to `aeghin://settings/billing`.
 */
export const POST = route<Params>("POST .../billing/checkout", async (req, { params }) => {
    const clerkId = await clerkIdOf();

    if (!clerkId) return fail(401, "Unauthorized");

    const { orgId } = await params;

    const membership = await membershipFor(clerkId, orgId);

    if (!membership) return fail(404, "Not Found");

    if (membership.role !== OrgRole.OWNER) {
        return fail(403, "Only an organization owner can start a subscription.");
    }

    const body = await readJson(req);

    if (!isObject(body) || !isPlan(body.plan)) {
        return fail(400, "Expected a plan of \"premium\" or \"pro\".");
    }

    const result = await createAiCheckoutSession({
        orgId,
        plan: body.plan,
        successUrl: returnUrl("success"),
        switchedUrl: returnUrl("portal"),
        cancelUrl: returnUrl("cancel"),
        originContext: "mobile_app",
    });

    if (!result.success) return fail(409, result.error);

    return json({ url: result.url });
});
