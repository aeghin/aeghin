"use server";

import { currentUser } from "@/lib/services/user";
import prisma from "@/lib/prisma";
import { ActivityType, OrgRole, VolunteerRole } from "@/generated/prisma/enums";
import { revalidatePath, updateTag } from "next/cache";
import { logActivity, orgRoleLabels } from "@/lib/activity";
import { userRoleSchema, UserRoleInput, assignOwnerSchema, AssignOwnerInput } from "../validations/roles";

/**
 * How a caller expires cache tags. `updateTag` throws inside a Route Handler,
 * so the mobile routes pass `revalidateTag`; every web call site keeps the
 * default. Not exported: a "use server" module may only export async functions.
 */
type TagInvalidator = (tag: string) => void;



type ActionResponse = { success: true, role?: OrgRole } | 
{ success: false, error: string }

export const updateUserRole = async (data: UserRoleInput, touch: TagInvalidator = updateTag): Promise<ActionResponse> => {
    
    try {

        const user = await currentUser();

        if (!user) return { success: false, error: "Unable to locate user" };

        const { role, organizationId, userId } = userRoleSchema.parse(data);

        if (user.id === userId) return { success: false, error: "Unable to change your own role. Please reach out to the owner." };

        if (role === OrgRole.OWNER) return { success: false, error: "Ownership cannot be assigned here. Only an owner can grant ownership." };

        const userMembership = await prisma.membership.findUnique({ 
            where: {
                userId_organizationId: {
                    userId: user.id, 
                    organizationId
                }
            },
            select: { 
                role: true
            },
        });

        if (!userMembership ) return { success: false, error: "Unable to find membership" };
        
        if (userMembership.role === OrgRole.MEMBER) return { success: false, error: "Unauthorized" };

        const assignee = await prisma.membership.findUnique({
            where: {
                userId_organizationId: {
                    userId,
                    organizationId
                }
            },
            select: {
                role: true,
                user: { select: { firstName: true, lastName: true } },
            }
        });

        if (!assignee) return { success: false, error: "Unable to find membership for member" };

        if (userMembership.role === OrgRole.ADMIN && assignee.role !== OrgRole.MEMBER) return { success: false, error: "Insufficient permissions. Reach out to owner." };

        const newRole = await prisma.membership.update({
            where: {
                userId_organizationId: {
                    userId,
                    organizationId
                }
            },
            data: {
                role,
            },
            select: {
                role: true
            }
        });
        
        await logActivity({
            organizationId,
            type: ActivityType.ROLE_CHANGED,
            actorName: `${user.firstName} ${user.lastName}`,
            targetName: `${assignee.user.firstName} ${assignee.user.lastName}`,
            detail: orgRoleLabels[newRole.role],
        });

        touch(`org-${organizationId}-members-list`);
        touch(`user-${userId}-org-${organizationId}-role`)
        touch(`user-${userId}-orgs`);
        touch(`org-${organizationId}-activity`);
        revalidatePath(`/dashboard/organizations/${organizationId}`);

        return { success: true, role: newRole.role };

    } catch (error) {
        console.error(error);
        return { success: false, error: "Something went wrong" };
    }
}

export const removeMember = async (userId: string, organizationId: string, touch: TagInvalidator = updateTag): Promise<ActionResponse> => {

    try {

        const user = await currentUser();

        if (!user) return { success: false, error: "Unauthorized" };

        if (!userId || !organizationId) return { success: false, error: "No data received" };

        if (user.id === userId) return { success: false, error: "You cannot remove yourself. Transfer ownership or use the leave-organization flow." };

        const assignee = await prisma.membership.findUnique({
            where: {
                userId_organizationId: {
                    userId,
                    organizationId
                }
            },
            include: {
                user: { select: { email: true, firstName: true, lastName: true } }
            }
        });

        if (!assignee) return { success: false, error: "Unable to find membership" };

        const userMembership = await prisma.membership.findUnique({
            where: {
                userId_organizationId: {
                    userId: user.id,
                    organizationId
                }
            },
            select: {
                role: true
            },
        });

        if (!userMembership) return { success: false, error: "Unable to find membership" };

        if (userMembership.role === OrgRole.MEMBER || assignee.role === OrgRole.OWNER) return { success: false, error: "Insufficient permission, reach out to owner." };

        if (userMembership.role === OrgRole.ADMIN && assignee.role !== OrgRole.MEMBER) return { success: false, error: "Admins can only remove members." };

        const upcoming = await prisma.eventAssignment.findMany({
            where: {
                userId,
                organizationId,
                event: { dates: { some: { endTime: { gte: new Date() } } } },
            },
            select: { eventId: true },
        });

        await prisma.$transaction([
            prisma.eventAssignment.deleteMany({
                where: {
                    userId,
                    organizationId,
                    event: { dates: { some: { endTime: { gte: new Date() } } } },
                },
            }),
            prisma.blockoutDate.deleteMany({
                where: { userId, organizationId },
            }),
            prisma.invitation.deleteMany({
                where: { organizationId, email: assignee.user.email },
            }),
            prisma.membership.delete({
                where: { userId_organizationId: { userId, organizationId } },
            }),
        ]);

        await logActivity({
            organizationId,
            type: ActivityType.MEMBER_REMOVED,
            actorName: `${user.firstName} ${user.lastName}`,
            targetName: `${assignee.user.firstName} ${assignee.user.lastName}`,
        });

        for (const { eventId } of upcoming) {
            touch(`event-${eventId}-org-${organizationId}-details`);
        };
        touch(`user-${userId}-roles`);
        touch(`user-${userId}-orgs`);
        touch(`user-${userId}-events-${organizationId}`);
        touch(`user-${userId}-blockouts-${organizationId}`);
        touch(`org-${organizationId}-members-list`);
        touch(`org-${organizationId}-member-count`);
        touch(`user-${userId}-org-${organizationId}-role`);
        touch(`user-${userId}-memberships`);
        touch(`invitations-${organizationId}-list`);
        touch(`org-${organizationId}-activity`);

        revalidatePath(`/dashboard/organizations/${organizationId}`);

        return { success: true };

    } catch (err) {

        console.error(err)
        return { success: false, error: "Unable to process request" };
    };
};


export const updateVolunteerRoles = async (userId: string, organizationId: string, role: VolunteerRole, touch: TagInvalidator = updateTag): Promise<ActionResponse> => {

    try {

    if (!userId || !organizationId || !role) return { success: false, error: "No data received" };

    const user = await currentUser(); 
    
    if (!user) return { success: false, error: "Unauthorized" };

    const member = await prisma.membership.findUnique({
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

    if (!member) return { success: false, error: "Unable to find membership." };

    if (member.role === OrgRole.MEMBER) return { success: false, error: "Unauthorized. Reach out to an administrator"}

    const assignee = await prisma.membership.findUnique({
        where: {
            userId_organizationId: {
                userId,
                organizationId
            }
        },
        select: {
            role: true,
            volunteerRoles: true
        }
    });

    if (!assignee) return { success: false, error: "Unable to find membership for this user" };

    if (member.role === OrgRole.ADMIN && assignee.role === OrgRole.OWNER) return { success: false, error: "Insufficient Permissions. Unable to change owner volunteer roles." };

    await prisma.membership.update({
        where: {
            userId_organizationId: {
                userId,
                organizationId
            }
        },
        data: {
            volunteerRoles: assignee.volunteerRoles.includes(role)
                ? assignee.volunteerRoles.filter((r) => r !== role)
                : [...assignee.volunteerRoles, role]
        }
    });
    touch(`user-${userId}-roles`);
    touch(`user-${userId}-orgs`);
    touch(`org-${organizationId}-members-list`);
    revalidatePath(`/dashboard/organizations/${organizationId}`);

    return { success: true };

    } catch {
        return { success: false, error: "Something went wrong, please try again."}
    }

};

export const leaveOrganization = async (organizationId: string, touch: TagInvalidator = updateTag): Promise<ActionResponse> => {
    try {

        const user = await currentUser();

        if (!user) return { success: false, error: "Unauthorized" };

        if (!organizationId) return { success: false, error: "No valid data received" };

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

        if (!membership) return { success: false, error: "Unable to locate membership" };

        if (membership.role === OrgRole.OWNER) {
            
            const ownerCount = await prisma.membership.count({
            where: {
                organizationId,
                role: OrgRole.OWNER
               }
            });

            if (ownerCount <= 1) {
                return {
                    success: false,
                    error: "You're the only owner. Transfer ownership or delete the organization before leaving."
                }
            }
        };

        const upcoming = await prisma.eventAssignment.findMany({
      where: {
          userId: user.id,
          organizationId,
          event: { dates: { some: { endTime: { gte: new Date() } } } },
      },
      select: { eventId: true },
  });   

        

        await prisma.$transaction([
      prisma.eventAssignment.deleteMany({
          where: {
              userId: user.id,
              organizationId,
              event: { dates: { some: { endTime: { gte: new Date() } } } },
          },
      }),
      prisma.blockoutDate.deleteMany({
          where: { userId: user.id, organizationId },
      }),
      prisma.membership.delete({
          where: { userId_organizationId: { userId: user.id, organizationId } },
        }),
      ]);
      
        await logActivity({
            organizationId,
            type: ActivityType.MEMBER_LEFT,
            actorName: `${user.firstName} ${user.lastName}`,
        });

        for (const { eventId } of upcoming) {
            touch(`event-${eventId}-org-${organizationId}-details`);
        }
          touch(`user-${user.id}-roles`);
          touch(`user-${user.id}-orgs`);
          touch(`user-${user.id}-events-${organizationId}`);
          touch(`user-${user.id}-blockouts-${organizationId}`);
          touch(`org-${organizationId}-members-list`);
          touch(`org-${organizationId}-member-count`);
          touch(`user-${user.id}-org-${organizationId}-role`);
          touch(`user-${user.id}-memberships`);
          touch(`org-${organizationId}-activity`);
          revalidatePath(`/dashboard/organizations/${organizationId}`);

        return { success: true }

    } catch (err) {
        console.log(err);
        return { success: false, error: "Something went wrong" }
    };
};   

export const assignOwnerRole = async (data: AssignOwnerInput, touch: TagInvalidator = updateTag): Promise<ActionResponse> => {
    
    try {

        const user = await currentUser(); 

        if (!user) return { success: false, error: "Unable to find user" };

        const { organizationId, userId } = assignOwnerSchema.parse(data);

        const userMembership = await prisma.membership.findUnique({
            where: {
                userId_organizationId:{
                    userId: user.id,
                    organizationId
                }
            }
        });

        if (!userMembership) return { success: false, error: "No membership found." };

        if (userMembership.role !== OrgRole.OWNER) return { success: false, error: "Insufficient permissions. Please contact an owner." };

        if (user.id === userId) return { success: false, error: "Unable to assign." };

        const assignee = await prisma.membership.findUnique({
            where: {
                userId_organizationId: {
                    userId,
                    organizationId
                }
            },
            include: {
                user: { select: { firstName: true, lastName: true } }
            }
        });

        if (!assignee) return { success: false, error: "No membership found for this user." };

        await prisma.membership.update({
            where: {
                userId_organizationId: {
                    userId,
                    organizationId
                }
            },
            data: {
                role: OrgRole.OWNER
            }
        });

        await logActivity({
            organizationId,
            type: ActivityType.ROLE_CHANGED,
            actorName: `${user.firstName} ${user.lastName}`,
            targetName: `${assignee.user.firstName} ${assignee.user.lastName}`,
            detail: orgRoleLabels[OrgRole.OWNER],
        });

        touch(`org-${organizationId}-members-list`);
        touch(`user-${userId}-org-${organizationId}-role`);
        touch(`user-${userId}-orgs`);
        touch(`org-${organizationId}-activity`);
        revalidatePath(`/dashboard/organizations/${organizationId}`);

        return { success: true }

    } catch (err) {
        return { success: false, error: "Something went wrong. Please try again" }
    }
}