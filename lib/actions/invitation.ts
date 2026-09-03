"use server";

import { auth } from "@clerk/nextjs/server";
import prisma from "@/lib/prisma";
import { orgInvitationSchema, OrgInvitationInput } from "../validations/invitations";
import { OrgRole, InvitationStatus, ActivityType } from "@/generated/prisma/enums";
import { logActivity, volunteerRoleLabels } from "@/lib/activity";

import { Resend } from "resend";
import InvitationEmail from "@/components/email/email-template";
import { verifyInvitationByToken } from "../services/invitation";

import { after } from "next/server";
import { updateTag } from "next/cache";
import { currentUser } from "../services/user";

/**
 * How a caller expires cache tags. `updateTag` throws inside a Route Handler,
 * so the mobile routes pass `revalidateTag`; every web call site keeps the
 * default. Not exported: a "use server" module may only export async functions.
 */
type TagInvalidator = (tag: string) => void;


// import twilio from 'twilio';

// const twilioClient = twilio(
//   process.env.TWILIO_ACCOUNT_SID!,
//   process.env.TWILIO_AUTH_TOKEN!
// );

const resend = new Resend(process.env.RESEND_EMAIL_API_KEY);

type ActionResponse =
  | { success: true; orgId?: string }
  | { success: false; error: string }

export async function inviteMember(data: OrgInvitationInput, touch: TagInvalidator = updateTag): Promise<ActionResponse> {
    
    try {

        const { userId } = await auth();

        if (!userId) return { success: false, error: "Unauthorized" };

        const user = await prisma.user.findUnique({
            where: { clerkId: userId } 
        });

        if (!user) return { success: false, error: "User not found" };


        const { email, volunteerRoles, orgId, phoneNumber } = orgInvitationSchema.parse(data);

        const membership = await prisma.membership.findUnique({
            where: {
                userId_organizationId: { userId: user.id, organizationId: orgId }
            },
            select: { role: true, organization: true }
        }); 

        if (!membership) return { success: false, error: "Not a member" };

        if (membership.role === OrgRole.MEMBER) return { success: false, error: "Insufficient Permissions" };

        const existingMember = await prisma.membership.findFirst({
            where: {
                organizationId: orgId,
                user: { email: { equals: email, mode: "insensitive" } }
            }
        });
        
        if (existingMember) return { success: false, error: "User is member" };

        const invitation = await prisma.invitation.upsert({
            where: {
                email_organizationId: {
                    email: email, organizationId: orgId
                } 
            },
            update: { 
                token: crypto.randomUUID(), 
                expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),  
                status: InvitationStatus.PENDING,
                volunteerRoles,
                invitedById: user.id,
            },
            create: {
                email,
                volunteerRoles,
                expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                invitedById: user.id,
                organizationId: orgId,
            }
        });

        await logActivity({
            organizationId: orgId,
            type: ActivityType.INVITE_SENT,
            actorName: `${user.firstName} ${user.lastName}`,
            targetName: email,
            detail: volunteerRoles.length
                ? volunteerRoles.map((role) => volunteerRoleLabels[role]).join(", ")
                : undefined,
        });

        touch(`invitations-${orgId}-list`);
        touch(`org-${orgId}-activity`);

        after(async () => {await resend.emails.send({
            from: `${membership.organization.name} <support@aeghin.com>`,
            to: email,
            subject: `You've been invited to join ${membership.organization.name}`,
            react: InvitationEmail({
                organizationName: membership.organization.name,
                logoUrl: membership.organization.logoUrl,
                invitedByName: user.firstName,
                volunteerRoles: volunteerRoles,
                inviteLink: `${process.env.NEXT_PUBLIC_APP_URL}/invite/${invitation.token}`
            })
        })
    });

        // await twilioClient.messages.create({
        //      body: `${user.firstName} has invited you to join ${membership.organization.name}! Accept here: ${process.env.NEXT_PUBLIC_APP_URL}/invite/${invitation.token}`,
        //      from: process.env.TWILIO_PHONE_NUMBER!,
        //      to: `+1${phoneNumber}`,
        //     });

        return { success: true };
    } catch (err) {
        return { success: false, error: "Failed to send invitation" };
    };
};


export async function acceptOrgInvite(token: string, touch: TagInvalidator = updateTag): Promise<ActionResponse> {

    try {

        const { userId } = await auth();

        if (!userId) return { success: false, error: "Unauthorized" };

        const user = await prisma.user.findUnique({
            where: {
                clerkId: userId,
            },
        });

         if (!user) return { success: false, error: "User not found"};

         const invitation = await verifyInvitationByToken(token);

         if (!invitation) return { success: false, error: "Invalid invitation" };
         
         if (invitation.expiresAt < new Date()) return { success: false, error: "Invitation has expired"};
         
         if (invitation.status !== InvitationStatus.PENDING) return { success: false, error: "This invitation is no longer valid" };
         
         if (user.email.toLowerCase() !== invitation.email.toLowerCase()) {
            return { success: false, error: "Incorrect Invitation"}
         };
         
         const acceptedInvitation = await prisma.$transaction(async (trx) => {
            const inv = await trx.invitation.update({
                where: {
                    id: invitation.id,
                },
                data: {
                    status: InvitationStatus.ACCEPTED
                }
            });

            await trx.membership.create({
                data: {
                    volunteerRoles: invitation.volunteerRoles,
                    userId: user.id,
                    organizationId: invitation.organizationId,
                }
            })

            return inv
        
         });

         await logActivity({
            organizationId: acceptedInvitation.organizationId,
            type: ActivityType.INVITE_ACCEPTED,
            actorName: `${user.firstName} ${user.lastName}`,
         });

         touch(`invitations-${acceptedInvitation.organizationId}-list`);
         touch(`user-${user.id}-orgs`);
         touch(`org-${acceptedInvitation.organizationId}-member-count`);
         touch(`org-${acceptedInvitation.organizationId}-members-list`);
         touch(`user-${user.id}-memberships`);
         touch(`org-${acceptedInvitation.organizationId}-activity`);

         return { success: true, orgId: acceptedInvitation.organizationId }

    } catch (error) {

        return { success: false, error: "Something went wrong; unable to accept invite" }
    };
};

export async function declineOrgInvite(token: string, touch: TagInvalidator = updateTag): Promise<ActionResponse> {

    try {

    const { userId } = await auth();

    if (!userId) return { success: false, error: "Unauthorized" };

    const user = await prisma.user.findUnique({
            where: {
                clerkId: userId,
            },
        });

    if (!user) return { success: false, error: "User not found" };

    const invitation = await verifyInvitationByToken(token);
    
    if (!invitation) return { success: false, error: "Invalid invitation" };

    if (invitation.expiresAt < new Date()) return { success: false, error: "Invitation has expired"};

    if (user.email.toLowerCase() !== invitation.email.toLowerCase()) return { success: false, error: "Incorrect Invitation"};

    if (invitation.status !== InvitationStatus.PENDING) return { success: false, error: "This invitation is no longer valid" };

    await prisma.invitation.update({
        where: {
            id: invitation.id,
        },
        data: {
            status: InvitationStatus.DECLINED
        }
    });

    await logActivity({
        organizationId: invitation.organizationId,
        type: ActivityType.INVITE_DECLINED,
        actorName: `${user.firstName} ${user.lastName}`,
    });

    touch(`invitations-${invitation.organizationId}-list`);
    touch(`org-${invitation.organizationId}-activity`);

    return { success: true };

    } catch (error) {

        return { success: false, error: "Unable to decline invitation" };

    };
};

export const cancelOrgInvite = async (organizationId: string, userEmail: string, touch: TagInvalidator = updateTag): Promise<ActionResponse> => {

    try {

        const user = await currentUser();

        if (!user) return { success: false, error: "Unable to find user" };

        if (!organizationId || !userEmail) return { success: false, error: "Insufficient data" };

        const membership = await prisma.membership.findUnique({
            where: {
                userId_organizationId: {
                    userId: user.id,
                    organizationId
                }
            }
        });

        if (!membership) return { success: false, error: "Unable to find membership" };

        if (membership.role === OrgRole.MEMBER) return { success: false, error: "Unable to process request." };

        const invitation = await prisma.invitation.findUnique({
            where: {
                email_organizationId: {
                    email: userEmail,
                    organizationId
                }
            }
        });

        if (!invitation) return { success: false, error: "Invitation doesn't exist." };

        if (invitation.status !== InvitationStatus.PENDING) return { success: false, error: "This invitation has either been accepted, declined or canceled already" };

        await prisma.invitation.update({
            where: {
                email_organizationId: {
                    email: userEmail,
                    organizationId
                }
            },
            data: {
                status: InvitationStatus.CANCELED
            }
        });

        await logActivity({
            organizationId,
            type: ActivityType.INVITE_CANCELED,
            actorName: `${user.firstName} ${user.lastName}`,
            targetName: userEmail,
        });

        touch(`invitations-${organizationId}-list`);
        touch(`org-${organizationId}-activity`);

        return { success: true };

    } catch {

        return { success: false, error: "Something went wrong, please try again" };

    }
}