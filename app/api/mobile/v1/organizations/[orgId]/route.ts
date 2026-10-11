import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import { InvitationStatus, type OrgRole, type VolunteerRole } from "@/generated/prisma/enums";
import {
    deleteOrganization,
    updateOrganizationDetails,
} from "@/lib/actions/organizations";
import { organizationSchema } from "@/lib/validations/organization";
import { expireTag } from "@/lib/mobile/route";
import { floatingNow } from "@/lib/time-zone";


type OrganizationDetail = {
    id: string;
    name: string;
    description: string;
    logoUrl: string | null;
    role: OrgRole;
    /** The caller's own volunteer roles here, as the summary carries them. */
    volunteerRoles: VolunteerRole[];
    memberCount: number;
    createdAt: string;
    /** Where the organization is, as an IANA zone. Owners change it in Settings. */
    timeZone: string;
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
                timeZone: true,
                memberships: {
                    where: {
                        user: {
                            clerkId: userId,
                        },
                    },
                    select: {
                        role: true,
                        volunteerRoles: true,
                    },
                },
                _count: {
                    select: {
                        memberships: true,
                        invitations: { where: { status: InvitationStatus.PENDING } },
                        songs: { where: { deletedAt: null } },
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

        // Against the organization's own clock: event times are its wall clock,
        // so the real one would count this morning's service as already begun
        // hours before it starts, anywhere west of UTC.
        const upcomingEventCount = await prisma.event.count({
            where: {
                organizationId: orgId,
                dates: { some: { startTime: { gte: floatingNow(organization.timeZone) } } },
            },
        });

        
        const organizationDetail: OrganizationDetail = {
            ...organization,
            role: memberships[0].role,
            volunteerRoles: memberships[0].volunteerRoles,
            memberCount: _count.memberships,
            createdAt: createdAt.toISOString(),
            upcomingEventCount,
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


/**
 * PATCH /api/mobile/v1/organizations/[orgId]
 *
 * Renames or re-describes the organization, or moves its time zone:
 * `{ name, description, timeZone? }`. Owners only — the action refuses
 * everybody else, and an unknown zone, with a message the app shows.
 */
export async function PATCH(
    req: Request,
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

        const parsed = organizationSchema.safeParse(body);

        if (!parsed.success) {
            return NextResponse.json(
                { error: parsed.error.issues[0]?.message ?? "Invalid organization." },
                { status: 400, headers: NO_STORE },
            );
        };

        const result = await updateOrganizationDetails(orgId, parsed.data, expireTag);

        if (!result.success) {
            return NextResponse.json(
                { error: result.error },
                { status: /unauthorized|owner/i.test(result.error) ? 403 : 400, headers: NO_STORE },
            );
        };

        return NextResponse.json({ success: true }, { headers: NO_STORE });

    } catch (err) {
        console.error("PATCH /api/mobile/v1/organizations/[orgId] failed", err);
        return NextResponse.json(
            { error: "Internal Server Error" },
            { status: 500, headers: NO_STORE },
        );
    };

};


/**
 * DELETE /api/mobile/v1/organizations/[orgId]
 *
 * Deletes the organization and everything in it. Owners only. The dashboard
 * makes the person type the name first; the phone does the same before it
 * gets here, and the action is the last word either way.
 */
export async function DELETE(
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
            where: { organizationId: orgId, user: { clerkId: userId } },
            select: { id: true },
        });

        if (!membership) {
            return NextResponse.json(
                { error: "Not Found" },
                { status: 404, headers: NO_STORE },
            );
        };

        const result = await deleteOrganization(orgId, expireTag);

        if (!result.success) {
            return NextResponse.json(
                { error: result.error },
                { status: result.error === "Forbidden" ? 403 : 400, headers: NO_STORE },
            );
        };

        return NextResponse.json({ success: true }, { headers: NO_STORE });

    } catch (err) {
        console.error("DELETE /api/mobile/v1/organizations/[orgId] failed", err);
        return NextResponse.json(
            { error: "Internal Server Error" },
            { status: 500, headers: NO_STORE },
        );
    };

};
