"use client";

import { useState, useTransition } from "react";
import { Zap } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { setEventSmartScheduling } from "@/lib/actions/event";

interface EventSmartSchedulingToggleProps {
  organizationId: string;
  eventId: string;
  enabled: boolean;
}

export const EventSmartSchedulingToggle = ({
  organizationId,
  eventId,
  enabled,
}: EventSmartSchedulingToggleProps) => {
  const [on, setOn] = useState(enabled);
  const [isPending, startTransition] = useTransition();

  const toggle = () => {
    const next = !on;
    setOn(next); // optimistic

    startTransition(async () => {
      const result = await setEventSmartScheduling(
        organizationId,
        eventId,
        next,
      );

      if (result.success) {
        toast.success(
          next
            ? "Declines will auto-fill for this event"
            : "Auto-fill turned off for this event",
          { position: "top-center" },
        );
      } else {
        setOn(!next); // revert
        toast.error(result.error);
      }
    });
  };

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={toggle}
      disabled={isPending}
      aria-pressed={on}
      title={
        on
          ? "Declines auto-fill from your roster"
          : "Declines won't be refilled automatically"
      }
      className={cn(
        "h-7 cursor-pointer gap-1 px-2 text-xs font-medium transition-colors",
        on
          ? "text-emerald-600 hover:text-emerald-700 dark:text-emerald-400"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Zap className={cn("h-3.5 w-3.5", on && "fill-current")} />
      Auto-fill {on ? "on" : "off"}
    </Button>
  );
};
