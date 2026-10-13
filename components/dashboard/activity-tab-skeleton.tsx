import { Card, CardContent, CardHeader } from "@/components/ui/card";

export const ActivityTabSkeleton = () => (
  <Card className="overflow-hidden rounded-xl border-border/40 bg-linear-to-br from-card to-card/80 shadow-sm">
    <CardHeader className="flex flex-row items-center justify-between border-b border-border/40 bg-secondary/20 px-6 py-4">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 animate-pulse rounded-xl bg-muted" />
        <div className="space-y-2">
          <div className="h-4 w-24 animate-pulse rounded-md bg-muted" />
          <div className="h-3 w-40 animate-pulse rounded-md bg-muted" />
        </div>
      </div>
    </CardHeader>
    <CardContent className="p-0">
      {/* Filter chips: All, Smart Scheduling, Invites, Members, Events */}
      <div className="flex gap-2 overflow-hidden px-4 pb-1 sm:px-6">
        {[40, 124, 64, 76, 62].map((width, i) => (
          <div key={i} className="h-7 shrink-0 animate-pulse rounded-full bg-muted" style={{ width }} />
        ))}
      </div>

      {/* A day heading, then its rows */}
      <div className="py-1">
        <div className="px-6 pt-3 pb-1">
          <div className="h-3 w-14 animate-pulse rounded-md bg-muted" />
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-start gap-4 px-6 py-4">
            <div className="h-9 w-9 shrink-0 animate-pulse rounded-xl bg-muted" />
            <div className="space-y-2">
              <div className="h-4 w-64 max-w-full animate-pulse rounded-md bg-muted" />
              <div className="h-3 w-32 animate-pulse rounded-md bg-muted" />
            </div>
          </div>
        ))}
      </div>
    </CardContent>
  </Card>
);
