import { Skeleton } from "@/components/ui/skeleton"

export function EventDetailSkeleton() {
  return (
    <main className="mx-auto max-w-screen-2xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="space-y-6 sm:space-y-8">
        <Skeleton className="h-4 w-40" />

        {/* The hero: date tile, stripe, name and badge, the when and where
            tiles beside them from lg, and the pager along the bottom. */}
        <div className="rounded-2xl border border-border bg-card p-4 sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-8">
            <div className="flex min-w-0 items-center gap-3.5 lg:flex-1">
              <Skeleton className="h-19 w-15 shrink-0 rounded-xl" />
              <Skeleton className="w-[3px] self-stretch rounded-full" />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-7 w-full max-w-72 sm:h-8" />
                <Skeleton className="h-5 w-24" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 lg:w-[46%] lg:shrink-0">
              {[0, 1].map((i) => (
                <div key={i} className="space-y-1.5 rounded-xl border border-border p-2.5">
                  <Skeleton className="h-2.5 w-12" />
                  <Skeleton className="h-3.5 w-24" />
                </div>
              ))}
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between border-t border-border pt-3 sm:mt-5">
            <Skeleton className="h-7 w-20 rounded-lg" />
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-7 w-20 rounded-lg" />
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            {/* Setlist: icon tile, title and song count, then the rows */}
            <div className="overflow-hidden rounded-2xl border border-border bg-card">
              <div className="flex items-center gap-3 px-4 pt-4 pb-3 sm:px-5 sm:pt-5">
                <Skeleton className="size-7.5 rounded-[10px]" />
                <div className="space-y-1.5">
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-3 w-12" />
                </div>
              </div>
              <div className="space-y-2 px-4 pb-4 sm:px-5">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            </div>
          </div>
          <div className="space-y-6">
            {/* Team: icon tile, title and count, the actions, then a section of rows */}
            <div className="overflow-hidden rounded-2xl border border-border bg-card">
              <div className="flex items-center gap-3 px-4 pt-4 pb-3 sm:px-5 sm:pt-5">
                <Skeleton className="size-7.5 rounded-[10px]" />
                <Skeleton className="h-4 w-14" />
                <Skeleton className="ml-auto h-4 w-24" />
              </div>
              <div className="flex gap-2 px-4 pb-4 sm:px-5">
                <Skeleton className="h-8.5 flex-1 rounded-[10px]" />
                <Skeleton className="h-8.5 flex-1 rounded-[10px]" />
              </div>
              <div className="space-y-2 border-t border-border px-4 py-3 sm:px-5">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-13 w-full rounded-xl" />
                <Skeleton className="h-13 w-full rounded-xl" />
              </div>
            </div>
            {/* Chat: icon tile, title and who's online, then the message area */}
            <div className="flex h-112 flex-col overflow-hidden rounded-2xl border border-border bg-card">
              <div className="flex items-center gap-3 px-4 pt-4 pb-3 sm:px-5 sm:pt-5">
                <Skeleton className="size-7.5 rounded-[10px]" />
                <Skeleton className="h-4 w-20" />
                <Skeleton className="ml-auto h-3 w-14" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
