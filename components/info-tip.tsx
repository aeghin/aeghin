"use client";

import { useRef, useState, type ReactNode } from "react";
import { Info } from "lucide-react";
import { Popover as PopoverPrimitive } from "radix-ui";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface InfoTipProps {
  /** What the (i) announces, e.g. "About Smart Scheduling". */
  label: string;
  children: ReactNode;
  className?: string;
}

/**
 * An (i) that explains whatever it sits beside. A mouse opens it by pointing,
 * like a tooltip; a tap or a key opens it like a popover, so a touch screen,
 * which never hovers and so never shows a tooltip, can read it too.
 */
export function InfoTip({ label, children, className }: InfoTipProps) {
  const [open, setOpen] = useState(false);
  // What last pressed it. A mouse has already opened it by pointing, so its
  // click mustn't toggle it shut again.
  const pointer = useRef<string | null>(null);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label={label}
        onPointerEnter={(event) => {
          if (event.pointerType === "mouse") setOpen(true);
        }}
        onPointerLeave={(event) => {
          if (event.pointerType === "mouse") setOpen(false);
        }}
        onPointerDown={(event) => {
          pointer.current = event.pointerType;
        }}
        onClick={(event) => {
          if (pointer.current === "mouse") event.preventDefault();
          pointer.current = null;
        }}
        className={cn(
          "inline-flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-all outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50",
          className,
        )}
      >
        <Info aria-hidden className="size-3.5" />
      </PopoverTrigger>

      <PopoverContent
        side="top"
        sideOffset={6}
        collisionPadding={16}
        // Opened by pointing, it mustn't take focus from the page, or hand it
        // back to the (i) and ring it when the mouse moves off.
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
        className="w-64 border-none bg-foreground px-3 py-2 text-xs leading-relaxed text-balance text-background"
      >
        {children}
        <PopoverPrimitive.Arrow className="size-2.5 translate-y-[calc(-50%_-_2px)] rotate-45 rounded-[2px] bg-foreground fill-foreground" />
      </PopoverContent>
    </Popover>
  );
}
