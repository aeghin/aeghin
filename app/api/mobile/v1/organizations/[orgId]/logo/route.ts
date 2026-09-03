import { UTApi } from "uploadthing/server";

import { OrgRole } from "@/generated/prisma/enums";
import { removeOrganizationLogo, updateOrganizationLogo } from "@/lib/actions/organizations";
import {
    actionFailure,
    clerkIdOf,
    expireTag,
    fail,
    json,
    membershipFor,
    route,
} from "@/lib/mobile/route";

/**
 * The limits `app/api/uploadthing/core.ts` puts on the `orgLogo` route.
 *
 * Repeated here for the same reason the song attachment route repeats its own:
 * the dashboard uploads from the browser, where UploadThing's client checks
 * these first, and the phone has no such client — it posts the file to us and
 * `UTApi` does that leg, so this handler stands where the client would.
 */
const MAX_BYTES = 4 * 1024 * 1024;

const megabytes = (bytes: number) => `${Math.round(bytes / (1024 * 1024))}MB`;

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

    const form = await req.formData().catch(() => null);

    if (!form) return fail(400, "Expected an image.");

    const file = form.get("file");

    if (!(file instanceof File)) return fail(400, "Expected an image.");

    if (!file.type.startsWith("image/")) {
        return fail(400, `${file.name} is not an image.`);
    }

    if (file.size > MAX_BYTES) {
        return fail(400, `The logo has to be under ${megabytes(MAX_BYTES)}.`);
    }

    const upload = await new UTApi().uploadFiles(file);

    if (!upload.data) {
        return fail(502, "The upload didn't go through. Try again.");
    }

    const result = await updateOrganizationLogo(
        orgId,
        { url: upload.data.ufsUrl, key: upload.data.key },
        expireTag,
    );

    // The bytes are already at UploadThing but no row points at them, so take
    // them back out rather than leave storage nobody can reach or delete.
    if (!result.success) {
        await new UTApi().deleteFiles(upload.data.key).catch(() => undefined);

        return actionFailure(result.error);
    }

    return json({ logoUrl: upload.data.ufsUrl }, 201);
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
