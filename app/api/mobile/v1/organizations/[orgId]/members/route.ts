import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import { type OrgRole, type VolunteerRole } from "@/generated/prisma/enums";


/**
 * Wire contract for the roster. Mirrors `OrganizationMember` in the Expo app
 * (`src/types/organization.ts`) — keep the two in sync, additive-only.
 */
type OrganizationMember = {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    phoneNumber: string;
    imageUrl: string | null;
    role: OrgRole;
    /** What they can be scheduled for — the event invite picker filters on it. */
    volunteerRoles: VolunteerRole[];
    joinedAt: string;
};


const NO_STORE = { "Cache-Control": "private, no-store" };


export async function GET(
    _req: Request,
    { params }: { params: Promise<{ orgId: string }> },
) {

    try {

        const { userId } = await auth();

        if (!userId) {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401, headers: NO_STORE },
            );
        };

        const { orgId } = await params;

        const memberships = await prisma.membership.findMany({
            where: {
                organizationId: orgId,
                organization: {
                    memberships: {
                        some: {
                            user: {
                                clerkId: userId,
                            },
                        },
                    },
                },
            },
            orderBy: [
                { createdAt: "asc" },
                { id: "asc" },
            ],
            select: {
                role: true,
                volunteerRoles: true,
                createdAt: true,
                user: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        email: true,
                        phoneNumber: true,
                        userImageUrl: true,
                    },
                },
            },
        });

        
        if (memberships.length === 0) {
            return NextResponse.json(
                { error: "Not Found" },
                { status: 404, headers: NO_STORE },
            );
        };

        const members: OrganizationMember[] = memberships.map(({ role, volunteerRoles, createdAt, user }) => ({
            id: user.id,
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
            phoneNumber: user.phoneNumber,
            imageUrl: user.userImageUrl,
            role,
            volunteerRoles,
            joinedAt: createdAt.toISOString(),
        }));

        return NextResponse.json({ members }, { headers: NO_STORE });

    } catch (err) {
        console.error("GET /api/mobile/v1/organizations/[orgId]/members failed", err);
        return NextResponse.json(
            { error: "Internal Server Error" },
            { status: 500, headers: NO_STORE },
        );
    };

};
