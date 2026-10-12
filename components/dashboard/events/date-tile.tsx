import { getServiceColors } from "@/lib/config/service-types-config";
import { formatDateTile, formatShortDate, keyToDate } from "@/lib/event-format";
import { cn } from "@/lib/utils";

interface DateTileProps {
  /** The `"2026-10-18"` day the tile shows. */
  day: string;
  /** The service type's colour key. */
  color: string;
  isToday?: boolean;
  /** Filled with the service's colour — the next day still to come. */
  solid?: boolean;
  size?: "default" | "large";
}

/**
 * `OCT` / `18` / `SUN` in the service's colour, as on the phone, so a column
 * of them down the list reads as a column of days.
 */
export function DateTile({ day, color, isToday, solid, size = "default" }: DateTileProps) {
  const colors = getServiceColors(color);
  const date = keyToDate(day);
  const tile = formatDateTile(date);
  const large = size === "large";
  const label = large
    ? "text-xs leading-[15px] tracking-[0.7px]"
    : "text-[10px] leading-[13px] tracking-[0.6px]";

  return (
    <div
      className={cn(
        "flex shrink-0 flex-col items-center justify-center self-center rounded-xl border px-1 py-1.5 font-bold shadow-[0_1px_0_rgb(0_0_0/0.05)]",
        large ? "min-h-19 min-w-15" : "min-h-15 min-w-12",
        solid
          ? cn(colors.solid, colors.borderSolid, "text-white/85")
          : cn(colors.badge, colors.badgeText, "border-current/25 dark:border-current/40"),
      )}
    >
      <span className="sr-only">{isToday ? "Today" : formatShortDate(date)}</span>
      <span aria-hidden className={label}>
        {tile.month}
      </span>
      <span
        aria-hidden
        className={cn(
          "tracking-tight",
          large ? "text-2xl leading-7" : "text-lg leading-[21px]",
          solid ? "text-white" : "text-foreground",
        )}
      >
        {tile.day}
      </span>
      <span aria-hidden className={cn("uppercase", label)}>
        {isToday ? "Today" : tile.weekday}
      </span>
    </div>
  );
}
