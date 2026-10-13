import "server-only";

import { z } from "zod/v4";
import { OrgRole } from "@/generated/prisma/enums";
import { getRoleConfig, hasSingingRole, volunteerRoleConfig } from "@/lib/config/roles";
import { getSeatUsage, type SeatUsage } from "@/lib/billing/limits";
import {
  getOrganizationDetailsById,
  getUserOrganizations,
} from "@/lib/services/organization";
import { currentUser, userRoles } from "@/lib/services/user";

/** Who is looking at which org, and what they may open. */
export interface OrgAccess {
  orgId: string;
  userId: string;
  organizationName: string;
  canManage: boolean;
  isOwner: boolean;
  /** Lead vocalists and BGVs — the only members with a key journal. */
  isVocalist: boolean;
}

/**
 * The membership check every page inside an org runs. Cached services only,
 * so the shell, the header and the page can each call it for cache hits.
 * Null when the id is malformed or the person isn't a member.
 */
export async function getOrgAccess(id: string): Promise<OrgAccess | null> {
  const { data: orgId, success } = z.uuid().safeParse(id);
  if (!success) return null;

  const user = await currentUser();
  if (!user) return null;

  const [organization, roles] = await Promise.all([
    getOrganizationDetailsById(orgId, user.id),
    userRoles(user.id, orgId),
  ]);

  if (!organization) return null;

  const role = organization.memberships[0].role;

  return {
    orgId,
    userId: user.id,
    organizationName: organization.name,
    canManage: role === OrgRole.OWNER || role === OrgRole.ADMIN,
    isOwner: role === OrgRole.OWNER,
    isVocalist: hasSingingRole(roles?.volunteerRoles ?? []),
  };
}

export interface OrgShellOrganization {
  id: string;
  name: string;
  logoUrl: string | null;
}

/** Everything the sidebar and top bar show, plain data for client components. */
export interface OrgShell {
  organization: OrgShellOrganization;
  roleLabel: string;
  /** "Lead Vocalist", "BGVs"…, in the order the person holds them. */
  volunteerRoleLabels: string[];
  canManage: boolean;
  isOwner: boolean;
  isVocalist: boolean;
  /** For the sidebar's invite dialog; null for members, or when the plan has no cap. */
  seatUsage: SeatUsage | null;
  organizations: OrgShellOrganization[];
}

/**
 * The org page and its sub-pages read the same cached services, so the shell
 * costs cache hits, not new queries. Returns null when the id is malformed or
 * the person isn't a member — the page underneath shows the 404.
 */
export async function getOrgShell(id: string): Promise<OrgShell | null> {
  const access = await getOrgAccess(id);
  if (!access) return null;

  const { orgId, userId, canManage, isOwner, isVocalist } = access;

  const [organization, organizations, roles, seatUsage] = await Promise.all([
    getOrganizationDetailsById(orgId, userId),
    getUserOrganizations(userId),
    userRoles(userId, orgId),
    canManage ? getSeatUsage(orgId) : null,
  ]);

  if (!organization) return null;

  return {
    organization: {
      id: organization.id,
      name: organization.name,
      logoUrl: organization.logoUrl,
    },
    roleLabel: getRoleConfig(organization.memberships[0].role).label,
    volunteerRoleLabels: (roles?.volunteerRoles ?? []).map((role) => volunteerRoleConfig[role].label),
    canManage,
    isOwner,
    isVocalist,
    seatUsage,
    organizations: organizations.map(({ id, name, logoUrl }) => ({ id, name, logoUrl })),
  };
}
