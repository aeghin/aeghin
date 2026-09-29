"use client";

import { useState, useTransition } from "react";
import { Eye } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { setEventWatch } from "@/lib/actions/team-notifications";

interface EventWatchToggleProps {
  organizationId: string;
  eventId: string;
  watching: boolean;
}

/**
 * The caller watching this event: a heads-up about every staffing alert on it
 * — whoever is asked to fill a role, they hear who has it.
 */
export const EventWatchToggle = ({
  organizationId,
  eventId,
  watching,
}: EventWatchToggleProps) => {
  const [on, setOn] = useState(watching);
  const [isPending, startTransition] = useTransition();

  const toggle = () => {
    const next = !on;
    setOn(next); // optimistic

    startTransition(async () => {
      const result = await setEventWatch({
        organizationId,
        eventId,
        watching: next,
      });

      if (result.success) {
        toast.success(
          next
            ? "You'll get a heads-up about this event's staffing"
            : "Stopped watching this event",
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
          ? "You get a heads-up about every staffing alert on this event"
          : "Get a heads-up about every staffing alert on this event"
      }
      className={cn(
        "h-7 cursor-pointer gap-1 px-2 text-xs font-medium transition-colors",
        on
          ? "text-sky-600 hover:text-sky-700 dark:text-sky-400"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Eye className="h-3.5 w-3.5" />
      {on ? "Watching" : "Watch"}
    </Button>
  );
};
