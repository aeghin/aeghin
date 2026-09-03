import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import { SERVICE_TYPE_COLORS } from "@/lib/config/service-colors";
import { createServiceType } from "@/lib/actions/service-type";
import { serviceTypeSchema } from "@/lib/validations/service-types";
import { expireTag } from "@/lib/mobile/route";


/**
 * Wire contract for the events screen's colour and filter data. Mirrors
 * `ServiceType` in the Expo app (`src/types/event.ts`) — keep the two in sync.
 */
type ServiceTypeColor =
    | "indigo"
    | "amber"
    | "emerald"
    | "pink"
    | "violet"
    | "red"
    | "blue"
    | "cyan";

type ServiceType = {
    id: string;
    name: string;
    color: ServiceTypeColor;
};


const NO_STORE = { "Cache-Control": "private, no-store" };


// The column is a plain string, so a colour written before the palette settled
// would reach a client with no swatch for it. Both apps already fall back to
// indigo for a colour they don't know; the wire does the same rather than pass
// one on.
const isServiceTypeColor = (color: string): color is ServiceTypeColor =>
    SERVICE_TYPE_COLORS.some((swatch) => swatch === color);


/**
 * GET /api/mobile/v1/organizations/[orgId]/service-types
 *
 * One organization's service types — the query `getOrgServiceTypes`
 * (lib/services/service-types.ts) runs for the web dashboard. Every member can
 * read them: they name and colour the events on everyone's schedule.
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
                id: true,
            },
        });

        if (!membership) {
            return NextResponse.json(
                { error: "Not Found" },
                { status: 404, headers: NO_STORE },
            );
        };

        const rows = await prisma.serviceType.findMany({
            where: {
                organizationId: orgId,
                deletedAt: null,
            },
            orderBy: {
                name: "asc",
            },
            select: {
                id: true,
                name: true,
                color: true,
            },
        });

        const serviceTypes: ServiceType[] = rows.map((row) => ({
            id: row.id,
            name: row.name,
            color: isServiceTypeColor(row.color) ? row.color : "indigo",
        }));

        return NextResponse.json({ serviceTypes }, { headers: NO_STORE });

    } catch (err) {
        console.error("GET /api/mobile/v1/organizations/[orgId]/service-types failed", err);
        return NextResponse.json(
            { error: "Internal Server Error" },
            { status: 500, headers: NO_STORE },
        );
    };

};


/**
 * POST /api/mobile/v1/organizations/[orgId]/service-types
 *
 * Adds one: `{ name, color }`. Owners and admins only; a soft-deleted type
 * with the same name is revived rather than duplicated, as on the dashboard.
 */
export async function POST(
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

        const parsed = serviceTypeSchema.safeParse(body);

        if (!parsed.success) {
            return NextResponse.json(
                { error: parsed.error.issues[0]?.message ?? "Invalid service type." },
                { status: 400, headers: NO_STORE },
            );
        };

        const result = await createServiceType(
            parsed.data.name,
            parsed.data.color,
            orgId,
            expireTag,
        );

        if (!result.success) {
            return NextResponse.json(
                { error: result.error },
                {
                    status: result.error === "Unauthorized" ? 403
                        : result.error === "Service Type exists" ? 409
                        : 400,
                    headers: NO_STORE,
                },
            );
        };

        const created = result.serviceType;

        const serviceType: ServiceType | null = created
            ? {
                id: created.id,
                name: created.name,
                color: isServiceTypeColor(created.color) ? created.color : "indigo",
            }
            : null;

        return NextResponse.json({ serviceType }, { status: 201, headers: NO_STORE });

    } catch (err) {
        console.error("POST /api/mobile/v1/organizations/[orgId]/service-types failed", err);
        return NextResponse.json(
            { error: "Internal Server Error" },
            { status: 500, headers: NO_STORE },
        );
    };

};
