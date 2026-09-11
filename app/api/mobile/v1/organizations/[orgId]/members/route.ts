import { NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import { type OrgRole, type VolunteerRole } from "@/generated/prisma/enums";
import { canManage, clerkIdOf, membershipFor } from "@/lib/mobile/route";


/**
 * Wire contract for the roster. Mirrors `OrganizationMember` in the Expo app
 * (`src/types/organization.ts`) — keep the two in sync, additive-only.
 */
type OrganizationMember = {
    id: string;
    firstName: string;
    lastName: string;
    /** Empty for everyone but yourself when the caller is a plain member. */
    email: string;
    /** Same rule as `email`, and empty anyway for anyone who never gave one. */
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

        const clerkId = await clerkIdOf();

        if (!clerkId) {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401, headers: NO_STORE },
            );
        };

        const { orgId } = await params;

        // Belonging to the organization is the gate, and the caller's own role
        // is what decides how much of each row they are allowed to read.
        const viewer = await membershipFor(clerkId, orgId);

        if (!viewer) {
            return NextResponse.json(
                { error: "Not Found" },
                { status: 404, headers: NO_STORE },
            );
        };

        const memberships = await prisma.membership.findMany({
            where: {
                organizationId: orgId,
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

        /**
         * Contact details are an owner's and an admin's to see, exactly as the
         * dashboard's members tab decides it. A plain member gets names, roles
         * and volunteer roles for everybody, and reaches their own row in full.
         *
         * Withheld here rather than hidden on the phone: a field that reaches
         * the device has been disclosed, whatever the screen then draws.
         */
        const seesContacts = canManage(viewer.role);

        const members: OrganizationMember[] = memberships.map(({ role, volunteerRoles, createdAt, user }) => {
            const visible = seesContacts || user.id === viewer.userId;

            return {
                id: user.id,
                firstName: user.firstName,
                lastName: user.lastName,
                email: visible ? user.email : "",
                phoneNumber: visible ? user.phoneNumber : "",
                imageUrl: user.userImageUrl,
                role,
                volunteerRoles,
                joinedAt: createdAt.toISOString(),
            };
        });

        return NextResponse.json({ members }, { headers: NO_STORE });

    } catch (err) {
        console.error("GET /api/mobile/v1/organizations/[orgId]/members failed", err);
        return NextResponse.json(
            { error: "Internal Server Error" },
            { status: 500, headers: NO_STORE },
        );
    };

};
