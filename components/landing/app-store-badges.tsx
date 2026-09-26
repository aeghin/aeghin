import { AndroidIcon } from "@/components/icons/brand-icons"
import { APP_STORE_URL } from "@/lib/constants/app-stores"
import { cn } from "@/lib/utils"

export function AppStoreBadges({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-3", className)}>
      <a
        href={APP_STORE_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="rounded-[10px] transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <img
          src="/app-store-badge.svg"
          alt="Download on the App Store"
          width={120}
          height={40}
          className="h-12 w-auto"
        />
      </a>
      <div className="flex h-12 items-center gap-2.5 rounded-[10px] border border-dashed border-muted-foreground/40 px-4 text-muted-foreground select-none">
        <AndroidIcon className="h-6 w-6" />
        <div className="flex flex-col text-left leading-tight">
          <span className="text-[10px] font-medium uppercase tracking-wider">Coming soon</span>
          <span className="text-base font-semibold">Android</span>
        </div>
      </div>
    </div>
  )
}
