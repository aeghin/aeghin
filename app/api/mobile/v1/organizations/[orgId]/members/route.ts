import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import { type OrgRole } from "@/generated/prisma/enums";


type OrganizationMember = {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    phoneNumber: string;
    imageUrl: string | null;
    role: OrgRole;
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

        const members: OrganizationMember[] = memberships.map(({ role, user }) => ({
            id: user.id,
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
            phoneNumber: user.phoneNumber,
            imageUrl: user.userImageUrl,
            role,
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
