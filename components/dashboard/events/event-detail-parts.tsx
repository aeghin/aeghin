import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

import { getServiceColors } from "@/lib/config/service-types-config";
import { cn } from "@/lib/utils";

/** The shell every section of the event page sits in, as on the phone. */
export const DETAIL_CARD = "overflow-hidden rounded-2xl border border-border bg-card";

interface DetailCardHeaderProps {
  icon: LucideIcon;
  title: string;
  /** One muted line under the title. */
  subtitle?: string;
  serviceColor: string;
  /** A count, a button — whatever the section offers at a glance. */
  trailing?: ReactNode;
}

/** A section's title bar: its glyph on a tile in the service's colour, a name, and what it adds up to. */
export function DetailCardHeader({
  icon: Icon,
  title,
  subtitle,
  serviceColor,
  trailing,
}: DetailCardHeaderProps) {
  const colors = getServiceColors(serviceColor);

  return (
    <div className="flex items-center gap-3 px-4 pt-4 pb-3 sm:px-5 sm:pt-5">
      <span
        className={cn(
          "flex size-7.5 shrink-0 items-center justify-center rounded-[10px]",
          colors.badge,
          colors.badgeText,
        )}
      >
        <Icon aria-hidden className="size-[15px]" />
      </span>

      <div className="min-w-0 flex-1">
        <h2 className="text-[15px] leading-5 font-bold tracking-tight text-foreground">{title}</h2>
        {subtitle && (
          <p className="truncate text-xs text-muted-foreground tabular-nums">{subtitle}</p>
        )}
      </div>

      {trailing}
    </div>
  );
}

/**
 * A section's small outlined button, in the event's service colour: filled for
 * the one action a section leads with, tinted while what it toggles is on.
 */
export function detailButtonClass(
  serviceColor: string,
  { primary, on }: { primary?: boolean; on?: boolean } = {},
) {
  const colors = getServiceColors(serviceColor);

  return cn(
    "inline-flex h-8.5 min-w-0 cursor-pointer items-center justify-center gap-1.5 rounded-[10px] border px-3 text-[12.5px] font-semibold whitespace-nowrap shadow-[0_1px_0_rgb(0_0_0/0.05)] transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-default disabled:opacity-50",
    primary
      ? cn(colors.solid, colors.borderSolid, colors.solidHover, "text-white")
      : on
        ? cn(colors.borderSoft, colors.badge, colors.badgeText)
        : "border-border bg-card text-foreground hover:bg-secondary/60",
  );
}

/** The icon inside a {@link detailButtonClass} button: the service's colour, or white on the filled one. */
export function detailIconClass(serviceColor: string, primary?: boolean) {
  return cn("size-3.5 shrink-0", primary ? "text-white" : getServiceColors(serviceColor).badgeText);
}
