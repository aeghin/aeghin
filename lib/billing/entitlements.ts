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

/** The plan an org is on, read off its Stripe entitlements. Pro wins when it holds both. */
export function planFromEntitlements(entitlements: string[]): OrgPlan {
  if (entitlements.includes("ai_pro")) return "pro";
  if (entitlements.includes("ai_setlist")) return "premium";
  return "free";
}

/** Through the cached entitlement read — for display only, never for enforcing a cap. */
export async function getOrgPlan(orgId: string): Promise<OrgPlan> {
  const entitlements = await getOrgEntitlements(orgId);
  return planFromEntitlements(entitlements);
}
