import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import { SMART_SCHEDULING_ACTIVITY_TYPES } from "@/lib/services/activity";
import { deleteEvent, editEventDetails, setEventSmartScheduling } from "@/lib/actions/event";
import type { EditEventDetailsInput } from "@/lib/validations/event";
import { expireTag, isObject } from "@/lib/mobile/route";
import {
    InvitationStatus,
    OrgRole,
    type ActivityType,
    type KeyQuality,
    type Pitch,
    type VolunteerRole,
} from "@/generated/prisma/enums";


/**
 * Wire contract for one event's detail screen. Mirrors `EventDetails` and
 * friends in the Expo app (`src/types/event.ts`) — keep the two in sync, and
 * treat it as additive-only: installed apps cannot be force-updated.
 *
 * The shape is the dashboard's event detail page flattened. `getEventDetailsById`
 * (lib/services/events.ts) hands React the Prisma tree and lets the components
 * pick it apart; here the setlist arrives already merged with its song, because
 * a phone should not have to know that a chart hangs off `song.attachments`.
 */
type EventDetailsDate = {
    id: string;
    startTime: string;
    endTime: string;
};

type EventDetailsPerson = {
    userId: string;
    firstName: string;
    lastName: string;
    userImageUrl: string | null;
};

type EventDetailsAssignment = {
    id: string;
    userId: string;
    role: VolunteerRole;
    status: InvitationStatus;
    expiresAt: string;
    user: {
        firstName: string;
        lastName: string;
        userImageUrl: string | null;
    };
};

type EventDetailsAttachment = {
    id: string;
    name: string;
    url: string;
    type: string;
    size: number;
    createdAt: string;
};

type EventDetailsSetlistSong = {
    id: string;
    songId: string;
    position: number;
    pitch: Pitch;
    keyQuality: KeyQuality;
    bpm: number;
    timeSignature: string;
    title: string;
    artist: string;
    youtubeUrl: string | null;
    spotifyUrl: string | null;
    attachments: EventDetailsAttachment[];
    /** Who is singing this one. Empty until somebody is assigned. */
    vocalists: EventDetailsPerson[];
};

type EventDetailsActivityItem = {
    id: string;
    type: ActivityType;
    actorName: string | null;
    targetName: string | null;
    detail: string | null;
    createdAt: string;
};

type EventDetails = {
    id: string;
    name: string;
    description: string;
    location: string;
    rolesNeeded: VolunteerRole[];
    smartSchedulingEnabled: boolean;
    organizationName: string;
    serviceType: {
        id: string;
        name: string;
        color: string;
    };
    dates: EventDetailsDate[];
    /** Everyone on the event, declined and canceled included — as the web shows. */
    assignments: EventDetailsAssignment[];
    setlist: EventDetailsSetlistSong[];
    /**
     * The caller's own standing, which is what every gate on the screen reads.
     * `userId` is the database id, so a row can be marked as theirs; the token
     * only carries a Clerk id, and the phone has no way to map one to the other.
     */
    viewer: {
        userId: string;
        canManage: boolean;
        /** Accepted, not merely invited — the same right that opens this page. */
        isAssigned: boolean;
    };
    /** Managers only; empty for everybody else. */
    smartSchedulingActivity: EventDetailsActivityItem[];
    /** Managers only; 0 for everybody else. */
    expiredInviteCount: number;
};


const NO_STORE = { "Cache-Control": "private, no-store" };


/**
 * GET /api/mobile/v1/organizations/[orgId]/events/[eventId]
 *
 * One event in full: when and where it runs, who is on it and what they
 * answered, the setlist, and — for owners and admins — what smart scheduling
 * has been doing about the declines.
 *
 * Access matches the dashboard's own page exactly: a manager, or somebody who
 * has **accepted** an assignment. A pending invitation is not yet a ticket in,
 * which is why the web's own invitation cards only link here for managers.
 * Non-member, no access, and no such event all answer 404, so none of the three
 * tells a stranger which it was.
 */
export async function GET(
    _req: Request,
    { params }: { params: Promise<{ orgId: string; eventId: string }> },
) {

    try {

        const { userId } = await auth();

        if (!userId) {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401, headers: NO_STORE },
            );
        };

        const { orgId, eventId } = await params;

        // The token carries a Clerk id and every query below needs the database
        // one — and belonging to this organization is the first thing that has
        // to be true. One lookup answers both.
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

        // Scoped by organization as well as by id, so an event id lifted from
        // another organization reads as missing rather than as forbidden.
        const event = await prisma.event.findFirst({
            where: {
                id: eventId,
                organizationId: orgId,
            },
            select: {
                id: true,
                name: true,
                description: true,
                location: true,
                rolesNeeded: true,
                smartSchedulingEnabled: true,
                organization: {
                    select: {
                        name: true,
                    },
                },
                serviceType: {
                    select: {
                        id: true,
                        name: true,
                        color: true,
                    },
                },
                dates: {
                    orderBy: { startTime: "asc" },
                    select: {
                        id: true,
                        startTime: true,
                        endTime: true,
                    },
                },
                assignments: {
                    // The web leaves these unordered and lets React's key sort
                    // it out; a stable order costs nothing and stops rows
                    // swapping places between two reads of the same roster.
                    orderBy: { createdAt: "asc" },
                    select: {
                        id: true,
                        userId: true,
                        role: true,
                        status: true,
                        expiresAt: true,
                        user: {
                            select: {
                                firstName: true,
                                lastName: true,
                                userImageUrl: true,
                            },
                        },
                    },
                },
                setlistSongs: {
                    orderBy: { position: "asc" },
                    select: {
                        id: true,
                        songId: true,
                        position: true,
                        pitch: true,
                        keyQuality: true,
                        bpm: true,
                        timeSignature: true,
                        song: {
                            select: {
                                title: true,
                                artist: true,
                                youtubeUrl: true,
                                spotifyUrl: true,
                                attachments: {
                                    orderBy: { createdAt: "asc" },
                                    select: {
                                        id: true,
                                        name: true,
                                        url: true,
                                        type: true,
                                        size: true,
                                        createdAt: true,
                                    },
                                },
                            },
                        },
                        setlistSongAssignment: {
                            select: {
                                userId: true,
                                user: {
                                    select: {
                                        firstName: true,
                                        lastName: true,
                                        userImageUrl: true,
                                    },
                                },
                            },
                        },
                    },
                },
            },
        });

        if (!event) {
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

        const isAssigned = event.assignments.some(
            (assignment) =>
                assignment.userId === membership.userId &&
                assignment.status === InvitationStatus.ACCEPTED,
        );

        // Same 404 as a missing event: somebody who may not read this event
        // should not learn that it exists.
        if (!canManage && !isAssigned) {
            return NextResponse.json(
                { error: "Not Found" },
                { status: 404, headers: NO_STORE },
            );
        };

        const now = new Date();

        // Both of these answer questions only a manager has, and the dashboard
        // skips the work for everybody else rather than fetching and hiding it.
        const activity = canManage
            ? await prisma.activityLog.findMany({
                where: {
                    eventId,
                    organizationId: orgId,
                    type: { in: SMART_SCHEDULING_ACTIVITY_TYPES },
                },
                orderBy: [{ createdAt: "desc" }, { id: "desc" }],
                select: {
                    id: true,
                    type: true,
                    actorName: true,
                    targetName: true,
                    detail: true,
                    createdAt: true,
                },
            })
            : [];

        const expiredInviteCount = canManage
            ? event.assignments.filter(
                (assignment) =>
                    assignment.status === InvitationStatus.PENDING &&
                    assignment.expiresAt < now,
            ).length
            : 0;

        const details: EventDetails = {
            id: event.id,
            name: event.name,
            description: event.description,
            location: event.location,
            rolesNeeded: event.rolesNeeded,
            smartSchedulingEnabled: event.smartSchedulingEnabled,
            organizationName: event.organization.name,
            serviceType: event.serviceType,
            dates: event.dates.map((date) => ({
                id: date.id,
                startTime: date.startTime.toISOString(),
                endTime: date.endTime.toISOString(),
            })),
            assignments: event.assignments.map((assignment) => ({
                ...assignment,
                expiresAt: assignment.expiresAt.toISOString(),
            })),
            setlist: event.setlistSongs.map((entry) => ({
                id: entry.id,
                songId: entry.songId,
                position: entry.position,
                pitch: entry.pitch,
                keyQuality: entry.keyQuality,
                bpm: entry.bpm,
                timeSignature: entry.timeSignature,
                title: entry.song.title,
                artist: entry.song.artist,
                youtubeUrl: entry.song.youtubeUrl,
                spotifyUrl: entry.song.spotifyUrl,
                attachments: entry.song.attachments.map((attachment) => ({
                    ...attachment,
                    createdAt: attachment.createdAt.toISOString(),
                })),
                vocalists: entry.setlistSongAssignment.map((assigned) => ({
                    userId: assigned.userId,
                    ...assigned.user,
                })),
            })),
            viewer: {
                userId: membership.userId,
                canManage,
                isAssigned,
            },
            smartSchedulingActivity: activity.map((item) => ({
                ...item,
                createdAt: item.createdAt.toISOString(),
            })),
            expiredInviteCount,
        };

        return NextResponse.json({ event: details }, { headers: NO_STORE });

    } catch (err) {
        console.error(
            "GET /api/mobile/v1/organizations/[orgId]/events/[eventId] failed",
            err,
        );
        return NextResponse.json(
            { error: "Internal Server Error" },
            { status: 500, headers: NO_STORE },
        );
    };

};


type EditDay = { date: string; startTime: string; endTime: string };

/** What the phone sends to change an event's name, description, place or hours. */
type EventEdit = {
    name: string;
    description?: string;
    location: string;
    days: EditDay[];
};

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const CLOCK = /^\d{2}:\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isEditDay = (value: unknown): value is EditDay =>
    isObject(value) &&
    typeof value.date === "string" && DAY.test(value.date) &&
    typeof value.startTime === "string" && CLOCK.test(value.startTime) &&
    typeof value.endTime === "string" && CLOCK.test(value.endTime);

const isEventEdit = (value: unknown): value is EventEdit =>
    isObject(value) &&
    typeof value.name === "string" &&
    (value.description === undefined || typeof value.description === "string") &&
    typeof value.location === "string" &&
    Array.isArray(value.days) && value.days.length > 0 && value.days.every(isEditDay);

/** `"2026-09-27"`, `"10:00"` -> the UTC instant the app stores. */
const instant = (date: string, clock: string) => new Date(`${date}T${clock}:00Z`);

/**
 * PATCH /api/mobile/v1/organizations/[orgId]/events/[eventId]
 *
 * Two shapes, told apart by what the body carries. `{ smartSchedulingEnabled }`
 * flips the auto-refill switch; `{ name, description?, location, days }` is the
 * dashboard's "edit event details" — the same fields, with the days as the
 * create route already spells them.
 *
 * Owners and admins only, and the actions behind both are the dashboard's, so
 * the role gate and the "these dates don't work for X" refusal are the same
 * work worded the same way. An edit deliberately keeps the roster, setlist and
 * chat, which is the whole reason it exists: the phone could already delete
 * and recreate, and that loses all three.
 */
export async function PATCH(
    req: Request,
    { params }: { params: Promise<{ orgId: string; eventId: string }> },
) {

    try {

        const { userId } = await auth();

        if (!userId) {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401, headers: NO_STORE },
            );
        };

        const { orgId, eventId } = await params;

        const membership = await prisma.membership.findFirst({
            where: { organizationId: orgId, user: { clerkId: userId } },
            select: { id: true },
        });

        if (!membership) {
            return NextResponse.json(
                { error: "Not Found" },
                { status: 404, headers: NO_STORE },
            );
        };

        const body: unknown = await req.json().catch(() => null);

        const enabled = (body as { smartSchedulingEnabled?: unknown } | null)
            ?.smartSchedulingEnabled;

        if (typeof enabled === "boolean") {
            const result = await setEventSmartScheduling(orgId, eventId, enabled, expireTag);

            if (!result.success) {
                return NextResponse.json(
                    { error: result.error },
                    { status: result.error === "Unauthorized" ? 403 : 400, headers: NO_STORE },
                );
            };

            return NextResponse.json({ success: true }, { headers: NO_STORE });
        };

        if (!isEventEdit(body)) {
            return NextResponse.json(
                { error: "Expected smartSchedulingEnabled, or the event's details." },
                { status: 400, headers: NO_STORE },
            );
        };

        // The action's schema parses this as a uuid, and hands back a JSON blob
        // of issues rather than a sentence when it isn't one.
        if (!UUID.test(eventId)) {
            return NextResponse.json(
                { error: "Not Found" },
                { status: 404, headers: NO_STORE },
            );
        };

        const days = [...body.days].sort((a, b) => a.date.localeCompare(b.date));

        const badOrder = days.find((day) => day.endTime <= day.startTime);

        if (badOrder) {
            return NextResponse.json(
                { error: "Each day has to end after it starts." },
                { status: 400, headers: NO_STORE },
            );
        };

        const edit = await editEventDetails(
            {
                eventId,
                organizationId: orgId,
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
            } as EditEventDetailsInput,
            expireTag,
        );

        if (!edit.success) {
            return NextResponse.json(
                { error: edit.error },
                {
                    status: /insufficient|unauthori[sz]ed/i.test(edit.error) ? 403 : 400,
                    headers: NO_STORE,
                },
            );
        };

        return NextResponse.json({ success: true }, { headers: NO_STORE });

    } catch (err) {
        console.error("PATCH /api/mobile/v1/organizations/[orgId]/events/[eventId] failed", err);
        return NextResponse.json(
            { error: "Internal Server Error" },
            { status: 500, headers: NO_STORE },
        );
    };

};


/**
 * DELETE /api/mobile/v1/organizations/[orgId]/events/[eventId]
 *
 * Deletes the event. Owners and admins only.
 */
export async function DELETE(
    _req: Request,
    { params }: { params: Promise<{ orgId: string; eventId: string }> },
) {

    try {

        const { userId } = await auth();

        if (!userId) {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401, headers: NO_STORE },
            );
        };

        const { orgId, eventId } = await params;

        const membership = await prisma.membership.findFirst({
            where: { organizationId: orgId, user: { clerkId: userId } },
            select: { id: true },
        });

        if (!membership) {
            return NextResponse.json(
                { error: "Not Found" },
                { status: 404, headers: NO_STORE },
            );
        };

        const result = await deleteEvent(orgId, eventId, expireTag);

        if (!result.success) {
            return NextResponse.json(
                { error: result.error },
                { status: /insufficient/i.test(result.error) ? 403 : 400, headers: NO_STORE },
            );
        };

        return NextResponse.json({ success: true }, { headers: NO_STORE });

    } catch (err) {
        console.error("DELETE /api/mobile/v1/organizations/[orgId]/events/[eventId] failed", err);
        return NextResponse.json(
            { error: "Internal Server Error" },
            { status: 500, headers: NO_STORE },
        );
    };

};
