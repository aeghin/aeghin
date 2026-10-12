import { Card, CardContent, CardHeader } from "@/components/ui/card";

export const TabsSkeleton = () => (
  <div className="space-y-6">
    <div className="flex w-full gap-1 overflow-hidden rounded-xl bg-secondary/50 p-1 sm:w-fit sm:max-w-full">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="h-9 shrink-0 animate-pulse rounded-lg bg-muted px-4 sm:h-10"
          style={{ width: `${80 + i * 10}px` }}
        />
      ))}
    </div>


    <Card className="overflow-hidden rounded-xl border-border/40 bg-linear-to-br from-card to-card/80 shadow-sm">
      <CardHeader className="flex flex-row items-center gap-3 border-b border-border/40 bg-secondary/20 px-6 py-4">
        <div className="h-10 w-10 animate-pulse rounded-xl bg-muted" />
        <div className="space-y-2">
          <div className="h-4 w-28 animate-pulse rounded-md bg-muted" />
          <div className="h-3 w-40 animate-pulse rounded-md bg-muted" />
        </div>
      </CardHeader>
      <CardContent className="p-6">
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4">
              <div className="h-11 w-11 shrink-0 animate-pulse rounded-xl bg-muted" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-48 animate-pulse rounded-md bg-muted" />
                <div className="h-3 w-32 animate-pulse rounded-md bg-muted" />
              </div>
              <div className="h-6 w-16 animate-pulse rounded-full bg-muted" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  </div>
);