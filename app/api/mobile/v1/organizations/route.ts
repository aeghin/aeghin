import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import type { OrgRole } from "@/generated/prisma/enums";

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

        const organizations: OrganizationSummary[] = memberships.map(({ role, organization }) => ({
            id: organization.id,
            name: organization.name,
            description: organization.description,
            logoUrl: organization.logoUrl,
            role,
            memberCount: organization._count.memberships,
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
