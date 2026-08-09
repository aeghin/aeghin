"use client";

import { useState, useTransition } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ActivityRow } from "@/components/dashboard/activity-row";
import { fetchActivityPage } from "@/lib/actions/activity";
import { cn } from "@/lib/utils";
import type { ActivityItem } from "@/lib/services/activity";

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
  initialItems: ActivityItem[];
  initialTotalPages: number;
}

export const ActivityFeed = ({
  organizationId,
  initialItems,
  initialTotalPages,
}: ActivityFeedProps) => {
  const [items, setItems] = useState(initialItems);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(initialTotalPages);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const goToPage = (next: number) => {
    if (next === page || next < 1 || next > totalPages) return;
    setError(null);

    startTransition(async () => {
      const res = await fetchActivityPage(organizationId, next);
      if (!res.success) {
        setError(res.error);
        return;
      }
      // The action clamps the page and recounts, so both come back from it
      // rather than being assumed here — rows logged since the initial render
      // can change how deep the feed goes.
      setItems(res.items);
      setPage(res.page);
      setTotalPages(res.totalPages);
    });
  };

  const pageList = buildPageList(page, totalPages);

  return (
    <>
      {/* The outgoing rows stay mounted while the next page loads so the card
          holds its height instead of collapsing behind a spinner. */}
      <div
        aria-busy={isPending}
        className={cn(
          "divide-y divide-border/40 transition-opacity",
          isPending && "opacity-50"
        )}
      >
        {items.map((item, i) => (
          // The stagger caps at the tenth row so a full page never takes a
          // second to finish animating in on every page change.
          <ActivityRow
            key={item.id}
            item={item}
            index={Math.min(i, 9)}
            organizationId={organizationId}
          />
        ))}
      </div>

      {totalPages > 1 && (
        <div className="flex flex-col items-center gap-2 border-t border-border/40 px-4 py-3">
          {error && <p className="text-xs text-destructive">{error}</p>}

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
