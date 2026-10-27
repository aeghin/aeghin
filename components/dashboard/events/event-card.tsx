import Link from "next/link";
import type { ReactNode } from "react";
import { Calendar, ChevronRight, Clock, MapPin, type LucideIcon } from "lucide-react";

import { DateTile } from "@/components/dashboard/events/date-tile";
import { StaffingMeter } from "@/components/dashboard/events/staffing-meter";
import { VolunteerRole } from "@/generated/prisma/enums";
import { volunteerRoleConfig } from "@/lib/config/roles";
import { getServiceColors } from "@/lib/config/service-types-config";
import { formatDateRange, formatTimeOn, isMultiDay } from "@/lib/event-format";
import type { RoleMeter } from "@/lib/staffing";
import { cn } from "@/lib/utils";

interface ServiceType {
  name: string;
  color: string;
}

interface EventCardProps {
  href: string;
  event: {
    name: string;
    location: string;
    dates: { startTime: Date | string; endTime: Date | string }[];
  };
  service: ServiceType | undefined;
  role: string | null;
  /** The `"2026-10-18"` day the card files under, which its tile shows. */
  day: string;
  today: string;
  /** The organization's clock, floating like event times. */
  now: Date;
  /** The first day still to come, whose tile goes solid. */
  highlight?: boolean;
  /** All Events only: where each role on the roster stands. */
  roleMeter?: RoleMeter | null;
}

/**
 * One event in the schedule, as on the phone: the date tile down the left
 * edge, the service's stripe, then what it is, where, and when. From `sm` up
 * the badges join the name and the details share a line.
 */
export function EventCard({
  href,
  event,
  service,
  role,
  day,
  today,
  now,
  highlight,
  roleMeter,
}: EventCardProps) {
  const colors = getServiceColors(service?.color ?? "indigo");
  const time = formatTimeOn(event.dates, day, now);
  const meter =
    roleMeter && roleMeter.roles > 0 ? <StaffingMeter meter={roleMeter} /> : null;

  return (
    <Link
      href={href}
      className="group flex items-start gap-3 rounded-xl border border-border bg-card p-3 shadow-xs transition-[border-color,box-shadow] duration-200 hover:border-foreground/15 hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:items-center sm:gap-4 sm:p-4"
    >
      <DateTile
        day={day}
        color={service?.color ?? "indigo"}
        isToday={day === today}
        solid={highlight}
      />

      <span aria-hidden className={cn("w-[3px] self-stretch rounded-full", colors.solid)} />

      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-2.5">
          <p className="min-w-0 truncate text-[15px] leading-5 font-semibold tracking-tight text-foreground">
            {event.name}
          </p>
          <div className="flex flex-wrap items-center gap-1.5 sm:shrink-0">
            <ServiceBadge service={service} />
            {role && <RoleChip role={role} />}
          </div>
        </div>

        <div className="flex flex-col gap-1 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4">
          {time && <MetaLine icon={Clock}>{time}</MetaLine>}
          {isMultiDay(event.dates) && (
            <MetaLine icon={Calendar}>{formatDateRange(event.dates)}</MetaLine>
          )}
          <MetaLine icon={MapPin}>{event.location}</MetaLine>
        </div>

        {meter && <div className="pt-0.5 sm:hidden">{meter}</div>}
      </div>

      {meter && (
        <div className="hidden shrink-0 sm:block">
          {meter}
        </div>
      )}

      <ChevronRight
        aria-hidden
        className="size-4 shrink-0 self-center text-muted-foreground transition-transform group-hover:translate-x-0.5"
      />
    </Link>
  );
}

/** The service type an event belongs to, in that service's own colour. */
export function ServiceBadge({ service }: { service: ServiceType | undefined }) {
  const colors = getServiceColors(service?.color ?? "indigo");

  return (
    <span
      className={cn(
        "shrink-0 rounded-md px-2 py-0.5 text-xs font-medium",
        colors.badge,
        colors.badgeText,
      )}
    >
      {service?.name || "Event"}
    </span>
  );
}

/** What the person was asked to do — the emoji is the chip's only colour. */
export function RoleChip({ role }: { role: string }) {
  const info = volunteerRoleConfig[role as VolunteerRole];
  if (!info) return null;

  return (
    <span className="inline-flex shrink-0 items-center gap-1 py-0.5 text-xs font-medium text-muted-foreground">
      <span aria-hidden>{info.icon}</span>
      {info.label}
    </span>
  );
}

/** One icon-led line of detail: a time, a date range, a place. */
export function MetaLine({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5 text-[13px] text-muted-foreground">
      <Icon aria-hidden className="size-3.5 shrink-0" />
      <span className="truncate">{children}</span>
    </span>
  );
}
