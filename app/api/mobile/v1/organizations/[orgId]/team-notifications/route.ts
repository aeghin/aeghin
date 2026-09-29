import { OrgRole, RoleCategory } from "@/generated/prisma/enums";
import { setTeamLead, setTeamWatcher } from "@/lib/actions/team-notifications";
import { getTeamNotificationSettings } from "@/lib/services/team-notifications";
import {
    actionFailure,
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
 * Wire contract for the staffing alerts screen. Mirrors
 * `TeamNotificationSettings` in the Expo app (`src/types/team-notifications.ts`)
 * — keep the two in sync, and treat it as additive-only.
 */
type TeamPerson = {
    userId: string;
    firstName: string;
    lastName: string;
};

type TeamSettings = {
    team: RoleCategory;
    lead: TeamPerson | null;
    watchers: TeamPerson[];
};

type TeamNotificationSettings = {
    teams: TeamSettings[];
    /** Admins and owners: everybody who can lead a team or be copied in. */
    managers: (TeamPerson & { role: OrgRole })[];
    /** Whose own switch this is, and whether they may change anybody else's. */
    viewer: { userId: string; isOwner: boolean };
};

type Params = { orgId: string };

const isTeam = (value: unknown): value is RoleCategory =>
    typeof value === "string" &&
    (Object.values(RoleCategory) as string[]).includes(value);

/**
 * GET /api/mobile/v1/organizations/[orgId]/team-notifications
 *
 * Who leads each team and who else gets a heads-up — the same cached read the
 * dashboard's Settings tab renders. Owners and admins only: members are never
 * asked to fill a role, so there is nothing here for them.
 */
export const GET = route<Params>("GET /team-notifications", async (_req, { params }) => {
    const clerkId = await clerkIdOf();

    if (!clerkId) return fail(401, "Unauthorized");

    const { orgId } = await params;
    const membership = await membershipFor(clerkId, orgId);

    if (!membership) return fail(404, "Not Found");

    if (!canManage(membership.role)) return fail(403, "Unauthorized");

    const settings = await getTeamNotificationSettings(orgId);

    return json<TeamNotificationSettings>({
        ...settings,
        viewer: {
            userId: membership.userId,
            isOwner: membership.role === OrgRole.OWNER,
        },
    });
});

/**
 * PATCH /api/mobile/v1/organizations/[orgId]/team-notifications
 *
 * Two shapes, told apart by what the body carries:
 *
 *   { team, lead: userId | null }        — who leads a team. Owners only.
 *   { team, userId, watching: boolean }  — somebody on or off the team's
 *                                           "Also notify". An owner for
 *                                           anybody, an admin for themselves.
 *
 * The dashboard's own actions do the work, so the permission rules and the
 * refusals are worded the same on both.
 */
export const PATCH = route<Params>("PATCH /team-notifications", async (req, { params }) => {
    const clerkId = await clerkIdOf();

    if (!clerkId) return fail(401, "Unauthorized");

    const { orgId } = await params;
    const membership = await membershipFor(clerkId, orgId);

    if (!membership) return fail(404, "Not Found");

    const body = await readJson(req);

    if (!isObject(body) || !isTeam(body.team)) return fail(400, "Expected a team.");

    if ("lead" in body) {
        if (body.lead !== null && typeof body.lead !== "string") {
            return fail(400, "Expected lead to be a member's id, or null.");
        }

        const result = await setTeamLead(
            { organizationId: orgId, team: body.team, userId: body.lead },
            expireTag,
        );

        return result.success ? json({ success: true }) : actionFailure(result.error);
    }

    if (typeof body.userId === "string" && typeof body.watching === "boolean") {
        const result = await setTeamWatcher(
            {
                organizationId: orgId,
                team: body.team,
                userId: body.userId,
                watching: body.watching,
            },
            expireTag,
        );

        return result.success ? json({ success: true }) : actionFailure(result.error);
    }

    return fail(400, "Expected { team, lead } or { team, userId, watching }.");
});
