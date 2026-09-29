import { setEventWatch } from "@/lib/actions/team-notifications";
import {
    actionFailure,
    clerkIdOf,
    expireTag,
    fail,
    json,
    membershipFor,
    route,
} from "@/lib/mobile/route";

type Params = { orgId: string; eventId: string };

/** Both verbs are the same call, one each way. */
const watch = (watching: boolean) =>
    route<Params>(`${watching ? "POST" : "DELETE"} /events/[eventId]/watch`, async (_req, { params }) => {
        const clerkId = await clerkIdOf();

        if (!clerkId) return fail(401, "Unauthorized");

        const { orgId, eventId } = await params;

        if (!(await membershipFor(clerkId, orgId))) return fail(404, "Not Found");

        const result = await setEventWatch(
            { organizationId: orgId, eventId, watching },
            expireTag,
        );

        return result.success ? json({ watching }) : actionFailure(result.error);
    });

/**
 * POST /api/mobile/v1/organizations/[orgId]/events/[eventId]/watch
 *
 * Starts watching the event: a heads-up about every staffing alert on it,
 * whoever is asked to act. Owners and admins, for themselves.
 */
export const POST = watch(true);

/** DELETE /api/mobile/v1/organizations/[orgId]/events/[eventId]/watch — stops. */
export const DELETE = watch(false);
