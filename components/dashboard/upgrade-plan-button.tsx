"use client";

import { useTransition } from "react";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { startPlanCheckout } from "@/lib/actions/billing";
import { PLAN_NAMES, type PaidPlan } from "@/lib/config/plans";

interface UpgradePlanButtonProps {
  orgId: string;
  plan: PaidPlan;
}

/** Starts the upgrade to the next plan. A Premium org goes to Pro through Stripe's own plan switch. */
export function UpgradePlanButton({ orgId, plan }: UpgradePlanButtonProps) {
  const [isPending, startTransition] = useTransition();

  const handleUpgrade = () => {
    startTransition(async () => {
      const result = await startPlanCheckout(orgId, plan);

      if (result.success) {
        // Full navigation — Stripe is an external URL.
        window.location.href = result.url;
      } else {
        toast.error(result.error, { position: "top-center" });
      }
    });
  };

  return (
    <Button onClick={handleUpgrade} disabled={isPending} size="sm" className="cursor-pointer">
      <Sparkles className="mr-1.5 h-3.5 w-3.5" />
      {isPending ? "Redirecting…" : `Upgrade to ${PLAN_NAMES[plan]}`}
    </Button>
  );
}
