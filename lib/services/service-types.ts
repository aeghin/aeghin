import "server-only";

import prisma from "@/lib/prisma";
import { cacheLife, cacheTag } from "next/cache";

export const getOrgServiceTypes = async (organizationId: string) => {
    "use cache"

    cacheLife("minutes");

    cacheTag(`org-${organizationId}-st`);

const serviceTypes = await prisma.serviceType.findMany({
    where: {
      organizationId,
      deletedAt: null
    },
    select: {
      id: true,
      name: true,
      color: true
    }
  });

  return serviceTypes;
};

/** The caller's own order for the service-type pills on Events. */
export const getServiceTypeOrder = async (userId: string, organizationId: string) => {
  "use cache";

  cacheLife("hours");

  cacheTag(`user-${userId}-st-order-${organizationId}`);

  const membership = await prisma.membership.findUnique({
    where: { userId_organizationId: { userId, organizationId } },
    select: { serviceTypeOrder: true },
  });

  return membership?.serviceTypeOrder ?? [];
};
