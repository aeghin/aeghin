import { Calendar, Clock, MapPin } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { colorClasses } from "@/lib/config/service-types-config";


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
};

interface EventDetailsCardProps {
  event: Event
  serviceType: {
    color: string
  }
};

export function EventDetailsCard({ event, serviceType }: EventDetailsCardProps) {
  const serviceColors = colorClasses[serviceType.color];

  // Sort locally too, so display order never depends on the caller's query
  const dates = [...event.dates].sort(
    (a, b) => a.startTime.getTime() - b.startTime.getTime(),
  );
  const first = dates[0];
  const last = dates[dates.length - 1];
  const isMultiDay = dates.length > 1;

  const formatTime = (d: Date) =>
    d.toLocaleTimeString("en-US", {
      timeZone: "UTC",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });

  const formatShortDate = (d: Date) =>
    d.toLocaleDateString("en-US", {
      timeZone: "UTC",
      weekday: "short",
      month: "short",
      day: "numeric",
    });

  const rows = [
    {
      icon: Calendar,
      label: "Date",
      value: isMultiDay
        ? `${formatShortDate(first.startTime)} – ${formatShortDate(last.startTime)}, ${last.startTime.getUTCFullYear()}`
        : first.startTime.toLocaleDateString("en-US", {
            timeZone: "UTC",
            weekday: "long",
            month: "long",
            day: "numeric",
            year: "numeric",
          }),
    },
    ...dates.map((date) => ({
      icon: Clock,
      label: isMultiDay ? formatShortDate(date.startTime) : "Time",
      value: `${formatTime(date.startTime)} – ${formatTime(date.endTime)}`,
    })),
    {
      icon: MapPin,
      label: "Where",
      value: event.location,
    },
  ]

  return (
    <Card
      className={cn(
        "relative overflow-hidden p-0 bg-linear-to-br from-card via-card",
        serviceColors.gradientTo,
      )}
    >
      <div
        className={cn(
          "pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full blur-3xl",
          serviceColors.blurSoft,
        )}
      />
      <div
        className={cn(
          "pointer-events-none absolute -bottom-16 -left-16 h-32 w-32 rounded-full blur-3xl",
          serviceColors.blurSoft,
        )}
      />
      <ul className="relative divide-y divide-border/60">
        {rows.map(({ icon: Icon, label, value }) => (
          <li
            key={label}
            className="flex items-center gap-3 px-4 py-3"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted/60 text-muted-foreground">
              <Icon className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {label}
              </p>
              <p className="break-words text-sm font-medium text-foreground sm:truncate">{value}</p>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  )
}
