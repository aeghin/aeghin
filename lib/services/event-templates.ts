import "server-only";

import prisma from "@/lib/prisma";
import { cacheLife, cacheTag } from "next/cache";
import { parseRoleSpots } from "@/lib/role-spots";

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
            roleSpots: true,
            expiresInDays: true,
            smartSchedulingEnabled: true,
            rehearsalDayOffset: true,
            rehearsalStartTime: true,
            rehearsalEndTime: true,
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

    return templates.map((template) => ({
        ...template,
        roleSpots: parseRoleSpots(template.roleSpots),
    }));
};
