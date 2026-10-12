import type { ReactNode } from "react";
import { DateTile } from "./date-tile";
import { EventDeleteMenu } from "./event-delete-menu";
import { ServiceBadge } from "./event-card";
import { EventWhenWhere } from "./event-when-where";
import type { TeamLeadChoices, TeamLeadPicks } from "./event-team-leads-field";
import { cn } from "@/lib/utils";
import { getServiceColors } from "@/lib/config/service-types-config";
import { dayKey } from "@/lib/event-format";
import { isBlockOver } from "@/lib/time-scope";
import { InvitationStatus } from "@/generated/prisma/enums";

type Event = {
  id: string
  name: string
  description: string
  location: string
  createdAt: Date
  updatedAt: Date
  dates: {
        id: string;
        eventId: string;
        startTime: Date;
        endTime: Date;
  }[],
  rehearsalStart: Date | null,
  rehearsalEnd: Date | null,
  assignments: {
    userId: string;
    status: InvitationStatus;
    user: {
      firstName: string;
      lastName: string;
    };
  }[],
};

interface EventHeaderProps {
  event: Event
  serviceType: {
    id: string;
    name: string;
    createdAt: Date;
    updatedAt: Date;
    organizationId: string;
    color: string;
  }
  canManage: boolean
  /** Who handles each team on this event, for the edit dialog — managers only. */
  teamLeads?: {
    choices: TeamLeadChoices
    picks: TeamLeadPicks
  }
  /** The organization's clock, floating like event times. */
  now: Date
  /** The previous/next pager, drawn as the card's footer. */
  pager?: ReactNode
}

/**
 * The top of the event page, as on the phone: built like the Upcoming card —
 * the solid date tile, the service's stripe, the name — grown to hold every
 * block, the place, and the way to the one before and after. From `lg` the
 * when and where sit beside the title.
 */
export function EventHeader({
  event,
  serviceType,
  canManage,
  teamLeads,
  now,
  pager,
}: EventHeaderProps) {
  const serviceColors = getServiceColors(serviceType.color);

  // The day it's on, as the Upcoming card picks it: the first block not over
  // yet, or the first block once the whole event has been.
  const sorted = [...event.dates].sort(
    (a, b) => a.startTime.getTime() - b.startTime.getTime(),
  );
  const shown = sorted.find((date) => !isBlockOver(date, now)) ?? sorted[0];

  return (
    <div className="relative isolate rounded-2xl border border-border bg-card p-4 sm:p-6">
      {/* The web's wash of the service colour behind everything: a gradient and
          two blurred blobs. Clipped on a layer of its own, because the card
          itself can't hide its overflow — the row of days runs to its edge. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-[inherit]"
      >
        <div
          className={cn(
            "absolute inset-0 bg-linear-to-br from-card via-card",
            serviceColors.gradientTo,
          )}
        />
        <div
          className={cn(
            "absolute -top-20 -right-20 h-64 w-64 rounded-full blur-3xl",
            serviceColors.blurSoft,
          )}
        />
        <div
          className={cn(
            "absolute -bottom-20 -left-20 h-48 w-48 rounded-full blur-3xl",
            serviceColors.blurStrong,
          )}
        />
      </div>

      {
        canManage &&
        <EventDeleteMenu
        eventId={event.id}
        organizationId={serviceType.organizationId}
        eventName={event.name}
        serviceColor={serviceType.color}
        eventDetails={{
          description: event.description,
          location: event.location,
          dates: event.dates,
          rehearsalStart: event.rehearsalStart,
          rehearsalEnd: event.rehearsalEnd,
          assignees: event.assignments
            .filter((a) => a.status !== InvitationStatus.DECLINED)
            .map((a) => ({
              userId: a.userId,
              firstName: a.user.firstName,
              lastName: a.user.lastName,
            })),
        }}
        teamLeads={teamLeads}
        />
      }

      <div
        className={cn(
          "flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-8",
          // The ⋮ menu is absolutely placed at right-4: beside the title on a
          // phone, above the tiles once they move up beside it.
          canManage && "lg:pr-10",
        )}
      >
        <div className="min-w-0 space-y-3.5 lg:flex-1">
          <div className="flex items-center gap-3.5">
            {shown && (
              <DateTile
                day={dayKey(shown.startTime)}
                color={serviceType.color}
                isToday={dayKey(shown.startTime) === dayKey(now)}
                solid
                size="large"
              />
            )}

            <span
              aria-hidden
              className={cn("w-[3px] self-stretch rounded-full", serviceColors.solid)}
            />

            <div className={cn("min-w-0 flex-1 space-y-2", canManage && "pr-10 lg:pr-0")}>
              <h1 className="text-xl font-bold tracking-tight text-balance sm:text-2xl">
                {event.name}
              </h1>
              <div className="flex">
                <ServiceBadge service={serviceType} />
              </div>
            </div>
          </div>

          {event.description && (
            <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
              {event.description}
            </p>
          )}
        </div>

        <div className="min-w-0 lg:w-[46%] lg:shrink-0">
          <EventWhenWhere
            dates={event.dates}
            location={event.location}
            serviceColor={serviceType.color}
            rehearsalStart={event.rehearsalStart}
            rehearsalEnd={event.rehearsalEnd}
            now={now}
          />
        </div>
      </div>

      {pager}
    </div>
  )
}
