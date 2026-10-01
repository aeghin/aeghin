import type { RoleCategory, VolunteerRole } from "@/generated/prisma/enums";
import {
    ROLE_ORDER,
    TEAM_ORDER,
    teamLabel,
    volunteerRoleConfig,
} from "@/lib/config/roles";
import { clerkIdOf, fail, json, route } from "@/lib/mobile/route";

/**
 * Wire contract for the role catalog. Mirrors `RoleCatalog` in the Expo app
 * (`src/lib/config/volunteer-roles.ts`) — keep the two in sync, and treat it
 * as additive-only.
 */
type CatalogRole = {
    role: VolunteerRole;
    label: string;
    emoji: string;
    team: RoleCategory;
    /** Can be put on a song in a setlist, and keeps a key journal. */
    sings: boolean;
};

type CatalogTeam = {
    team: RoleCategory;
    label: string;
};

type RoleCatalog = {
    /** Every role, in roster order. */
    roles: CatalogRole[];
    /** Every team, in roster order. */
    teams: CatalogTeam[];
};

/**
 * GET /api/mobile/v1/roles
 *
 * Every volunteer role and team, as `lib/config/roles.ts` describes them. The
 * phone reads this instead of keeping its own copy, so a role or team added
 * there shows up on it without an app release.
 */
export const GET = route<Record<string, never>>("GET /roles", async () => {
    const clerkId = await clerkIdOf();

    if (!clerkId) return fail(401, "Unauthorized");

    return json<RoleCatalog>({
        roles: ROLE_ORDER.map((role) => {
            const { label, icon, team, sings } = volunteerRoleConfig[role];

            return { role, label, emoji: icon, team, sings };
        }),
        teams: TEAM_ORDER.map((team) => ({ team, label: teamLabel(team) })),
    });
});
