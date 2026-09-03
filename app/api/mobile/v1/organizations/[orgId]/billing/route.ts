import prisma from "@/lib/prisma";
import { OrgRole } from "@/generated/prisma/enums";
import { clerkIdOf, fail, json, membershipFor, route } from "@/lib/mobile/route";

/**
 * Wire contract for the phone's billing screen. Mirrors `BillingStatus` in
 * the Expo app (`src/types/billing.ts`) — keep the two in sync.
 */
type BillingStatus = {
    hasPremium: boolean;
    hasPro: boolean;
    /** Owners only — the dashboard's rule for who may start a subscription. */
    canSubscribe: boolean;
    /** Whether a Stripe customer exists, so the portal has something to open. */
    hasBillingAccount: boolean;
};

type Params = { orgId: string };

/**
 * GET /api/mobile/v1/organizations/[orgId]/billing
 *
 * The organization's AI entitlements as the caller sees them. Read straight
 * from the row rather than through the dashboard's cached reader, so a
 * checkout that just finished shows up on the first refetch.
 */
export const GET = route<Params>("GET .../billing", async (_req, { params }) => {
    const clerkId = await clerkIdOf();

    if (!clerkId) return fail(401, "Unauthorized");

    const { orgId } = await params;

    const membership = await membershipFor(clerkId, orgId);

    if (!membership) return fail(404, "Not Found");

    const org = await prisma.organization.findUnique({
        where: { id: orgId },
        select: { entitlements: true, stripeCustomerId: true },
    });

    if (!org) return fail(404, "Not Found");

    const status: BillingStatus = {
        hasPremium: org.entitlements.includes("ai_setlist"),
        hasPro: org.entitlements.includes("ai_pro"),
        canSubscribe: membership.role === OrgRole.OWNER,
        hasBillingAccount: org.stripeCustomerId !== null,
    };

    return json(status);
});
