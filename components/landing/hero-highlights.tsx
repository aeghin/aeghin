import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"
import { BellRing, Check, Sparkles, Users, X, Zap } from "lucide-react"
import { RoleChip } from "@/components/dashboard/events/event-card"
import { getServiceColors } from "@/lib/config/service-types-config"
import { cn } from "@/lib/utils"

// Four moments from the app beside the hero screenshot: an invitation, the
// day-before push, an AI setlist draft and a Smart Scheduling refill. Each is
// worded as the app words it, for the Riverbend demo church in the picture.
// The cards are pictures, so readers get only their captions.

const prayerNight = getServiceColors("emerald")
const sundayWorship = getServiceColors("indigo")

/** A card floating over the screenshot, frosted so the page shows through. */
const card =
  "rounded-2xl border border-border bg-card/90 px-4 py-3.5 text-left shadow-[0_1px_2px_rgb(0_0_0/0.04),0_16px_36px_-14px_rgb(0_0_0/0.25)] backdrop-blur-md"

/** The marketing line under a card that stands alone. */
function Caption({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <figcaption className="mt-2.5 flex items-center gap-1.5 text-[12.5px] font-medium text-muted-foreground">
      <Icon aria-hidden className="size-3.5 shrink-0 text-primary" />
      {children}
    </figcaption>
  )
}

/** The marketing line along the bottom of a card that holds it. */
function Footer({ children }: { children: ReactNode }) {
  return (
    <figcaption className="-mx-4 mt-3 -mb-3.5 border-t border-border px-4 pt-2.5 pb-3 text-[12.5px] font-medium text-muted-foreground">
      {children}
    </figcaption>
  )
}

/** A tinted icon square, as the app's cards head their content. */
function Tile({ icon: Icon, className }: { icon: LucideIcon; className: string }) {
  return (
    <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-[9px]", className)}>
      <Icon className="size-4" />
    </span>
  )
}

/** As the Pending tab shows it. */
function InviteHighlight() {
  return (
    <figure>
      <div aria-hidden className={cn(card, "w-62.5")}>
        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              "rounded-md px-2 py-0.5 text-xs font-medium",
              prayerNight.badge,
              prayerNight.badgeText,
            )}
          >
            Prayer Night
          </span>
          <RoleChip role="LEAD_VOCALIST" />
        </div>
        <p className="mt-2 text-[15px] font-semibold tracking-tight text-foreground">
          Worship &amp; Prayer
        </p>
        <p className="mt-0.5 text-[12.5px] text-muted-foreground">Wed, Oct 21 · 7:00 PM · Chapel</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <span className="flex h-8 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 text-[13px] font-semibold text-white">
            <Check className="size-3.5" />
            Accept
          </span>
          <span className="flex h-8 items-center justify-center gap-1.5 rounded-lg border border-destructive/45 bg-destructive/5 text-[13px] font-semibold text-destructive">
            <X className="size-3.5" />
            Decline
          </span>
        </div>
      </div>
      <Caption icon={Users}>Invited by the roles they actually play</Caption>
    </figure>
  )
}

/** The day-before reminder, as a phone shows the push. */
function PushHighlight() {
  return (
    <figure>
      <div
        aria-hidden
        className="w-67 rounded-[20px] border border-white/70 bg-muted/85 px-3.5 pt-3 pb-3.5 text-left shadow-[0_1px_2px_rgb(0_0_0/0.05),0_18px_40px_-16px_rgb(0_0_0/0.3)] backdrop-blur-lg dark:border-white/10"
      >
        <div className="flex items-center gap-1.5 text-[11.5px] tracking-wide text-muted-foreground uppercase">
          <img src="/aeghin-icon.svg" alt="" className="size-5 rounded-[5px]" />
          Aeghin
          <span className="ml-auto tracking-normal normal-case">now</span>
        </div>
        <p className="mt-1.5 text-sm font-semibold text-foreground">Tomorrow: Communion Sunday</p>
        <p className="text-[13px] font-medium text-foreground">Riverbend Church</p>
        <p className="text-[13px] text-foreground/75">
          Lead Vocalist · Sun, Oct 18 · 9:30 AM
          <br />
          Main Sanctuary
        </p>
      </div>
      <Caption icon={BellRing}>A reminder the day before they serve</Caption>
    </figure>
  )
}

const draft = [
  ["Come Thou Fount of Every Blessing", "Eb"],
  ["Amazing Grace", "G"],
  ["It Is Well With My Soul", "Db"],
]

/** As the setlist editor's AI tab answers one of its own suggestions. */
function AiSetlistHighlight() {
  return (
    <figure className={cn(card, "w-67")}>
      <div aria-hidden>
        <div className="flex items-center gap-2.5">
          <Tile icon={Sparkles} className={cn(sundayWorship.badge, sundayWorship.badgeText)} />
          <div>
            <p className="text-sm font-semibold text-foreground">Generate a setlist</p>
            <p className="text-[12.5px] text-muted-foreground">Communion Sunday</p>
          </div>
        </div>
        <p
          className={cn(
            "mt-3 ml-auto w-fit max-w-[92%] rounded-xl rounded-br-sm px-3 py-1.5 text-[12.5px] text-white",
            sundayWorship.solid,
          )}
        >
          Songs about grace, building toward communion
        </p>
        <ol className="mt-3 grid grid-cols-1 gap-1.5">
          {draft.map(([title, key], index) => (
            <li key={title} className="flex items-center gap-2 text-[12.5px]">
              <span className="flex size-4.5 shrink-0 items-center justify-center rounded-[5px] bg-muted text-[11px] text-muted-foreground">
                {index + 1}
              </span>
              <span className="min-w-0 flex-1 truncate font-medium text-foreground">{title}</span>
              <span className="shrink-0 rounded-full border border-border px-1.5 text-[11px] font-semibold text-foreground">
                {key}
              </span>
            </li>
          ))}
        </ol>
      </div>
      <Footer>Drafted from your own song library.</Footer>
    </figure>
  )
}

/** One line of the event's Smart Scheduling log. */
function Step({ icon: Icon, tone, children }: { icon: LucideIcon; tone: string; children: ReactNode }) {
  return (
    <li className="flex items-center gap-2 text-[12.5px] text-foreground">
      <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-full", tone)}>
        <Icon className="size-3" />
      </span>
      <span>{children}</span>
    </li>
  )
}

/** A declined spot refilling itself, as the event's log tells it. */
function SmartSchedulingHighlight() {
  return (
    <figure className={cn(card, "w-64")}>
      <div aria-hidden>
        <div className="flex items-center gap-2.5">
          <Tile icon={Zap} className="bg-emerald-500/10 text-emerald-600" />
          <div>
            <p className="text-sm font-semibold text-foreground">Smart Scheduling</p>
            <p className="text-[12.5px] text-muted-foreground">Communion Sunday · Usher</p>
          </div>
        </div>
        <ol className="mt-3 grid grid-cols-1 gap-2">
          <Step icon={X} tone="bg-destructive/10 text-destructive">
            <b className="font-semibold">Daniel Wright</b> declined
          </Step>
          <Step icon={Zap} tone="bg-emerald-500/10 text-emerald-600">
            Invited <b className="font-semibold">Aaron Price</b>
          </Step>
          <Step icon={Check} tone="bg-emerald-500 text-white">
            <b className="font-semibold">Aaron Price</b> accepted
          </Step>
        </ol>
      </div>
      <Footer>Declined spots refill themselves.</Footer>
    </figure>
  )
}

/**
 * Wide screens: the four hang off the screenshot's edges, staggered so no two
 * sit level. Goes inside the screenshot's positioned wrapper.
 */
export function HeroHighlights() {
  return (
    <div className="hidden min-[1400px]:block">
      <div className="absolute top-[6%] right-0 translate-x-[66%]">
        <AiSetlistHighlight />
      </div>
      <div className="absolute top-[39%] left-0 -translate-x-[56%]">
        <InviteHighlight />
      </div>
      <div className="absolute top-[52%] right-0 translate-x-[66%]">
        <SmartSchedulingHighlight />
      </div>
      <div className="absolute top-[64%] left-0 -translate-x-[56%]">
        <PushHighlight />
      </div>
    </div>
  )
}

/**
 * Narrower screens: the same four under the screenshot, in a row you swipe —
 * edge to edge on phones, centred once they fit.
 */
export function HeroHighlightsRail() {
  return (
    <div className="-mx-6 mt-8 flex snap-x snap-mandatory items-start gap-3.5 overflow-x-auto px-6 pt-1.5 pb-4 [scrollbar-width:none] sm:mx-auto sm:w-fit sm:max-w-full sm:px-0 min-[1400px]:hidden">
      <div className="shrink-0 snap-center">
        <InviteHighlight />
      </div>
      <div className="shrink-0 snap-center">
        <PushHighlight />
      </div>
      <div className="shrink-0 snap-center">
        <AiSetlistHighlight />
      </div>
      <div className="shrink-0 snap-center">
        <SmartSchedulingHighlight />
      </div>
    </div>
  )
}
