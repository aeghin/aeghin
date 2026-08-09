"use client";

import { useState, type ReactNode } from "react";
import {
  CalendarClock,
  ChevronRight,
  MailWarning,
  TriangleAlert,
  UserSearch,
  Zap,
  ZapOff,
  type LucideIcon,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
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
          auto-fill was off, so the slot is still open
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

const formatRowTime = (date: Date) => {
  const diffDays = (Date.now() - date.getTime()) / 86_400_000;
  return diffDays < 7
    ? formatDistanceToNow(date, { addSuffix: true })
    : format(date, "MMM d, yyyy");
};

const UNFILLED_TYPES = new Set<string>([
  ActivityType.SMART_FILL_SKIPPED,
  ActivityType.SMART_FILL_NO_CANDIDATES,
  ActivityType.SMART_FILL_ALL_UNAVAILABLE,
  ActivityType.SMART_FILL_FAILED,
]);

interface SmartSchedulingActivityProps {
  enabled: boolean;
  items: SmartSchedulingActivityItem[];
  expiredCount: number;
}

export const SmartSchedulingActivity = ({
  enabled,
  items,
  expiredCount,
}: SmartSchedulingActivityProps) => {
  const [open, setOpen] = useState(false);

  const filledCount = items.filter(
    (i) => i.type === ActivityType.AUTO_INVITE_SENT,
  ).length;
  const unfilledCount = items.filter((i) => UNFILLED_TYPES.has(i.type)).length;

  if (!enabled && items.length === 0 && expiredCount === 0) return null;

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
      label: `${unfilledCount} ${unfilledCount === 1 ? "slot" : "slots"} left open`,
      className: "text-amber-600 dark:text-amber-400",
    },
    expiredCount > 0 && {
      key: "expired",
      icon: MailWarning,
      label: `${expiredCount} ${expiredCount === 1 ? "invite" : "invites"} expired`,
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
      <div className="rounded-2xl border border-border/40 bg-card/50 px-5 py-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl",
                  enabled
                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {enabled ? (
                  <Zap className="h-4 w-4 fill-current" />
                ) : (
                  <ZapOff className="h-4 w-4" />
                )}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold">Smart Scheduling</p>
                <p className="text-xs text-muted-foreground">
                  Auto-fill {enabled ? "on" : "off"}
                </p>
              </div>
            </div>

            {stats.length > 0 && (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                {stats.map((stat) => (
                  <span
                    key={stat.key}
                    className={cn(
                      "flex items-center gap-1.5 text-xs font-medium tabular-nums",
                      stat.className,
                    )}
                  >
                    <stat.icon className="h-3.5 w-3.5" />
                    {stat.label}
                  </span>
                ))}
              </div>
            )}

            {stats.length === 0 && (
              <span className="text-xs text-muted-foreground">
                No declines to fill yet
              </span>
            )}
          </div>

          <DialogTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={items.length === 0}
              className="h-8 shrink-0 cursor-pointer gap-1 self-start px-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground sm:self-auto"
            >
              View log
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </DialogTrigger>
        </div>
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
                    title={format(item.createdAt, "PPpp")}
                  >
                    {formatRowTime(item.createdAt)}
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
