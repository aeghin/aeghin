import { UTApi } from "uploadthing/server";

import prisma from "@/lib/prisma";
import { addSongAttachments } from "@/lib/actions/song";
import {
    canManage,
    clerkIdOf,
    expireTag,
    fail,
    isObject,
    json,
    membershipFor,
    readJson,
    route,
} from "@/lib/mobile/route";

/**
 * The limits `app/api/uploadthing/core.ts` puts on the `songAttachment` route.
 *
 * Repeated here because a client that uploads to UploadThing directly reports
 * back what it stored, and this handler is what decides whether a row may point
 * at it. The file router enforces the same caps on the upload itself.
 */
const MAX_FILES = 5;
const MAX_PDF_BYTES = 16 * 1024 * 1024;
const MAX_AUDIO_BYTES = 64 * 1024 * 1024;

const PDF = "application/pdf";

const isAudio = (type: string) => type.startsWith("audio/");

/** The cap for a type, or null when we do not accept it at all. */
const limitFor = (type: string): number | null =>
    type === PDF ? MAX_PDF_BYTES : isAudio(type) ? MAX_AUDIO_BYTES : null;

const megabytes = (bytes: number) => `${Math.round(bytes / (1024 * 1024))}MB`;

const filled = (value: unknown): value is string =>
    typeof value === "string" && value.length > 0;

type StoredFile = {
    name: string;
    url: string;
    key: string;
    type: string;
    size: number;
};

/** A refusal to answer with, or what actually reached UploadThing. */
type Stored = { status: number; error: string } | { files: StoredFile[]; skipped: number };

/**
 * What a client says it just uploaded.
 *
 * The same trust the dashboard has always had — the browser posts whatever its
 * `onClientUploadComplete` handed it — and the same thing backs it: the file
 * router's middleware is what authorized the upload, against this caller's
 * membership and role. The caps are re-checked anyway so a bad client cannot
 * write a row claiming a 500MB chart.
 */
function readStored(body: unknown): Stored {
    if (!isObject(body) || !Array.isArray(body.files)) {
        return { status: 400, error: "Expected the uploaded files." };
    }

    if (body.files.length === 0) return { status: 400, error: "Expected at least one file." };

    if (body.files.length > MAX_FILES) {
        return { status: 400, error: `Up to ${MAX_FILES} files at a time.` };
    }

    const files: StoredFile[] = [];

    for (const entry of body.files) {
        if (
            !isObject(entry) ||
            !filled(entry.name) ||
            !filled(entry.url) ||
            !filled(entry.key) ||
            !filled(entry.type) ||
            typeof entry.size !== "number" ||
            !Number.isInteger(entry.size) ||
            entry.size < 0
        ) {
            return { status: 400, error: "Expected the uploaded files." };
        }

        const limit = limitFor(entry.type);

        if (limit === null) {
            return { status: 400, error: `${entry.name} is not a PDF or an audio file.` };
        }

        if (entry.size > limit) {
            return { status: 400, error: `${entry.name} is over the ${megabytes(limit)} limit.` };
        }

        files.push({
            name: entry.name,
            url: entry.url,
            key: entry.key,
            type: entry.type,
            size: entry.size,
        });
    }

    return { files, skipped: 0 };
}

/**
 * The older path: the phone posts the bytes and we forward them.
 *
 * Bounded by the platform's 4.5MB request body cap, which is the reason newer
 * builds upload to UploadThing themselves. It stays for as long as those builds
 * are installed — an app already on a phone cannot be forced to update.
 */
async function forwardUpload(req: Request): Promise<Stored> {
    const form = await req.formData().catch(() => null);

    if (!form) return { status: 400, error: "Expected a file upload." };

    const posted = form.getAll("files").filter((entry): entry is File => entry instanceof File);

    if (posted.length === 0) return { status: 400, error: "Expected at least one file." };

    if (posted.length > MAX_FILES) {
        return { status: 400, error: `Up to ${MAX_FILES} files at a time.` };
    }

    for (const file of posted) {
        const limit = limitFor(file.type);

        if (limit === null) {
            return { status: 400, error: `${file.name} is not a PDF or an audio file.` };
        }

        if (file.size > limit) {
            return { status: 400, error: `${file.name} is over the ${megabytes(limit)} limit.` };
        }
    }

    const results = await new UTApi().uploadFiles(posted);
    const uploaded = results.flatMap((result) => (result.data ? [result.data] : []));

    return {
        files: uploaded.map((file) => ({
            name: file.name,
            url: file.ufsUrl,
            key: file.key,
            type: file.type,
            size: file.size,
        })),
        skipped: results.length - uploaded.length,
    };
}

type Params = { orgId: string; songId: string };

/**
 * POST /api/mobile/v1/organizations/[orgId]/songs/[songId]/attachments
 *
 * Attaches charts and tracks to a song, in one of two shapes told apart by the
 * body. JSON is a client that uploaded to UploadThing itself and is reporting
 * the keys, which is what the dashboard has always done. `multipart/form-data`
 * under `files` is an older build posting the bytes for us to forward.
 *
 * Owners and admins only, matching the file router's own middleware. The rows
 * are written by `addSongAttachments` either way, so the duplicate check and
 * the refusals stay shared with the dashboard.
 */
export const POST = route<Params>(".../songs/[id]/attachments", async (req, { params }) => {
    const clerkId = await clerkIdOf();

    if (!clerkId) return fail(401, "Unauthorized");

    const { orgId, songId } = await params;

    const membership = await membershipFor(clerkId, orgId);

    if (!membership) return fail(404, "Not Found");

    // Checked here as well as in the action: an upload that the action would
    // refuse must not leave a paid-for orphan behind.
    if (!canManage(membership.role)) return fail(403, "Forbidden");

    const song = await prisma.song.findFirst({
        where: { id: songId, organizationId: orgId, deletedAt: null },
        select: { id: true },
    });

    if (!song) return fail(404, "Song not found.");

    const stored = req.headers.get("content-type")?.includes("application/json")
        ? readStored(await readJson(req))
        : await forwardUpload(req);

    if ("error" in stored) return fail(stored.status, stored.error);

    const { files, skipped } = stored;

    if (files.length === 0) return fail(502, "The upload didn't go through. Try again.");

    const result = await addSongAttachments(
        { songId, organizationId: orgId, files },
        expireTag,
    );

    // The bytes are already at UploadThing but nothing points at them, so take
    // them back out rather than leave storage nobody can reach or delete.
    if (!result.success) {
        await new UTApi().deleteFiles(files.map((file) => file.key)).catch(() => undefined);

        return fail(/unauthori[sz]ed/i.test(result.error) ? 403 : 400, result.error);
    }

    // Partial success is still a failure to report: the app shows what landed.
    return json({ added: files.length, skipped }, 201);
});
