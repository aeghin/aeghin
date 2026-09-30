"use server";

import { auth } from "@clerk/nextjs/server";
import prisma from "@/lib/prisma";
import { ServiceType, OrgRole } from "@/generated/prisma/client";
import { currentUser } from "@/lib/services/user";
import { revalidatePath, updateTag } from "next/cache";
import { editServiceTypeSchema, type EditServiceTypeInput } from "@/lib/validations/service-types";
import { serviceTypeLimitError } from "@/lib/billing/limits";
import { syncOrganizationNotifications } from "@/lib/notifications/sync";

/**
 * How a caller expires cache tags. `updateTag` throws inside a Route Handler,
 * so the mobile routes pass `revalidateTag`; every web call site keeps the
 * default. Not exported: a "use server" module may only export async functions.
 */
type TagInvalidator = (tag: string) => void;




type ActionResponse = 
  | { success: true; serviceType?: ServiceType }
  | { success: false; error: string; code?: "SERVICE_TYPE_LIMIT" };


export async function createServiceType(name: string, color: string, organizationId: string, touch: TagInvalidator = updateTag): Promise<ActionResponse> {
    try {

        if (!name || !color || !organizationId) return { success: false, error: "no data received, try again"};
        
        const user = await currentUser();

        if (!user) return { success: false, error: "Unable to find user" };

        const userRole = await prisma.membership.findUnique({
            where: {
                userId_organizationId: {
                    userId: user.id, 
                    organizationId
                }
            },
            select: {
                role: true
            }
        });

        if (!userRole) return { success: false, error: "Unable to locate membership" };

        if (userRole.role === OrgRole.MEMBER) return { success: false, error: "Unauthorized" };

        const existingServiceType = await prisma.serviceType.findUnique({
            where: {
                name_organizationId: {
                    name,
                    organizationId
                }
            }
        });

        if (existingServiceType && existingServiceType.deletedAt === null) {
            return { success: false, error: "Service Type exists" };
        };

        const limitError = await serviceTypeLimitError(organizationId, userRole.role === OrgRole.OWNER);

        if (limitError) return { success: false, error: limitError, code: "SERVICE_TYPE_LIMIT" };

        let serviceType: ServiceType;

        if (existingServiceType) {
            serviceType = await prisma.serviceType.update({
                where: { id: existingServiceType.id },
                data: {
                    color,
                    deletedAt: null
                }
            });
        } else {
            serviceType = await prisma.serviceType.create({
                data : {
                    name,
                    color,
                    organizationId
                }
            });
        };

        touch(`org-${organizationId}-st`);
        revalidatePath(`/dashboard/organizations/${organizationId}/events/create`);

        return { success: true, serviceType: serviceType };

    } catch (err) {
        console.log(err);
        return { success: false, error: "something went wrong, try again."}
    };
};


export const deleteServiceType = async (organizationId: string, serviceTypeId: string, touch: TagInvalidator = updateTag): Promise<ActionResponse> => {

    try {

    const user = await currentUser();

    if (!user) return { success: false, error: "Unable to find user" };

    if (!organizationId || !serviceTypeId) return { success: false, error: "Insufficient data" };

    const membership = await prisma.membership.findUnique({
        where: {
            userId_organizationId: {
                userId: user.id,
                organizationId
            }
        },
        select: {
            role: true
        }
    });

    if (!membership) return { success: false, error: "Unable to locate membership." };

    if (membership.role === OrgRole.MEMBER) return { success: false, error: "Insufficient permissions." };

    const serviceTypeExist = await prisma.serviceType.findFirst({
        where: {
            id: serviceTypeId,
            organizationId,
            deletedAt: null
        }
    });

    if (!serviceTypeExist) return { success: false, error: "This service type is not valid." };

    await prisma.serviceType.update({
        where: {
            id: serviceTypeId,
            organizationId,
        },
        data: {
            deletedAt: new Date()
        }
    });

    touch(`org-${organizationId}-st`);
    revalidatePath(`/dashboard/organizations/${organizationId}/events/create`);

    // Its team leads stop counting once it's gone, so the open spots on its
    // events pass to whoever is next in line. The bell follows now rather than
    // at the next hourly reconcile. Nothing changes hands without a lead.
    const hadLeads = await prisma.teamLead.count({ where: { serviceTypeId } });

    if (hadLeads > 0) {
        await syncOrganizationNotifications(organizationId, touch);
    }

    return { success: true }

    } catch {

    return { success: false, error: "Something went wrong. Try again" };

    }
}


export const editServiceType = async (input: EditServiceTypeInput, touch: TagInvalidator = updateTag): Promise<ActionResponse> => {

    try {

        const parsed = editServiceTypeSchema.safeParse(input);

        if (!parsed.success) return { success: false, error: parsed.error.issues[0].message };

        const { organizationId, serviceTypeId, name, color } = parsed.data;

        const user = await currentUser();

        if (!user) return { success: false, error: "Unable to find user" };

        const membership = await prisma.membership.findUnique({
            where: {
                userId_organizationId: {
                    userId: user.id,
                    organizationId
                }
            },
            select: {
                role: true
            }
        });

        if (!membership) return { success: false, error: "Unable to locate membership." };

        if (membership.role === OrgRole.MEMBER) return { success: false, error: "Insufficient permissions." };

        const serviceTypeExist = await prisma.serviceType.findFirst({
            where: {
                id: serviceTypeId,
                organizationId,
                deletedAt: null
            }
        });

        if (!serviceTypeExist) return { success: false, error: "This service type is not valid." };

        // @@unique([name, organizationId]) still counts soft-deleted rows, so a rename
        // can collide with a type that was deleted but is kept for past events.
        const nameOwner = await prisma.serviceType.findUnique({
            where: {
                name_organizationId: {
                    name,
                    organizationId
                }
            },
            select: {
                id: true,
                deletedAt: true
            }
        });

        if (nameOwner && nameOwner.id !== serviceTypeId) {
            return {
                success: false,
                error: nameOwner.deletedAt
                    ? "A deleted service type already uses that name. Pick a different one."
                    : "A service type with that name already exists."
            };
        }

        const serviceType = await prisma.serviceType.update({
            where: {
                id: serviceTypeId,
                organizationId,
            },
            data: {
                name,
                color
            }
        });

        touch(`org-${organizationId}-st`);
        revalidatePath(`/dashboard/organizations/${organizationId}`);
        revalidatePath(`/dashboard/organizations/${organizationId}/events/create`);

        return { success: true, serviceType };

    } catch (err) {
        console.log(err);
        return { success: false, error: "Something went wrong. Try again" };
    }
}

/**
 * Saves the caller's own order for the service-type pills on Events. Anyone
 * in the organization may arrange theirs; it changes nothing for anyone else.
 *
 * Reads `auth()` rather than `currentUser()`, which redirects, so the mobile
 * route can call it too.
 */
export const setServiceTypeOrder = async (organizationId: string, serviceTypeIds: string[], touch: TagInvalidator = updateTag): Promise<{ success: true } | { success: false; error: string }> => {

    try {

        const { userId: clerkId } = await auth();

        if (!clerkId) return { success: false, error: "Unauthorized" };

        if (!organizationId || !Array.isArray(serviceTypeIds) || serviceTypeIds.length > 200 || !serviceTypeIds.every((id) => typeof id === "string")) {
            return { success: false, error: "Expected a list of service type ids." };
        }

        const membership = await prisma.membership.findFirst({
            where: { organizationId, user: { clerkId } },
            select: { id: true, userId: true },
        });

        if (!membership) return { success: false, error: "Unable to locate membership." };

        const live = await prisma.serviceType.findMany({
            where: { organizationId, deletedAt: null, id: { in: serviceTypeIds } },
            select: { id: true },
        });

        const known = new Set(live.map(({ id }) => id));

        await prisma.membership.update({
            where: { id: membership.id },
            data: { serviceTypeOrder: [...new Set(serviceTypeIds)].filter((id) => known.has(id)) },
        });

        touch(`user-${membership.userId}-st-order-${organizationId}`);

        return { success: true };

    } catch (err) {
        console.log(err);
        return { success: false, error: "Something went wrong. Try again" };
    }
}
