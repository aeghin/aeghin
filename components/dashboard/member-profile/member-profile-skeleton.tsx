import { Skeleton } from "@/components/ui/skeleton";

export function MemberProfileSkeleton() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="mx-auto max-w-285 px-[clamp(20px,5vw,56px)] pb-[clamp(56px,8vw,96px)] pt-[clamp(32px,5.5vw,64px)]">
        {/* Hero */}
        <div className="flex flex-wrap items-center gap-[clamp(24px,4vw,44px)]">
          <Skeleton className="aspect-square w-[clamp(110px,15vw,152px)] flex-none rounded-full" />
          <div className="min-w-[min(100%,320px)] flex-1">
            <Skeleton className="h-13 w-3/4" />
            <div className="mt-5 flex flex-wrap items-center gap-2.5">
              <Skeleton className="h-9 w-32 rounded-full" />
              <Skeleton className="h-9 w-40 rounded-full" />
              <Skeleton className="h-5 w-36" />
            </div>
          </div>
        </div>

        {/* Cards */}
        <div className="mt-[clamp(36px,5vw,56px)] grid grid-cols-[repeat(auto-fit,minmax(min(100%,350px),1fr))] items-stretch gap-[clamp(16px,2.5vw,24px)]">
          {/* Event acceptance */}
          <div className="flex flex-col rounded-[24px] border border-border bg-card p-[clamp(22px,3vw,32px)]">
            <div className="flex items-center justify-between gap-3">
              <Skeleton className="h-3.5 w-32" />
              <Skeleton className="h-8 w-40 rounded-full" />
            </div>
            <div className="mt-6 flex flex-1 items-center justify-center">
              <Skeleton className="aspect-square w-[min(190px,52vw)] rounded-full" />
            </div>
            <div className="mt-5.5 grid grid-cols-3 gap-3 border-t border-border pt-5">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex flex-col gap-2">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-6 w-10" />
                </div>
              ))}
            </div>
            <Skeleton className="mt-3.5 h-3 w-40" />
          </div>

          {/* Top 5 songs */}
          <div className="flex flex-col rounded-[24px] border border-border bg-card p-[clamp(22px,3vw,32px)]">
            <div className="flex items-center justify-between gap-3">
              <Skeleton className="h-3.5 w-28" />
              <Skeleton className="h-3.5 w-16" />
            </div>
            <div className="mt-2.5 flex flex-col gap-5 pt-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex flex-col gap-2.5">
                  <div className="grid grid-cols-[30px_1fr_auto] items-center gap-3.5">
                    <Skeleton className="h-4 w-5" />
                    <div className="flex flex-col gap-1.5">
                      <Skeleton className="h-4 w-40" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                    <Skeleton className="h-5 w-8" />
                  </div>
                  <Skeleton className="ml-11 h-1.25 w-full rounded-full" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
