import {
  Users,
  Clock,
  Check,
  X,
  Hourglass,
  CircleAlert,
  LucideIcon,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { cn } from "@/lib/utils";
import type { EventDetails, EventDetailsAssignment } from "@/lib/types";
import type { EmailAllowance } from "@/lib/billing/limits";
import type { EventTeamLead } from "@/lib/services/team-notifications";
import {
  InvitationStatus,
  RoleCategory as Team,
  VolunteerRole,
} from "@/generated/prisma/enums";
import { statusStyles } from "@/lib/config/status";
import { getServiceColors } from "@/lib/config/service-types-config";
// import { VolunteerRowMenu } from "./volunteer-row-menu";

import {
  volunteerRoleConfig,
  ROLE_ORDER,
  TEAM_ORDER,
  teamLabel,
  teamOfRole,
} from "@/lib/config/roles";
import { EventVolunteerRowMenu } from "./event-volunteer-row-menu";
import { EmailTeamDialog } from "./email-team-dialog";
import { AddEventRolesDialog } from "./add-event-roles-dialog";
import { InviteToEventDialog, type EventPlace } from "./invite-to-event-dialog";
import { TeamFillDialog, type FillableTeam } from "./team-fill-dialog";
import { EventRoleRemoveButton } from "./event-role-remove-button";
import { roleStanding } from "@/lib/role-spots";
import { EventSmartSchedulingToggle } from "./event-smart-scheduling-toggle";
import { DETAIL_CARD, DetailCardHeader } from "./event-detail-parts";

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
  /**
   * The viewer can still say "Can't Make It" from the header's ⋮, so a
   * manager's own accepted row has no remove, which would skip telling their lead.
   */
  canWithdraw: boolean;
  /** Org roster for the invite pickers — empty for members, who can't invite */
  members: TeamMember[];
  /** This month's group emails — null for members, who can't send them */
  emailAllowance: EmailAllowance | null;
  /** Whether the organization's plan includes auto-fill */
  smartSchedulingAvailable: boolean;
  /** Owners, the only ones who can upgrade */
  canUpgrade: boolean;
  /**
   * Who handles each team on this event — whoever covers it here, else the
   * service type's lead. Named in the invite dialog, over the member list, so
   * nobody staffs a team twice. Empty for members.
   */
  teamLeads: Partial<Record<Team, EventTeamLead>>;
  /**
   * The teams the viewer can fill with AI here: theirs and the ones they back
   * up on Also notify, on a Pro plan, while the event is still ahead. A backed-
   * up team names who they're backing up. Empty for members.
   */
  aiTeams: { team: Team; backingUp: string | null }[];
  /** The event is inside its last-call days, when backups can step in anyway. */
  lastCall: boolean;
}

// Tiny corner badge icon shown on the avatar
const statusBadgeIcons: Record<InvitationStatus, LucideIcon> = {
  ACCEPTED: Check,
  PENDING: Clock,
  DECLINED: X,
  CANCELED: X,
  EXPIRED: Hourglass,
};

// The hourly sweep writes EXPIRED, so for up to an hour after a lapse the row
// is still PENDING. The timestamp is what the server honours.
const displayStatus = (
  assignment: EventDetailsAssignment,
  now: Date,
): InvitationStatus =>
  assignment.status === InvitationStatus.PENDING && assignment.expiresAt <= now
    ? InvitationStatus.EXPIRED
    : assignment.status;

const lapsedAgo = (expiresAt: Date, now: Date) => {
  const days = Math.floor(
    (now.getTime() - expiresAt.getTime()) / (24 * 60 * 60 * 1000),
  );

  if (days < 1) return "today";
  if (days === 1) return "yesterday";

  return `${days} days ago`;
};

/** Holds the colour wash over the header, then lets it go before the roster. */
const HEADER_FADE = "linear-gradient(to bottom, black 0%, black 35%, transparent 75%)";

export function EventAssignmentsCard({
  event,
  currentUserId,
  canManage,
  canWithdraw,
  members,
  emailAllowance,
  smartSchedulingAvailable,
  canUpgrade,
  teamLeads,
  aiTeams,
  lastCall,
}: EventAssignmentsCardProps) {
  const serviceColor = event.serviceType.color;
  const serviceColors = getServiceColors(serviceColor);

  // One clock for the whole card, so the roster, the counts and the invite
  // pickers can't disagree about which invitations are still live.
  const now = new Date();

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
  // event can't be invited into another role; the invite picker names the
  // role they hold. A lapsed invite isn't live — it can't be accepted anymore,
  // so re-inviting is what unsticks it.
  const onEvent: Record<string, EventPlace> = Object.fromEntries(
    event.assignments
      .filter(
        (a) =>
          a.status === InvitationStatus.ACCEPTED ||
          (a.status === InvitationStatus.PENDING && a.expiresAt > now),
      )
      .map((a) => [
        a.userId,
        { role: a.role, confirmed: a.status === InvitationStatus.ACCEPTED },
      ]),
  );

  const leadFor = (role: VolunteerRole) => {
    const team = teamOfRole(role);
    const handler = teamLeads[team];

    return handler && handler.person.userId !== currentUserId
      ? {
          name: `${handler.person.firstName} ${handler.person.lastName}`,
          team: teamLabel(team),
          cover: handler.cover,
        }
      : null;
  };

  // Each role against how many it needs. Every invite is somebody wanted
  // there, so the counts are spots: two pianists needed and one confirmed is
  // 1/2, whoever else declined or let it lapse.
  const standingOf = (role: VolunteerRole) =>
    roleStanding(role, event.roleSpots, event.assignments, now);

  const standings = [...rosterRoles].map(standingOf);
  const neededSpots = standings.reduce((sum, s) => sum + s.needed, 0);
  const filledSpots = standings.reduce((sum, s) => sum + Math.min(s.accepted, s.needed), 0);

  const membersByRole: Record<string, TeamMember[]> = {};

  for (const role of ROLE_ORDER) {
    membersByRole[role] = members.filter((m) => m.volunteerRoles.includes(role));
  }

  // Times are stored as wall-clock with Z, so the day key comes off the ISO string
  const eventDates = event.dates.map((d) => ({
    date: d.startTime.toISOString().slice(0, 10),
    startTime: d.startTime.toISOString(),
    endTime: d.endTime.toISOString(),
  }));

  const categories = TEAM_ORDER
    .map((key) => {
      const roleGroups = ROLE_ORDER
        .filter((role) => teamOfRole(role) === key && rosterRoles.has(role))
        .map((role) => ({
          role,
          items: event.assignments.filter((a) => a.role === role),
          standing: standingOf(role),
        }));

      return {
        key,
        label: teamLabel(key),
        roleGroups,
        // Somebody was invited, it fell through, and nothing is in flight to
        // fill the spot they left — the state a manager has to act on. A
        // fresh event is short everywhere, so being short alone isn't marked.
        stalled: roleGroups.some(
          (g) =>
            g.standing.open > 0 &&
            g.items.some(
              (a) =>
                a.status !== InvitationStatus.ACCEPTED &&
                !(a.status === InvitationStatus.PENDING && a.expiresAt > now),
            ),
        ),
        needed: roleGroups.reduce((sum, g) => sum + g.standing.needed, 0),
        filled: roleGroups.reduce(
          (sum, g) => sum + Math.min(g.standing.accepted, g.standing.needed),
          0,
        ),
        open: roleGroups.reduce((sum, g) => sum + g.standing.open, 0),
      };
    })
    .filter((cat) => cat.roleGroups.length > 0);

  // Fill with AI: the viewer's teams that still have spots nobody has taken.
  // A team they only back up waits for its lead until the backup is needed:
  // a spot on it fell through, which is when they're emailed, or last call.
  const fillable: FillableTeam[] = categories.flatMap((cat) => {
    const aiTeam = aiTeams.find((t) => t.team === cat.key);
    const needed = aiTeam?.backingUp === null || cat.stalled || lastCall;

    return aiTeam && cat.open > 0 && needed
      ? [{ team: cat.key, label: cat.label, open: cat.open, backingUp: aiTeam.backingUp }]
      : [];
  });

  // Buttons share a line two or three across, and a lone last one stretches.
  const actionClass = "flex-1 basis-28";

  return (
    <div className={cn(DETAIL_CARD, "relative isolate")}>
      {/* The service colour washed in behind the header — a gradient and two
          blurred blobs — fading out before the roster so the rows stay plain. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-40 overflow-hidden"
        style={{ maskImage: HEADER_FADE, WebkitMaskImage: HEADER_FADE }}
      >
        <div
          className={cn(
            "absolute inset-0 bg-linear-to-br from-card via-card",
            serviceColors.gradientTo,
          )}
        />
        <div
          className={cn(
            "absolute -top-16 -right-16 h-40 w-40 rounded-full blur-3xl",
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

      <DetailCardHeader
        icon={Users}
        title="Team"
        serviceColor={serviceColor}
        trailing={
          neededSpots > 0 ? (
            // The title's size and line, so the count reads as part of the
            // header rather than a second headline beside it.
            <span
              className="flex shrink-0 items-baseline gap-1.5"
              aria-label={`${filledSpots} of ${neededSpots} ${neededSpots === 1 ? "spot" : "spots"} filled`}
            >
              <span aria-hidden className="text-[15px] leading-5 font-bold tabular-nums">
                {filledSpots}
                <span className="text-muted-foreground">/{neededSpots}</span>
              </span>
              <span aria-hidden className="text-[13px] text-muted-foreground">
                {neededSpots === 1 ? "spot filled" : "spots filled"}
              </span>
            </span>
          ) : undefined
        }
      />

      {/* The roster-wide actions sit under the title, where the roster is worked on. */}
      {canManage && (
        <div className="flex flex-wrap gap-2 px-4 pb-4 sm:px-5">
          <EventSmartSchedulingToggle
            organizationId={event.organizationId}
            organizationName={event.organization.name}
            eventId={event.id}
            enabled={event.smartSchedulingEnabled}
            available={smartSchedulingAvailable}
            canUpgrade={canUpgrade}
            serviceColor={serviceColor}
            className={actionClass}
          />
          <AddEventRolesDialog
            organizationId={event.organizationId}
            eventId={event.id}
            existingRoles={[...rosterRoles]}
            serviceColor={serviceColor}
            teamLeads={teamLeads}
            currentUserId={currentUserId}
            className={actionClass}
          />
          {acceptedCount > 0 && emailAllowance && (
            <EmailTeamDialog
              organizationId={event.organizationId}
              organizationName={event.organization.name}
              eventId={event.id}
              eventName={event.name}
              recipientCount={acceptedCount}
              serviceColor={serviceColor}
              allowance={emailAllowance}
              canUpgrade={canUpgrade}
              className={actionClass}
            />
          )}
          {/* Fill with AI on a line of its own, once for all the viewer's teams.
              Mounted while they have any, so its own Invite can't close it. */}
          {aiTeams.length > 0 && (
            <TeamFillDialog
              organizationId={event.organizationId}
              eventId={event.id}
              eventName={event.name}
              serviceColor={serviceColor}
              teams={fillable}
              className="basis-full"
            />
          )}
        </div>
      )}

      {categories.length === 0 ? (
        <p className="border-t border-border px-4 pt-3 pb-4 text-[13px] text-muted-foreground sm:px-5">
          {canManage
            ? "No roles on this event yet. Add roles to start building the team."
            : "No roles on this event yet."}
        </p>
      ) : (
      <div className="border-t border-border px-4 sm:px-5">
        <Accordion
          // Remounts when a team joins or leaves the roster, so a new one opens too.
          key={categories.map((c) => c.key).join()}
          type="multiple"
          defaultValue={categories.map((c) => c.key)}
          className="w-full"
        >
          {categories.map((category) => (
            <AccordionItem
              key={category.key}
              value={category.key}
              className="border-border"
            >
              <AccordionTrigger className="py-3 hover:no-underline">
                <div className="flex w-full items-center gap-2 pr-2">
                  <span className="flex-1 text-sm font-bold">{category.label}</span>
                  {category.stalled && (
                    <CircleAlert
                      aria-label="Needs attention"
                      className="size-3.5 shrink-0 text-amber-500"
                    />
                  )}
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {category.filled}/{category.needed}
                  </span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="space-y-5 pt-1">
                {category.roleGroups.map((group) => {
                  const roleInfo = volunteerRoleConfig[group.role];
                  const isUnfilled = group.items.length === 0;
                  const { needed, accepted, open } = group.standing;
                  const openLabel = `${open} more needed`;

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
                          {Math.min(accepted, needed)}/{needed}
                        </span>
                        {canManage && (
                          <span className="ml-auto flex items-center gap-1">
                            {/* Open spots invite from their own row; a full
                                role still can, which adds a spot. */}
                            {!isUnfilled && open === 0 && (
                              <InviteToEventDialog
                                organizationId={event.organizationId}
                                eventId={event.id}
                                role={group.role}
                                members={membersByRole[group.role] || []}
                                onEvent={onEvent}
                                eventDates={eventDates}
                                serviceColor={event.serviceType.color}
                                teamLead={leadFor(group.role)}
                                spots={{ needed, open }}
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
                            onEvent={onEvent}
                            eventDates={eventDates}
                            variant="row"
                            serviceColor={event.serviceType.color}
                            teamLead={leadFor(group.role)}
                            spots={{ needed, open }}
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
                          const status = displayStatus(assignment, now);
                          const isDeclined =
                            status === InvitationStatus.DECLINED ||
                            status === InvitationStatus.CANCELED;
                          const isExpired =
                            status === InvitationStatus.EXPIRED;
                          const BadgeIcon = statusBadgeIcons[status];
                          const assignmentStyles = statusStyles[status];

                          return (
                            <div
                              key={`${assignment.userId}-${assignment.role}`}
                              className={cn(
                                "group flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors",
                                isCurrentUser
                                  ? cn(
                                      assignmentStyles.border,
                                      assignmentStyles.bgSoft,
                                    )
                                  : "border-border bg-card hover:bg-secondary/40",
                              )}
                            >
                              <div className="relative shrink-0">
                                <Avatar
                                  className={cn(
                                    "h-9 w-9 ring-2 ring-offset-2 ring-offset-background transition-opacity",
                                    assignmentStyles.ring,
                                    (isDeclined || isExpired) &&
                                      "opacity-60",
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
                              </div>

                              <div className="min-w-0 flex-1">
                                <p
                                  className={cn(
                                    "truncate text-sm font-semibold",
                                    isDeclined &&
                                      "text-muted-foreground line-through",
                                  )}
                                >
                                  {isCurrentUser
                                    ? "You"
                                    : `${assignment.user.firstName} ${assignment.user.lastName}`}
                                </p>
                                {isExpired && (
                                  <p className="truncate text-xs text-muted-foreground">
                                    Invite expired{" "}
                                    {lapsedAgo(assignment.expiresAt, now)}
                                  </p>
                                )}
                              </div>
                              <span
                                className={cn(
                                  "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
                                  assignmentStyles.pill,
                                )}
                              >
                                <span
                                  aria-hidden
                                  className={cn("size-1.5 rounded-full", assignmentStyles.dot)}
                                />
                                {assignmentStyles.label}
                              </span>
                              {canManage &&
                                !(isCurrentUser && canWithdraw && assignment.status === InvitationStatus.ACCEPTED) && (
                                  <EventVolunteerRowMenu assignedUserId={assignment.userId} eventId={assignment.eventId} organizationId={assignment.organizationId} isExpired={isExpired} isEnded={isDeclined} />
                                )}
                            </div>
                          );
                        })}
                      </div>

                      {/* Somebody declined, let it lapse, was removed, or the
                          role needs more than are on it: the spot is still open. */}
                      {!isUnfilled &&
                        open > 0 &&
                        (canManage ? (
                          <InviteToEventDialog
                            organizationId={event.organizationId}
                            eventId={event.id}
                            role={group.role}
                            members={membersByRole[group.role] || []}
                            onEvent={onEvent}
                            eventDates={eventDates}
                            variant="row"
                            rowLabel={openLabel}
                            serviceColor={event.serviceType.color}
                            teamLead={leadFor(group.role)}
                            spots={{ needed, open }}
                          />
                        ) : (
                          <p className="px-3 py-2.5 text-sm text-muted-foreground">
                            {openLabel}
                          </p>
                        ))}
                    </div>
                  );
                })}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
      )}
    </div>
  );
}
