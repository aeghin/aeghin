import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

export function EventDetailSkeleton() {
  return (
    <main className="mx-auto max-w-screen-2xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="space-y-6 sm:space-y-8">
        {/* Sized like the back link and the prev/next pager, so stepping to
            another event doesn't jump when the page lands. */}
        <div className="flex items-center justify-between gap-3">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-9.5 w-21 rounded-lg sm:w-44.5" />
        </div>

        <div className="rounded-2xl border border-border/40 border-l-[3px] border-l-muted bg-card p-5 sm:p-8">
          <div className="flex items-start gap-4 sm:gap-5">
            <Skeleton className="h-14 w-14 shrink-0 rounded-2xl sm:h-16 sm:w-16" />
            <div className="min-w-0 flex-1 space-y-3">
              <Skeleton className="h-5.5 w-28" />
              <Skeleton className="h-8 w-full max-w-72 sm:h-9" />
              <div className="py-1">
                <Skeleton className="h-4 w-full max-w-80" />
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <Card>
              <CardHeader className="pb-3">
                <Skeleton className="h-4 w-16" />
              </CardHeader>
              <CardContent className="space-y-3">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-4 w-1/2" />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <Skeleton className="h-4 w-20" />
              </CardHeader>
              <CardContent className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </CardContent>
            </Card>
          </div>
          <div className="space-y-6">
            <Card>
              <CardHeader className="pb-3">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-1.5 w-full mt-2" />
              </CardHeader>
              <CardContent className="space-y-2">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6 space-y-3">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </main>
  )
}
