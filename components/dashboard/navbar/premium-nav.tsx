"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname } from "next/navigation";
import { ChevronDown, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  getOrgPremiumStatus,
  startAiSetlistCheckout,
  startAiSetlistProCheckout,
} from "@/lib/actions/billing";

type Status = { hasPremium: boolean; hasPro: boolean; canSubscribe: boolean };

export function PremiumNav() {
  const pathname = usePathname();
  // Same derivation NavLinks uses, so this targets the org in view.
  const orgId = pathname.match(/^\/dashboard\/organizations\/([^/]+)/)?.[1];

  const [status, setStatus] = useState<Status | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!orgId) {
      setStatus(null);
      return;
    }
    let active = true;
    getOrgPremiumStatus(orgId)
      .then((s) => {
        if (active) setStatus(s);
      })
      .catch(() => {
        // Fail safe: a status fetch error must never break the navbar.
        if (active) setStatus(null);
      });
    return () => {
      active = false;
    };
  }, [orgId]);

  // Render nothing until we know the status (also avoids SSR/CSR mismatch).
  if (!orgId || !status) return null;

  if (status.hasPro) {
    return (
      <Badge
        variant="secondary"
        className="gap-1 border-violet-500/30 bg-violet-500/10 text-violet-600 dark:text-violet-400"
      >
        <Sparkles className="h-3 w-3" />
        Pro
      </Badge>
    );
  }

  if (status.hasPremium) {
    return (
      <Badge
        variant="secondary"
        className="gap-1 border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400"
      >
        <Sparkles className="h-3 w-3" />
        Premium
      </Badge>
    );
  }

  
  if (!status.canSubscribe) return null;

  const subscribe = (plan: "premium" | "pro") => {
    startTransition(async () => {
      const start =
        plan === "pro" ? startAiSetlistProCheckout : startAiSetlistCheckout;
      const result = await start(orgId);
      if (result.success) {
        window.location.href = result.url;
      } else {
        toast.error(result.error, { position: "top-center" });
      }
    });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" disabled={isPending} className="cursor-pointer">
          <Sparkles className="mr-1.5 h-3.5 w-3.5" />
          {isPending ? "Redirecting…" : "Upgrade"}
          <ChevronDown className="ml-1 h-3.5 w-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem
          onClick={() => subscribe("premium")}
          className="flex-col items-start gap-0.5 cursor-pointer"
        >
          <span className="text-sm font-medium">Premium</span>
          <span className="text-xs text-muted-foreground">
            Unlimited members + AI setlists
          </span>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => subscribe("pro")}
          className="flex-col items-start gap-0.5 cursor-pointer"
        >
          <span className="text-sm font-medium">Pro</span>
          <span className="text-xs text-muted-foreground">
            Smarter model + web search
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
