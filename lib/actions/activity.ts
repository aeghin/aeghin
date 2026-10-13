"use server";

import { currentUser } from "@/lib/services/user";
import prisma from "@/lib/prisma";
import { OrgRole } from "@/generated/prisma/enums";
import {
  getOrganizationActivity,
  getOrganizationActivityPageCount,
  type ActivityItem,
} from "@/lib/services/activity";
import { isActivityFilter, type ActivityFilter } from "@/lib/activity-feed";

type FetchActivityPageResponse =
  | { success: true; items: ActivityItem[]; page: number; totalPages: number }
  | { success: false; error: string };

// Server actions are public endpoints, so this re-checks that the caller can
// manage the org (owner/admin) before returning feed rows — mirrors roles.ts.
export const fetchActivityPage = async (
  organizationId: string,
  page: number,
  filter: ActivityFilter = "all"
): Promise<FetchActivityPageResponse> => {
  const user = await currentUser();
  if (!user) return { success: false, error: "Unauthorized" };

  const membership = await prisma.membership.findUnique({
    where: {
      userId_organizationId: { userId: user.id, organizationId },
    },
    select: { role: true },
  });

  if (!membership || membership.role === OrgRole.MEMBER) {
    return { success: false, error: "Unauthorized" };
  }

  // Arrives from the client like the page does; anything unknown reads as "all".
  const safeFilter = isActivityFilter(filter) ? filter : "all";

  const totalPages = await getOrganizationActivityPageCount(organizationId, safeFilter);

  // The page number arrives from the client, so pin it inside the real range
  // before it reaches a skip/take. Rows deleted since the client last rendered
  // can put the requested page past the end, so this also clamps downward.
  const requested = Math.trunc(page) || 1;
  const safePage = Math.min(Math.max(requested, 1), Math.max(totalPages, 1));

  const items = await getOrganizationActivity(organizationId, safePage, safeFilter);

  return { success: true, items, page: safePage, totalPages };
};
