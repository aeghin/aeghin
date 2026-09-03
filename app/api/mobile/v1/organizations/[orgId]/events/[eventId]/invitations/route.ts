import { inviteMembersToEvent } from "@/lib/actions/event";
import { inviteToEventSchema } from "@/lib/validations/event";
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

type Params = { orgId: string; eventId: string };

/**
 * POST /api/mobile/v1/organizations/[orgId]/events/[eventId]/invitations
 *
 * Invites members into one role: `{ role, userIds, expiresAt: 3 | 5 | 7 }`.
 *
 * The action is the dashboard's: it refuses anyone without the volunteer
 * role or with a blockout on an event day, skips anyone already live on the
 * roster, reuses dead rows, emails the invitees and logs the activity.
 * Answers `{ invitedCount, skippedNames }` so the phone can say who was
 * already on it.
 */
export const POST = route<Params>("POST .../events/[id]/invitations", async (req, { params }) => {
    const clerkId = await clerkIdOf();

    if (!clerkId) return fail(401, "Unauthorized");

    const { orgId, eventId } = await params;

    const membership = await membershipFor(clerkId, orgId);

    if (!membership) return fail(404, "Not Found");

    const body = await readJson(req);

    if (!isObject(body)) return fail(400, "Expected an invitation.");

    const parsed = inviteToEventSchema.safeParse(body);

    if (!parsed.success) {
        return fail(400, parsed.error.issues[0]?.message ?? "Invalid invitation.");
    }

    const result = await inviteMembersToEvent(orgId, eventId, parsed.data, expireTag);

    if (!result.success) return actionFailure(result.error);

    return json(
        { invitedCount: result.invitedCount, skippedNames: result.skippedNames },
        201,
    );
});
