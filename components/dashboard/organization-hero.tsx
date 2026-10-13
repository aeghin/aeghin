import { CalendarPlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "../ui/button";
import { volunteerRoleConfig } from "@/lib/config/roles";
import { InviteMemberButton } from "./invite-person-button";
import { OrgRole, VolunteerRole } from "@/generated/prisma/enums";
import { getSeatUsage } from "@/lib/billing/limits";
import Link from "next/link";

type Organization = {
  memberships: {
    role: OrgRole;
  }[];
  id: string;
  name: string;
  description: string;
  logoUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
};

interface OrganizationHeroProps {
  organization: Organization;
  volunteerRoles: VolunteerRole[];
}

export const OrganizationHero = async ({
  organization: { id, name, description, memberships },
  volunteerRoles,
}: OrganizationHeroProps) => {
  const userRole = memberships[0].role;

  const canManage = userRole === OrgRole.OWNER || userRole === OrgRole.ADMIN;

  // Read here so the invite dialog can say "full" before anyone fills it in.
  const seatUsage = canManage ? await getSeatUsage(id) : null;

  return (
    <>
      {/* From 768px up the sidebar carries all of this: the switcher names the
          org and lists your roles, and Create event and Invite member sit
          under it. The name stays as the page's heading for screen readers. */}
      <h1 className="sr-only hidden md:block">{name}</h1>

      {/* Below 768px the sidebar is a sheet, so the header is the org's one
          compact row: the name with your roles beside it, the description and
          the actions, ruled off from the section under it. */}
      <div className="flex flex-col gap-3.5 border-b pb-5 sm:flex-row sm:items-start sm:justify-between sm:gap-6 md:hidden">
        <div className="min-w-0 space-y-2 sm:space-y-1">
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-3">
            <h1 className="text-2xl font-semibold tracking-tight text-balance">{name}</h1>

            {volunteerRoles.length > 0 ? (
              <div className="flex flex-wrap items-center gap-1.5">
                {volunteerRoles.map((role) => {
                  const { label, icon } = volunteerRoleConfig[role];
                  return (
                    <Badge
                      key={role}
                      variant="secondary"
                      className="h-6 gap-1 rounded-md px-2 text-xs font-medium"
                    >
                      <span>{icon}</span>
                      {label}
                    </Badge>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                No volunteer roles assigned yet
              </p>
            )}
          </div>

          {/* Two lines at most on a phone, one beside the buttons from 640px;
              the full text is on hover. */}
          <p title={description} className="line-clamp-2 text-sm text-muted-foreground sm:line-clamp-1">
            {description}
          </p>
        </div>

        {canManage && (
          // Side by side at equal widths on a phone.
          <div className="grid grid-cols-2 gap-2 sm:flex sm:shrink-0 sm:items-center">
            <InviteMemberButton
              organizationId={id}
              organizationName={name}
              seatUsage={seatUsage}
              canUpgrade={userRole === OrgRole.OWNER}
            />
            <Button size="sm" className="cursor-pointer transition-all" asChild>
              <Link
                href={`/dashboard/organizations/${id}/events/create`}
              >
                <CalendarPlus className="mr-2 h-4 w-4" />
                Create event
              </Link>
            </Button>
          </div>
        )}
      </div>
    </>
  );
};
