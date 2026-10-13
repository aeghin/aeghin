import { Card } from "@/components/ui/card"

export function SongLibrarySkeleton() {
  return (
    <div className="mx-auto w-full max-w-screen-2xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-6">
        <div className="flex items-end justify-between gap-4">
          <div>
            <div className="h-8 w-48 animate-pulse rounded bg-muted" />
            <div className="mt-2 h-3 w-64 animate-pulse rounded bg-muted/60" />
          </div>
          <div className="h-10 w-28 animate-pulse rounded-md bg-muted" />
        </div>
      </div>

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="h-10 flex-1 animate-pulse rounded-md bg-muted" />
        <div className="flex gap-2">
          <div className="h-10 w-24 animate-pulse rounded-md bg-muted" />
          <div className="h-10 w-24 animate-pulse rounded-md bg-muted" />
          <div className="h-10 w-40 animate-pulse rounded-md bg-muted" />
        </div>
      </div>

      <Card className="overflow-hidden p-0">
        <div className="border-b border-border/60 bg-muted/30 px-4 py-2.5">
          <div className="h-3 w-20 animate-pulse rounded bg-muted" />
        </div>
        <ul className="divide-y divide-border/60">
          {Array.from({ length: 8 }).map((_, i) => (
            <li
              key={i}
              className="grid grid-cols-[1fr_180px_64px_84px_120px] items-center gap-4 px-4 py-3"
            >
              <div className="space-y-1.5">
                <div className="h-3.5 w-48 animate-pulse rounded bg-muted" />
                <div className="h-3 w-32 animate-pulse rounded bg-muted/60" />
              </div>
              <div className="flex gap-1">
                <div className="h-4 w-14 animate-pulse rounded bg-muted" />
                <div className="h-4 w-12 animate-pulse rounded bg-muted/60" />
              </div>
              <div className="h-4 w-8 animate-pulse rounded bg-muted" />
              <div className="ml-auto h-3 w-12 animate-pulse rounded bg-muted" />
              <div className="ml-auto flex gap-1">
                <div className="h-7 w-7 animate-pulse rounded-md bg-muted" />
                <div className="h-7 w-7 animate-pulse rounded-md bg-muted" />
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}
