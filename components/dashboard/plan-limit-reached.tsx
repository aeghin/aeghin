"use client";

import { useTransition } from "react";
import { Check, Sparkles, type LucideIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { startAiSetlistCheckout, startAiSetlistProCheckout } from "@/lib/actions/billing";
import { PLAN_LIMITS, PLAN_NAMES, PLAN_PRICES, formatStorage } from "@/lib/config/plans";

// What the limit screens say each paid plan adds. Keep it to what the plan does today.
const PLAN_PERKS: Record<"premium" | "pro", string[]> = {
  premium: [
    "Unlimited members and songs",
    "Smart Scheduling fills declines for you",
    `${PLAN_LIMITS.premium.bulkEmails} group emails a month`,
    `${formatStorage(PLAN_LIMITS.premium.storage)} of storage for charts and audio`,
    "AI setlist generation from your song library",
    "Billed per organization, cancel anytime",
  ],
  pro: [
    "Everything in Premium",
    `${PLAN_LIMITS.pro.bulkEmails} group emails a month`,
    `${formatStorage(PLAN_LIMITS.pro.storage)} of storage for charts and audio`,
    "AI event drafting and a more capable AI model",
    "Billed per organization, cancel anytime",
  ],
};

interface PlanLimitReachedProps {
  icon: LucideIcon;
  title: string;
  description: string;
  // One more line under the plan panel, like how to free a spot instead.
  hint?: string;
  organizationId?: string;
  organizationName?: string;
  canUpgrade: boolean;
  // The plan that lifts this limit. Null when none does, like Pro's allowances.
  upgradeTo?: "premium" | "pro" | null;
  onClose: () => void;
}

/**
 * What a dialog shows instead of its form when an organization is at a plan
 * limit. Owners get the upgrade; everyone else is told who can.
 */
export function PlanLimitReached({
  icon: Icon,
  title,
  description,
  hint,
  organizationId,
  organizationName,
  canUpgrade,
  upgradeTo = "premium",
  onClose,
}: PlanLimitReachedProps) {
  const [isUpgrading, startUpgrade] = useTransition();

  const offersUpgrade = upgradeTo !== null && canUpgrade;

  const handleUpgrade = () => {
    if (!organizationId || upgradeTo === null) return;

    startUpgrade(async () => {
      const start = upgradeTo === "pro" ? startAiSetlistProCheckout : startAiSetlistCheckout;
      const result = await start(organizationId);

      if (result.success) {
        // Full navigation — Stripe is an external URL.
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

      {upgradeTo !== null && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
          <div className="flex items-baseline justify-between gap-2">
            <p className="flex items-center gap-1.5 font-semibold">
              <Sparkles className="h-4 w-4 text-primary" />
              {PLAN_NAMES[upgradeTo]}
            </p>
            <p className="text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">{PLAN_PRICES[upgradeTo]}</span>/month
            </p>
          </div>
          <ul className="mt-3 space-y-2 text-sm">
            {PLAN_PERKS[upgradeTo].map((perk) => (
              <li key={perk} className="flex items-start gap-2">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                {perk}
              </li>
            ))}
          </ul>
        </div>
      )}

      {hint && (
        <p className="text-center text-xs text-muted-foreground">{hint}</p>
      )}

      {upgradeTo !== null && !canUpgrade && (
        <p className="text-center text-sm text-muted-foreground">
          Only an owner can upgrade. Ask an owner of {organizationName ?? "your organization"} to upgrade to {PLAN_NAMES[upgradeTo]}.
        </p>
      )}

      <DialogFooter className="gap-2 sm:justify-center">
        <Button variant="outline" onClick={onClose} className="w-full cursor-pointer sm:w-auto">
          {offersUpgrade ? "Not now" : "Close"}
        </Button>
        {offersUpgrade && (
          <Button onClick={handleUpgrade} disabled={isUpgrading} className="w-full cursor-pointer sm:w-auto">
            <Sparkles className="mr-2 h-4 w-4" />
            {isUpgrading ? "Redirecting…" : `Upgrade to ${PLAN_NAMES[upgradeTo]}`}
          </Button>
        )}
      </DialogFooter>
    </>
  );
}
