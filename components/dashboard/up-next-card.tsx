import Link from "next/link";
import { ArrowRight, Calendar, CalendarClock, Clock, MapPin, type LucideIcon } from "lucide-react";

import { DateTile } from "@/components/dashboard/events/date-tile";
import { MetaLine, RoleChip, ServiceBadge } from "@/components/dashboard/events/event-card";
import { InvitationStatus } from "@/generated/prisma/enums";
import { getServiceColors } from "@/lib/config/service-types-config";
import {
  dayKey,
  formatDateRange,
  formatRehearsal,
  formatTimeOn,
  isMultiDay,
} from "@/lib/event-format";
import { cn } from "@/lib/utils";

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
  rehearsalStart?: Date | string | null;
  rehearsalEnd?: Date | string | null;
}

export interface UpNextSelection<T extends UpNextEvent = UpNextEvent> {
  event: T;
  date: EventDate;
}

// Next accepted commitment: earliest upcoming date block across accepted events.
// `now` is the organization's clock as a floating time (`floatingNow`), since
// event times are its wall clock: the real one would skip this morning's service.
export function findUpNext<T extends UpNextEvent>(
  events: T[],
  now: Date,
): UpNextSelection<T> | null {
  let nextEvent: T | null = null;
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

interface UpNextCardProps {
  upNext: UpNextSelection;
  service: ServiceType | undefined;
  href: string;
  /** Today on the organization's clock, as a `"2026-10-18"` key. */
  today: string;
  /** The organization's clock, floating like event times. */
  now: Date;
}

/**
 * The next thing the person has committed to, as on the phone: led like the
 * event cards with the solid tile a size up, then the time, place and
 * rehearsal tiles. The list below starts after it. From `lg` up the tiles sit
 * beside the title instead of under it.
 */
export function UpNextCard({ upNext, service, href, today, now }: UpNextCardProps) {
  const { event, date } = upNext;
  const colors = getServiceColors(service?.color ?? "indigo");
  const day = dayKey(date.startTime);
  const time = formatTimeOn(event.dates, day, now);
  const rehearsal = formatRehearsal(event.rehearsalStart, event.rehearsalEnd);
  const role = event.assignments.find(
    (a) => a.status === InvitationStatus.ACCEPTED,
  )?.role;

  return (
    <Link
      href={href}
      className="group block rounded-xl border border-border bg-card p-4 shadow-sm transition-[border-color,box-shadow] duration-200 hover:border-foreground/15 hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:p-5"
    >
      <div className="flex flex-col gap-3.5 lg:flex-row lg:items-center lg:gap-6">
        <div className="flex min-w-0 items-center gap-3.5 lg:flex-1">
          <DateTile
            day={day}
            color={service?.color ?? "indigo"}
            isToday={day === today}
            solid
            size="large"
          />

          <span aria-hidden className={cn("w-[3px] self-stretch rounded-full", colors.solid)} />

          <div className="min-w-0 flex-1 space-y-2">
            <h3 className="line-clamp-2 text-lg leading-[23px] font-bold tracking-tight text-foreground">
              {event.name}
            </h3>
            <div className="flex">
              <ServiceBadge service={service} />
            </div>
            {isMultiDay(event.dates) && (
              <MetaLine icon={Calendar}>{formatDateRange(event.dates)}</MetaLine>
            )}
          </div>
        </div>

        <div
          className={cn(
            "grid grid-cols-2 gap-2 lg:flex-[1.4]",
            rehearsal && "sm:grid-cols-3",
          )}
        >
          <InfoTile icon={Clock} label="Time" value={time} tint={colors.badgeText} />
          <InfoTile icon={MapPin} label="Location" value={event.location} tint={colors.badgeText} />
          {rehearsal && (
            <InfoTile
              icon={CalendarClock}
              label="Rehearsal"
              value={rehearsal}
              tint={colors.badgeText}
              className="col-span-2 sm:col-span-1"
            />
          )}
        </div>
      </div>

      <div className="mt-3.5 flex items-center justify-between gap-3 border-t border-border pt-3">
        {role ? <RoleChip role={role} /> : <span />}
        <span
          className={cn(
            "inline-flex items-center gap-1 text-[13px] font-semibold",
            colors.badgeText,
          )}
        >
          View event
          <ArrowRight
            aria-hidden
            className="size-3.5 transition-transform group-hover:translate-x-0.5"
          />
        </span>
      </div>
    </Link>
  );
}

/** An icon-led label over its value. */
function InfoTile({
  icon: Icon,
  label,
  value,
  tint,
  className,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  tint: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "min-w-0 space-y-1 rounded-xl border border-border bg-secondary/20 p-2.5",
        className,
      )}
    >
      <p
        className={cn(
          "flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.3px] uppercase",
          tint,
        )}
      >
        <Icon aria-hidden className="size-3 shrink-0" />
        {label}
      </p>
      <p className="line-clamp-2 text-[13px] leading-[18px] font-semibold text-foreground">
        {value}
      </p>
    </div>
  );
}
