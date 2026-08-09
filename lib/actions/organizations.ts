"use server";

import { auth } from "@clerk/nextjs/server";
import prisma from "@/lib/prisma";
import { organizationSchema, OrganizationInput, organizationLogoSchema, OrganizationLogoInput } from "@/lib/validations/organization";
import { OrganizationEmailInput, organizationEmailSchema } from "../validations/organization-email";
import { revalidatePath, updateTag } from "next/cache";
import { OrgRole } from "@/generated/prisma/enums";
import { UTApi } from "uploadthing/server";
import { currentUser } from "../services/user";
import { Resend } from "resend";
import OrganizationMessageEmail from "@/components/email/organization-message-template";


const resend = new Resend(process.env.RESEND_EMAIL_API_KEY);


type ActionResponse =
  | { success: true; orgId?: string }
  | { success: false; error: string }


export async function createOrganization(data: OrganizationInput): Promise<ActionResponse> {

    try {
        
        const { userId } = await auth();

        if (!userId) return { success: false, error: "Unauthorized" };

        const user = await prisma.user.findUnique({
            where: { clerkId: userId }
        });

        if (!user) return { success: false, error: "Unauthorized" };

        const { name, description } = organizationSchema.parse(data);

        const orgExists = await prisma.organization.findFirst({
            where: {
                name,
                memberships: {
                    some: {
                        userId: user.id,
                        role: OrgRole.OWNER
                    }
                }
            },
        });

        if (orgExists) {
            return { success: false, error: 'Organization exists' }
        };

        const organization = await prisma.$transaction(async (trx) => {
            const org = await trx.organization.create({
                data: {
                    name,
                    description
                }
            });

            await trx.membership.create({
                data: {
                    userId: user.id,
                    organizationId: org.id,
                    role: OrgRole.OWNER
                }
            });

            return org;
        });

        updateTag(`user-${user.id}-orgs`);
        updateTag(`user-${user.id}-memberships`);
        revalidatePath('/dashboard');
        
        return { success: true, orgId: organization.id }
        
    } catch (error) {

        console.error('createOrganization error:', error)

        return { success: false, error: 'Something went wrong' }
    };
};


export const updateOrganizationDetails = async (organizationId: string, values: OrganizationInput): Promise<ActionResponse> => {

    try {

        const { userId } = await auth();

        if (!userId) return { success: false, error: "Unauthorized" };

        const { name, description } = organizationSchema.parse(values);

        const user = await prisma.user.findUnique({
            where: {
                clerkId: userId
            },
        });

        if (!user) return { success: false, error: "Unable to find the user" };

        const currentUser = await prisma.membership.findFirst({
            where: {
                userId: user.id,
                organizationId,
                role: OrgRole.OWNER
            },
        });

        if (!currentUser) return { success: false, error: "Unable to make edits. Please reach out to an owner."}

        
        await prisma.organization.update({
            where: {
                id: organizationId
            },
            data: {
                name,
                description
            }
        });

        updateTag(`org-${organizationId}-details`);
        updateTag(`org-${organizationId}-setting-details`);
        updateTag(`org-${organizationId}-list-entry`);

        
        return { success: true };

    } catch (err) {
        return { success: false, error: "Something went wrong, please try again." }
    }
}


export const updateOrganizationLogo = async (organizationId: string, logo: OrganizationLogoInput): Promise<ActionResponse> => {

    try {

        const { userId } = await auth();

        if (!userId) return { success: false, error: "Unauthorized" };

        const { url, key } = organizationLogoSchema.parse(logo);

        const user = await prisma.user.findUnique({
            where: {
                clerkId: userId
            },
        });

        if (!user) return { success: false, error: "Unable to find the user" };

        const currentUser = await prisma.membership.findFirst({
            where: {
                userId: user.id,
                organizationId,
                role: OrgRole.OWNER
            },
        });

        if (!currentUser) return { success: false, error: "Unable to make edits. Please reach out to an owner." };

        const organization = await prisma.organization.findUnique({
            where: { id: organizationId },
            select: { logoKey: true }
        });

        if (!organization) return { success: false, error: "Organization not found" };

        await prisma.organization.update({
            where: {
                id: organizationId
            },
            data: {
                logoUrl: url,
                logoKey: key
            }
        });

        if (organization.logoKey && organization.logoKey !== key) {
            try {
                const utapi = new UTApi();
                await utapi.deleteFiles(organization.logoKey);
            } catch (err) {
                console.error('updateOrganizationLogo file cleanup error:', err);
            }
        }

        updateTag(`org-${organizationId}-details`);
        updateTag(`org-${organizationId}-setting-details`);
        updateTag(`org-${organizationId}-list-entry`);

        return { success: true };

    } catch (err) {
        console.error('updateOrganizationLogo error:', err);
        return { success: false, error: "Something went wrong, please try again." }
    }
}


export const removeOrganizationLogo = async (organizationId: string): Promise<ActionResponse> => {

    try {

        const { userId } = await auth();

        if (!userId) return { success: false, error: "Unauthorized" };

        const user = await prisma.user.findUnique({
            where: {
                clerkId: userId
            },
        });

        if (!user) return { success: false, error: "Unable to find the user" };

        const currentUser = await prisma.membership.findFirst({
            where: {
                userId: user.id,
                organizationId,
                role: OrgRole.OWNER
            },
        });

        if (!currentUser) return { success: false, error: "Unable to make edits. Please reach out to an owner." };

        const organization = await prisma.organization.findUnique({
            where: { id: organizationId },
            select: { logoKey: true }
        });

        if (!organization) return { success: false, error: "Organization not found" };

        await prisma.organization.update({
            where: {
                id: organizationId
            },
            data: {
                logoUrl: null,
                logoKey: null
            }
        });

        if (organization.logoKey) {
            try {
                const utapi = new UTApi();
                await utapi.deleteFiles(organization.logoKey);
            } catch (err) {
                console.error('removeOrganizationLogo file cleanup error:', err);
            }
        }

        updateTag(`org-${organizationId}-details`);
        updateTag(`org-${organizationId}-setting-details`);
        updateTag(`org-${organizationId}-list-entry`);

        return { success: true };

    } catch (err) {
        console.error('removeOrganizationLogo error:', err);
        return { success: false, error: "Something went wrong, please try again." }
    }
}


export const deleteOrganization = async (organizationId: string): Promise<ActionResponse> => {

    try {

        const { userId } = await auth();

        if (!userId) return { success: false, error: "Unauthorized" };

        const membership = await prisma.membership.findFirst({
            where: {
                user: {
                    clerkId: userId
                },
                organizationId,
                role: OrgRole.OWNER
            },
            select: { userId: true }
        });

        if (!membership) return { success: false, error: "Forbidden" };

        const members = await prisma.membership.findMany({
            where: { organizationId },
            select: { userId: true }
        });

        await prisma.$transaction([
            prisma.event.deleteMany({ where: { organizationId } }),
            prisma.song.deleteMany({ where: { organizationId } }),
            prisma.eventTemplate.deleteMany({ where: { organizationId } }),
            prisma.serviceType.deleteMany({ where: { organizationId } }),
            prisma.organization.delete({ where: { id: organizationId } }),
        ]);

        for (const { userId: memberId } of members) {
            updateTag(`user-${memberId}-orgs`);
            updateTag(`user-${memberId}-memberships`);
        }

        updateTag(`org-${organizationId}-details`);
        updateTag(`org-${organizationId}-setting-details`);
        updateTag(`org-${organizationId}-list-entry`);
        updateTag(`org-${organizationId}-member-count`);
        updateTag(`org-${organizationId}-members-list`);
        updateTag(`org-${organizationId}-st`);
        updateTag(`org-${organizationId}-songs`);
        updateTag(`org-${organizationId}-templates`);
        updateTag(`invitations-${organizationId}-list`);

        revalidatePath('/dashboard');
        
        return { success: true };
        
    } catch (error) {
        console.error('deleteOrganization error:', error);
        return { success: false, error: "Something went wrong." };
    }
};


type EmailOrganizationResult =
  | { success: true; sentCount: number }
  | { success: false; error: string };


export const emailEntireOrganization = async (
    organizationId: string,
    data: OrganizationEmailInput,
): Promise<EmailOrganizationResult> => {

    try {

        const user = await currentUser();

        if (!user) return { success: false, error: "Unable to find user" };

        const parsed = organizationEmailSchema.safeParse(data);

        if (!parsed.success) return { success: false, error: "Invalid data provided." };

        const { subject, body } = parsed.data;

        const userMembership = await prisma.membership.findUnique({
            where: {
                userId_organizationId: {
                    userId: user.id,
                    organizationId
                }
            },
            select: {
                role: true,
                organization: {
                    select: {
                        name: true,
                        logoUrl: true
                    }
                }
            }
        });

        if (!userMembership) return { success: false, error: "Unable to find membership." };

        if (userMembership.role === OrgRole.MEMBER) return { success: false, error: "Insufficient permissions" };
        
        const membersInfo = await prisma.membership.findMany({
            where: {
                organizationId,
            },
            select: {
                user: {
                    select: {
                        firstName: true,
                        email: true,
                    }
                }
            }
        });

        if (membersInfo.length === 0) {
            return { success: false, error: "No members to email" };
        }

        const { name: organizationName, logoUrl } = userMembership.organization;
        const senderName = `${user.firstName} ${user.lastName}`;
        const viewLink = `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/organizations/${organizationId}`;

        const emails = membersInfo.map(({ user: recipient }) => ({
            from: `${organizationName} <support@aeghin.com>`,
            to: recipient.email,
            replyTo: user.email,
            subject,
            react: OrganizationMessageEmail({
                recipientName: recipient.firstName,
                senderName,
                organizationName,
                logoUrl,
                body,
                viewLink,
            }),
        }));

        // Sent in the request (not after()) so the sender gets a real
        // delivered/failed answer. batch.send caps at 100 emails per call.
        for (let i = 0; i < emails.length; i += 100) {
            const { error } = await resend.batch.send(emails.slice(i, i + 100));

            if (error) {
                return { success: false, error: "Unable to send message, please try again" };
            }
        }

        return { success: true, sentCount: membersInfo.length };

    } catch (error) {
        console.error('emailEntireOrganization error:', error);
        return { success: false, error: "Something went wrong." };
    }

}