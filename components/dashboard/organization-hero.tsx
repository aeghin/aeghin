import { Building2, CalendarPlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "../ui/button";
import { cn } from "@/lib/utils";
import { getRoleConfig, volunteerRoleConfig } from "@/lib/config/roles";
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
  organization: { id, name, description, logoUrl, memberships },
  volunteerRoles,
}: OrganizationHeroProps) => {
  const userRole = memberships[0].role;

  const roleConfig = getRoleConfig(userRole);
  const RoleIcon = roleConfig.icon;

  const canManage = userRole === OrgRole.OWNER || userRole === OrgRole.ADMIN;

  // Read here so the invite dialog can say "full" before anyone fills it in.
  const seatUsage = canManage ? await getSeatUsage(id) : null;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border/40 bg-linear-to-br from-card via-card to-primary/5 p-8">
      <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-primary/5 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-20 -left-20 h-48 w-48 rounded-full bg-primary/10 blur-3xl" />

      <div className="relative flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-5">
          <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl bg-linear-to-br from-primary/20 to-primary/10 text-primary shadow-lg shadow-primary/10 transition-transform hover:scale-105">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt={`${name} logo`}
                className="h-full w-full object-cover"
              />
            ) : (
              <Building2 className="h-8 w-8" />
            )}
          </div>
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight">{name}</h1>
              <Badge
                variant="outline"
                className={cn("text-xs font-medium", roleConfig.className)}
              >
                <RoleIcon className="mr-1 h-3 w-3" />
                {roleConfig.label}
              </Badge>
            </div>
            <p className="max-w-lg text-muted-foreground">{description}</p>

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
        </div>

        {canManage && (
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              className="cursor-pointer bg-background/50 backdrop-blur-sm transition-all hover:bg-background hover:border-primary/30 hover:scale-105"
              asChild
            >
              <Link
                href={`/dashboard/organizations/${id}/events/create`}
              >
                <CalendarPlus className="mr-2 h-4 w-4" />
                Create Event
              </Link>
            </Button>
            <InviteMemberButton
              organizationId={id}
              organizationName={name}
              seatUsage={seatUsage}
              canUpgrade={userRole === OrgRole.OWNER}
            />
          </div>
        )}
      </div>
    </div>
  );
};
