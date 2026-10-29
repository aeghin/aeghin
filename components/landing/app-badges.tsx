import { cn } from "@/lib/utils"

const APP_STORE_URL = "https://apps.apple.com/us/app/aeghin/id6809009901"

export function AppBadges({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-3", className)}>
      <a href={APP_STORE_URL} target="_blank" rel="noopener noreferrer">
        <img src="/app-store-badge.svg" alt="Download on the App Store" className="h-12 w-auto" />
      </a>
      <span className="relative">
        <img
          src="/google-play-badge.svg"
          alt="Google Play, coming soon"
          className="h-12 w-auto opacity-50 grayscale"
        />
        <span className="absolute -top-3 -right-2 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold leading-tight text-primary-foreground">
          Coming soon
        </span>
      </span>
    </div>
  )
}
