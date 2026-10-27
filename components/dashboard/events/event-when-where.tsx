"use client";

import { useEffect, useRef } from "react";
import { CalendarClock, Clock, MapPin, type LucideIcon } from "lucide-react";

import { getServiceColors } from "@/lib/config/service-types-config";
import {
  dayKey,
  formatRehearsal,
  formatShortDate,
  formatTime,
  isMultiDay,
} from "@/lib/event-format";
import { isBlockOver } from "@/lib/time-scope";
import { cn } from "@/lib/utils";

type ServiceColors = ReturnType<typeof getServiceColors>;

interface EventDate {
  id: string;
  startTime: Date;
  endTime: Date;
}

interface Tile {
  key: string;
  icon: LucideIcon;
  label: string;
  value: string;
  /** Where a block sits against today, once the event is under way. */
  when?: "done" | "today";
  /** The block a scrolling row of days opens on: the first not over, while under way. */
  opens?: boolean;
}

interface EventWhenWhereProps {
  dates: EventDate[];
  location: string;
  serviceColor: string;
  rehearsalStart: Date | null;
  rehearsalEnd: Date | null;
  /** The organization's clock, floating like event times. */
  now: Date;
}

/**
 * When the event runs and where, as the phone's hero draws it: one tile per
 * block, since an event is a list of blocks and collapsing them to "Saturday
 * to Sunday" would lose the times somebody has to turn up at. One block keeps
 * its time beside the place; past that the days get a row of their own and the
 * place and rehearsal become lines under it.
 */
export function EventWhenWhere({
  dates,
  location,
  serviceColor,
  rehearsalStart,
  rehearsalEnd,
  now,
}: EventWhenWhereProps) {
  const colors = getServiceColors(serviceColor);
  const sorted = [...dates].sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
  const rehearsal = formatRehearsal(rehearsalStart, rehearsalEnd);
  const spansDays = isMultiDay(dates);
  const today = dayKey(now);

  // Only an event under way marks its blocks: a finished one would fade every
  // tile, and an upcoming one has nothing behind it yet.
  const keys = sorted.map((date) => dayKey(date.startTime));
  const over = sorted.map((date) => isBlockOver(date, now));
  const underWay = over.some(Boolean) && !over.every(Boolean);
  const firstAhead = over.indexOf(false);

  const blocks: Tile[] = sorted.map((date, index) => ({
    key: date.id,
    icon: Clock,
    label: spansDays
      ? `${keys[index] === today ? "Today · " : ""}${formatShortDate(date.startTime)}`
      : keys[index] === today
        ? "Today"
        : "Time",
    value: `${formatTime(date.startTime)} – ${formatTime(date.endTime)}`,
    when: underWay && over[index] ? "done" : keys[index] === today ? "today" : undefined,
    opens: underWay && index === firstAhead,
  }));

  if (blocks.length <= 1) {
    return (
      <div className="grid grid-cols-2 gap-2">
        {blocks.map((tile) => (
          <InfoTile key={tile.key} tile={tile} colors={colors} />
        ))}
        <InfoTile
          tile={{ key: "where", icon: MapPin, label: "Location", value: location }}
          colors={colors}
        />
        {/* Dated on its own: it rarely falls on the service day. */}
        {rehearsal && (
          <InfoTile
            tile={{ key: "rehearsal", icon: CalendarClock, label: "Rehearsal", value: rehearsal }}
            colors={colors}
            className="col-span-2"
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <DayRow tiles={blocks} colors={colors} />

      <div className="space-y-2">
        <InfoLine icon={MapPin} colors={colors}>
          {location}
        </InfoLine>
        {rehearsal && (
          <InfoLine icon={CalendarClock} colors={colors}>
            {`Rehearsal · ${rehearsal}`}
          </InfoLine>
        )}
      </div>
    </div>
  );
}

/**
 * Every block on one line. Two share it evenly; past that the row scrolls
 * sideways, running out under the card's padding on a phone so the next day
 * peeks in, and opening on the block that's next while the event is under way.
 */
function DayRow({ tiles, colors }: { tiles: Tile[]; colors: ServiceColors }) {
  const rowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const row = rowRef.current;
    const opens = row?.querySelector<HTMLElement>("[data-opens]");
    if (!row || !opens) return;
    row.scrollLeft = opens.offsetLeft - parseFloat(getComputedStyle(row).paddingLeft);
  }, []);

  if (tiles.length <= 2) {
    return (
      <div className="grid grid-cols-2 gap-2">
        {tiles.map((tile) => (
          <InfoTile key={tile.key} tile={tile} colors={colors} />
        ))}
      </div>
    );
  }

  return (
    <div
      ref={rowRef}
      className="relative -mx-4 flex gap-2 overflow-x-auto px-4 pb-1.5 sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0"
      style={{ scrollbarWidth: "thin" }}
    >
      {tiles.map((tile) => (
        <InfoTile key={tile.key} tile={tile} colors={colors} className="min-w-35 flex-1 shrink-0" />
      ))}
    </div>
  );
}

/** An icon-led label over its value. Today's block wears the service's colour; a finished one recedes. */
function InfoTile({
  tile,
  colors,
  className,
}: {
  tile: Tile;
  colors: ServiceColors;
  className?: string;
}) {
  const Icon = tile.icon;

  return (
    <div
      data-opens={tile.opens || undefined}
      className={cn(
        "min-w-0 space-y-1 rounded-xl border p-2.5",
        tile.when === "today"
          ? cn(colors.borderSoft, colors.badge)
          : "border-border bg-secondary/20",
        tile.when === "done" && "opacity-50",
        className,
      )}
    >
      <p
        className={cn(
          "flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.3px] uppercase",
          colors.badgeText,
        )}
      >
        <Icon aria-hidden className="size-3 shrink-0" />
        <span className="truncate">{tile.label}</span>
      </p>
      <p className="line-clamp-3 text-[13px] leading-[18px] font-semibold text-foreground">
        {tile.value}
      </p>
    </div>
  );
}

/** The place or the rehearsal under a row of days, its icon on a tinted square. */
function InfoLine({
  icon: Icon,
  colors,
  children,
}: {
  icon: LucideIcon;
  colors: ServiceColors;
  children: string;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <span
        className={cn(
          "flex size-6.5 shrink-0 items-center justify-center rounded-lg",
          colors.badge,
          colors.badgeText,
        )}
      >
        <Icon aria-hidden className="size-3.5" />
      </span>
      <p className="line-clamp-2 text-[13.5px] leading-[18px] text-foreground">{children}</p>
    </div>
  );
}
