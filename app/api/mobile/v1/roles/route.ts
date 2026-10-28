import type { RoleCategory, VoiceType, VolunteerRole } from "@/generated/prisma/enums";
import {
    ROLE_ORDER,
    TEAM_ORDER,
    VOICE_TYPE_ORDER,
    teamLabel,
    voiceTypeLabel,
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

type CatalogVoiceType = {
    voiceType: VoiceType;
    label: string;
};

type RoleCatalog = {
    /** Every role, in roster order. */
    roles: CatalogRole[];
    /** Every team, in roster order. */
    teams: CatalogTeam[];
    /** Every singer's voice type, high to low. */
    voiceTypes: CatalogVoiceType[];
};

/**
 * GET /api/mobile/v1/roles
 *
 * Every volunteer role, team and voice type, as `lib/config/roles.ts`
 * describes them. The phone reads this instead of keeping its own copy, so one
 * added there shows up on it without an app release.
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
        voiceTypes: VOICE_TYPE_ORDER.map((voiceType) => ({ voiceType, label: voiceTypeLabel(voiceType) })),
    });
});
