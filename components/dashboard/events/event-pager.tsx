"use client";

// A client component only so the <Link> is built here. Passed down from a
// server component, it reaches TooltipTrigger's asChild as a lazy element,
// which the Slot inside Tooltip drops during SSR — the links went missing from
// the HTML and hydration failed.
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { getServiceColors } from "@/lib/config/service-types-config";
import { formatDayMonth, formatShortDate } from "@/lib/event-format";

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
  serviceColor: string;
  event: AdjacentEvent | null;
  direction: "previous" | "next";
}

/**
 * Previous and next of the same service type, as the footer of the event's
 * card on the phone. Each arrow carries the date it goes to, so a step is a
 * choice rather than a guess, and the service is named between them.
 */
export function EventPager({
  organizationId,
  serviceName,
  serviceColor,
  previous,
  next,
}: EventPagerProps) {
  // Nothing either side, e.g. a volunteer's only Sunday.
  if (!previous && !next) return null;

  const serviceColors = getServiceColors(serviceColor);

  return (
    <nav
      aria-label={`Previous and next ${serviceName} event`}
      className="mt-4 flex items-center gap-2 border-t border-border pt-3 sm:mt-5"
    >
      <PagerStep
        organizationId={organizationId}
        serviceName={serviceName}
        serviceColor={serviceColor}
        event={previous}
        direction="previous"
      />

      <div className="flex min-w-0 flex-1 items-center justify-center gap-1.5">
        <span aria-hidden="true" className={cn("size-1.75 shrink-0 rounded-full", serviceColors.dot)} />
        <span className="truncate text-[13px] font-semibold text-muted-foreground">
          {serviceName}
        </span>
      </div>

      <PagerStep
        organizationId={organizationId}
        serviceName={serviceName}
        serviceColor={serviceColor}
        event={next}
        direction="next"
      />
    </nav>
  );
}

function PagerStep({ organizationId, serviceName, serviceColor, event, direction }: PagerStepProps) {
  const isNext = direction === "next";
  const label = isNext ? "Next" : "Previous";
  const serviceColors = getServiceColors(serviceColor);

  const arrow = (
    <span className="flex size-7 shrink-0 items-center justify-center rounded-lg border border-border bg-card">
      {isNext ? (
        <ChevronRight className={cn("size-3.5", serviceColors.badgeText)} />
      ) : (
        <ChevronLeft className={cn("size-3.5", serviceColors.badgeText)} />
      )}
    </span>
  );

  const date = (
    <span className="text-xs font-semibold text-foreground tabular-nums">
      {event ? formatDayMonth(event.startTime) : isNext ? "Latest" : "First"}
    </span>
  );

  const content = (
    <>
      {isNext ? date : arrow}
      {isNext ? arrow : date}
    </>
  );

  const stepClass = "-m-1 inline-flex shrink-0 items-center gap-2 rounded-lg p-1";

  // At either end the step stays, dimmed, so the other one doesn't shift
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
            "outline-none transition-colors hover:bg-secondary focus-visible:ring-[3px] focus-visible:ring-ring/50",
          )}
        >
          {content}
        </Link>
      </TooltipTrigger>
      <TooltipContent side="top" collisionPadding={16}>
        {event.name} · {when}
      </TooltipContent>
    </Tooltip>
  );
}
