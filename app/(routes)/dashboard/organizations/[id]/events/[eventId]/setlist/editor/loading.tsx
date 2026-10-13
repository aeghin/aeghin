import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="min-h-screen bg-muted/10">
      <header className="sticky top-14 z-10 border-b bg-background/80 backdrop-blur">
        <div className="container mx-auto flex items-center justify-between gap-4 px-4 py-3">
          <Skeleton className="h-3.5 w-48" />
          <Skeleton className="h-8 w-16 rounded-md" />
        </div>
      </header>

      <div className="container mx-auto grid grid-cols-1 gap-6 px-4 py-6 lg:grid-cols-3">
        <section className="lg:col-span-2">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Skeleton className="h-4 w-4 rounded" />
                <Skeleton className="h-4 w-16" />
                <Skeleton className="ml-auto h-3 w-14" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 rounded-lg border bg-card p-2"
                  >
                    <Skeleton className="h-4 w-4 shrink-0" />
                    <Skeleton className="h-6 w-6 shrink-0 rounded-md" />
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <Skeleton className="h-3.5 w-40" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                    <Skeleton className="h-7 w-20 rounded-md" />
                    <Skeleton className="h-7 w-16 rounded-md" />
                    <Skeleton className="h-7 w-14 rounded-md" />
                    <Skeleton className="h-7 w-7 rounded-md" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </section>

        <aside className="lg:col-span-1">
          <div className="w-full space-y-3">
            <div className="grid w-full grid-cols-2 gap-1 rounded-md bg-muted p-1">
              <Skeleton className="h-7 rounded-sm" />
              <Skeleton className="h-7 rounded-sm" />
            </div>

            <Card>
              <CardContent className="space-y-3 p-3">
                <Skeleton className="h-8 w-full rounded-md" />
                <div className="h-105 space-y-1 overflow-hidden pr-2">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 rounded-md p-2"
                    >
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <Skeleton className="h-3 w-36" />
                        <Skeleton className="h-2.5 w-28" />
                      </div>
                      <Skeleton className="h-7 w-7 rounded-md" />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </aside>
      </div>
    </div>
  );
}
