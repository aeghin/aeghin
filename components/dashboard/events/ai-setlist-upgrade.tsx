"use client";

import { useState, useTransition } from "react";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  startAiSetlistCheckout,
  startAiSetlistProCheckout,
} from "@/lib/actions/billing";

type Plan = "premium" | "pro";

export function AiSetlistUpgrade({
  orgId,
  canSubscribe,
}: {
  orgId: string;
  canSubscribe: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [pendingPlan, setPendingPlan] = useState<Plan | null>(null);

  const subscribe = (plan: Plan) => {
    setPendingPlan(plan);
    startTransition(async () => {
      const start =
        plan === "pro" ? startAiSetlistProCheckout : startAiSetlistCheckout;
      const result = await start(orgId);
      if (result.success) {
        // Full navigation — Stripe Checkout is an external URL.
        window.location.href = result.url;
      } else {
        toast.error(result.error, { position: "top-center" });
        setPendingPlan(null);
      }
    });
  };

  return (
    <Card>
      <CardContent className="flex h-120 flex-col gap-4 p-4">
        <div className="text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
            <Sparkles className="h-6 w-6 text-primary" />
          </div>
          <p className="mt-3 text-sm font-semibold">AI setlist generation</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Describe the vibe and let AI build the setlist. Pick a plan to
            unlock it.
          </p>
          {!canSubscribe && (
            <p className="mt-2 text-xs text-muted-foreground">
              Reach out to an organization owner to subscribe.
            </p>
          )}
        </div>

        <div className="space-y-3">
          <div className="rounded-lg border p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold">Premium</p>
              <Sparkles className="h-3.5 w-3.5 text-primary" />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Build setlists from your organization&apos;s song catalog.
            </p>
            <Button
              size="sm"
              onClick={() => subscribe("premium")}
              disabled={isPending || !canSubscribe}
              className="mt-3 w-full cursor-pointer"
            >
              {pendingPlan === "premium" ? "Redirecting…" : "Get Premium"}
            </Button>
          </div>

          <div className="rounded-lg border border-violet-500/30 bg-violet-500/5 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold">Pro</p>
              <Sparkles className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              A smarter model that researches beyond your catalog, plus AI event
              drafting with volunteer picks.
            </p>
            <Button
              size="sm"
              onClick={() => subscribe("pro")}
              disabled={isPending || !canSubscribe}
              className="mt-3 w-full cursor-pointer"
            >
              {pendingPlan === "pro" ? "Redirecting…" : "Get Pro"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
