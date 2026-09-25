import "server-only";

import prisma from "@/lib/prisma";
import { cacheLife, cacheTag } from "next/cache";
import type { OrgPlan } from "@/lib/config/plans";


async function getOrgEntitlements(orgId: string): Promise<string[]> {
  "use cache";

  cacheLife("minutes");

  cacheTag(`org-${orgId}-billing`);

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { entitlements: true },
  });

  return org?.entitlements ?? [];
}

export async function getAiSetlistAccess(params: {
  userId: string;
  orgId: string;
}): Promise<boolean> {
  const entitlements = await getOrgEntitlements(params.orgId);
  return entitlements.includes("ai_setlist");
};

export async function getAiProAccess(params: {
  userId: string;
  orgId: string;
}): Promise<boolean> {
  const entitlements = await getOrgEntitlements(params.orgId);
  return entitlements.includes("ai_pro");
};

/**
 * The entitlements whose plans include Smart Scheduling (Premium and Pro), for
 * a query that has to pick those organizations out in SQL. Starter is paid but
 * doesn't include it, so its key stays out of this list.
 */
export const SMART_SCHEDULING_ENTITLEMENTS = ["ai_setlist", "ai_pro"];

/** The plan an org is on, read off its Stripe entitlements. The highest plan wins when it holds more than one. */
export function planFromEntitlements(entitlements: string[]): OrgPlan {
  if (entitlements.includes("ai_pro")) return "pro";
  if (entitlements.includes("ai_setlist")) return "premium";
  if (entitlements.includes("starter")) return "starter";
  return "free";
}

/** Through the cached entitlement read — for display only, never for enforcing a cap. */
export async function getOrgPlan(orgId: string): Promise<OrgPlan> {
  const entitlements = await getOrgEntitlements(orgId);
  return planFromEntitlements(entitlements);
}
