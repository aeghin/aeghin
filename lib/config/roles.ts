
import { VolunteerRole, OrgRole, RoleCategory as Team } from "@/generated/prisma/enums";
import { Crown, Shield, User } from "lucide-react";

export const volunteerRoleConfig: Record<VolunteerRole, { label: string; icon: string }> = {
  [VolunteerRole.GUITARIST]:   { label: "Guitarist",   icon: "🎸" },
  [VolunteerRole.PIANIST]:     { label: "Pianist",      icon: "🎹" },
  [VolunteerRole.AUX_KEYS]:   { label: "Aux Keys",     icon: "🎹" },
  [VolunteerRole.DRUMMER]:    { label: "Drummer",       icon: "🥁" },
  [VolunteerRole.LEAD_VOCALIST]: { label: "Lead Vocalist", icon: "🎤" },
  [VolunteerRole.BGVS]:       { label: "BGVs", icon: "🎤" },
  [VolunteerRole.BASSIST]:    { label: "Bassist",       icon: "🎸" },
  [VolunteerRole.SOUND_TECH]: { label: "Sound Tech",    icon: "🎚️" },
  [VolunteerRole.STREAM_TECH]: { label: "Stream Tech",  icon: "📹" },
  [VolunteerRole.PROJECTION_TECH]: { label: "Projection", icon: "📽️" },
  [VolunteerRole.USHER]:      { label: "Usher",         icon: "🚪" },
  [VolunteerRole.GREETER]:    { label: "Greeter",       icon: "👋" },
};

export type RoleCategory = "band" | "vocals" | "production" | "hospitality";

export const roleCategoryConfig: Record<
  RoleCategory,
  { label: string; order: number }
> = {
  band: { label: "Band", order: 0 },
  vocals: { label: "Vocals", order: 1 },
  production: { label: "Production", order: 2 },
  hospitality: { label: "Hospitality", order: 3 },
};

export const roleToCategory: Record<VolunteerRole, RoleCategory> = {
  [VolunteerRole.PIANIST]: "band",
  [VolunteerRole.AUX_KEYS]: "band",
  [VolunteerRole.BASSIST]: "band",
  [VolunteerRole.GUITARIST]: "band",
  [VolunteerRole.DRUMMER]: "band",
  [VolunteerRole.LEAD_VOCALIST]: "vocals",
  [VolunteerRole.BGVS]: "vocals",
  [VolunteerRole.SOUND_TECH]: "production",
  [VolunteerRole.STREAM_TECH]: "production",
  [VolunteerRole.PROJECTION_TECH]: "production",
  [VolunteerRole.USHER]: "hospitality",
  [VolunteerRole.GREETER]: "hospitality",
};

/**
 * The same four groups under the names the database keeps team leads and
 * watchers against. `roleToCategory` stays the one place a role is put in a
 * team; these only translate its answer.
 */
export const TEAM_ORDER: Team[] = [
  Team.BAND,
  Team.VOCALS,
  Team.PRODUCTION,
  Team.HOSPITALITY,
];

const teamOfCategory: Record<RoleCategory, Team> = {
  band: Team.BAND,
  vocals: Team.VOCALS,
  production: Team.PRODUCTION,
  hospitality: Team.HOSPITALITY,
};

const categoryOfTeam: Record<Team, RoleCategory> = {
  [Team.BAND]: "band",
  [Team.VOCALS]: "vocals",
  [Team.PRODUCTION]: "production",
  [Team.HOSPITALITY]: "hospitality",
};

export const teamOfRole = (role: VolunteerRole): Team =>
  teamOfCategory[roleToCategory[role]];

export const teamLabel = (team: Team): string =>
  roleCategoryConfig[categoryOfTeam[team]].label;

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