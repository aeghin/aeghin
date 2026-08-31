import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import { InvitationStatus, type OrgRole } from "@/generated/prisma/enums";


type OrganizationDetail = {
    id: string;
    name: string;
    description: string;
    logoUrl: string | null;
    role: OrgRole;
    memberCount: number;
    createdAt: string;
    upcomingEventCount: number;
    songCount: number;
    pendingInvitationCount: number;
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

        const now = new Date();

        const organizationDetails = await prisma.organization.findUnique({
            where: {
                id: orgId,
                memberships: {
                    some: {
                        user: {
                            clerkId: userId,
                        },
                    },
                },
            },
            select: {
                id: true,
                name: true,
                description: true,
                logoUrl: true,
                createdAt: true,
                memberships: {
                    where: {
                        user: {
                            clerkId: userId,
                        },
                    },
                    select: {
                        role: true,
                    },
                },
                _count: {
                    select: {
                        memberships: true,
                        invitations: { where: { status: InvitationStatus.PENDING } },
                        songs: { where: { deletedAt: null } },
                        events: { where: { dates: { some: { startTime: { gte: now } } } } },
                    },
                },
            },
        });

        if (!organizationDetails) {
            return NextResponse.json(
                { error: "Not Found" },
                { status: 404, headers: NO_STORE },
            );
        };

        const { memberships, _count, createdAt, ...organization } = organizationDetails;

        
        const organizationDetail: OrganizationDetail = {
            ...organization,
            role: memberships[0].role,
            memberCount: _count.memberships,
            createdAt: createdAt.toISOString(),
            upcomingEventCount: _count.events,
            songCount: _count.songs,
            pendingInvitationCount: _count.invitations,
        };

        return NextResponse.json(
            { organization: organizationDetail },
            { headers: NO_STORE },
        );

    } catch (err) {
        console.error("GET /api/mobile/v1/organizations/[orgId] failed", err);
        return NextResponse.json(
            { error: "Internal Server Error" },
            { status: 500, headers: NO_STORE },
        );
    };

};
