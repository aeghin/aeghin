"use client";

import { useTransition } from "react";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { startAiSetlistProCheckout } from "@/lib/actions/billing";

export function AiSetlistProUpsell({
  orgId,
  canSubscribe,
  title = "Do more with Pro",
  description = "A smarter model that researches beyond your catalog, plus an AI assistant that drafts whole events, volunteers included.",
}: {
  orgId: string;
  canSubscribe: boolean;
  /** Lead with whichever Pro feature the surrounding screen is about. */
  title?: string;
  description?: string;
}) {
  const [isPending, startTransition] = useTransition();

  const handleUpgrade = () => {
    startTransition(async () => {
      const result = await startAiSetlistProCheckout(orgId);
      if (result.success) {
        // Full navigation — Stripe Checkout is an external URL.
        window.location.href = result.url;
      } else {
        toast.error(result.error, { position: "top-center" });
      }
    });
  };

  return (
    <Card className="border-violet-500/30 bg-violet-500/5">
      <CardContent className="flex items-center gap-3 p-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-500/10">
          <Sparkles className="h-4 w-4 text-violet-600 dark:text-violet-400" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold">{title}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
          {!canSubscribe && (
            <p className="mt-1 text-xs text-muted-foreground">
              Ask an organization owner to upgrade.
            </p>
          )}
        </div>
        <Button
          size="sm"
          onClick={handleUpgrade}
          disabled={isPending || !canSubscribe}
          className="shrink-0 cursor-pointer"
        >
          {isPending ? "Redirecting…" : "Upgrade to Pro"}
        </Button>
      </CardContent>
    </Card>
  );
}
