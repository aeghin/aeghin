import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import {
    InvitationStatus,
    OrgRole,
    VolunteerRole,
} from "@/generated/prisma/enums";
import { createEvent } from "@/lib/actions/event";
import type { CreateEventInput } from "@/lib/validations/event";
import {
    clerkIdOf,
    expireTag,
    isObject,
    membershipFor,
    readJson,
} from "@/lib/mobile/route";


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


/**
 * What the phone sends to create an event.
 *
 * Deliberately not the dashboard form's own shape. The web carries a
 * `dateRange` its action never reads and a `dayTimes` record keyed by date
 * whose values are full ISO instants, both of which are artefacts of a
 * react-hook-form wizard. The phone sends the thing itself: one entry per day
 * the event runs, with wall-clock times. This route assembles what the action
 * wants. Mirrors `NewEvent` in the Expo app (`src/types/event.ts`).
 */
type NewEventDay = {
    /** `"2026-09-27"`. */
    date: string;
    /** `"10:00"`, read in UTC like every other time in this app. */
    startTime: string;
    endTime: string;
};

type NewEvent = {
    serviceTypeId: string;
    name: string;
    description?: string;
    location: string;
    days: NewEventDay[];
    rolesNeeded: VolunteerRole[];
    /** Days an invitee has to answer. */
    expiresAt: number;
    smartSchedulingEnabled: boolean;
    /** Who to invite, per role. Every role optional. */
    roleAssignments: Record<string, string[]>;
};

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const CLOCK = /^\d{2}:\d{2}$/;

const isNewEventDay = (value: unknown): value is NewEventDay =>
    isObject(value) &&
    typeof value.date === "string" && DAY.test(value.date) &&
    typeof value.startTime === "string" && CLOCK.test(value.startTime) &&
    typeof value.endTime === "string" && CLOCK.test(value.endTime);

const isNewEvent = (value: unknown): value is NewEvent =>
    isObject(value) &&
    typeof value.serviceTypeId === "string" &&
    typeof value.name === "string" &&
    (value.description === undefined || typeof value.description === "string") &&
    typeof value.location === "string" &&
    Array.isArray(value.days) && value.days.length > 0 && value.days.every(isNewEventDay) &&
    Array.isArray(value.rolesNeeded) &&
    value.rolesNeeded.every((role) => typeof role === "string" && role in VolunteerRole) &&
    typeof value.expiresAt === "number" &&
    typeof value.smartSchedulingEnabled === "boolean" &&
    isObject(value.roleAssignments);

/** `"2026-09-27"`, `"10:00"` -> the UTC instant the app stores. */
const instant = (date: string, clock: string) => new Date(`${date}T${clock}:00Z`);


/**
 * POST /api/mobile/v1/organizations/[orgId]/events
 *
 * Creates an event. The action behind it is the dashboard's own, so the role
 * gate, the "assignee doesn't hold that role" and "assignee has a blockout"
 * refusals, the invitation emails and the two activity entries are all the
 * same work, worded the same way.
 */
export async function POST(
    req: Request,
    { params }: { params: Promise<{ orgId: string }> },
) {

    try {

        const clerkId = await clerkIdOf();

        // `createEvent` reaches for the caller through `currentUser`, which
        // redirects when there is nobody there — HTML the app would choke on.
        // The token is checked here first, before the action can.
        if (!clerkId) {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401, headers: NO_STORE },
            );
        };

        const { orgId } = await params;

        const membership = await membershipFor(clerkId, orgId);

        if (!membership) {
            return NextResponse.json(
                { error: "Not Found" },
                { status: 404, headers: NO_STORE },
            );
        };

        const body = await readJson(req);

        if (!isNewEvent(body)) {
            return NextResponse.json(
                { error: "Expected an event." },
                { status: 400, headers: NO_STORE },
            );
        };

        const days = [...body.days].sort((a, b) => a.date.localeCompare(b.date));

        const result = await createEvent(
            {
                serviceTypeId: body.serviceTypeId,
                name: body.name,
                description: body.description,
                location: body.location,
                // Unused by the action, but its schema still validates the pair.
                dateRange: {
                    from: instant(days[0].date, "00:00"),
                    to: instant(days[days.length - 1].date, "00:00"),
                },
                dayTimes: Object.fromEntries(
                    days.map((day) => [
                        day.date,
                        {
                            startTime: instant(day.date, day.startTime).toISOString(),
                            endTime: instant(day.date, day.endTime).toISOString(),
                        },
                    ]),
                ),
                rolesNeeded: body.rolesNeeded,
                expiresAt: body.expiresAt,
                smartSchedulingEnabled: body.smartSchedulingEnabled,
                roleAssignments: body.roleAssignments,
            } as CreateEventInput,
            orgId,
            expireTag,
        );

        if (!result.success) {
            return NextResponse.json(
                { error: result.error },
                {
                    status: /unauthorized/i.test(result.error) ? 403 : 400,
                    headers: NO_STORE,
                },
            );
        };

        return NextResponse.json({ success: true }, { status: 201, headers: NO_STORE });

    } catch (err) {
        console.error("POST /api/mobile/v1/organizations/[orgId]/events failed", err);
        return NextResponse.json(
            { error: "Internal Server Error" },
            { status: 500, headers: NO_STORE },
        );
    };

};
