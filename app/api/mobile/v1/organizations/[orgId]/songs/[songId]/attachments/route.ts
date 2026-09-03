import { UTApi } from "uploadthing/server";

import prisma from "@/lib/prisma";
import { addSongAttachments } from "@/lib/actions/song";
import {
    canManage,
    clerkIdOf,
    expireTag,
    fail,
    json,
    membershipFor,
    route,
} from "@/lib/mobile/route";

/**
 * The limits `app/api/uploadthing/core.ts` puts on the `songAttachment` route,
 * repeated here because the phone does not go through it.
 *
 * The dashboard uploads straight from the browser, where UploadThing's own
 * client enforces these before a byte leaves. There is no such client for
 * React Native — `useUploadThing` is a React DOM hook — so the phone posts the
 * file to us and we upload it with `UTApi`, which means this handler is the
 * only thing standing where that client would be.
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

type Params = { orgId: string; songId: string };

/**
 * POST /api/mobile/v1/organizations/[orgId]/songs/[songId]/attachments
 *
 * Attaches charts and tracks to a song. `multipart/form-data`, with the files
 * under `files` — the one route in the mobile API that is not JSON, because
 * the alternative is base64 in a JSON body and a third more bytes over a
 * cellular connection.
 *
 * Owners and admins only, matching the file router's own middleware. The rows
 * are written by `addSongAttachments`, the action the dashboard calls once its
 * browser upload finishes, so the duplicate check and the refusals are shared.
 */
export const POST = route<Params>(".../songs/[id]/attachments", async (req, { params }) => {
    const clerkId = await clerkIdOf();

    if (!clerkId) return fail(401, "Unauthorized");

    const { orgId, songId } = await params;

    const membership = await membershipFor(clerkId, orgId);

    if (!membership) return fail(404, "Not Found");

    // Checked here as well as in the action: an upload that the action would
    // refuse must not reach UploadThing and leave a paid-for orphan behind.
    if (!canManage(membership.role)) return fail(403, "Forbidden");

    const song = await prisma.song.findFirst({
        where: { id: songId, organizationId: orgId, deletedAt: null },
        select: { id: true },
    });

    if (!song) return fail(404, "Song not found.");

    const form = await req.formData().catch(() => null);

    if (!form) return fail(400, "Expected a file upload.");

    const files = form.getAll("files").filter((entry): entry is File => entry instanceof File);

    if (files.length === 0) return fail(400, "Expected at least one file.");

    if (files.length > MAX_FILES) {
        return fail(400, `Up to ${MAX_FILES} files at a time.`);
    }

    for (const file of files) {
        const limit = limitFor(file.type);

        if (limit === null) {
            return fail(400, `${file.name} is not a PDF or an audio file.`);
        }

        if (file.size > limit) {
            return fail(400, `${file.name} is over the ${megabytes(limit)} limit.`);
        }
    }

    const results = await new UTApi().uploadFiles(files);

    const uploaded = results.flatMap((result) => (result.data ? [result.data] : []));

    if (uploaded.length === 0) {
        return fail(502, "The upload didn't go through. Try again.");
    }

    const result = await addSongAttachments(
        {
            songId,
            organizationId: orgId,
            files: uploaded.map((file) => ({
                name: file.name,
                url: file.ufsUrl,
                key: file.key,
                type: file.type,
                size: file.size,
            })),
        },
        expireTag,
    );

    // The bytes are already at UploadThing but nothing points at them, so take
    // them back out rather than leave storage nobody can reach or delete.
    if (!result.success) {
        await new UTApi().deleteFiles(uploaded.map((file) => file.key)).catch(() => undefined);

        return fail(/unauthori[sz]ed/i.test(result.error) ? 403 : 400, result.error);
    }

    // Partial success is still a failure to report: the app shows what landed.
    return json({ added: uploaded.length, skipped: results.length - uploaded.length }, 201);
});
