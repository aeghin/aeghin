"use client";

import { useState, useTransition } from "react";
import { format, isBefore, startOfDay } from "date-fns";
import type { DateRange } from "react-day-picker";
import {
  CalendarOff,
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

import {
  createBlockoutDate,
  deleteBlockoutDate,
} from "@/lib/actions/blockout";
import {
  blockoutDayCount,
  daysCovered,
  formatBlockoutRange,
  formatMonth,
  monthGrid,
  shiftMonth,
} from "@/lib/blockout-calendar";
import { cn } from "@/lib/utils";

export type BlockoutItem = {
  id: string;
  startDate: Date;
  endDate: Date;
};

interface BlockoutsManagerProps {
  organizationId: string;
  blockouts: BlockoutItem[];
  /** Days this person accepted something on, as day keys — the calendars' dots. */
  scheduledDays: string[];
  /** The church's today, as a day key. */
  today: string;
}

/** How far ahead the calendars step: a blockout can run up to a year out. */
const MONTHS_AHEAD = 12;

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

// Hatched rather than filled, so a blocked day still reads as a day and the
// scheduled dot on top of one stays visible. Inline because the stripes need
// the theme's own red at two strengths.
const HATCH = {
  backgroundImage:
    "repeating-linear-gradient(135deg, color-mix(in oklch, var(--destructive) 16%, transparent) 0 4px, transparent 4px 8px)",
};

export function BlockoutsManager({
  organizationId,
  blockouts,
  scheduledDays,
  today,
}: BlockoutsManagerProps) {
  const thisMonth = today.slice(0, 7);
  const [month, setMonth] = useState(thisMonth);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [range, setRange] = useState<DateRange | undefined>(undefined);
  const [isSaving, startSaving] = useTransition();

  const handlePickerOpenChange = (open: boolean) => {
    setIsPickerOpen(open);
    if (!open) setRange(undefined);
  };

  const handleSave = () => {
    if (!range?.from) return;

    const from = range.from;
    const to = range.to ?? range.from;

    startSaving(async () => {
      const result = await createBlockoutDate({
        organizationId,
        startDate: format(from, "yyyy-MM-dd"),
        endDate: format(to, "yyyy-MM-dd"),
      });

      if (result.success) {
        toast.success("Blockout added", { position: "bottom-center" });
        setRange(undefined);
        setIsPickerOpen(false);
      } else {
        toast.error(result.error, { position: "bottom-center" });
      }
    });
  };

  const blocked = new Set(blockouts.flatMap((b) => daysCovered(b.startDate, b.endDate)));
  const scheduled = new Set(scheduledDays);
  const lastMonth = shiftMonth(thisMonth, MONTHS_AHEAD - 1);

  const rangeSummary = range?.from
    ? range.to && range.from.getTime() !== range.to.getTime()
      ? `${format(range.from, "MMM d")} – ${format(range.to, "MMM d, yyyy")}`
      : format(range.from, "MMM d, yyyy")
    : "Pick a day or range";

  return (
    <Card className="overflow-hidden rounded-xl border-border/40 bg-linear-to-br from-card to-card/80 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between gap-3 border-b border-border/40 bg-secondary/20 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
            <CalendarOff className="h-5 w-5 text-primary" />
          </div>
          <div>
            <CardTitle className="text-lg font-semibold">
              Blockout Dates
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Days you&apos;re unavailable — you won&apos;t be scheduled on them
            </p>
          </div>
        </div>

        <Popover open={isPickerOpen} onOpenChange={handlePickerOpenChange}>
          <PopoverTrigger asChild>
            <Button size="sm" className="shrink-0">
              <CalendarPlus className="h-4 w-4 sm:mr-1.5" />
              <span className="hidden sm:inline">Add Blockout</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="end">
            <CalendarComponent
              mode="range"
              selected={range}
              onSelect={setRange}
              numberOfMonths={1}
              disabled={(date) => isBefore(date, startOfDay(new Date()))}
            />
            <div className="flex items-center justify-between gap-3 border-t p-3">
              <p className="text-xs text-muted-foreground">{rangeSummary}</p>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={!range?.from || isSaving}
              >
                {isSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Save"
                )}
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      </CardHeader>

      <CardContent className="p-0">
        <div className="space-y-4 px-4 pb-5 sm:px-6">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span aria-hidden className="size-3.5 rounded-sm" style={HATCH} />
                Blocked out
              </span>
              <span className="flex items-center gap-1.5">
                <span aria-hidden className="size-1.5 rounded-full bg-primary" />
                You&apos;re scheduled
              </span>
            </div>

            <div className="ml-auto flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                onClick={() => setMonth(shiftMonth(month, -1))}
                disabled={month <= thisMonth}
                aria-label="Previous month"
              >
                <ChevronLeft className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                onClick={() => setMonth(shiftMonth(month, 1))}
                disabled={month >= lastMonth}
                aria-label="Next month"
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>

          {/* Two months side by side where there's room; a phone gets one and the arrows. */}
          <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
            <BlockoutMonth month={month} blocked={blocked} scheduled={scheduled} today={today} />
            <div className="hidden sm:block">
              <BlockoutMonth
                month={shiftMonth(month, 1)}
                blocked={blocked}
                scheduled={scheduled}
                today={today}
              />
            </div>
          </div>
        </div>

        {blockouts.length === 0 ? (
          <p className="border-t border-border/40 px-6 py-5 text-center text-sm text-muted-foreground">
            No blockout dates yet. Add the days you can&apos;t serve and you
            won&apos;t be scheduled on them.
          </p>
        ) : (
          <div className="divide-y divide-border/40 border-t border-border/40">
            {blockouts.map((blockout) => (
              <BlockoutRow
                key={blockout.id}
                blockout={blockout}
                organizationId={organizationId}
                today={today}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** One month, Sunday first: blocked days hatched, scheduled days dotted, today outlined. */
function BlockoutMonth({
  month,
  blocked,
  scheduled,
  today,
}: {
  month: string;
  blocked: Set<string>;
  scheduled: Set<string>;
  today: string;
}) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold">{formatMonth(month)}</h3>
      <div className="grid grid-cols-7 gap-1 text-center tabular-nums">
        {WEEKDAYS.map((weekday, i) => (
          <span key={i} aria-hidden className="pb-1 text-[11px] font-semibold text-muted-foreground">
            {weekday}
          </span>
        ))}
        {monthGrid(month).map((day, i) => {
          if (!day) return <span key={`lead-${i}`} aria-hidden />;

          const isBlocked = blocked.has(day);
          const isScheduled = scheduled.has(day);
          const isToday = day === today;
          const isPast = day < today;

          return (
            <span
              key={day}
              className={cn(
                "relative flex h-9 items-center justify-center rounded-md text-[13px]",
                isBlocked && "font-semibold text-destructive",
                isToday && "font-semibold ring-[1.5px] ring-foreground ring-inset",
                isPast && "text-muted-foreground opacity-55",
              )}
              style={isBlocked ? HATCH : undefined}
            >
              {Number(day.slice(8))}
              {isScheduled && (
                <span aria-hidden className="absolute bottom-1 size-[5px] rounded-full bg-primary" />
              )}
              {(isBlocked || isScheduled) && (
                <span className="sr-only">
                  {[isBlocked && "blocked out", isScheduled && "you're scheduled"]
                    .filter(Boolean)
                    .join(", ")}
                </span>
              )}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function BlockoutRow({
  blockout,
  organizationId,
  today,
}: {
  blockout: BlockoutItem;
  organizationId: string;
  today: string;
}) {
  const [isDeleting, startDeleting] = useTransition();

  const dayCount = blockoutDayCount(blockout.startDate, blockout.endDate);

  const handleDelete = () => {
    startDeleting(async () => {
      const result = await deleteBlockoutDate(blockout.id, organizationId);

      result.success
        ? toast.success("Blockout removed", { position: "bottom-center" })
        : toast.error(result.error, { position: "bottom-center" });
    });
  };

  return (
    <div className="flex items-center gap-3 px-6 py-3">
      <p className="min-w-0 flex-1 truncate text-sm font-medium tabular-nums sm:flex-none sm:w-64">
        {formatBlockoutRange(blockout.startDate, blockout.endDate, today)}
      </p>
      <p className="shrink-0 text-xs text-muted-foreground sm:flex-1">
        {dayCount === 1 ? "1 day" : `${dayCount} days`}
      </p>
      <Button
        variant="ghost"
        size="icon"
        onClick={handleDelete}
        disabled={isDeleting}
        className="shrink-0 text-muted-foreground hover:text-destructive"
      >
        {isDeleting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Trash2 className="h-4 w-4" />
        )}
        <span className="sr-only">Remove blockout</span>
      </Button>
    </div>
  );
}
