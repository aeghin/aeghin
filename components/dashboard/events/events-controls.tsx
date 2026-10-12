"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

import type { TimeScope } from "@/lib/time-scope";
import { cn } from "@/lib/utils";

const TIME_SCOPES: { value: TimeScope; label: string }[] = [
  { value: "upcoming", label: "Upcoming" },
  { value: "week", label: "This Week" },
  { value: "month", label: "This Month" },
  { value: "past", label: "Past" },
];

/**
 * Which stretch of the calendar the list covers. Text that tints orange
 * rather than a second segmented control, which would read as one broken
 * widget stacked under the first. Centred on a phone, as in the app.
 */
export function ScopeFilter({
  value,
  onChange,
}: {
  value: TimeScope;
  onChange: (scope: TimeScope) => void;
}) {
  return (
    <div className="overflow-x-auto" style={{ scrollbarWidth: "none" }}>
      <div className="mx-auto flex w-max gap-1 sm:mx-0">
        {TIME_SCOPES.map((scope) => {
          const active = scope.value === value;

          return (
            <button
              key={scope.value}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(scope.value)}
              className={cn(
                "cursor-pointer rounded-lg px-2.5 py-1.5 text-[13px] font-semibold whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                active
                  ? "bg-primary/13 text-primary"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground",
              )}
            >
              {scope.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Steps the month that This Month and Past read from. */
export function MonthStepper({
  label,
  onPrevious,
  onNext,
}: {
  label: string;
  onPrevious: () => void;
  onNext: () => void;
}) {
  const button =
    "flex h-8 w-10 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

  return (
    <div className="flex h-9 w-full items-center justify-between rounded-xl border border-border bg-secondary/60 px-0.5 sm:w-60">
      <button type="button" aria-label="Previous month" onClick={onPrevious} className={button}>
        <ChevronLeft className="size-3.5" />
      </button>
      <span className="text-[13px] font-semibold text-foreground">{label}</span>
      <button type="button" aria-label="Next month" onClick={onNext} className={button}>
        <ChevronRight className="size-3.5" />
      </button>
    </div>
  );
}
