import { DETAIL_CARD } from "@/components/dashboard/events/event-detail-parts";

/** My keys while it loads: the card's header and search, then rows led by a key tile. */
export const SongKeysTabSkeleton = () => (
  <div className={DETAIL_CARD}>
    <div className="flex items-center gap-3 px-4 pt-4 pb-3 sm:px-5 sm:pt-5">
      <div className="size-7.5 animate-pulse rounded-[10px] bg-muted" />
      <div className="flex-1 space-y-1.5">
        <div className="h-4 w-20 animate-pulse rounded-md bg-muted" />
        <div className="h-3 w-48 animate-pulse rounded-md bg-muted" />
      </div>
      <div className="h-8.5 w-24 animate-pulse rounded-[10px] bg-muted" />
    </div>
    <div className="flex flex-col gap-2 px-4 pb-3 sm:flex-row sm:px-5">
      <div className="h-9 flex-1 animate-pulse rounded-md bg-muted" />
      <div className="flex gap-2">
        <div className="h-9 w-20 animate-pulse rounded-md bg-muted" />
        <div className="h-9 w-24 animate-pulse rounded-md bg-muted" />
        <div className="h-9 w-36 animate-pulse rounded-md bg-muted max-sm:w-14" />
      </div>
    </div>
    <div className="divide-y divide-border/60 border-t border-border">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3 sm:px-5">
          <div className="size-13 animate-pulse rounded-xl bg-muted" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-44 animate-pulse rounded-md bg-muted" />
            <div className="h-3 w-24 animate-pulse rounded-md bg-muted" />
          </div>
        </div>
      ))}
    </div>
  </div>
);
