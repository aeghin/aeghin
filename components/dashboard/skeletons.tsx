import { Skeleton } from "@/components/ui/skeleton";

export function OrganizationsGridSkeleton() {
  return (
    <div className="space-y-5">
      <div>
        <Skeleton className="h-6 w-48" />
        <Skeleton className="mt-1 h-4 w-72" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="rounded-lg border border-border/40 bg-linear-to-br from-card to-card/80 p-5"
          >
            <div className="flex items-start gap-3">
              <Skeleton className="h-11 w-11 rounded-xl shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-4 w-48" />
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-5 w-12 rounded-full" />
            </div>
            <div className="mt-5 border-t border-border/40 pt-4">
              <Skeleton className="h-4 w-24" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
