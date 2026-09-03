import prisma from "@/lib/prisma";
import type { InvitationStatus, VolunteerRole } from "@/generated/prisma/enums";
import { clerkIdOf, fail, json, route } from "@/lib/mobile/route";

/**
 * One invitation looked up by its token, for the deep link. Mirrors
 * `InvitationDetail` in the Expo app (`src/types/organization.ts`).
 *
 * Unlike the list beside it this answers for invitations the caller cannot
 * accept, because saying *why* is the whole job: already answered, lapsed, or
 * sent to a different address than the one they are signed in with.
 */
type InvitationDetail = {
    id: string;
    token: string;
    email: string;
    volunteerRoles: VolunteerRole[];
    expiresAt: string;
    createdAt: string;
    invitedBy: { firstName: string; lastName: string };
    organization: {
        id: string;
        name: string;
        description: string;
        logoUrl: string | null;
        memberCount: number;
    };
    status: InvitationStatus;
    expired: boolean;
    /** False when it was sent to an address other than the caller's. */
    forYou: boolean;
    /** True when the caller already belongs to the organization. */
    alreadyMember: boolean;
};

type Params = { token: string };

/**
 * GET /api/mobile/v1/invitations/[token]
 *
 * The dashboard's `/invite/[token]` page, as data. It requires a session where
 * the web page does not, because the app has one and the extra check costs
 * nothing; everything it discloses, the web page already shows to anyone
 * holding the link.
 */
export const GET = route<Params>("GET /invitations/[token]", async (_req, { params }) => {
    const clerkId = await clerkIdOf();

    if (!clerkId) return fail(401, "Unauthorized");

    const { token } = await params;

    const user = await prisma.user.findUnique({
        where: { clerkId },
        select: { id: true, email: true },
    });

    if (!user) return fail(401, "Unauthorized");

    const invitation = await prisma.invitation.findUnique({
        where: { token },
        select: {
            id: true,
            token: true,
            email: true,
            status: true,
            volunteerRoles: true,
            expiresAt: true,
            createdAt: true,
            invitedBy: { select: { firstName: true, lastName: true } },
            organization: {
                select: {
                    id: true,
                    name: true,
                    description: true,
                    logoUrl: true,
                    _count: { select: { memberships: true } },
                    memberships: {
                        where: { userId: user.id },
                        select: { id: true },
                    },
                },
            },
        },
    });

    if (!invitation) return fail(404, "Not Found");

    const detail: InvitationDetail = {
        id: invitation.id,
        token: invitation.token,
        email: invitation.email,
        volunteerRoles: invitation.volunteerRoles,
        expiresAt: invitation.expiresAt.toISOString(),
        createdAt: invitation.createdAt.toISOString(),
        invitedBy: invitation.invitedBy,
        organization: {
            id: invitation.organization.id,
            name: invitation.organization.name,
            description: invitation.organization.description,
            logoUrl: invitation.organization.logoUrl,
            memberCount: invitation.organization._count.memberships,
        },
        status: invitation.status,
        expired: invitation.expiresAt < new Date(),
        forYou: invitation.email.toLowerCase() === user.email.toLowerCase(),
        alreadyMember: invitation.organization.memberships.length > 0,
    };

    return json({ invitation: detail });
});
