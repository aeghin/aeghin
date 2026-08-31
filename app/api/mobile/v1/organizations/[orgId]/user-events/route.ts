import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import { InvitationStatus, type VolunteerRole } from "@/generated/prisma/enums";


type EventDate = {
    id: string;
    startTime: string;
    endTime: string;
};

type EventAssignment = {
    id: string;
    userId: string;
    role: VolunteerRole;
    status: InvitationStatus;
    assignedBy: { firstName: string } | null;
    expiresAt: string;
};

type OrganizationEvent = {
    id: string;
    name: string;
    description: string;
    location: string;
    serviceTypeId: string;
    dates: EventDate[];
    assignments: EventAssignment[];
    rolesNeeded: VolunteerRole[];
    smartSchedulingEnabled: boolean;
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

        // The query below needs the database user id, but the token only carries
        // a Clerk id — and being a member of this org is exactly what earns you
        // this list. One lookup answers both questions.
        const membership = await prisma.membership.findFirst({
            where: {
                organizationId: orgId,
                user: {
                    clerkId: userId,
                },
            },
            select: {
                userId: true,
            },
        });

        if (!membership) {
            return NextResponse.json(
                { error: "Not Found" },
                { status: 404, headers: NO_STORE },
            );
        };

        const events = await prisma.event.findMany({
            where: {
                organizationId: orgId,
                assignments: {
                    some: {
                        userId: membership.userId,
                        OR: [
                            { status: InvitationStatus.ACCEPTED },
                            { status: InvitationStatus.PENDING },
                        ],
                    },
                },
            },
            select: {
                id: true,
                name: true,
                description: true,
                location: true,
                serviceTypeId: true,
                rolesNeeded: true,
                smartSchedulingEnabled: true,
                dates: {
                    select: {
                        id: true,
                        startTime: true,
                        endTime: true,
                    },
                },
                // The caller's assignments only, so a role badge on the list can
                // never belong to somebody else.
                assignments: {
                    where: {
                        userId: membership.userId,
                        OR: [
                            { status: InvitationStatus.ACCEPTED },
                            { status: InvitationStatus.PENDING },
                        ],
                    },
                    select: {
                        id: true,
                        userId: true,
                        role: true,
                        status: true,
                        assignedBy: {
                            select: {
                                firstName: true,
                            },
                        },
                        expiresAt: true,
                    },
                },
            },
        });

        const userEvents: OrganizationEvent[] = events.map((event) => ({
            ...event,
            dates: event.dates.map((date) => ({
                id: date.id,
                startTime: date.startTime.toISOString(),
                endTime: date.endTime.toISOString(),
            })),
            assignments: event.assignments.map((assignment) => ({
                ...assignment,
                expiresAt: assignment.expiresAt.toISOString(),
            })),
        }));

        return NextResponse.json({ events: userEvents }, { headers: NO_STORE });

    } catch (err) {
        console.error("GET /api/mobile/v1/organizations/[orgId]/user-events failed", err);
        return NextResponse.json(
            { error: "Internal Server Error" },
            { status: 500, headers: NO_STORE },
        );
    };

};
