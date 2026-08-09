import "server-only";

import prisma from "@/lib/prisma";
import { cacheLife, cacheTag } from "next/cache";
import { ActivityType } from "@/generated/prisma/enums";

export const ACTIVITY_PAGE_SIZE = 10;

export const SMART_SCHEDULING_ACTIVITY_TYPES: ActivityType[] = [
  ActivityType.AUTO_INVITE_SENT,
  ActivityType.SMART_FILL_SKIPPED,
  ActivityType.SMART_FILL_NO_CANDIDATES,
  ActivityType.SMART_FILL_ALL_UNAVAILABLE,
  ActivityType.SMART_FILL_FAILED,
  ActivityType.SMART_SCHEDULING_ENABLED,
  ActivityType.SMART_SCHEDULING_DISABLED,
];

export type ActivityItem = {
  id: string;
  type: ActivityType;
  actorName: string | null;
  targetName: string | null;
  detail: string | null;
  eventName: string | null;
  createdAt: Date;
};

// `page` is 1-based and must already be clamped to the real range — a page
// below 1 would produce a negative skip.
export const getOrganizationActivity = async (
  organizationId: string,
  page: number
): Promise<ActivityItem[]> => {
  "use cache";

  cacheLife("minutes");
  cacheTag(`org-${organizationId}-activity`);

  const rows = await prisma.activityLog.findMany({
    where: { organizationId },
    // id is the unique tiebreak so the sort is total and a row can't drift
    // between pages when several share a createdAt.
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * ACTIVITY_PAGE_SIZE,
    take: ACTIVITY_PAGE_SIZE,
    select: {
      id: true,
      type: true,
      actorName: true,
      targetName: true,
      detail: true,
      createdAt: true,
      event: { select: { name: true } },
    },
  });

  return rows.map(({ event, ...row }) => ({
    ...row,
    eventName: event?.name ?? null,
  }));
};

// Cached apart from the rows so paging through the feed reuses a single count
// instead of re-running it once per page.
export const getOrganizationActivityPageCount = async (
  organizationId: string
): Promise<number> => {
  "use cache";

  cacheLife("minutes");
  cacheTag(`org-${organizationId}-activity`);

  const total = await prisma.activityLog.count({ where: { organizationId } });

  return Math.ceil(total / ACTIVITY_PAGE_SIZE);
};

export type SmartSchedulingActivityItem = {
  id: string;
  type: ActivityType;
  actorName: string | null;
  targetName: string | null;
  detail: string | null;
  createdAt: Date;
};

export const getEventSmartSchedulingActivity = async (
  eventId: string,
  organizationId: string
): Promise<SmartSchedulingActivityItem[]> => {
  "use cache";

  cacheLife("minutes");
  cacheTag(`event-${eventId}-org-${organizationId}-activity`);

  return prisma.activityLog.findMany({
    where: {
      eventId,
      organizationId,
      type: { in: SMART_SCHEDULING_ACTIVITY_TYPES },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      type: true,
      actorName: true,
      targetName: true,
      detail: true,
      createdAt: true,
    },
  });
};
