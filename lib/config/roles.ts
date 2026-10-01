
import { VolunteerRole, OrgRole, RoleCategory as Team } from "@/generated/prisma/enums";
import { Crown, Shield, User } from "lucide-react";

export type VolunteerRoleDefinition = {
  label: string;
  icon: string;
  team: Team;
  /** Sings: can be put on a song in a setlist, and keeps a key journal. */
  sings: boolean;
};

/**
 * Every volunteer role, in the order rosters and pickers list them. The one
 * place a role is described: the app reads it through the API.
 *
 * Adding one takes a value on the `VolunteerRole` enum, an entry here and a
 * migration, and every organization gets it at once. Postgres can't drop an
 * enum value, so treat it as permanent. Keep emoji to Emoji 3.0 or older — the
 * oldest Android the app supports can't draw anything newer.
 */
export const volunteerRoleConfig: Record<VolunteerRole, VolunteerRoleDefinition> = {
  [VolunteerRole.PIANIST]:         { label: "Pianist",       icon: "🎹", team: Team.BAND,        sings: false },
  [VolunteerRole.AUX_KEYS]:        { label: "Aux Keys",      icon: "🎹", team: Team.BAND,        sings: false },
  [VolunteerRole.BASSIST]:         { label: "Bassist",       icon: "🎸", team: Team.BAND,        sings: false },
  [VolunteerRole.GUITARIST]:       { label: "Guitarist",     icon: "🎸", team: Team.BAND,        sings: false },
  [VolunteerRole.DRUMMER]:         { label: "Drummer",       icon: "🥁", team: Team.BAND,        sings: false },
  [VolunteerRole.LEAD_VOCALIST]:   { label: "Lead Vocalist", icon: "🎤", team: Team.VOCALS,      sings: true },
  [VolunteerRole.BGVS]:            { label: "BGVs",          icon: "🎤", team: Team.VOCALS,      sings: true },
  [VolunteerRole.CHOIR]:           { label: "Choir",         icon: "🎶", team: Team.VOCALS,      sings: true },
  [VolunteerRole.SOUND_TECH]:      { label: "Sound Tech",    icon: "🎚️", team: Team.PRODUCTION,  sings: false },
  [VolunteerRole.STREAM_TECH]:     { label: "Stream Tech",   icon: "📹", team: Team.PRODUCTION,  sings: false },
  [VolunteerRole.CAMERA]:          { label: "Camera",        icon: "🎥", team: Team.PRODUCTION,  sings: false },
  [VolunteerRole.LIGHTING]:        { label: "Lighting",      icon: "💡", team: Team.PRODUCTION,  sings: false },
  [VolunteerRole.PROJECTION_TECH]: { label: "Projection",    icon: "📽️", team: Team.MEDIA,       sings: false },
  [VolunteerRole.USHER]:           { label: "Usher",         icon: "🚪", team: Team.HOSPITALITY, sings: false },
  [VolunteerRole.GREETER]:         { label: "Greeter",       icon: "👋", team: Team.HOSPITALITY, sings: false },
};

/**
 * The teams, in the order a roster shows them. Each gets its own lead and
 * Also notify in Settings → Staffing Alerts. Added the same way as a role: a
 * value on the `RoleCategory` enum, an entry here and a migration.
 */
export const teamConfig: Record<Team, { label: string }> = {
  [Team.BAND]: { label: "Band" },
  [Team.VOCALS]: { label: "Vocals" },
  [Team.PRODUCTION]: { label: "Production" },
  [Team.MEDIA]: { label: "Media" },
  [Team.HOSPITALITY]: { label: "Hospitality" },
};

/** Every role, in the order written above. */
export const ROLE_ORDER = Object.keys(volunteerRoleConfig) as VolunteerRole[];

/** Every team, in the order written above. */
export const TEAM_ORDER = Object.keys(teamConfig) as Team[];

/** The roles that can be put on a song, for the setlist and the key journal. */
export const SINGING_ROLES = ROLE_ORDER.filter((role) => volunteerRoleConfig[role].sings);

export const teamOfRole = (role: VolunteerRole): Team => volunteerRoleConfig[role].team;

/** The teams a set of roles falls into, in TEAM_ORDER. */
export const teamsOfRoles = (roles: VolunteerRole[]): Team[] =>
  TEAM_ORDER.filter((team) => roles.some((role) => teamOfRole(role) === team));

export const teamLabel = (team: Team): string => teamConfig[team].label;

/** One team's roles, in roster order. */
export const rolesOfTeam = (team: Team): VolunteerRole[] =>
  ROLE_ORDER.filter((role) => teamOfRole(role) === team);

/** Whether any of these roles sings — the gate for the key journal and song assignment. */
export const hasSingingRole = (roles: VolunteerRole[]): boolean =>
  roles.some((role) => volunteerRoleConfig[role].sings);

export const getRoleConfig = (role: OrgRole) => {
  switch (role) {
      case OrgRole.OWNER:
        return { icon: Crown, label: "Owner", className: "border-gold/40 bg-linear-to-r from-gold/15 to-gold/8 text-gold" }
      case OrgRole.ADMIN:
        return { icon: Shield, label: "Admin", className: "bg-blue-500/10 text-blue-600 border-blue-500/20" }
      default:
        return { icon: User, label: "Member", className: "bg-muted text-muted-foreground border-border" }
    };
};
