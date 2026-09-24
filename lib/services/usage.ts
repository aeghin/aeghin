import "server-only";

import prisma from "@/lib/prisma";
import { cacheLife, cacheTag } from "next/cache";
import type { UsageKind } from "@/generated/prisma/enums";

/**
 * One monthly allowance's uses since `since` (the month's first instant, as
 * ISO), for display. Keyed on the month, so the 1st starts a fresh entry
 * instead of serving last month's count. Every send and AI message expires the
 * tag. Never enforce with this.
 */
export const getOrgUsageCount = async (
  organizationId: string,
  kind: UsageKind,
  since: string,
): Promise<number> => {
  "use cache";

  cacheLife("minutes");

  cacheTag(`org-${organizationId}-usage`);

  return prisma.usageEvent.count({
    where: { organizationId, kind, createdAt: { gte: new Date(since) } },
  });
};
