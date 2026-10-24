"use client";

import { useState, type ReactNode } from "react";
import {
  CalendarClock,
  ChevronRight,
  TriangleAlert,
  UserSearch,
  Zap,
  ZapOff,
  type LucideIcon,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { getServiceColors } from "@/lib/config/service-types-config";
import { DETAIL_CARD, detailButtonClass, detailIconClass } from "./event-detail-parts";
import { formatDateInZone, formatDateTimeInZone } from "@/lib/time-zone";
import { ActivityType } from "@/generated/prisma/enums";
import type { SmartSchedulingActivityItem } from "@/lib/services/activity";

const rowConfig: Record<string, { icon: LucideIcon; className: string }> = {
  AUTO_INVITE_SENT: { icon: Zap, className: "bg-emerald-500/10 text-emerald-600" },
  SMART_FILL_SKIPPED: { icon: ZapOff, className: "bg-muted text-muted-foreground" },
  SMART_FILL_NO_CANDIDATES: {
    icon: UserSearch,
    className: "bg-amber-500/10 text-amber-600",
  },
  SMART_FILL_ALL_UNAVAILABLE: {
    icon: CalendarClock,
    className: "bg-amber-500/10 text-amber-600",
  },
  SMART_FILL_FAILED: {
    icon: TriangleAlert,
    className: "bg-destructive/10 text-destructive",
  },
  SMART_SCHEDULING_ENABLED: {
    icon: Zap,
    className: "bg-emerald-500/10 text-emerald-600",
  },
  SMART_SCHEDULING_DISABLED: {
    icon: ZapOff,
    className: "bg-muted text-muted-foreground",
  },
};

const Name = ({ children }: { children: ReactNode }) => (
  <span className="font-medium text-foreground">{children}</span>
);

const describeRow = (item: SmartSchedulingActivityItem): ReactNode => {
  switch (item.type) {
    case ActivityType.AUTO_INVITE_SENT:
      return item.actorName ? (
        <>
          Invited <Name>{item.targetName}</Name> after <Name>{item.actorName}</Name>{" "}
          declined
        </>
      ) : (
        <>
          Auto-invited <Name>{item.targetName}</Name>
        </>
      );
    case ActivityType.SMART_FILL_SKIPPED:
      return (
        <>
          <Name>{item.actorName}</Name> declined <Name>{item.targetName}</Name> —
          auto-fill was off, so nobody was invited
        </>
      );
    case ActivityType.SMART_FILL_NO_CANDIDATES:
      return (
        <>
          Couldn&apos;t fill <Name>{item.targetName}</Name> — nobody in this
          organization has that role
        </>
      );
    case ActivityType.SMART_FILL_ALL_UNAVAILABLE:
      return (
        <>
          Couldn&apos;t fill <Name>{item.targetName}</Name> — everyone qualified is
          unavailable
        </>
      );
    case ActivityType.SMART_FILL_FAILED:
      return (
        <>
          Hit an error filling <Name>{item.targetName}</Name> after{" "}
          <Name>{item.actorName}</Name> declined
        </>
      );
    case ActivityType.SMART_SCHEDULING_ENABLED:
      return (
        <>
          <Name>{item.actorName}</Name> turned auto-fill on
        </>
      );
    case ActivityType.SMART_SCHEDULING_DISABLED:
      return (
        <>
          <Name>{item.actorName}</Name> turned auto-fill off
        </>
      );
    default:
      return null;
  }
};

// Dates on the organization's clock, the same on the server render and in the
// browser — the server's own zone is UTC and would hydrate to another day.
const formatRowTime = (date: Date, timeZone: string) => {
  const diffDays = (Date.now() - date.getTime()) / 86_400_000;
  return diffDays < 7
    ? formatDistanceToNow(date, { addSuffix: true })
    : formatDateInZone(date, timeZone);
};

const UNFILLED_TYPES = new Set<string>([
  ActivityType.SMART_FILL_SKIPPED,
  ActivityType.SMART_FILL_NO_CANDIDATES,
  ActivityType.SMART_FILL_ALL_UNAVAILABLE,
  ActivityType.SMART_FILL_FAILED,
]);

interface SmartSchedulingActivityProps {
  enabled: boolean;
  // Whether the plan includes it. An enabled event on a plan without it is paused.
  available: boolean;
  items: SmartSchedulingActivityItem[];
  /** The organization's zone, for the rows' dates. */
  timeZone: string;
  serviceColor: string;
}

/**
 * Expired invitations used to be counted here, as a bare "N invites expired".
 * They belong on the Team card instead: invites lapse whether auto-fill is on
 * or off, so filing it under this feature implied a connection that isn't
 * there, and a number with no name attached told nobody who to chase. The
 * roster now labels the lapsed row itself and totals them in its own header.
 */
export const SmartSchedulingActivity = ({
  enabled,
  available,
  items,
  timeZone,
  serviceColor,
}: SmartSchedulingActivityProps) => {
  const [open, setOpen] = useState(false);

  const running = enabled && available;

  const filledCount = items.filter(
    (i) => i.type === ActivityType.AUTO_INVITE_SENT,
  ).length;
  const unfilledCount = items.filter((i) => UNFILLED_TYPES.has(i.type)).length;

  if (!enabled && items.length === 0) return null;

  const stats = [
    filledCount > 0 && {
      key: "filled",
      icon: Zap,
      label: `${filledCount} filled automatically`,
      className: "text-emerald-600 dark:text-emerald-400",
    },
    unfilledCount > 0 && {
      key: "unfilled",
      icon: CalendarClock,
      // History, like "filled automatically": the log can't know what the
      // roster did since, so it never claims a spot is still open.
      label: `${unfilledCount} not filled automatically`,
      className: "text-amber-600 dark:text-amber-400",
    },
  ].filter(Boolean) as {
    key: string;
    icon: LucideIcon;
    label: string;
    className: string;
  }[];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <div className={cn(DETAIL_CARD, "space-y-1.5 p-4 sm:p-5")}>
        {/* The log sits opposite the title, where the setlist keeps its
            Edit, so the counts below get the card's whole width. */}
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1 space-y-1">
            {/* The eyebrow: whether the rule is running. */}
            <p
              className={cn(
                "flex items-center gap-1 text-[10.5px] font-bold tracking-[0.8px] uppercase",
                running ? getServiceColors(serviceColor).badgeText : "text-muted-foreground",
              )}
            >
              {running ? (
                <Zap aria-hidden className="size-3 shrink-0" />
              ) : (
                <ZapOff aria-hidden className="size-3 shrink-0" />
              )}
              Auto-fill {running ? "on" : enabled ? "paused on this plan" : "off"}
            </p>
            <h2 className="text-[15px] leading-5 font-bold tracking-tight text-foreground">
              Smart Scheduling
            </h2>
          </div>

          {items.length > 0 && (
            <DialogTrigger asChild>
              <button type="button" className={cn(detailButtonClass(serviceColor), "shrink-0")}>
                View log
                <ChevronRight className={detailIconClass(serviceColor)} />
              </button>
            </DialogTrigger>
          )}
        </div>

        {stats.length > 0 ? (
          <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1">
            {stats.map((stat) => (
              <span
                key={stat.key}
                className={cn(
                  "flex items-center gap-1.5 text-[12.5px] font-semibold tabular-nums",
                  stat.className,
                )}
              >
                <stat.icon className="h-3 w-3" />
                {stat.label}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-[12.5px] text-muted-foreground">No declines to fill yet</p>
        )}
      </div>

      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Smart Scheduling log</DialogTitle>
          <DialogDescription>
            Every auto-fill attempt for this event, newest first.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[55vh] space-y-1 overflow-y-auto pr-1">
          {items.map((item) => {
            const config = rowConfig[item.type];
            if (!config) return null;
            const Icon = config.icon;

            return (
              <div
                key={item.id}
                className="flex min-w-0 items-start gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-muted/50"
              >
                <div
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl",
                    config.className,
                  )}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 space-y-0.5">
                  <p className="text-sm text-muted-foreground">
                    {describeRow(item)}
                  </p>
                  <p
                    className="text-xs text-muted-foreground"
                    title={formatDateTimeInZone(item.createdAt, timeZone)}
                  >
                    {formatRowTime(item.createdAt, timeZone)}
                    {item.detail && ` · ${item.detail}`}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
};
