import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { getPlanUsage } from "@/lib/billing/limits";
import { PLAN_LIMITS, formatStorage, type OrgPlan } from "@/lib/config/plans";
import { UpgradePlanButton } from "./upgrade-plan-button";

const PLAN_NAMES: Record<OrgPlan, string> = { free: "Free", premium: "Premium", pro: "Pro" };

// From this share of a limit the row turns amber, so the wall is never a surprise.
const WARN_AT = 0.8;

/** What a plan includes, from the same numbers the checks use. */
function planSummary(plan: OrgPlan): string {
  const { members, songs, storage } = PLAN_LIMITS[plan];

  return members !== null && songs !== null
    ? `${PLAN_NAMES[plan]} includes up to ${members} members, ${songs} songs and ${formatStorage(storage)} of storage.`
    : `${PLAN_NAMES[plan]} has no member or song limit, and ${formatStorage(storage)} of storage.`;
}

interface PlanUsageSectionProps {
  organizationId: string;
  isOwner: boolean;
}

/** The organization's plan and how much of it is in use. Owners and admins see it. */
export const PlanUsageSection = async ({ organizationId, isOwner }: PlanUsageSectionProps) => {
  const { plan, members, songs, storage } = await getPlanUsage(organizationId);

  const nextPlan = plan === "free" ? "premium" : plan === "premium" ? "pro" : null;

  // Pending invites hold seats too, so they fill the bar and come off what's left.
  const seatsUsed = members.used + members.pending;
  const invited = members.pending > 0 ? `${members.pending} invited · ` : "";

  return (
    <section className="rounded-xl border border-border/40 bg-secondary/10 p-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">Plan &amp; usage</h3>
        <Badge variant="secondary">{PLAN_NAMES[plan]}</Badge>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{planSummary(plan)}</p>

      <div className="mt-4 flex flex-col gap-4">
        <UsageRow
          label="Members"
          value={members.limit === null ? `${members.used}` : `${members.used} / ${members.limit}`}
          detail={
            members.limit === null
              ? `${invited}No limit`
              : `${invited}${seatsUsed >= members.limit ? "Limit reached" : `${members.limit - seatsUsed} left`}`
          }
          used={seatsUsed}
          limit={members.limit}
        />
        <UsageRow
          label="Songs"
          value={songs.limit === null ? `${songs.used}` : `${songs.used} / ${songs.limit}`}
          detail={
            songs.limit === null
              ? "No limit"
              : songs.used >= songs.limit ? "Limit reached" : `${songs.limit - songs.used} left`
          }
          used={songs.used}
          limit={songs.limit}
        />
        <UsageRow
          label="Storage"
          value={`${formatStorage(storage.used)} / ${formatStorage(storage.limit)}`}
          detail={storage.used >= storage.limit ? "Full" : `${formatStorage(storage.limit - storage.used)} left`}
          used={storage.used}
          limit={storage.limit}
        />
      </div>

      {nextPlan && (
        <div className="mt-5">
          {isOwner ? (
            <UpgradePlanButton orgId={organizationId} plan={nextPlan} />
          ) : (
            <p className="text-xs text-muted-foreground">Only an owner can change the plan.</p>
          )}
        </div>
      )}
    </section>
  );
};

interface UsageRowProps {
  label: string;
  value: string;
  detail: string;
  used: number;
  // Null means no limit, and no bar.
  limit: number | null;
}

function UsageRow({ label, value, detail, used, limit }: UsageRowProps) {
  const ratio = limit ? used / limit : 0;
  const warn = limit !== null && ratio >= WARN_AT;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-medium">{label}</span>
        <span
          className={cn(
            "tabular-nums",
            warn ? "font-medium text-amber-600 dark:text-amber-400" : "text-muted-foreground",
          )}
        >
          {value}
        </span>
      </div>
      {limit !== null && (
        <Progress value={Math.min(100, ratio * 100)} aria-label={`${label} used`} />
      )}
      <p className={cn("text-xs", warn ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground")}>
        {detail}
      </p>
    </div>
  );
}
