import "server-only";

import prisma from "@/lib/prisma";
import { cacheLife, cacheTag } from "next/cache";

export const getOrgEventTemplates = async (organizationId: string) => {
    "use cache"

    cacheLife("minutes");

    cacheTag(`org-${organizationId}-templates`);

    const templates = await prisma.eventTemplate.findMany({
        where: {
            organizationId
        },
        orderBy: [
            { dayOfWeek: "asc" },
            { name: "asc" }
        ],
        select: {
            id: true,
            name: true,
            description: true,
            location: true,
            dayOfWeek: true,
            days: {
                orderBy: { dayOffset: "asc" },
                select: {
                    dayOffset: true,
                    startTime: true,
                    endTime: true
                }
            },
            rolesNeeded: true,
            expiresInDays: true,
            smartSchedulingEnabled: true,
            serviceTypeId: true,
            serviceType: {
                select: {
                    id: true,
                    name: true,
                    color: true
                }
            }
        }
    });

    return templates;
};
