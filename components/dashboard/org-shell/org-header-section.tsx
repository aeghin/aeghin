import { OrganizationHero } from "@/components/dashboard/organization-hero";
import { getOrganizationDetailsById } from "@/lib/services/organization";
import { userRoles } from "@/lib/services/user";
import { getOrgAccess } from "./get-org-shell";

/** Holds the header's height while it resolves, so sections don't jump. */
export function OrgHeaderSkeleton() {
  return (
    <div className="flex items-start gap-3 sm:gap-4">
      <div className="flex-1 space-y-2.5 pt-1">
        <div className="h-6 w-56 animate-pulse rounded-md bg-muted" />
        <div className="h-4 w-80 max-w-full animate-pulse rounded-md bg-muted" />
        <div className="h-5 w-40 animate-pulse rounded-md bg-muted" />
      </div>
    </div>
  );
}

/**
 * The org header above every overview section. It lives in the (overview)
 * layout, so moving between sections doesn't re-render it.
 */
export async function OrgHeaderSection({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await getOrgAccess(id);
  if (!access) return null;

  const [organization, roles] = await Promise.all([
    getOrganizationDetailsById(access.orgId, access.userId),
    userRoles(access.userId, access.orgId),
  ]);

  if (!organization) return null;

  return (
    <OrganizationHero
      organization={organization}
      volunteerRoles={roles?.volunteerRoles ?? []}
    />
  );
}
