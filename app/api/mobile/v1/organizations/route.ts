import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import type { OrgRole, VolunteerRole } from "@/generated/prisma/enums";
import { createOrganization } from "@/lib/actions/organizations";
import { organizationSchema } from "@/lib/validations/organization";
import { expireTag } from "@/lib/mobile/route";

/**
 * Wire contract for the mobile home list. Mirrors `OrganizationSummary` in the
 * Expo app (`src/types/organization.ts`) — keep the two in sync.
 */
type OrganizationSummary = {
    id: string;
    name: string;
    description: string;
    logoUrl: string | null;
    role: OrgRole;
    memberCount: number;
    /** The caller's own volunteer roles here — what the phone gates My Keys on. */
    volunteerRoles: VolunteerRole[];
};

/**
 * GET /api/mobile/v1/organizations
 *
 * Returns the organizations the *caller* belongs to. The caller is identified
 * from the verified Clerk session token, never from a client-supplied id.
 */
export async function GET() {

    try {

        const { userId } = await auth();

        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        };

        const memberships = await prisma.membership.findMany({
            where: {
                user: { clerkId: userId },
            },
            select: {
                role: true,
                volunteerRoles: true,
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
            orderBy: {
                organization: { name: "asc" },
            },
        });

        const organizations: OrganizationSummary[] = memberships.map(({ role, volunteerRoles, organization }) => ({
            id: organization.id,
            name: organization.name,
            description: organization.description,
            logoUrl: organization.logoUrl,
            role,
            memberCount: organization._count.memberships,
            volunteerRoles,
        }));

        return NextResponse.json(
            { organizations },
            { headers: { "Cache-Control": "private, no-store" } },
        );

    } catch (err) {
        console.error("GET /api/mobile/v1/organizations failed", err);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    };

};


/**
 * POST /api/mobile/v1/organizations
 *
 * Creates an organization with the caller as its owner: `{ name, description }`.
 *
 * The dashboard's own action does the work — the schema, the "you already own
 * one by this name" check and the owner membership all live there. It expires
 * its cache tags through `revalidateTag`, because `updateTag` throws outside a
 * Server Action.
 */
export async function POST(req: Request) {

    try {

        const { userId } = await auth();

        if (!userId) {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401, headers: { "Cache-Control": "private, no-store" } },
            );
        };

        const body: unknown = await req.json().catch(() => null);

        if (body === null || typeof body !== "object") {
            return NextResponse.json(
                { error: "Expected an organization." },
                { status: 400, headers: { "Cache-Control": "private, no-store" } },
            );
        };

        const parsed = organizationSchema.safeParse(body);

        if (!parsed.success) {
            return NextResponse.json(
                { error: parsed.error.issues[0]?.message ?? "Invalid organization." },
                { status: 400, headers: { "Cache-Control": "private, no-store" } },
            );
        };

        const result = await createOrganization(parsed.data, expireTag);

        if (!result.success) {
            return NextResponse.json(
                { error: result.error === "Organization exists"
                    ? "You already own an organization with that name."
                    : result.error },
                {
                    status: result.error === "Organization exists" ? 409 : 400,
                    headers: { "Cache-Control": "private, no-store" },
                },
            );
        };

        return NextResponse.json(
            { orgId: result.orgId },
            { status: 201, headers: { "Cache-Control": "private, no-store" } },
        );

    } catch (err) {
        console.error("POST /api/mobile/v1/organizations failed", err);
        return NextResponse.json(
            { error: "Internal Server Error" },
            { status: 500, headers: { "Cache-Control": "private, no-store" } },
        );
    };

};
