import {
  Users,
  Clock,
  Check,
  X,
  LucideIcon,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { cn } from "@/lib/utils";
import type { EventDetails } from "@/lib/types";
import { InvitationStatus, VolunteerRole } from "@/generated/prisma/enums";
import { statusStyles } from "@/lib/config/status";
import { colorClasses } from "@/lib/config/service-types-config";
// import { VolunteerRowMenu } from "./volunteer-row-menu";

import {
  volunteerRoleConfig,
  roleCategoryConfig,
  roleToCategory,
  RoleCategory,
} from "@/lib/config/roles";
import { EventVolunteerRowMenu } from "./event-volunteer-row-menu";
import { EmailTeamDialog } from "./email-team-dialog";
import { AddEventRolesDialog } from "./add-event-roles-dialog";
import { InviteToEventDialog } from "./invite-to-event-dialog";
import { EventRoleRemoveButton } from "./event-role-remove-button";

export type TeamMember = {
  userId: string;
  volunteerRoles: VolunteerRole[];
  user: {
    firstName: string;
    lastName: string;
    email: string;
    userImageUrl: string | null;
  };
};

interface EventAssignmentsCardProps {
  event: EventDetails;
  currentUserId: string;
  canManage: boolean;
  /** Org roster for the invite pickers — empty for members, who can't invite */
  members: TeamMember[];
}

const roleOrder: VolunteerRole[] = [
  VolunteerRole.PIANIST,
  VolunteerRole.AUX_KEYS,
  VolunteerRole.BASSIST,
  VolunteerRole.GUITARIST,
  VolunteerRole.DRUMMER,
  VolunteerRole.LEAD_VOCALIST,
  VolunteerRole.BGVS,
  VolunteerRole.SOUND_TECH,
  VolunteerRole.STREAM_TECH,
  VolunteerRole.PROJECTION_TECH,
  VolunteerRole.USHER,
  VolunteerRole.GREETER,
];

// Tiny corner badge icon shown on the avatar
const statusBadgeIcons: Record<InvitationStatus, LucideIcon> = {
  ACCEPTED: Check,
  PENDING: Clock,
  DECLINED: X,
  CANCELED: X,
};

export function EventAssignmentsCard({
  event,
  currentUserId,
  canManage,
  members,
}: EventAssignmentsCardProps) {
  const serviceColors = colorClasses[event.serviceType.color];

  const total = event.assignments.length;
  const acceptedCount = event.assignments.filter(
    (e) => e.status === InvitationStatus.ACCEPTED,
  ).length;

  // A role belongs on the roster if the event declared it or someone is on it.
  // The union keeps events created before rolesNeeded was persisted intact.
  const rosterRoles = new Set<VolunteerRole>([
    ...event.rolesNeeded,
    ...event.assignments.map((a) => a.role),
  ]);

  // One role per member (unique eventId+userId), so anyone still live on the
  // event can't be invited into another role. A lapsed invite isn't live —
  // it can't be accepted anymore, so re-inviting is what unsticks it.
  const now = new Date();

  const unavailableUserIds = event.assignments
    .filter(
      (a) =>
        a.status === InvitationStatus.ACCEPTED ||
        (a.status === InvitationStatus.PENDING && a.expiresAt > now),
    )
    .map((a) => a.userId);

  const membersByRole: Record<string, TeamMember[]> = {};
  const memberCountByRole: Record<string, number> = {};

  for (const role of roleOrder) {
    const eligible = members.filter((m) => m.volunteerRoles.includes(role));
    membersByRole[role] = eligible;
    memberCountByRole[role] = eligible.length;
  }

  // Times are stored as wall-clock with Z, so the day key comes off the ISO string
  const eventDates = event.dates.map((d) => ({
    date: d.startTime.toISOString().slice(0, 10),
    startTime: d.startTime.toISOString(),
    endTime: d.endTime.toISOString(),
  }));

  const categoryKeys = (Object.keys(roleCategoryConfig) as RoleCategory[]).sort(
    (a, b) => roleCategoryConfig[a].order - roleCategoryConfig[b].order,
  );

  const categories = categoryKeys
    .map((key) => {
      const roleGroups = roleOrder
        .filter((role) => roleToCategory[role] === key && rosterRoles.has(role))
        .map((role) => ({
          role,
          items: event.assignments.filter((a) => a.role === role),
        }));

      const items = roleGroups.flatMap((g) => g.items);
      const acceptedCount = items.filter(
        (a) => a.status === InvitationStatus.ACCEPTED,
      ).length;

      return {
        key,
        label: roleCategoryConfig[key].label,
        roleGroups,
        total: items.length,
        acceptedCount,
      };
    })
    .filter((cat) => cat.roleGroups.length > 0);

  const decorativeMask =
    "linear-gradient(to bottom, black 0%, black 35%, transparent 75%)";

  return (
    <Card className="relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-40 overflow-hidden rounded-[inherit]"
        style={{ maskImage: decorativeMask, WebkitMaskImage: decorativeMask }}
      >
        <div
          className={cn(
            "absolute inset-0 bg-linear-to-br from-card via-card",
            serviceColors.gradientTo,
          )}
        />
        <div
          className={cn(
            "absolute -right-16 -top-16 h-40 w-40 rounded-full blur-3xl",
            serviceColors.blurSoft,
          )}
        />
        <div
          className={cn(
            "absolute -bottom-16 -left-16 h-32 w-32 rounded-full blur-3xl",
            serviceColors.blurSoft,
          )}
        />
      </div>

      <CardHeader className="relative pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <Users className="h-4 w-4 text-muted-foreground" />
            Team
          </CardTitle>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground tabular-nums">
              {acceptedCount}/{total} confirmed
            </span>
            {canManage && (
              <AddEventRolesDialog
                organizationId={event.organizationId}
                eventId={event.id}
                existingRoles={[...rosterRoles]}
                memberCountByRole={memberCountByRole}
                serviceColor={event.serviceType.color}
              />
            )}
            {canManage && acceptedCount > 0 && (
              <EmailTeamDialog
                organizationId={event.organizationId}
                eventId={event.id}
                eventName={event.name}
                recipientCount={acceptedCount}
                serviceColor={event.serviceType.color}
              />
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="relative">
        <Accordion
          type="multiple"
          defaultValue={["band"]}
          className="w-full"
        >
          {categories.map((category) => (
            <AccordionItem
              key={category.key}
              value={category.key}
              className="border-border/40"
            >
              <AccordionTrigger className="py-3 hover:no-underline">
                <div className="flex w-full items-center justify-between pr-2">
                  <span className="text-sm font-semibold">{category.label}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {category.acceptedCount}/{category.total}
                  </span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="space-y-5 pt-1">
                {category.roleGroups.map((group) => {
                  const roleInfo = volunteerRoleConfig[group.role];
                  const isUnfilled = group.items.length === 0;

                  return (
                    <div key={group.role} className="group/role space-y-2">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-[14px] leading-none">
                          {roleInfo.icon}
                        </span>
                        <span className="font-semibold uppercase tracking-wider text-muted-foreground">
                          {roleInfo.label}
                        </span>
                        <span className="text-muted-foreground tabular-nums">
                          ·
                        </span>
                        <span className="text-muted-foreground tabular-nums">
                          {group.items.length}
                        </span>
                        {canManage && (
                          <span className="ml-auto flex items-center gap-1">
                            {!isUnfilled && (
                              <InviteToEventDialog
                                organizationId={event.organizationId}
                                eventId={event.id}
                                role={group.role}
                                members={membersByRole[group.role] || []}
                                unavailableUserIds={unavailableUserIds}
                                eventDates={eventDates}
                                serviceColor={event.serviceType.color}
                              />
                            )}
                            <EventRoleRemoveButton
                              organizationId={event.organizationId}
                              eventId={event.id}
                              role={group.role}
                            />
                          </span>
                        )}
                      </div>

                      {isUnfilled &&
                        (canManage ? (
                          <InviteToEventDialog
                            organizationId={event.organizationId}
                            eventId={event.id}
                            role={group.role}
                            members={membersByRole[group.role] || []}
                            unavailableUserIds={unavailableUserIds}
                            eventDates={eventDates}
                            variant="row"
                            serviceColor={event.serviceType.color}
                          />
                        ) : (
                          <p className="px-3 py-2.5 text-sm text-muted-foreground">
                            No one assigned yet
                          </p>
                        ))}

                      <div className="space-y-1.5">
                        {group.items.map((assignment) => {
                          const isCurrentUser =
                            assignment.userId === currentUserId;
                          const isDeclined =
                            assignment.status === InvitationStatus.DECLINED ||
                            assignment.status === InvitationStatus.CANCELED;
                          const BadgeIcon = statusBadgeIcons[assignment.status];
                          const assignmentStyles =
                            statusStyles[assignment.status];

                          return (
                            <div
                              key={`${assignment.userId}-${assignment.role}`}
                              className={cn(
                                "group flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors",
                                isCurrentUser
                                  ? cn(
                                      assignmentStyles.border,
                                      assignmentStyles.bgSoft,
                                    )
                                  : "border-border/40 hover:border-border hover:bg-muted/30",
                              )}
                            >
                              <div className="relative shrink-0">
                                <Avatar
                                  className={cn(
                                    "h-9 w-9 ring-2 ring-offset-2 ring-offset-background transition-opacity",
                                    assignmentStyles.ring,
                                    isDeclined && "opacity-60",
                                  )}
                                >
                                  <AvatarImage
                                    src={
                                      assignment.user.userImageUrl ?? undefined
                                    }
                                    alt={
                                      isCurrentUser
                                        ? "You"
                                        : `${assignment.user.firstName} ${assignment.user.lastName}`
                                    }
                                  />
                                  <AvatarFallback className="text-[11px] font-medium">
                                    {assignment.user.firstName.charAt(0)}
                                  </AvatarFallback>
                                </Avatar>
                                <span
                                  aria-hidden
                                  className={cn(
                                    "absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full ring-2 ring-background",
                                    assignmentStyles.badgeBg,
                                  )}
                                >
                                  <BadgeIcon
                                    className="h-2.5 w-2.5 text-white"
                                    strokeWidth={3}
                                  />
                                </span>
                                <span className="sr-only">
                                  {assignmentStyles.label}
                                </span>
                              </div>

                              <div className="min-w-0 flex-1">
                                <p
                                  className={cn(
                                    "truncate text-sm font-medium",
                                    isDeclined &&
                                      "text-muted-foreground line-through",
                                  )}
                                >
                                  {isCurrentUser
                                    ? "You"
                                    : `${assignment.user.firstName} ${assignment.user.lastName}`}
                                </p>
                              </div>
                              {!isDeclined && canManage && <EventVolunteerRowMenu assignedUserId={assignment.userId} eventId={assignment.eventId} organizationId={assignment.organizationId} />}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </CardContent>
    </Card>
  );
}
