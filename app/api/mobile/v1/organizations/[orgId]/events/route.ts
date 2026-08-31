import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import {
    InvitationStatus,
    OrgRole,
    type VolunteerRole,
} from "@/generated/prisma/enums";


/**
 * Wire contract for the events screen's All tab. Mirrors `OrganizationEvent`
 * and friends in the Expo app (`src/types/event.ts`) — keep the two in sync,
 * and with the user-events route beside this one, which returns the same shape
 * without `filledRoleCount`.
 */
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
    filledRoleCount: number;
};


const NO_STORE = { "Cache-Control": "private, no-store" };


/**
 * GET /api/mobile/v1/organizations/[orgId]/events
 *
 * Every event in one organization — the query `getOrgEvents`
 * (lib/services/events.ts) runs for the web dashboard, plus the staffing
 * number the mobile card's meter reads.
 *
 * Owners and admins only, matching the web: the dashboard only asks for this
 * list behind `canManage`, and a plain member's own events are what the
 * user-events route beside this one answers with.
 */
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

        const membership = await prisma.membership.findFirst({
            where: {
                organizationId: orgId,
                user: {
                    clerkId: userId,
                },
            },
            select: {
                userId: true,
                role: true,
            },
        });

        if (!membership) {
            return NextResponse.json(
                { error: "Not Found" },
                { status: 404, headers: NO_STORE },
            );
        };

        // Named roles rather than "not a member", which is how every gate in
        // the dashboard reads. A role added later is then shut out until
        // somebody decides otherwise, instead of inheriting the whole roster.
        const canManage =
            membership.role === OrgRole.OWNER || membership.role === OrgRole.ADMIN;

        if (!canManage) {
            return NextResponse.json(
                { error: "Forbidden" },
                { status: 403, headers: NO_STORE },
            );
        };

        // Two questions of the same table: which events there are, and — for
        // the staffing meter — which of the roles each one asked for has
        // somebody on it. Grouping by role rather than counting rows keeps two
        // guitarists from reading as a filled drum stool.
        const [events, acceptedRoles] = await Promise.all([
            prisma.event.findMany({
                where: {
                    organizationId: orgId,
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
                    // The caller's own assignments, so their role badge still
                    // shows on an event they are also managing. An event
                    // nobody invited them to carries an empty array.
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
            }),
            prisma.eventAssignment.groupBy({
                by: ["eventId", "role"],
                where: {
                    organizationId: orgId,
                    status: InvitationStatus.ACCEPTED,
                },
                _count: {
                    _all: true,
                },
            }),
        ]);

        const rolesByEvent = new Map<string, Set<VolunteerRole>>();

        for (const row of acceptedRoles) {
            const roles = rolesByEvent.get(row.eventId) ?? new Set<VolunteerRole>();
            roles.add(row.role);
            rolesByEvent.set(row.eventId, roles);
        }

        const orgEvents: OrganizationEvent[] = events.map((event) => {
            const filled = rolesByEvent.get(event.id);

            return {
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
                filledRoleCount: event.rolesNeeded.filter(
                    (role) => filled?.has(role) ?? false,
                ).length,
            };
        });

        return NextResponse.json({ events: orgEvents }, { headers: NO_STORE });

    } catch (err) {
        console.error("GET /api/mobile/v1/organizations/[orgId]/events failed", err);
        return NextResponse.json(
            { error: "Internal Server Error" },
            { status: 500, headers: NO_STORE },
        );
    };

};
