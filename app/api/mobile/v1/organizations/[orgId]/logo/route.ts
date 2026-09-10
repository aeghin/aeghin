import { UTApi } from "uploadthing/server";

import { OrgRole } from "@/generated/prisma/enums";
import { removeOrganizationLogo, updateOrganizationLogo } from "@/lib/actions/organizations";
import {
    actionFailure,
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
 * The limit `app/api/uploadthing/core.ts` puts on the `orgLogo` route.
 *
 * Only the older, byte-forwarding path needs it: a client that uploads to
 * UploadThing itself has already been held to the file router's own cap.
 */
const MAX_BYTES = 4 * 1024 * 1024;

const megabytes = (bytes: number) => `${Math.round(bytes / (1024 * 1024))}MB`;

const filled = (value: unknown): value is string =>
    typeof value === "string" && value.length > 0;

/** A refusal to answer with, or the image that reached UploadThing. */
type Stored = { status: number; error: string } | { url: string; key: string };

/**
 * What a client says it just uploaded, same trust as the dashboard's own
 * `onClientUploadComplete`: the `orgLogo` file router's middleware is what
 * authorized it, owners only, against this caller.
 */
function readStored(body: unknown): Stored {
    if (!isObject(body) || !filled(body.url) || !filled(body.key)) {
        return { status: 400, error: "Expected an image." };
    }

    return { url: body.url, key: body.key };
}

/**
 * The older path: the phone posts the bytes and we forward them. Kept for as
 * long as builds that do that are installed.
 */
async function forwardUpload(req: Request): Promise<Stored> {
    const form = await req.formData().catch(() => null);

    if (!form) return { status: 400, error: "Expected an image." };

    const file = form.get("file");

    if (!(file instanceof File)) return { status: 400, error: "Expected an image." };

    if (!file.type.startsWith("image/")) {
        return { status: 400, error: `${file.name} is not an image.` };
    }

    if (file.size > MAX_BYTES) {
        return { status: 400, error: `The logo has to be under ${megabytes(MAX_BYTES)}.` };
    }

    const upload = await new UTApi().uploadFiles(file);

    if (!upload.data) {
        return { status: 502, error: "The upload didn't go through. Try again." };
    }

    return { url: upload.data.ufsUrl, key: upload.data.key };
}

type Params = { orgId: string };

/**
 * POST /api/mobile/v1/organizations/[orgId]/logo
 *
 * Replaces the organization's logo. `multipart/form-data`, one image under
 * `file`. Owners only, matching the file router's middleware and the action.
 *
 * The action deletes whatever the logo used to be once the new key is stored,
 * so nothing here has to clean up the old one — only the new one, and only
 * when the write it was uploaded for does not happen.
 */
export const POST = route<Params>("POST .../logo", async (req, { params }) => {
    const clerkId = await clerkIdOf();

    if (!clerkId) return fail(401, "Unauthorized");

    const { orgId } = await params;

    const membership = await membershipFor(clerkId, orgId);

    if (!membership) return fail(404, "Not Found");

    // Checked before the upload rather than left to the action: a refusal
    // afterwards would mean paying to store a file only to delete it again.
    if (membership.role !== OrgRole.OWNER) {
        return fail(403, "Unable to make edits. Please reach out to an owner.");
    }

    const stored = req.headers.get("content-type")?.includes("application/json")
        ? readStored(await readJson(req))
        : await forwardUpload(req);

    if ("error" in stored) return fail(stored.status, stored.error);

    const { url, key } = stored;

    const result = await updateOrganizationLogo(orgId, { url, key }, expireTag);

    // The bytes are already at UploadThing but no row points at them, so take
    // them back out rather than leave storage nobody can reach or delete.
    if (!result.success) {
        await new UTApi().deleteFiles(key).catch(() => undefined);

        return actionFailure(result.error);
    }

    return json({ logoUrl: url }, 201);
});

/**
 * DELETE /api/mobile/v1/organizations/[orgId]/logo
 *
 * Clears the logo and deletes the stored file. Owners only. The organization
 * falls back to its initials, which is what every avatar draws without one.
 */
export const DELETE = route<Params>("DELETE .../logo", async (_req, { params }) => {
    const clerkId = await clerkIdOf();

    if (!clerkId) return fail(401, "Unauthorized");

    const { orgId } = await params;

    const membership = await membershipFor(clerkId, orgId);

    if (!membership) return fail(404, "Not Found");

    const result = await removeOrganizationLogo(orgId, expireTag);

    if (!result.success) return actionFailure(result.error);

    return json({ success: true });
});
