import { deleteEventTemplate, updateEventTemplate } from "@/lib/actions/event-template";
import { eventTemplateSchema } from "@/lib/validations/event-template";
import {
    clerkIdOf,
    expireTag,
    fail,
    isObject,
    json,
    membershipFor,
    readJson,
    route,
} from "@/lib/mobile/route";

type Params = { orgId: string; templateId: string };

/** An action's refusal as a status. "Template not found" is a 404, not a 400. */
const templateFailure = (error: string) =>
    fail(
        /unauthori[sz]ed/i.test(error) ? 403
            : /not found/i.test(error) ? 404
            : /already exists/i.test(error) ? 409
            : 400,
        error,
    );

/**
 * PATCH /api/mobile/v1/organizations/[orgId]/templates/[templateId]
 *
 * Replaces a template's fields, its days included — the action deletes and
 * recreates the day rows, so the body carries the whole schedule rather than a
 * patch of it. Owners and admins only.
 */
export const PATCH = route<Params>("PATCH .../templates/[id]", async (req, { params }) => {
    const clerkId = await clerkIdOf();

    if (!clerkId) return fail(401, "Unauthorized");

    const { orgId, templateId } = await params;

    const membership = await membershipFor(clerkId, orgId);

    if (!membership) return fail(404, "Not Found");

    const body = await readJson(req);

    if (!isObject(body)) return fail(400, "Expected a template.");

    const parsed = eventTemplateSchema.safeParse({ ...body, organizationId: orgId });

    if (!parsed.success) {
        return fail(400, parsed.error.issues[0]?.message ?? "Invalid template.");
    }

    const result = await updateEventTemplate(templateId, parsed.data, expireTag);

    if (!result.success) return templateFailure(result.error);

    return json({ success: true });
});

/**
 * DELETE /api/mobile/v1/organizations/[orgId]/templates/[templateId]
 *
 * Deletes one, and its days with it. Events already built from it are
 * untouched — a template is only ever a starting point. Owners and admins only.
 */
export const DELETE = route<Params>("DELETE .../templates/[id]", async (_req, { params }) => {
    const clerkId = await clerkIdOf();

    if (!clerkId) return fail(401, "Unauthorized");

    const { orgId, templateId } = await params;

    const membership = await membershipFor(clerkId, orgId);

    if (!membership) return fail(404, "Not Found");

    const result = await deleteEventTemplate(templateId, orgId, expireTag);

    if (!result.success) return templateFailure(result.error);

    return json({ success: true });
});
