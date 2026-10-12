interface EventsTabSkeletonProps {
  canManage?: boolean;
}

export const EventsTabSkeleton = ({ canManage = false }: EventsTabSkeletonProps) => (
  <div className="flex flex-col gap-4">
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
    <div className="mx-auto flex gap-1 sm:mx-0">
      {[68, 72, 82, 36].map((width, i) => (
        <div key={i} className="h-7 animate-pulse rounded-lg bg-muted" style={{ width }} />
      ))}
    </div>

    {/* Service type filter chips */}
    <div className="flex gap-2 pb-2">
      {[44, 76, 92, 68].map((width, i) => (
        <div key={i} className="h-7 shrink-0 animate-pulse rounded-full bg-muted" style={{ width }} />
      ))}
    </div>

    {/* Event cards: date tile, stripe, name and badges, details */}
    <div className="flex flex-col gap-3">
      {[190, 150, 215].map((width, i) => (
        <div
          key={i}
          className="flex items-start gap-3 rounded-2xl border border-border bg-card p-3 sm:items-center sm:gap-4 sm:p-4"
        >
          <div className="h-15 w-12 shrink-0 animate-pulse self-center rounded-xl bg-muted" />
          <div className="w-[3px] self-stretch rounded-full bg-muted" />

          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2.5">
              <div className="h-4 animate-pulse rounded-md bg-muted" style={{ width }} />
              <div className="flex gap-1.5">
                <div className="h-5 w-20 animate-pulse rounded-md bg-muted" />
                <div className="h-5 w-16 animate-pulse rounded-md bg-muted" />
              </div>
            </div>
            <div className="h-3.5 w-36 animate-pulse rounded-md bg-muted" />
          </div>
        </div>
      ))}
    </div>
  </div>
);
