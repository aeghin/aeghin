interface EventsTabSkeletonProps {
  canManage?: boolean;
}

export const EventsTabSkeleton = ({ canManage = false }: EventsTabSkeletonProps) => (
  <div className="flex flex-col gap-6">
    {/* Up Next banner */}
    <div className="rounded-xl border border-border/40 bg-card p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-5">
        <div className="flex items-center gap-3 sm:w-40 sm:shrink-0">
          <div className="size-10 shrink-0 animate-pulse rounded-xl bg-muted" />
          <div className="space-y-1.5">
            <div className="h-3 w-16 animate-pulse rounded-md bg-muted" />
            <div className="h-4 w-20 animate-pulse rounded-md bg-muted" />
          </div>
        </div>

        <div className="hidden h-10 w-px shrink-0 bg-border/60 sm:block" />

        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <div className="h-6 w-44 animate-pulse rounded-md bg-muted" />
            <div className="h-5 w-16 animate-pulse rounded bg-muted" />
            <div className="h-5 w-20 animate-pulse rounded-md bg-muted" />
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <div className="h-4 w-48 animate-pulse rounded-md bg-muted" />
            <div className="h-4 w-28 animate-pulse rounded-md bg-muted" />
          </div>
        </div>

        <div className="hidden size-5 shrink-0 animate-pulse rounded bg-muted sm:block" />
      </div>
    </div>

    {/* Pending / My Schedule / All Events tabs */}
    <div className="flex gap-1 border-b border-border">
      {(canManage ? [52, 84, 68] : [52, 84]).map((width, i) => (
        <div key={i} className="flex items-center gap-2 rounded-t-lg px-3 pt-2 pb-3">
          <div className="h-2 w-2 animate-pulse rounded-full bg-muted" />
          <div className="h-4 animate-pulse rounded-md bg-muted" style={{ width }} />
          <div className="h-5 w-7 animate-pulse rounded-full bg-muted" />
        </div>
      ))}
    </div>

    {/* Time scope buttons */}
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex gap-1 rounded-lg border border-border bg-background p-1">
        {[74, 86, 80, 48].map((width, i) => (
          <div key={i} className="h-7 animate-pulse rounded-md bg-muted" style={{ width }} />
        ))}
      </div>
    </div>

    {/* Service type filter chips */}
    <div className="flex gap-2 pb-2">
      {[44, 76, 92, 68].map((width, i) => (
        <div key={i} className="h-7 shrink-0 animate-pulse rounded-full bg-muted" style={{ width }} />
      ))}
    </div>

    {/* Date-grouped event rows */}
    <div className="space-y-6">
      {[2, 1].map((rowCount, groupIndex) => (
        <div key={groupIndex}>
          <div className="mb-3 flex items-center gap-3">
            <div className="h-4 w-28 animate-pulse rounded-md bg-muted" />
            <div className="h-px flex-1 bg-border" />
          </div>

          <div className="space-y-2">
            {Array.from({ length: rowCount }).map((_, i) => (
              <div
                key={i}
                className="rounded-lg border border-border border-l-[3px] border-l-muted bg-card p-3"
              >
                {/* Desktop layout */}
                <div className="hidden items-center gap-3 sm:flex">
                  <div className="h-4 w-17.5 shrink-0 animate-pulse rounded-md bg-muted" />
                  <div className="h-5 w-16 shrink-0 animate-pulse rounded bg-muted" />
                  <div className="flex-1">
                    <div className="h-4 w-40 animate-pulse rounded-md bg-muted" />
                  </div>
                  <div className="h-5 w-20 shrink-0 animate-pulse rounded-md bg-muted" />
                </div>

                {/* Mobile layout */}
                <div className="flex flex-col gap-2 sm:hidden">
                  <div className="flex items-center justify-between gap-2">
                    <div className="h-5 w-16 animate-pulse rounded bg-muted" />
                    <div className="h-5 w-20 animate-pulse rounded-md bg-muted" />
                  </div>
                  <div className="h-4 w-40 animate-pulse rounded-md bg-muted" />
                  <div className="h-3 w-28 animate-pulse rounded-md bg-muted" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  </div>
);
