import { Badge } from "@/components/ui/badge";
import { EventDeleteMenu } from "./event-delete-menu";
import { cn } from "@/lib/utils";
import { colorClasses } from "@/lib/config/service-types-config";
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
}

export function EventHeader({
  event,
  serviceType,
  canManage,
}: EventHeaderProps) {
  const serviceColors = colorClasses[serviceType.color];

  const firstDate = event.dates[0]?.startTime;

  const dateParts = firstDate
    ? {
        month: firstDate.toLocaleString("en-US", { timeZone: "UTC", month: "short" }).toUpperCase(),
        day: firstDate.getUTCDate(),
        weekday: firstDate.toLocaleString("en-US", { timeZone: "UTC", weekday: "short" }).toUpperCase(),
      }
    : null;

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-border/40 border-l-[3px] bg-linear-to-br from-card via-card p-5 sm:p-8",
        serviceColors.border,
        serviceColors.gradientTo,
      )}
    >
      <div
        className={cn(
          "pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full blur-3xl",
          serviceColors.blurSoft,
        )}
      />
      <div
        className={cn(
          "pointer-events-none absolute -bottom-20 -left-20 h-48 w-48 rounded-full blur-3xl",
          serviceColors.blurStrong,
        )}
      />

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
          assignees: event.assignments
            .filter((a) => a.status !== InvitationStatus.DECLINED)
            .map((a) => ({
              userId: a.userId,
              firstName: a.user.firstName,
              lastName: a.user.lastName,
            })),
        }}
        />
      }

      <div
        className={cn(
          "relative flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between",
          // The ⋮ menu is absolutely placed at right-4; keep the title out from under it.
          canManage && "pr-10 sm:pr-0",
        )}
      >
        <div className="flex items-start gap-4 sm:gap-5">
          {dateParts && (
            <div
              className={cn(
                "flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-2xl border border-border/40 bg-muted/30 shadow-lg sm:h-16 sm:w-16",
                serviceColors.shadow,
              )}
            >
              <span className="text-[10px] font-bold tracking-wider text-muted-foreground">
                {dateParts.month}
              </span>
              <span className="text-2xl font-bold leading-none text-foreground">
                {dateParts.day}
              </span>
              <span className="text-[10px] text-muted-foreground">{dateParts.weekday}</span>
            </div>
          )}

          <div className="min-w-0 space-y-3">
            {serviceType && (
              <Badge
                className={cn(
                  "text-xs font-medium",
                  serviceColors.badge,
                  serviceColors.badgeText,
                )}
              >
                <span className={cn("mr-1.5 h-2 w-2 rounded-full", serviceColors.dot)} />
                {serviceType.name}
              </Badge>
            )}
            <h1 className="text-2xl font-bold tracking-tight text-balance sm:text-3xl">{event.name}</h1>
            {event.description && (
              <p className="max-w-lg text-muted-foreground">{event.description}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}