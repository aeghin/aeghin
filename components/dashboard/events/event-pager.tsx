"use client";

// A client component only so the <Link> is built here. Passed down from a
// server component, it reaches TooltipTrigger's asChild as a lazy element,
// which the Slot inside Tooltip drops during SSR — the links went missing from
// the HTML and hydration failed.
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { colorClasses } from "@/lib/config/service-types-config";

interface AdjacentEvent {
  id: string;
  name: string;
  startTime: Date;
}

interface EventPagerProps {
  organizationId: string;
  serviceName: string;
  serviceColor: string;
  previous: AdjacentEvent | null;
  next: AdjacentEvent | null;
}

interface PagerStepProps {
  organizationId: string;
  serviceName: string;
  event: AdjacentEvent | null;
  direction: "previous" | "next";
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

const stepClass =
  "inline-flex h-8 items-center gap-1 rounded-md px-2 text-sm text-muted-foreground";

// Steps between events of one service type, so its dot sits between the
// arrows — the same dot as the badge in the header below.
export function EventPager({
  organizationId,
  serviceName,
  serviceColor,
  previous,
  next,
}: EventPagerProps) {
  // Nothing either side, e.g. a volunteer's only Sunday.
  if (!previous && !next) return null;

  const serviceColors = colorClasses[serviceColor];

  return (
    <nav
      aria-label={`Previous and next ${serviceName} event`}
      className="flex shrink-0 items-center rounded-lg border border-border bg-background p-0.5"
    >
      <PagerStep
        organizationId={organizationId}
        serviceName={serviceName}
        event={previous}
        direction="previous"
      />
      <span
        aria-hidden="true"
        className={cn("mx-1 h-1.5 w-1.5 shrink-0 rounded-full", serviceColors.dot)}
      />
      <PagerStep
        organizationId={organizationId}
        serviceName={serviceName}
        event={next}
        direction="next"
      />
    </nav>
  );
}

function PagerStep({ organizationId, serviceName, event, direction }: PagerStepProps) {
  const isNext = direction === "next";
  const label = isNext ? "Next" : "Previous";

  const content = (
    <>
      {!isNext && <ChevronLeft className="h-4 w-4" />}
      <span className="hidden sm:inline">{label}</span>
      {isNext && <ChevronRight className="h-4 w-4" />}
    </>
  );

  // At either end the arrow stays, greyed out, so the other one doesn't shift
  // under a pointer that's clicking through.
  if (!event) {
    return (
      <span aria-hidden="true" className={cn(stepClass, "opacity-40")}>
        {content}
      </span>
    );
  }

  const when = formatShortDate(event.startTime);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          href={`/dashboard/organizations/${organizationId}/events/${event.id}`}
          aria-label={`${label} ${serviceName}: ${event.name}, ${when}`}
          className={cn(
            stepClass,
            "outline-none transition-colors hover:bg-secondary hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50",
          )}
        >
          {content}
        </Link>
      </TooltipTrigger>
      <TooltipContent side="bottom" collisionPadding={16}>
        {event.name} · {when}
      </TooltipContent>
    </Tooltip>
  );
}
