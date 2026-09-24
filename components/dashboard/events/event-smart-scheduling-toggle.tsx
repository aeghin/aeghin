"use client";

import { useState, useTransition } from "react";
import { Zap } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { PlanLimitReached } from "@/components/dashboard/plan-limit-reached";
import { cn } from "@/lib/utils";
import { setEventSmartScheduling } from "@/lib/actions/event";

interface EventSmartSchedulingToggleProps {
  organizationId: string;
  organizationName: string;
  eventId: string;
  enabled: boolean;
  // Whether the plan includes it. Without it the button explains the plan instead.
  available: boolean;
  canUpgrade: boolean;
}

export const EventSmartSchedulingToggle = ({
  organizationId,
  organizationName,
  eventId,
  enabled,
  available,
  canUpgrade,
}: EventSmartSchedulingToggleProps) => {
  const [on, setOn] = useState(enabled);
  const [isPending, startTransition] = useTransition();
  const [planOpen, setPlanOpen] = useState(false);

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

  if (!available) {
    return (
      <Dialog open={planOpen} onOpenChange={setPlanOpen}>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setPlanOpen(true)}
          title="Auto-fill is part of Premium"
          className="h-7 cursor-pointer gap-1 px-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <Zap className="h-3.5 w-3.5" />
          Auto-fill {enabled ? "paused" : "off"}
        </Button>
        <DialogContent className="sm:max-w-120">
          <PlanLimitReached
            icon={Zap}
            title="Auto-fill is part of Premium"
            description="Smart Scheduling invites the next best available member when someone declines, and emails you 3 days and 1 day before an event that still isn't fully staffed."
            hint={
              enabled
                ? "This event keeps its auto-fill setting, and it picks up again after an upgrade."
                : undefined
            }
            organizationId={organizationId}
            organizationName={organizationName}
            canUpgrade={canUpgrade}
            onClose={() => setPlanOpen(false)}
          />
        </DialogContent>
      </Dialog>
    );
  }

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
