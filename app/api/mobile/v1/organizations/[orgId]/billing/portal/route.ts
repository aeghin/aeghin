import { OrgRole } from "@/generated/prisma/enums";
import { createPortalSession } from "@/lib/billing/stripe-sessions";
import { clerkIdOf, fail, json, membershipFor, route } from "@/lib/mobile/route";

type Params = { orgId: string };

/**
 * POST /api/mobile/v1/organizations/[orgId]/billing/portal
 *
 * A Stripe Customer Portal session → `{ url }`. Owners only. Answers 404
 * when the organization has never subscribed, since there is nothing to manage.
 */
export const POST = route<Params>("POST .../billing/portal", async (_req, { params }) => {
    const clerkId = await clerkIdOf();

    if (!clerkId) return fail(401, "Unauthorized");

    const { orgId } = await params;

    const membership = await membershipFor(clerkId, orgId);

    if (!membership) return fail(404, "Not Found");

    if (membership.role !== OrgRole.OWNER) {
        return fail(403, "Only an organization owner can manage the subscription.");
    }

    const url = await createPortalSession({
        orgId,
        returnUrl: `${process.env.NEXT_PUBLIC_APP_URL}/mobile/billing/return?status=portal`,
    });

    if (!url) return fail(404, "No billing account yet.");

    return json({ url });
});
