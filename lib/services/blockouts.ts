import "server-only";

import prisma from "@/lib/prisma";
import { cacheLife, cacheTag } from "next/cache";
import { getOrganizationTimeZone } from "@/lib/services/organization";
import { floatingNow } from "@/lib/time-zone";

type DateRange = { startTime: Date | string; endTime: Date | string };

const DAY_MS = 24 * 60 * 60 * 1000;


export const getUserBlockouts = async (
  userId: string,
  organizationId: string,
) => {
  "use cache";

  cacheLife("minutes");
  cacheTag(`user-${userId}-blockouts-${organizationId}`);
  cacheTag(`org-${organizationId}-details`);

  // A blockout's last day is inclusive and stored as its floating midnight, so
  // it runs until the next midnight on the organization's clock.
  const today = floatingNow(await getOrganizationTimeZone(organizationId));

  const blockouts = await prisma.blockoutDate.findMany({
    where: {
      userId,
      organizationId,
      endDate: { gt: new Date(today.getTime() - DAY_MS) },
    },
    orderBy: { startDate: "asc" },
    select: {
      id: true,
      startDate: true,
      endDate: true,
    },
  });

  return blockouts;
};


export async function getBlockoutsForDates(
  organizationId: string,
  dates: DateRange[],
) {
  if (dates.length === 0) return [];

  const overlapConditions = dates.map(({ startTime, endTime }) => ({
    startDate: { lt: new Date(endTime) },
    endDate: { gt: new Date(new Date(startTime).getTime() - DAY_MS) },
  }));

  return prisma.blockoutDate.findMany({
    where: {
      organizationId,
      OR: overlapConditions,
    },
    select: {
      userId: true,
      startDate: true,
      endDate: true,
    },
  });
}

export async function getBlockedUserIds(
  organizationId: string,
  dates: DateRange[],
): Promise<Set<string>> {
  if (dates.length === 0) return new Set();
  const rows = await getBlockoutsForDates(organizationId, dates);
  return new Set(rows.map((r) => r.userId));
}
