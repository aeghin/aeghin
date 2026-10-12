"use client";

import { useState, useTransition } from "react";
import { Zap } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { PlanLimitReached } from "@/components/dashboard/plan-limit-reached";
import { cn } from "@/lib/utils";
import { setEventSmartScheduling } from "@/lib/actions/event";
import { detailButtonClass, detailIconClass } from "./event-detail-parts";

interface EventSmartSchedulingToggleProps {
  organizationId: string;
  organizationName: string;
  eventId: string;
  enabled: boolean;
  // Whether the plan includes it. Without it the button explains the plan instead.
  available: boolean;
  canUpgrade: boolean;
  serviceColor: string;
  className?: string;
}

export const EventSmartSchedulingToggle = ({
  organizationId,
  organizationName,
  eventId,
  enabled,
  available,
  canUpgrade,
  serviceColor,
  className,
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
        <button
          type="button"
          onClick={() => setPlanOpen(true)}
          title="Auto-fill is part of Premium"
          className={cn(detailButtonClass(serviceColor), className)}
        >
          <Zap className={detailIconClass(serviceColor)} />
          Auto-fill{enabled ? " paused" : ""}
        </button>
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
    // As on the phone, the colour says whether it's on; the filled bolt and
    // aria-pressed say it without colour.
    <button
      type="button"
      onClick={toggle}
      disabled={isPending}
      aria-pressed={on}
      title={
        on
          ? "Declines auto-fill from your roster"
          : "Declines won't be refilled automatically"
      }
      className={cn(detailButtonClass(serviceColor, { on }), className)}
    >
      <Zap className={cn(detailIconClass(serviceColor), on && "fill-current")} />
      Auto-fill
    </button>
  );
};
