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
    // Flat on the page, as in the design system. The org's logo and your
    // role sit in the sidebar's switcher right beside this, so the header
    // keeps only what's new here: the name as the page's title (the one place
    // it shows on a phone), the description, your roles and the actions.
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
        <div className="min-w-0 space-y-2">
            <h1 className="text-xl font-semibold tracking-tight text-balance sm:text-2xl">{name}</h1>
            <p className="max-w-lg text-sm text-muted-foreground">{description}</p>

            {volunteerRoles.length > 0 ? (
              <div className="flex flex-wrap items-center gap-1.5">
                {volunteerRoles.map((role) => {
                  const { label, icon } = volunteerRoleConfig[role];
                  return (
                    <Badge
                      key={role}
                      variant="secondary"
                      className="gap-1 px-2.5 py-1 text-xs font-medium"
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

        {canManage && (
          <div className="flex items-center gap-2">
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
    </div>
  );
};
