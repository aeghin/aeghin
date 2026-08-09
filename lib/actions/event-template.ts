"use server"

import prisma from "@/lib/prisma";
import { currentUser } from "@/lib/services/user";
import { type EventTemplateInput, eventTemplateSchema } from "@/lib/validations/event-template";
import { OrgRole } from "@/generated/prisma/enums";
import { revalidatePath, updateTag } from "next/cache";
import { Prisma } from "@/generated/prisma/client";

type ActionResponse = { success: true } | { success: false; error: string };

export const createEventTemplate = async (input: EventTemplateInput): Promise<ActionResponse> => {

    try {

        const user = await currentUser();

        if (!user) return { success: false, error: "Unauthorized" };

        const parsed = eventTemplateSchema.safeParse(input);

        if (!parsed.success) return { success: false, error: parsed.error.issues[0].message };

        const { organizationId, serviceTypeId, name, description, location, dayOfWeek, days, rolesNeeded, expiresInDays, smartSchedulingEnabled } = parsed.data;

        const membership = await prisma.membership.findUnique({
            where: {
                userId_organizationId: {
                    userId: user.id,
                    organizationId
                }
            }
        });

        if (!membership) return { success: false, error: "Unable to locate membership" };

        if (membership.role === OrgRole.MEMBER) return { success: false, error: "Unauthorized" };

        const serviceType = await prisma.serviceType.findFirst({
            where: {
                id: serviceTypeId,
                organizationId,
                deletedAt: null
            }
        });

        if (!serviceType) return { success: false, error: "Invalid Service Type" };

        await prisma.eventTemplate.create({
            data: {
                name,
                description: description ?? "",
                location,
                dayOfWeek,
                rolesNeeded,
                expiresInDays,
                smartSchedulingEnabled,
                serviceTypeId,
                organizationId,
                days: {
                    create: days.map((day, index) => ({
                        dayOffset: index,
                        startTime: day.startTime,
                        endTime: day.endTime
                    }))
                }
            }
        });

        updateTag(`org-${organizationId}-templates`);
        revalidatePath(`/dashboard/organizations/${organizationId}`);
        revalidatePath(`/dashboard/organizations/${organizationId}/events/create`);

        return { success: true };

    } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
            return { success: false, error: "A template with this name already exists" };
        }
        console.log(err);
        return { success: false, error: "Something went wrong. Try Again" };
    }
};

export const updateEventTemplate = async (templateId: string, input: EventTemplateInput): Promise<ActionResponse> => {

    try {

        const user = await currentUser();

        if (!user) return { success: false, error: "Unauthorized" };

        const parsed = eventTemplateSchema.safeParse(input);

        if (!parsed.success) return { success: false, error: parsed.error.issues[0].message };

        const { organizationId, serviceTypeId, name, description, location, dayOfWeek, days, rolesNeeded, expiresInDays, smartSchedulingEnabled } = parsed.data;

        const membership = await prisma.membership.findUnique({
            where: {
                userId_organizationId: {
                    userId: user.id,
                    organizationId
                }
            }
        });

        if (!membership) return { success: false, error: "Unable to locate membership" };

        if (membership.role === OrgRole.MEMBER) return { success: false, error: "Unauthorized" };

        const [template, serviceType] = await Promise.all([
            prisma.eventTemplate.findFirst({
                where: {
                    id: templateId,
                    organizationId
                }
            }),
            prisma.serviceType.findFirst({
                where: {
                    id: serviceTypeId,
                    organizationId,
                    deletedAt: null
                }
            })
        ]);

        if (!template) return { success: false, error: "Template not found" };

        if (!serviceType) return { success: false, error: "Invalid Service Type" };

        await prisma.eventTemplate.update({
            where: { id: templateId },
            data: {
                name,
                description: description ?? "",
                location,
                dayOfWeek,
                rolesNeeded,
                expiresInDays,
                smartSchedulingEnabled,
                serviceTypeId,
                days: {
                    deleteMany: {},
                    create: days.map((day, index) => ({
                        dayOffset: index,
                        startTime: day.startTime,
                        endTime: day.endTime
                    }))
                }
            }
        });

        updateTag(`org-${organizationId}-templates`);
        revalidatePath(`/dashboard/organizations/${organizationId}`);
        revalidatePath(`/dashboard/organizations/${organizationId}/events/create`);

        return { success: true };

    } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
            return { success: false, error: "A template with this name already exists" };
        }
        console.log(err);
        return { success: false, error: "Something went wrong. Try Again" };
    }
};

export const deleteEventTemplate = async (templateId: string, organizationId: string): Promise<ActionResponse> => {

    try {

        if (!templateId || !organizationId) return { success: false, error: "no data received, try again" };

        const user = await currentUser();

        if (!user) return { success: false, error: "Unauthorized" };

        const membership = await prisma.membership.findUnique({
            where: {
                userId_organizationId: {
                    userId: user.id,
                    organizationId
                }
            }
        });

        if (!membership) return { success: false, error: "Unable to locate membership" };

        if (membership.role === OrgRole.MEMBER) return { success: false, error: "Unauthorized" };

        const template = await prisma.eventTemplate.findFirst({
            where: {
                id: templateId,
                organizationId
            }
        });

        if (!template) return { success: false, error: "Template not found" };

        await prisma.eventTemplate.delete({
            where: { id: templateId }
        });

        updateTag(`org-${organizationId}-templates`);
        revalidatePath(`/dashboard/organizations/${organizationId}`);
        revalidatePath(`/dashboard/organizations/${organizationId}/events/create`);

        return { success: true };

    } catch (err) {
        console.log(err);
        return { success: false, error: "Something went wrong. Try Again" };
    }
};
