import Link from "next/link";
import { CalendarClock, Clock, MapPin, ArrowUpRight } from "lucide-react";
import { AnimatedSection } from "@/components/dashboard/animate-section";
import { cn } from "@/lib/utils";
import { getServiceColors } from "@/lib/config/service-types-config";
import { volunteerRoleConfig } from "@/lib/config/roles";
import { InvitationStatus, VolunteerRole } from "@/generated/prisma/enums";

interface EventDate {
  id: string;
  startTime: Date | string;
  endTime: Date | string;
}

interface EventAssignment {
  role: string;
  status: InvitationStatus;
}

interface ServiceType {
  id: string;
  name: string;
  color: string;
}

interface UpNextEvent {
  id: string;
  name: string;
  location: string;
  serviceTypeId: string;
  dates: EventDate[];
  assignments: EventAssignment[];
}

export interface UpNextSelection {
  event: UpNextEvent;
  date: EventDate;
}

interface UpNextBannerProps {
  upNext: UpNextSelection | null;
  serviceTypes: ServiceType[];
  organizationId: string;
}

// Events store wall-clock times with a Z suffix, so display always pins to UTC.
function formatShortDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    timeZone: "UTC",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

// Day distance between the event's wall-clock date (UTC fields) and today.
function daysUntil(target: Date, now: Date): number {
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const startOfTarget = new Date(
    target.getUTCFullYear(),
    target.getUTCMonth(),
    target.getUTCDate(),
  );
  return Math.round(
    (startOfTarget.getTime() - startOfToday.getTime()) / 86_400_000,
  );
}

function countdownLabel(days: number): string {
  if (days <= 0) return "Today";
  if (days === 1) return "Tomorrow";
  return `In ${days} days`;
}

// Next accepted commitment: earliest upcoming date block across accepted events.
// Exported so the caller picks it once and the schedule list can drop the same
// event instead of repeating it — see events-tab-content.tsx.
export function findUpNext(
  events: UpNextEvent[],
  now: Date,
): UpNextSelection | null {
  let nextEvent: UpNextEvent | null = null;
  let nextDate: EventDate | null = null;

  for (const event of events) {
    const accepted = event.assignments.some(
      (a) => a.status === InvitationStatus.ACCEPTED,
    );
    if (!accepted) continue;

    for (const date of event.dates) {
      if (new Date(date.endTime) < now) continue;
      if (!nextDate || new Date(date.startTime) < new Date(nextDate.startTime)) {
        nextDate = date;
        nextEvent = event;
      }
    }
  }

  if (!nextEvent || !nextDate) return null;
  return { event: nextEvent, date: nextDate };
}

export function UpNextBanner({
  upNext,
  serviceTypes,
  organizationId,
}: UpNextBannerProps) {
  // Banners have to earn their row — render nothing when there is no commitment.
  if (!upNext) return null;

  const now = new Date();
  const upNextEvent = upNext.event;
  const upNextDate = upNext.date;

  const service = serviceTypes.find((s) => s.id === upNextEvent.serviceTypeId);
  const colors = getServiceColors(service?.color || "indigo");

  const role = upNextEvent.assignments.find(
    (a) => a.status === InvitationStatus.ACCEPTED,
  )?.role;
  const roleConfig = role
    ? volunteerRoleConfig[role as VolunteerRole]
    : undefined;

  const start = new Date(upNextDate.startTime);
  const end = new Date(upNextDate.endTime);
  const days = daysUntil(start, now);

  return (
    <AnimatedSection delay={0.05}>
      <Link
        href={`/dashboard/organizations/${organizationId}/events/${upNextEvent.id}`}
        className="group block"
      >
        <div className="relative overflow-hidden rounded-xl border border-border/40 bg-linear-to-r from-primary/10 via-card to-card p-4 transition-all duration-300 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 sm:p-5">
          <div className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-primary/10 blur-3xl" />

          <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-5">
            {/* Label + countdown */}
            <div className="flex items-center gap-3 sm:w-40 sm:shrink-0">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                <CalendarClock className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Upcoming
                </p>
                <p
                  className={cn(
                    "text-sm font-semibold",
                    days <= 1 ? "text-emerald-600" : "text-primary",
                  )}
                >
                  {countdownLabel(days)}
                </p>
              </div>
            </div>

            <div className="hidden h-10 w-px shrink-0 bg-border/60 sm:block" />

            {/* Event info */}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <p className="truncate text-base font-semibold tracking-tight">
                  {upNextEvent.name}
                </p>
                <span
                  className={cn(
                    "rounded px-2 py-0.5 text-xs font-medium",
                    colors.badge,
                    colors.badgeText,
                  )}
                >
                  {service?.name || "Event"}
                </span>
                {roleConfig && (
                  <span className="rounded-md bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
                    {roleConfig.icon} {roleConfig.label}
                  </span>
                )}
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 shrink-0" />
                  {formatShortDate(start)} · {formatTime(start)} –{" "}
                  {formatTime(end)}
                </span>
                <span className="flex min-w-0 items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{upNextEvent.location}</span>
                </span>
              </div>
            </div>

            <ArrowUpRight className="hidden h-5 w-5 shrink-0 text-muted-foreground transition-all duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-foreground sm:block" />
          </div>
        </div>
      </Link>
    </AnimatedSection>
  );
}
