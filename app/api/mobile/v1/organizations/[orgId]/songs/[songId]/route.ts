import { auth } from "@clerk/nextjs/server";
import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import {
    deleteSongFromLibrary,
    updateSongInLibrary,
} from "@/lib/actions/song";
import type { songSchemaInput } from "@/lib/validations/song";


const NO_STORE = { "Cache-Control": "private, no-store" };

/** Route-handler-safe cache expiry, for the actions called below. */
const expireTag = (tag: string) => {
    revalidateTag(tag, "max");
};

const membershipFor = async (clerkId: string, orgId: string) =>
    prisma.membership.findFirst({
        where: { organizationId: orgId, user: { clerkId } },
        select: { userId: true },
    });

/** Both handlers below open the same way. */
const authorize = async (orgId: string) => {

    const { userId } = await auth();

    if (!userId) {
        return {
            error: NextResponse.json(
                { error: "Unauthorized" },
                { status: 401, headers: NO_STORE },
            ),
        };
    };

    const membership = await membershipFor(userId, orgId);

    if (!membership) {
        return {
            error: NextResponse.json(
                { error: "Not Found" },
                { status: 404, headers: NO_STORE },
            ),
        };
    };

    return { error: null };
};

/**
 * What an action's refusal is worth as a status.
 *
 * The owner/admin gate is the one failure the app treats differently — a member
 * should be told they cannot do this rather than shown a form error. Everything
 * else is a message worth reading beside the field that caused it.
 */
const statusFor = (error: string) =>
    error === "Unauthorized" ? 403 : error.endsWith("not found.") ? 404 : 400;


/**
 * PATCH /api/mobile/v1/organizations/[orgId]/songs/[songId]
 *
 * Edits one song. The body is the whole song, as the dashboard's form submits
 * it — the action revalidates every field, so a partial patch would fail its
 * schema rather than merge.
 */
export async function PATCH(
    req: Request,
    { params }: { params: Promise<{ orgId: string; songId: string }> },
) {

    try {

        const { orgId, songId } = await params;

        const denied = await authorize(orgId);

        if (denied.error) return denied.error;

        const body: unknown = await req.json().catch(() => null);

        if (body === null || typeof body !== "object") {
            return NextResponse.json(
                { error: "Expected a song." },
                { status: 400, headers: NO_STORE },
            );
        };

        const result = await updateSongInLibrary(
            songId,
            { ...body, organizationId: orgId } as songSchemaInput,
            expireTag,
        );

        if (!result.success) {
            return NextResponse.json(
                { error: result.error },
                { status: statusFor(result.error), headers: NO_STORE },
            );
        };

        return NextResponse.json({ success: true }, { headers: NO_STORE });

    } catch (err) {
        console.error(
            "PATCH /api/mobile/v1/organizations/[orgId]/songs/[songId] failed",
            err,
        );
        return NextResponse.json(
            { error: "Internal Server Error" },
            { status: 500, headers: NO_STORE },
        );
    };

};


/**
 * DELETE /api/mobile/v1/organizations/[orgId]/songs/[songId]
 *
 * Removes one song from the library.
 *
 * Soft delete, and the action refuses outright while the song is on an upcoming
 * setlist — naming those events in the message, which is the whole reason the
 * phone shows the server's own text rather than a generic failure.
 */
export async function DELETE(
    _req: Request,
    { params }: { params: Promise<{ orgId: string; songId: string }> },
) {

    try {

        const { orgId, songId } = await params;

        const denied = await authorize(orgId);

        if (denied.error) return denied.error;

        const result = await deleteSongFromLibrary(orgId, songId, expireTag);

        if (!result.success) {
            return NextResponse.json(
                { error: result.error },
                { status: statusFor(result.error), headers: NO_STORE },
            );
        };

        return NextResponse.json({ success: true }, { headers: NO_STORE });

    } catch (err) {
        console.error(
            "DELETE /api/mobile/v1/organizations/[orgId]/songs/[songId] failed",
            err,
        );
        return NextResponse.json(
            { error: "Internal Server Error" },
            { status: 500, headers: NO_STORE },
        );
    };

};
