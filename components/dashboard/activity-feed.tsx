"use client";

import { useRef, useState, useTransition } from "react";
import { m } from "motion/react";
import { ChevronLeft, ChevronRight, ListFilter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ActivityRow } from "@/components/dashboard/activity-row";
import { fetchActivityPage } from "@/lib/actions/activity";
import {
  ACTIVITY_FILTERS,
  activityDaysAgo,
  activityGroupLabel,
  formatActivityStamp,
  type ActivityFilter,
} from "@/lib/activity-feed";
import { cn } from "@/lib/utils";
import type { ActivityItem } from "@/lib/services/activity";

// The Events page's service pills, so the two filters read as one family.
const CHIP_BASE =
  "flex shrink-0 items-center rounded-full border px-3 py-1.5 text-xs font-medium transition-all cursor-pointer";

const chipClass = (active: boolean) =>
  cn(
    CHIP_BASE,
    active
      ? "border-transparent bg-foreground text-background"
      : "border-border bg-background text-muted-foreground hover:border-foreground/20 hover:text-foreground"
  );

/** Consecutive rows under one heading: Today, Yesterday, Earlier this week, Earlier. */
type DayGroup = { label: string; rows: { item: ActivityItem; stamp: string }[] };

// The page is already newest first, so a heading only ever opens once.
const groupByDay = (items: ActivityItem[], now: Date, timeZone: string): DayGroup[] => {
  const groups: DayGroup[] = [];

  for (const item of items) {
    const daysAgo = activityDaysAgo(item.createdAt, now, timeZone);
    const label = activityGroupLabel(daysAgo);
    const row = { item, stamp: formatActivityStamp(item.createdAt, daysAgo, now, timeZone) };
    const last = groups.at(-1);

    if (last?.label === label) last.rows.push(row);
    else groups.push({ label, rows: [row] });
  }

  return groups;
};

// Always keeps the first and last page plus the current page and its
// neighbours, with "ellipsis" standing in for the gaps, so the control holds a
// stable width however deep the feed gets.
const buildPageList = (
  current: number,
  total: number
): (number | "ellipsis")[] => {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

  const first = Math.max(2, current - 1);
  const last = Math.min(total - 1, current + 1);
  const pages: (number | "ellipsis")[] = [1];

  if (first > 2) pages.push("ellipsis");
  for (let page = first; page <= last; page++) pages.push(page);
  if (last < total - 1) pages.push("ellipsis");

  pages.push(total);

  return pages;
};

interface ActivityFeedProps {
  organizationId: string;
  /** The organization's zone, for the rows' dates. */
  timeZone: string;
  initialItems: ActivityItem[];
  initialTotalPages: number;
}

export const ActivityFeed = ({
  organizationId,
  timeZone,
  initialItems,
  initialTotalPages,
}: ActivityFeedProps) => {
  const [items, setItems] = useState(initialItems);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(initialTotalPages);
  const [filter, setFilter] = useState<ActivityFilter>("all");
  // What "today" is for the headings: read again with every page that lands,
  // so a feed left open overnight doesn't keep calling yesterday Today.
  const [now, setNow] = useState(() => new Date());
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  // Only the newest request may write: tapping chips in a row starts one each,
  // and an older one answering last would show the wrong chip's rows.
  const latestRequest = useRef(0);
  // The chip the rows on screen belong to, for a failed switch to fall back to.
  const shownFilter = useRef<ActivityFilter>("all");

  const load = (nextPage: number, nextFilter: ActivityFilter) => {
    const request = ++latestRequest.current;
    setError(null);

    startTransition(async () => {
      const res = await fetchActivityPage(organizationId, nextPage, nextFilter);
      if (request !== latestRequest.current) return;
      if (!res.success) {
        setError(res.error);
        setFilter(shownFilter.current);
        return;
      }
      shownFilter.current = nextFilter;
      // The action clamps the page and recounts, so both come back from it
      // rather than being assumed here — rows logged since the initial render
      // can change how deep the feed goes.
      setItems(res.items);
      setPage(res.page);
      setTotalPages(res.totalPages);
      setNow(new Date());
    });
  };

  const goToPage = (next: number) => {
    if (next === page || next < 1 || next > totalPages) return;
    load(next, filter);
  };

  // The chip lights at once; the rows under it follow when they land. Every
  // chip starts from its own first page.
  const chooseFilter = (next: ActivityFilter) => {
    if (next === filter) return;
    setFilter(next);
    load(1, next);
  };

  const pageList = buildPageList(page, totalPages);
  const groups = groupByDay(items, now, timeZone);
  const filterInfo = ACTIVITY_FILTERS.find((f) => f.value === filter);

  return (
    <>
      <div
        role="toolbar"
        aria-label="Filter activity"
        className="flex gap-2 overflow-x-auto px-4 pb-1 scrollbar-hide sm:px-6"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {ACTIVITY_FILTERS.map((option) => (
          <m.button
            key={option.value}
            type="button"
            whileTap={{ scale: 0.97 }}
            onClick={() => chooseFilter(option.value)}
            aria-pressed={option.value === filter}
            className={chipClass(option.value === filter)}
          >
            {option.label}
          </m.button>
        ))}
      </div>

      {error && <p className="px-6 pt-2 text-xs text-destructive">{error}</p>}

      {/* The outgoing rows stay mounted while the next page loads so the card
          holds its height instead of collapsing behind a spinner. */}
      <div
        aria-busy={isPending}
        className={cn("transition-opacity", isPending && "opacity-50")}
      >
        {groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center text-muted-foreground">
            <ListFilter className="h-8 w-8 opacity-30" />
            <p className="text-sm">{filterInfo?.empty}</p>
            <Button variant="ghost" size="sm" onClick={() => chooseFilter("all")}>
              Show all activity
            </Button>
          </div>
        ) : (
          groups.map((group, g) => {
            // The stagger caps at the tenth row so a full page never takes a
            // second to finish animating in on every page change.
            const before = groups.slice(0, g).reduce((n, prev) => n + prev.rows.length, 0);

            return (
              <section
                key={`${group.label}-${group.rows[0].item.id}`}
                aria-label={group.label}
                className={cn("py-1", g > 0 && "border-t border-border/40")}
              >
                <h3 className="px-6 pt-3 pb-1 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                  {group.label}
                </h3>
                {group.rows.map(({ item, stamp }, i) => (
                  <ActivityRow
                    key={item.id}
                    item={item}
                    stamp={stamp}
                    index={Math.min(before + i, 9)}
                    organizationId={organizationId}
                    timeZone={timeZone}
                  />
                ))}
              </section>
            );
          })
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex flex-col items-center gap-2 border-t border-border/40 px-4 py-3">
          <div className="flex items-center justify-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => goToPage(page - 1)}
              disabled={isPending || page === 1}
              aria-label="Previous page"
            >
              <ChevronLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Previous</span>
            </Button>

            {/* Numbered jumps need more room than a phone has, so the counter
                stands in for them below sm. */}
            <span className="px-2 text-sm text-muted-foreground sm:hidden">
              Page {page} of {totalPages}
            </span>

            <div className="hidden items-center gap-1 sm:flex">
              {pageList.map((entry, i) =>
                entry === "ellipsis" ? (
                  <span
                    key={`ellipsis-${i}`}
                    aria-hidden
                    className="px-1 text-sm text-muted-foreground"
                  >
                    …
                  </span>
                ) : (
                  <Button
                    key={entry}
                    variant={entry === page ? "secondary" : "ghost"}
                    size="sm"
                    onClick={() => goToPage(entry)}
                    disabled={isPending}
                    aria-label={`Page ${entry}`}
                    aria-current={entry === page ? "page" : undefined}
                    className={cn(
                      "min-w-8 px-2 text-sm",
                      entry === page && "font-medium"
                    )}
                  >
                    {entry}
                  </Button>
                )
              )}
            </div>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => goToPage(page + 1)}
              disabled={isPending || page === totalPages}
              aria-label="Next page"
            >
              <span className="hidden sm:inline">Next</span>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </>
  );
};
