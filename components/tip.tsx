"use client";

import type { ReactNode } from "react";
import { m } from "motion/react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

interface TipProps {
  icon: LucideIcon;
  title: string;
  message: ReactNode;
  onDismiss: () => void;
  /** The end of the bubble its arrow sits at, under the thing it points to. */
  align?: "start" | "end";
  className?: string;
}

/**
 * A one-time hint pointing up at whatever sits just above it, as on the phone:
 * the page's ink as its fill, so it reads as a note on the page rather than
 * part of it, in either scheme. Pair it with `useTip` so "Got it" is
 * remembered.
 */
export function Tip({
  icon: Icon,
  title,
  message,
  onDismiss,
  align = "start",
  className,
}: TipProps) {
  return (
    <m.div
      role="note"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
      // A note's width, not a banner's, at the end its arrow points from.
      className={cn("relative max-w-md pt-2", align === "end" && "ml-auto", className)}
    >
      <div className="space-y-2.5 rounded-2xl bg-foreground px-4 py-3 text-background shadow-lg">
        <div className="flex items-start gap-3">
          <Icon aria-hidden className="mt-px size-4.5 shrink-0" />
          <div className="min-w-0 flex-1 space-y-0.5">
            <p className="text-sm font-semibold">{title}</p>
            <p className="text-[13px] leading-[18px] text-background/75">{message}</p>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={onDismiss}
            className="cursor-pointer rounded-full bg-background px-3.5 py-1.5 text-[13px] font-semibold text-foreground transition-all hover:opacity-80"
          >
            Got it
          </button>
        </div>
      </div>

      {/* The arrow: a square turned on its point, half tucked into the
          bubble, and drawn after it so the bubble's shadow stays off it. */}
      <div
        aria-hidden
        className={cn(
          "absolute top-0.5 size-3 rotate-45 bg-foreground",
          align === "end" ? "right-5" : "left-5",
        )}
      />
    </m.div>
  );
}
