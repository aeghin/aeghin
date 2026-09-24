"use client";

import { useTransition } from "react";
import { Check, Sparkles, type LucideIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { startAiSetlistCheckout } from "@/lib/actions/billing";
import { PLAN_PRICES } from "@/lib/config/plans";

// What the limit screens say Premium adds. Keep it to what Premium does today.
const PREMIUM_PERKS = [
  "Unlimited members and songs",
  "AI setlist generation from your song library",
  "Billed per organization, cancel anytime",
];

interface PlanLimitReachedProps {
  icon: LucideIcon;
  title: string;
  description: string;
  // One more line under the Premium panel, like how to free a spot instead.
  hint?: string;
  organizationId?: string;
  organizationName?: string;
  canUpgrade: boolean;
  onClose: () => void;
}

/**
 * What a dialog shows instead of its form when a Free organization is at a
 * plan limit. Owners get the upgrade; everyone else is told who can.
 */
export function PlanLimitReached({
  icon: Icon,
  title,
  description,
  hint,
  organizationId,
  organizationName,
  canUpgrade,
  onClose,
}: PlanLimitReachedProps) {
  const [isUpgrading, startUpgrade] = useTransition();

  const handleUpgrade = () => {
    if (!organizationId) return;

    startUpgrade(async () => {
      const result = await startAiSetlistCheckout(organizationId);

      if (result.success) {
        // Full navigation — Stripe Checkout is an external URL.
        window.location.href = result.url;
      } else {
        toast.error(result.error, { position: "top-center" });
      }
    });
  };

  return (
    <>
      <div className="flex flex-col items-center pt-4 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
          <Icon className="h-8 w-8 text-primary" />
        </div>
        <DialogTitle className="mb-2 text-xl">{title}</DialogTitle>
        <DialogDescription className="text-center">{description}</DialogDescription>
      </div>

      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
        <div className="flex items-baseline justify-between gap-2">
          <p className="flex items-center gap-1.5 font-semibold">
            <Sparkles className="h-4 w-4 text-primary" />
            Premium
          </p>
          <p className="text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">{PLAN_PRICES.premium}</span>/month
          </p>
        </div>
        <ul className="mt-3 space-y-2 text-sm">
          {PREMIUM_PERKS.map((perk) => (
            <li key={perk} className="flex items-start gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              {perk}
            </li>
          ))}
        </ul>
      </div>

      {hint && (
        <p className="text-center text-xs text-muted-foreground">{hint}</p>
      )}

      {!canUpgrade && (
        <p className="text-center text-sm text-muted-foreground">
          Only an owner can upgrade. Ask an owner of {organizationName ?? "your organization"} to upgrade to Premium.
        </p>
      )}

      <DialogFooter className="gap-2 sm:justify-center">
        <Button variant="outline" onClick={onClose} className="w-full cursor-pointer sm:w-auto">
          {canUpgrade ? "Not now" : "Close"}
        </Button>
        {canUpgrade && (
          <Button onClick={handleUpgrade} disabled={isUpgrading} className="w-full cursor-pointer sm:w-auto">
            <Sparkles className="mr-2 h-4 w-4" />
            {isUpgrading ? "Redirecting…" : "Upgrade to Premium"}
          </Button>
        )}
      </DialogFooter>
    </>
  );
}
