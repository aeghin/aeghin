"use client";

import { useTransition } from "react";
import Link from "next/link";
import { Bell, CircleCheck, Inbox, TriangleAlert } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/actions/notification";
import type { NotificationItem } from "@/lib/types";
import { cn } from "@/lib/utils";

interface NotificationsMenuProps {
  items: NotificationItem[];
  unreadCount: number;
}

// Outside the component: static, and not worth recreating per render.
const CATEGORY_ICONS = {
  ROSTER_ATTENTION: TriangleAlert,
  AWAITING_RESPONSE: Inbox,
  FULLY_STAFFED: CircleCheck,
} as const;

// The category split is the only structural information in this list, so it
// gets the widest gap the palette allows: brand orange against a cool blue,
// and green for the one row that asks nothing of anybody. Two warm tints read
// as one category at a glance, and the icons alone cannot carry the difference
// between "your event needs people" and "you owe someone an answer".
//
// The dark variants are explicit because these are the only raw palette values
// in the file — everything else is a semantic token that flips on its own, and
// sky-600 or emerald-600 on a near-black surface would not.
const CATEGORY_COLORS = {
  ROSTER_ATTENTION: "bg-primary/15 text-primary",
  AWAITING_RESPONSE:
    "bg-sky-500/10 text-sky-600 dark:bg-sky-400/10 dark:text-sky-400",
  FULLY_STAFFED:
    "bg-emerald-500/10 text-emerald-600 dark:bg-emerald-400/10 dark:text-emerald-400",
} as const;

/**
 * The line a notification carries.
 *
 * Deliberately vague: a count and an event name, never which roles or who
 * declined. The app is one tap away and always current, so detail here buys
 * nothing and costs the one thing a notification cannot afford — being wrong by
 * the time it is read.
 */
const describe = (item: NotificationItem) => {
  if (item.category === "AWAITING_RESPONSE") return "Waiting on your answer";
  if (item.category === "FULLY_STAFFED") return "Fully staffed";

  return item.count === 1
    ? "1 role still open"
    : `${item.count} roles still open`;
};

/**
 * Where a row takes you. A volunteer answers from the organization page — the
 * event page only opens for managers and people who have already accepted, so
 * an invitation still waiting on them would land on a 404 there. Every
 * "You've been assigned" email links to the organization page for the same
 * reason.
 */
const hrefFor = (item: NotificationItem) =>
  item.category === "AWAITING_RESPONSE"
    ? `/dashboard/organizations/${item.organizationId}`
    : `/dashboard/organizations/${item.organizationId}/events/${item.eventId}`;

export function NotificationsMenu({
  items,
  unreadCount,
}: NotificationsMenuProps) {
  const [, startTransition] = useTransition();

  const handleMarkAllRead = () => {
    startTransition(async () => {
      await markAllNotificationsRead();
    });
  };

  const handleOpen = (item: NotificationItem) => {
    if (!item.unread) return;

    startTransition(async () => {
      await markNotificationRead(item.id);
    });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={
            unreadCount > 0
              ? `Notifications, ${unreadCount} unread`
              : "Notifications"
          }
          className="relative h-9 w-9 cursor-pointer rounded-lg transition-all duration-200 hover:bg-muted/80 hover:scale-105"
        >
          <Bell className="h-4.5 w-4.5" />
          {unreadCount > 0 && (
            // Hidden from the reader: the badge truncates at 9+, and the label
            // above carries the real number.
            <span
              aria-hidden="true"
              className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground ring-2 ring-background"
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        className="w-[min(20rem,calc(100vw-2rem))] p-0"
      >
        <DropdownMenuLabel className="flex items-center justify-between px-4 py-3">
          <span className="text-sm font-semibold">Notifications</span>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-auto cursor-pointer p-0 text-xs font-medium text-primary transition-all hover:bg-transparent hover:text-primary/80"
              onClick={handleMarkAllRead}
            >
              Mark all read
            </Button>
          )}
        </DropdownMenuLabel>

        <DropdownMenuSeparator className="m-0" />

        {items.length === 0 ? (
          // Honest, because rows are deleted once the roster is fixed rather
          // than left behind to be marked read.
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted/50">
              <Bell className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-muted-foreground">
              No notifications
            </p>
            <p className="mt-1 text-xs text-muted-foreground/70">
              You&apos;re all caught up!
            </p>
          </div>
        ) : (
          <div className="max-h-100 overflow-y-auto">
            {items.map((item) => {
              const Icon = CATEGORY_ICONS[item.category];
              const colorClass = CATEGORY_COLORS[item.category];

              return (
                <DropdownMenuItem
                  key={item.id}
                  asChild
                  className="cursor-pointer focus:bg-muted/50"
                >
                  <Link
                    href={hrefFor(item)}
                    onClick={() => handleOpen(item)}
                    className="flex items-start gap-3 px-4 py-3"
                  >
                    <div
                      className={cn(
                        "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-transform",
                        colorClass,
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium leading-tight">
                          {item.eventName}
                        </span>
                        {item.unread && (
                          <>
                            {/* The dot is the only thing separating a read row
                                from an unread one, so it has to say so. */}
                            <span className="sr-only">Unread</span>
                            <span
                              aria-hidden="true"
                              className="h-2 w-2 shrink-0 rounded-full bg-primary"
                            />
                          </>
                        )}
                      </div>
                      <p className="text-xs leading-relaxed text-muted-foreground">
                        {describe(item)}
                      </p>
                      <p className="text-[11px] text-muted-foreground/60">
                        {item.organizationName} ·{" "}
                        {formatDistanceToNow(item.updatedAt, {
                          addSuffix: true,
                        })}
                      </p>
                    </div>
                  </Link>
                </DropdownMenuItem>
              );
            })}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
