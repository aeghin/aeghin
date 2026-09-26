import { AndroidIcon } from "@/components/icons/brand-icons"
import { cn } from "@/lib/utils"

const APP_STORE_URL = "https://apps.apple.com/us/app/aeghin/id6809009901"

export function AppBadges({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-3", className)}>
      <a href={APP_STORE_URL} target="_blank" rel="noopener noreferrer">
        <img src="/app-store-badge.svg" alt="Download on the App Store" className="h-12 w-auto" />
      </a>
      <span className="inline-grid h-12 w-36 grid-cols-[auto_auto] content-center items-center justify-center gap-x-2 rounded-lg border border-dashed border-border text-muted-foreground">
        <span className="col-span-2 text-center text-[10px] leading-tight">Coming soon</span>
        <AndroidIcon className="h-6 w-6 text-[#3ddc84]" />
        <span className="text-lg font-semibold leading-tight text-foreground">Android</span>
      </span>
    </div>
  )
}
