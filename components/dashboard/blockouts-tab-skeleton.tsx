import { Card, CardContent, CardHeader } from "@/components/ui/card";

export const BlockoutsTabSkeleton = () => (
  <Card className="overflow-hidden rounded-xl border-border/40 bg-linear-to-br from-card to-card/80 shadow-sm">
    <CardHeader className="flex flex-row items-center justify-between border-b border-border/40 bg-secondary/20 px-6 py-4">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 animate-pulse rounded-xl bg-muted" />
        <div className="space-y-2">
          <div className="h-4 w-32 animate-pulse rounded-md bg-muted" />
          <div className="h-3 w-48 animate-pulse rounded-md bg-muted" />
        </div>
      </div>
      <div className="h-9 w-28 animate-pulse rounded-md bg-muted" />
    </CardHeader>
    <CardContent className="p-0">
      <div className="space-y-4 px-4 pb-5 sm:px-6">
        {/* Legend and month arrows */}
        <div className="flex items-center gap-4">
          <div className="h-3.5 w-24 animate-pulse rounded-md bg-muted" />
          <div className="h-3.5 w-28 animate-pulse rounded-md bg-muted" />
          <div className="ml-auto flex gap-1">
            <div className="size-8 animate-pulse rounded-md bg-muted" />
            <div className="size-8 animate-pulse rounded-md bg-muted" />
          </div>
        </div>

        {/* One month on a phone, two side by side from sm */}
        <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
          {[0, 1].map((m) => (
            <div key={m} className={m === 1 ? "hidden sm:block" : undefined}>
              <div className="mb-2 h-4 w-28 animate-pulse rounded-md bg-muted" />
              <div className="grid grid-cols-7 gap-1">
                {Array.from({ length: 35 }).map((_, i) => (
                  <div key={i} className="h-9 animate-pulse rounded-md bg-muted/60" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="divide-y divide-border/40 border-t border-border/40">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-6 py-3">
            <div className="h-4 w-44 animate-pulse rounded-md bg-muted sm:w-56" />
            <div className="h-3 w-12 animate-pulse rounded-md bg-muted" />
            <div className="ml-auto h-8 w-8 animate-pulse rounded-md bg-muted" />
          </div>
        ))}
      </div>
    </CardContent>
  </Card>
);
