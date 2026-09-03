import prisma from "@/lib/prisma";
import { InvitationStatus, type VolunteerRole } from "@/generated/prisma/enums";
import { clerkIdOf, fail, json, route } from "@/lib/mobile/route";

/**
 * Wire contract for an invitation the caller has been sent. Mirrors
 * `PendingInvitation` in the Expo app (`src/types/organization.ts`) — keep the
 * two in sync, and treat it as additive-only.
 *
 * `token` rides along because it is what answering one is keyed on. It is the
 * caller's own invitation, sent to the caller's own address, so this hands
 * them nothing the email in their inbox did not.
 */
type PendingInvitation = {
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
};

/**
 * GET /api/mobile/v1/invitations
 *
 * Every organization invitation waiting on the caller: pending, unexpired, and
 * addressed to the email their account is signed in with.
 *
 * This is the phone's answer to the dashboard's emailed token link. A browser
 * needs the link because it has no idea who is reading; the app already knows,
 * so it can simply ask what is waiting. Not scoped to an organization — the
 * whole point is that the caller is not a member of one yet.
 */
export const GET = route<Record<string, never>>("GET /invitations", async () => {
    const clerkId = await clerkIdOf();

    if (!clerkId) return fail(401, "Unauthorized");

    const user = await prisma.user.findUnique({
        where: { clerkId },
        select: { email: true },
    });

    if (!user) return fail(401, "Unauthorized");

    const rows = await prisma.invitation.findMany({
        where: {
            // Matched case-insensitively: the schema lowercases new invitations,
            // but rows written before it did are still out there.
            email: { equals: user.email, mode: "insensitive" },
            status: InvitationStatus.PENDING,
            expiresAt: { gt: new Date() },
        },
        orderBy: { createdAt: "desc" },
        select: {
            id: true,
            token: true,
            email: true,
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
                },
            },
        },
    });

    const invitations: PendingInvitation[] = rows.map((row) => ({
        id: row.id,
        token: row.token,
        email: row.email,
        volunteerRoles: row.volunteerRoles,
        expiresAt: row.expiresAt.toISOString(),
        createdAt: row.createdAt.toISOString(),
        invitedBy: row.invitedBy,
        organization: {
            id: row.organization.id,
            name: row.organization.name,
            description: row.organization.description,
            logoUrl: row.organization.logoUrl,
            memberCount: row.organization._count.memberships,
        },
    }));

    return json({ invitations });
});
