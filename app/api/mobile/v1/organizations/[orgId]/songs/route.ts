import { auth } from "@clerk/nextjs/server";
import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import { addSongToLibrary } from "@/lib/actions/song";
import type { songSchemaInput } from "@/lib/validations/song";
import type { KeyQuality, Pitch } from "@/generated/prisma/enums";


/**
 * One song as the phone reads it — the same shape `getOrganizationSongs`
 * returns the dashboard, with `DateTime` flattened to an ISO string and Prisma
 * enums left as the string unions they serialise to. Mirrored in the Expo app
 * at `src/types/song.ts`.
 */
type LibraryAttachment = {
    id: string;
    name: string;
    url: string;
    type: string;
    size: number;
    createdAt: string;
};

type LibrarySong = {
    id: string;
    title: string;
    artist: string;
    bpm: number;
    timeSignature: string;
    defaultPitch: Pitch;
    defaultKeyQuality: KeyQuality;
    spotifyUrl: string | null;
    youtubeUrl: string | null;
    themes: string[];
    attachments: LibraryAttachment[];
};


const NO_STORE = { "Cache-Control": "private, no-store" };

/**
 * Route-handler-safe cache expiry, for the actions called below.
 *
 * `{ expire: 0 }` rather than `"max"`, for the reason `lib/mobile/route.ts`
 * spells out: the phone refetches immediately, and a stale window means that
 * refetch is served the pre-write state.
 */
const expireTag = (tag: string) => {
    revalidateTag(tag, { expire: 0 });
};

/**
 * The caller's membership, or null when they have none.
 *
 * The token only carries a Clerk id and the queries below need the database
 * user id — and belonging to this organization is exactly what earns you the
 * library. One lookup answers both.
 */
const membershipFor = async (clerkId: string, orgId: string) =>
    prisma.membership.findFirst({
        where: { organizationId: orgId, user: { clerkId } },
        select: { userId: true, role: true },
    });


/**
 * GET /api/mobile/v1/organizations/[orgId]/songs
 *
 * The whole song library for one organization, attachments included.
 *
 * Every member gets the list — the dashboard hands it to members and admins
 * alike, and gates only the writes. Soft-deleted songs stay out: a song removed
 * from the library keeps its rows so past setlists still resolve, but it is not
 * part of the library any more.
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

        const membership = await membershipFor(userId, orgId);

        if (!membership) {
            return NextResponse.json(
                { error: "Not Found" },
                { status: 404, headers: NO_STORE },
            );
        };

        const songs = await prisma.song.findMany({
            where: {
                organizationId: orgId,
                deletedAt: null,
            },
            select: {
                id: true,
                title: true,
                artist: true,
                bpm: true,
                timeSignature: true,
                defaultPitch: true,
                defaultKeyQuality: true,
                spotifyUrl: true,
                youtubeUrl: true,
                themes: true,
                attachments: {
                    select: {
                        id: true,
                        name: true,
                        url: true,
                        type: true,
                        size: true,
                        createdAt: true,
                    },
                    orderBy: { createdAt: "asc" },
                },
            },
            orderBy: { title: "asc" },
        });

        const library: LibrarySong[] = songs.map((song) => ({
            ...song,
            attachments: song.attachments.map((attachment) => ({
                ...attachment,
                createdAt: attachment.createdAt.toISOString(),
            })),
        }));

        return NextResponse.json({ songs: library }, { headers: NO_STORE });

    } catch (err) {
        console.error("GET /api/mobile/v1/organizations/[orgId]/songs failed", err);
        return NextResponse.json(
            { error: "Internal Server Error" },
            { status: 500, headers: NO_STORE },
        );
    };

};


/**
 * POST /api/mobile/v1/organizations/[orgId]/songs
 *
 * Adds one song to the library.
 *
 * The body is the dashboard's own song form, minus `organizationId` — that
 * comes from the path, so a caller cannot post a song into somebody else's
 * library by editing the payload. Validation, the owner/admin gate and the
 * "already in the library" check all belong to the action, which is the same
 * one the web form calls.
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

        const membership = await membershipFor(userId, orgId);

        if (!membership) {
            return NextResponse.json(
                { error: "Not Found" },
                { status: 404, headers: NO_STORE },
            );
        };

        const body: unknown = await req.json().catch(() => null);

        if (body === null || typeof body !== "object") {
            return NextResponse.json(
                { error: "Expected a song." },
                { status: 400, headers: NO_STORE },
            );
        };

        const result = await addSongToLibrary(
            { ...body, organizationId: orgId } as songSchemaInput,
            expireTag,
        );

        if (!result.success) {
            return NextResponse.json(
                { error: result.error },
                {
                    status: result.error === "Unauthorized" ? 403 : 400,
                    headers: NO_STORE,
                },
            );
        };

        return NextResponse.json({ success: true }, { status: 201, headers: NO_STORE });

    } catch (err) {
        console.error("POST /api/mobile/v1/organizations/[orgId]/songs failed", err);
        return NextResponse.json(
            { error: "Internal Server Error" },
            { status: 500, headers: NO_STORE },
        );
    };

};
