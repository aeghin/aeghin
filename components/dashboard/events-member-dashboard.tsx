"use client";

import { useState, useMemo, useEffect, useTransition } from "react";
import { m, AnimatePresence } from "motion/react";
import {
  Calendar,
  Clock,
  MapPin,
  Check,
  X,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Hourglass,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { InvitationStatus, VolunteerRole } from "@/generated/prisma/enums";
import { volunteerRoleConfig } from "@/lib/config/roles";
import { toast } from "sonner";
import {
  acceptEventInvitation,
  declineEventInvitation,
} from "@/lib/actions/event";
import { Spinner } from "@/components/ui/spinner";
import { getServiceColors as getColorClasses } from "@/lib/config/service-types-config";

interface EventDate {
  id: string;
  startTime: Date | string;
  endTime: Date | string;
}

interface EventAssignment {
  id: string;
  userId: string;
  role: string;
  status: InvitationStatus;
  assignedBy: {
    firstName: string;
  } | null;
  expiresAt: Date;
}

interface ServiceType {
  id: string;
  name: string;
  color: string;
}

interface Event {
  id: string;
  name: string;
  description: string;
  location: string;
  dates: EventDate[];
  assignments: EventAssignment[];
  serviceTypeId: string;
}

// ─── Color config ───────────────────────────────────────────────
// Palette lives in lib/config/service-types-config.ts — see getServiceColors.

// ─── Date helpers (pure functions — accept `today` as parameter) ─

function createToday(): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

/** Earliest startTime across all EventDates */
function getEarliestDate(dates: EventDate[]): Date {
  return new Date(
    Math.min(...dates.map((d) => new Date(d.startTime).getTime())),
  );
}

/** Latest endTime across all EventDates */
function getLatestDate(dates: EventDate[]): Date {
  return new Date(Math.max(...dates.map((d) => new Date(d.endTime).getTime())));
}

/** Whether the event spans more than one calendar day */
function isMultiDay(dates: EventDate[]): boolean {
  if (dates.length > 1) return true;
  if (dates.length === 0) return false;
  const start = new Date(dates[0].startTime);
  const end = new Date(dates[0].endTime);
  return start.toISOString().slice(0, 10) !== end.toISOString().slice(0, 10);
}

function formatShortDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    timeZone: "UTC",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/** Display-friendly date range: single day or "Mar 27 – 29" / "Mar 31 – Apr 2" */
function formatDateRange(dates: EventDate[]): string {
  if (dates.length === 0) return "";
  const earliest = getEarliestDate(dates);
  const latest = getLatestDate(dates);

  if (!isMultiDay(dates)) {
    return formatShortDate(earliest);
  }

  if (earliest.getUTCMonth() === latest.getUTCMonth()) {
    return `${earliest.toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric" })} – ${latest.getUTCDate()}`;
  }

  return `${earliest.toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric" })} – ${latest.toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric" })}`;
}

/** Time range for the earliest EventDate (for card display) */
function formatTimeRange(dates: EventDate[]): string {
  if (dates.length === 0) return "";
  const sorted = [...dates].sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
  );
  return `${formatTime(new Date(sorted[0].startTime))} – ${formatTime(new Date(sorted[0].endTime))}`;
}

function getMonthYear(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

/**
 * Check if ANY of an event's dates overlap with the given time scope.
 * Pure function — all dependencies passed as parameters.
 */
function isEventInTimeScope(
  dates: EventDate[],
  scope: TimeScope,
  currentMonth: Date,
  today: Date,
): boolean {
  if (dates.length === 0) return false;

  switch (scope) {
    case "week": {
      const weekEnd = new Date(today);
      weekEnd.setDate(weekEnd.getDate() + 7);
      return dates.some((d) => {
        const start = new Date(d.startTime);
        const end = new Date(d.endTime);
        return start <= weekEnd && end >= today;
      });
    }
    case "month": {
      const monthStart = new Date(
        currentMonth.getFullYear(),
        currentMonth.getMonth(),
        1,
      );
      const monthEnd = new Date(
        currentMonth.getFullYear(),
        currentMonth.getMonth() + 1,
        0,
        23,
        59,
        59,
      );
      return dates.some((d) => {
        const start = new Date(d.startTime);
        const end = new Date(d.endTime);
        return start <= monthEnd && end >= monthStart;
      });
    }
    case "upcoming": {
      return dates.some((d) => new Date(d.endTime) >= today);
    }
    case "past": {
      const monthStart = new Date(
        currentMonth.getFullYear(),
        currentMonth.getMonth(),
        1,
      );
      const monthEnd = new Date(
        currentMonth.getFullYear(),
        currentMonth.getMonth() + 1,
        0,
        23,
        59,
        59,
      );
      return (
        dates.every((d) => new Date(d.endTime) < today) &&
        dates.some((d) => {
          const start = new Date(d.startTime);
          const end = new Date(d.endTime);
          return start <= monthEnd && end >= monthStart;
        })
      );
    }
  }
}

/** True only if every EventDate's endTime is before today */
function isEventPast(dates: EventDate[], today: Date): boolean {
  return dates.length > 0 && dates.every((d) => new Date(d.endTime) < today);
}

/**
 * A pending invitation the member can still answer.
 *
 * Takes a real timestamp, never `today`. Expiry is wall-clock — an invite
 * lapses N days after the moment it was sent, not at a midnight — so comparing
 * against local midnight left a lapsed invite listed *and* offering Accept for
 * up to a day after the server had stopped honouring it, which answered with
 * "Unable to find this event". The hourly sweep flips these rows to EXPIRED;
 * this covers the window before the next tick.
 *
 * Shared by the initial tab choice and the Pending list on purpose: those two
 * used to carry different predicates, so a member whose only invites had
 * lapsed landed on a Pending tab that was empty.
 */
function hasLiveInvite(event: Event, now: Date): boolean {
  return event.assignments.some(
    (a) => a.status === InvitationStatus.PENDING && a.expiresAt > now,
  );
}

/**
 * A pending invitation that lapsed before it was answered.
 *
 * Reads the timestamp as well as the status, because the hourly sweep is what
 * writes EXPIRED — for up to an hour after a lapse the row is still PENDING.
 *
 * Paired with hasLiveInvite: an assignment row is unique per event and member,
 * so between them a pending invite lands in exactly one bucket and can never
 * show up as answerable and lapsed at the same time.
 */
function hasExpiredInvite(event: Event, now: Date): boolean {
  return event.assignments.some(
    (a) =>
      a.status === InvitationStatus.EXPIRED ||
      (a.status === InvitationStatus.PENDING && a.expiresAt <= now),
  );
}

/**
 * For grouping: find the earliest startTime that falls within the current scope.
 * Falls back to the absolute earliest date if none qualify.
 */
function getAnchorDateInScope(
  dates: EventDate[],
  scope: TimeScope,
  currentMonth: Date,
  today: Date,
): Date {
  const datesInScope = dates.filter((d) => {
    const start = new Date(d.startTime);
    const end = new Date(d.endTime);

    switch (scope) {
      case "week": {
        const weekEnd = new Date(today);
        weekEnd.setDate(weekEnd.getDate() + 7);
        return start <= weekEnd && end >= today;
      }
      case "month": {
        const monthStart = new Date(
          currentMonth.getFullYear(),
          currentMonth.getMonth(),
          1,
        );
        const monthEnd = new Date(
          currentMonth.getFullYear(),
          currentMonth.getMonth() + 1,
          0,
          23,
          59,
          59,
        );
        return start <= monthEnd && end >= monthStart;
      }
      case "upcoming":
        return end >= today;
      case "past":
        return end < today;
    }
  });

  if (datesInScope.length > 0) {
    return getEarliestDate(datesInScope);
  }
  return getEarliestDate(dates);
}

// ─── Component types ────────────────────────────────────────────

type TimeScope = "month" | "week" | "upcoming" | "past";
type TabType = "pending" | "schedule" | "all";

interface MemberEventsDashboardProps {
  events: Event[];
  /** All org events — only supplied for owners/admins; powers the "All Events" tab. */
  allEvents?: Event[];
  serviceTypes: ServiceType[];
  organizationId: string;
  canManage: boolean;
  /** Event already shown in the Upcoming banner — kept out of My Schedule rows. */
  upNextEventId?: string | null;
}

// Motion only scale-corrects borderRadius when it's a number or a px string —
// a rem value is passed through uncorrected and the corners visibly stretch flat
// while the fill slides between tabs. This is `--radius` (0.625rem) in px, so
// keep it in sync by hand if that token ever changes.
const TAB_FILL_RADIUS = {
  borderTopLeftRadius: 10,
  borderTopRightRadius: 10,
};

// ─── Component ──────────────────────────────────────────────────

export function MemberEventsDashboard({
  events,
  allEvents = [],
  serviceTypes,
  organizationId,
  canManage,
  upNextEventId = null,
}: MemberEventsDashboardProps) {
  const [activeTab, setActiveTab] = useState<TabType>(() =>
    events.some((e) => hasLiveInvite(e, new Date())) ? "pending" : "schedule",
  );
  const [timeScope, setTimeScope] = useState<TimeScope>("upcoming");
  const [selectedServiceType, setSelectedServiceType] = useState<string | null>(
    null,
  );
  const [currentMonth, setCurrentMonth] = useState(() => new Date());
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Compute today once per render, pass to all helpers
  const today = useMemo(() => createToday(), []);

  // `today` is midnight because every date helper above wants a calendar day.
  // Expiry is a timestamp, so it gets its own clock — see hasLiveInvite.
  const now = useMemo(() => new Date(), []);

  // ── Memoized lookups ────────────────────────────────────────

  const serviceTypeMap = useMemo(() => {
    return new Map(serviceTypes.map((s) => [s.id, s]));
  }, [serviceTypes]);

  const getServiceType = (id: string) => serviceTypeMap.get(id);

  // ── Derived data ────────────────────────────────────────────

  const pendingEvents = useMemo(() => {
    return events.filter((e) => hasLiveInvite(e, now));
  }, [events, now]);

  const expiredEvents = useMemo(() => {
    return events.filter((e) => hasExpiredInvite(e, now));
  }, [events, now]);

  const acceptedEvents = useMemo(() => {
    return events.filter((e) =>
      e.assignments.some((a) => a.status === InvitationStatus.ACCEPTED),
    );
  }, [events]);

  const nonPastPendingEvents = useMemo(
    () => pendingEvents.filter((e) => !isEventPast(e.dates, today)),
    [pendingEvents, today],
  );

  const nonPastAcceptedEvents = useMemo(
    () => acceptedEvents.filter((e) => !isEventPast(e.dates, today)),
    [acceptedEvents, today],
  );

  const filteredPendingEvents = useMemo(() => {
    return pendingEvents.filter((event) => {
      const inScope = isEventInTimeScope(
        event.dates,
        timeScope,
        currentMonth,
        today,
      );
      const matchesService =
        !selectedServiceType || event.serviceTypeId === selectedServiceType;
      const notPast =
        timeScope === "past" || !isEventPast(event.dates, today);
      return inScope && matchesService && notPast;
    });
  }, [pendingEvents, timeScope, currentMonth, selectedServiceType, today]);

  // Same scope and service filtering as the live list, so the tab stays
  // coherent when a month or a service type is selected.
  const filteredExpiredEvents = useMemo(() => {
    return expiredEvents.filter((event) => {
      const inScope = isEventInTimeScope(
        event.dates,
        timeScope,
        currentMonth,
        today,
      );
      const matchesService =
        !selectedServiceType || event.serviceTypeId === selectedServiceType;
      const notPast =
        timeScope === "past" || !isEventPast(event.dates, today);
      return inScope && matchesService && notPast;
    });
  }, [expiredEvents, timeScope, currentMonth, selectedServiceType, today]);

  const filteredAcceptedEvents = useMemo(() => {
    return acceptedEvents
      .filter((event) => {
        const inScope = isEventInTimeScope(
          event.dates,
          timeScope,
          currentMonth,
          today,
        );
        const matchesService =
          !selectedServiceType || event.serviceTypeId === selectedServiceType;
        const notPast =
          timeScope === "past" || !isEventPast(event.dates, today);
        return inScope && matchesService && notPast;
      })
      .sort(
        (a, b) =>
          getEarliestDate(a.dates).getTime() -
          getEarliestDate(b.dates).getTime(),
      );
  }, [acceptedEvents, timeScope, currentMonth, selectedServiceType, today]);

  // The Upcoming banner above already renders this one — drop it from the rows.
  // Kept as its own layer so the empty state can tell "nothing matches" apart
  // from "the banner took the only match".
  const scheduleEvents = useMemo(
    () => filteredAcceptedEvents.filter((e) => e.id !== upNextEventId),
    [filteredAcceptedEvents, upNextEventId],
  );

  const groupedAcceptedEvents = useMemo(() => {
    const groups: Record<string, Event[]> = {};

    scheduleEvents.forEach((event) => {
      const anchorDate = getAnchorDateInScope(
        event.dates,
        timeScope,
        currentMonth,
        today,
      );
      const key = anchorDate.toDateString();

      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(event);
    });

    return Object.entries(groups).sort(
      ([a], [b]) => new Date(a).getTime() - new Date(b).getTime(),
    );
  }, [scheduleEvents, timeScope, currentMonth, today]);

  // ── All-events derivations (managers only) ──────────────────

  const nonPastAllEvents = useMemo(
    () => allEvents.filter((e) => !isEventPast(e.dates, today)),
    [allEvents, today],
  );

  const filteredAllEvents = useMemo(() => {
    return allEvents
      .filter((event) => {
        const inScope = isEventInTimeScope(
          event.dates,
          timeScope,
          currentMonth,
          today,
        );
        const matchesService =
          !selectedServiceType || event.serviceTypeId === selectedServiceType;
        const notPast =
          timeScope === "past" || !isEventPast(event.dates, today);
        return inScope && matchesService && notPast;
      })
      .sort(
        (a, b) =>
          getEarliestDate(a.dates).getTime() -
          getEarliestDate(b.dates).getTime(),
      );
  }, [allEvents, timeScope, currentMonth, selectedServiceType, today]);

  const groupedAllEvents = useMemo(() => {
    const groups: Record<string, Event[]> = {};

    filteredAllEvents.forEach((event) => {
      const anchorDate = getAnchorDateInScope(
        event.dates,
        timeScope,
        currentMonth,
        today,
      );
      const key = anchorDate.toDateString();

      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(event);
    });

    return Object.entries(groups).sort(
      ([a], [b]) => new Date(a).getTime() - new Date(b).getTime(),
    );
  }, [filteredAllEvents, timeScope, currentMonth, today]);

  // ── Helpers ─────────────────────────────────────────────────

  const pendingCount = nonPastPendingEvents.length;
  const scheduleCount = nonPastAcceptedEvents.length;
  const allCount = nonPastAllEvents.length;

  // "My Schedule" and "All Events" share the same grouped rendering; only the
  // source set differs by active tab.
  const groupedSchedule =
    activeTab === "all" ? groupedAllEvents : groupedAcceptedEvents;

  // Whether the banner actually took an event out of *this* view — false when
  // the scope or service filter had already excluded it anyway.
  const bannerInThisView =
    scheduleEvents.length !== filteredAcceptedEvents.length;

  // The banner is holding the only event this view would have shown, so the
  // list is empty while an event is plainly visible right above it.
  const bannerHoldsSchedule =
    activeTab !== "all" && bannerInThisView && scheduleEvents.length === 0;

  // The banner is the "soonest" marker for the events it took, so a second pill
  // on the next group down would only compete with it. All Events is a
  // different set (the whole org), so it keeps its own marker.
  const nextUpcomingDate =
    activeTab !== "all" && bannerInThisView
      ? undefined
      : groupedSchedule.find(([dateStr]) => new Date(dateStr) >= today)?.[0];

  // ── JSX ─────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <m.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="relative"
      >
        <div className="flex gap-1 border-b border-border">
          <button
            type="button"
            onClick={() => setActiveTab("pending")}
            className={`relative flex items-center rounded-t-lg px-3 pt-2 pb-3 text-sm font-medium transition-colors cursor-pointer ${
              activeTab === "pending"
                ? "text-foreground"
                : "text-foreground/70 hover:bg-muted/50 hover:text-foreground"
            }`}
          >
            {activeTab === "pending" && (
              <m.div
                layoutId="events-tab-fill"
                className="absolute inset-0 bg-muted"
                style={TAB_FILL_RADIUS}
                transition={{ type: "spring", stiffness: 500, damping: 30 }}
              >
                <span className="absolute inset-x-0 bottom-0 h-0.5 bg-foreground" />
              </m.div>
            )}
            <span className="relative flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-amber-500" />
              Pending
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  activeTab === "pending"
                    ? "bg-background text-foreground/70"
                    : "bg-secondary text-secondary-foreground"
                }`}
              >
                {pendingCount}
              </span>
            </span>
            {activeTab !== "pending" && (
              <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-foreground/20" />
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("schedule")}
            className={`relative flex items-center rounded-t-lg px-3 pt-2 pb-3 text-sm font-medium transition-colors cursor-pointer ${
              activeTab === "schedule"
                ? "text-foreground"
                : "text-foreground/70 hover:bg-muted/50 hover:text-foreground"
            }`}
          >
            {activeTab === "schedule" && (
              <m.div
                layoutId="events-tab-fill"
                className="absolute inset-0 bg-muted"
                style={TAB_FILL_RADIUS}
                transition={{ type: "spring", stiffness: 500, damping: 30 }}
              >
                <span className="absolute inset-x-0 bottom-0 h-0.5 bg-foreground" />
              </m.div>
            )}
            <span className="relative flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              My Schedule
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  activeTab === "schedule"
                    ? "bg-background text-foreground/70"
                    : "bg-secondary text-secondary-foreground"
                }`}
              >
                {scheduleCount}
              </span>
            </span>
            {activeTab !== "schedule" && (
              <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-foreground/20" />
            )}
          </button>
          {canManage && (
            <button
              type="button"
              onClick={() => setActiveTab("all")}
              className={`relative flex items-center rounded-t-lg px-3 pt-2 pb-3 text-sm font-medium transition-colors cursor-pointer ${
                activeTab === "all"
                  ? "text-foreground"
                  : "text-foreground/70 hover:bg-muted/50 hover:text-foreground"
              }`}
            >
              {activeTab === "all" && (
                <m.div
                  layoutId="events-tab-fill"
                  className="absolute inset-0 bg-muted"
                  style={TAB_FILL_RADIUS}
                  transition={{ type: "spring", stiffness: 500, damping: 30 }}
                >
                  <span className="absolute inset-x-0 bottom-0 h-0.5 bg-foreground" />
                </m.div>
              )}
              <span className="relative flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-blue-500" />
                All Events
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    activeTab === "all"
                      ? "bg-background text-foreground/70"
                      : "bg-secondary text-secondary-foreground"
                  }`}
                >
                  {allCount}
                </span>
              </span>
              {activeTab !== "all" && (
                <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-foreground/20" />
              )}
            </button>
          )}
        </div>
      </m.div>

      {/* Time Scope */}
      <m.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="flex flex-wrap items-center gap-2"
      >
        <div className="flex rounded-lg border border-border bg-background p-1">
          {(["upcoming", "month", "week", "past"] as TimeScope[]).map(
            (scope) => (
              <button
                type="button"
                key={scope}
                onClick={() => setTimeScope(scope)}
                className={`relative rounded-md px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                  timeScope === scope
                    ? "bg-secondary text-secondary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {scope === "week" && "This Week"}
                {scope === "month" && "This Month"}
                {scope === "upcoming" && "Upcoming"}
                {scope === "past" && "Past"}
              </button>
            ),
          )}
        </div>

        <AnimatePresence>
          {(timeScope === "month" || timeScope === "past") && (
            <m.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              className="flex items-center gap-1 text-sm"
            >
              <button
                type="button"
                onClick={() =>
                  setCurrentMonth((prev) => {
                    const newDate = new Date(prev);
                    newDate.setMonth(newDate.getMonth() - 1);
                    return newDate;
                  })
                }
                className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground cursor-pointer"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="min-w-30 text-center font-medium">
                {getMonthYear(currentMonth)}
              </span>
              <button
                type="button"
                onClick={() =>
                  setCurrentMonth((prev) => {
                    const newDate = new Date(prev);
                    newDate.setMonth(newDate.getMonth() + 1);
                    return newDate;
                  })
                }
                className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground cursor-pointer"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </m.div>
          )}
        </AnimatePresence>
      </m.div>

      {/* Service Type Filters */}
      <m.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide snap-x snap-mandatory sm:snap-none"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        <m.button
          whileTap={{ scale: 0.97 }}
          onClick={() => setSelectedServiceType(null)}
          className={`flex shrink-0 snap-start items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all cursor-pointer ${
            !selectedServiceType
              ? "bg-foreground text-background"
              : "border border-border bg-background text-muted-foreground hover:border-foreground/20 hover:text-foreground"
          }`}
        >
          All
        </m.button>
        {serviceTypes.map((service) => {
          const colors = getColorClasses(service.color);
          return (
            <m.button
              key={service.id}
              whileTap={{ scale: 0.97 }}
              onClick={() =>
                setSelectedServiceType(
                  service.id === selectedServiceType ? null : service.id,
                )
              }
              className={`flex shrink-0 snap-start items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all cursor-pointer ${
                selectedServiceType === service.id
                  ? "bg-foreground text-background"
                  : "border border-border bg-background text-muted-foreground hover:border-foreground/20 hover:text-foreground"
              }`}
            >
              <span className={`h-2 w-2 rounded-full ${colors.dot}`} />
              {service.name}
            </m.button>
          );
        })}
      </m.div>

      {/* Content */}
      <AnimatePresence mode="wait">
        {activeTab === "pending" ? (
          <m.div
            key="pending"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            {filteredPendingEvents.length === 0 &&
            filteredExpiredEvents.length === 0 ? (
              <m.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="flex flex-col items-center justify-center rounded-lg border border-border bg-card py-16"
              >
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
                  <CheckCircle2 className="h-6 w-6 text-emerald-600" />
                </div>
                <p className="text-sm font-medium text-foreground">
                  You&apos;re all caught up!
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  No pending invitations
                </p>
              </m.div>
            ) : (
              <div className="space-y-3">
                {filteredPendingEvents.map((event, index) => (
                  <PendingEventCard
                    key={event.id}
                    event={event}
                    organizationId={organizationId}
                    index={index}
                    isMounted={isMounted}
                    getServiceType={getServiceType}
                    canManage={canManage}
                  />
                ))}

                {filteredExpiredEvents.length > 0 && (
                  <div className="space-y-3 pt-2">
                    <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      <Hourglass className="h-3.5 w-3.5" />
                      Expired
                    </p>
                    {filteredExpiredEvents.map((event, index) => (
                      <ExpiredInviteCard
                        key={event.id}
                        event={event}
                        index={index}
                        isMounted={isMounted}
                        getServiceType={getServiceType}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </m.div>
        ) : (
          <m.div
            key={activeTab}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            {groupedSchedule.length === 0 ? (
              <m.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="flex flex-col items-center justify-center rounded-lg border border-border bg-card py-16"
              >
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-secondary">
                  <Calendar className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium text-foreground">
                  {activeTab === "all"
                    ? "No events"
                    : bannerHoldsSchedule
                      ? "Nothing else scheduled"
                      : "No scheduled events"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {timeScope === "past"
                    ? "No past events found"
                    : activeTab === "all"
                      ? "No events in this period"
                      : bannerHoldsSchedule
                        ? "Your next event is shown above"
                        : "Check back later for new assignments"}
                </p>
              </m.div>
            ) : (
              <div className="space-y-6">
                {groupedSchedule.map(
                  ([dateStr, dateEvents], groupIndex) => {
                    const groupDate = new Date(dateStr);
                    const allPast = dateEvents.every((e) =>
                      isEventPast(e.dates, today),
                    );
                    const isNextUpcoming = dateStr === nextUpcomingDate;

                    return (
                      <m.div
                        key={dateStr}
                        initial={isMounted ? { opacity: 0, y: 20 } : false}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{
                          delay: isMounted ? groupIndex * 0.05 : 0,
                        }}
                        className={allPast ? "opacity-60" : ""}
                      >
                        <div className="mb-3 flex items-center gap-3">
                          <h3 className="text-sm font-semibold text-foreground">
                            {formatShortDate(groupDate)}
                          </h3>
                          {isNextUpcoming && (
                            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                              Upcoming
                            </span>
                          )}
                          {allPast && (
                            <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-muted-foreground">
                              Past
                            </span>
                          )}
                          <div className="h-px flex-1 bg-border" />
                        </div>

                        <div className="space-y-2">
                          {dateEvents.map((event, eventIndex) => {
                            const service = getServiceType(event.serviceTypeId);
                            const role = event.assignments[0]?.role ?? null;
                            const roleInfo = role
                              ? volunteerRoleConfig[role as VolunteerRole]
                              : null;
                            const colors = getColorClasses(
                              service?.color || "indigo",
                            );
                            const multiDay = isMultiDay(event.dates);

                            return (
                              <Link
                                key={event.id}
                                href={`/dashboard/organizations/${organizationId}/events/${event.id}`}
                              >
                                <m.div
                                  initial={
                                    isMounted ? { opacity: 0, x: -10 } : false
                                  }
                                  animate={{ opacity: 1, x: 0 }}
                                  transition={{
                                    delay: isMounted
                                      ? groupIndex * 0.05 + eventIndex * 0.03
                                      : 0,
                                  }}
                                  whileHover={{ scale: 1.01 }}
                                  className={`group cursor-pointer rounded-lg border border-border border-l-[3px] bg-card p-3 transition-all duration-200 hover:shadow-md ${colors.border}`}
                                >
                                  {/* Desktop layout */}
                                  <div className="hidden items-center gap-3 sm:flex">
                                    <span className="min-w-17.5 text-sm font-medium text-foreground">
                                      {formatTimeRange(event.dates)}
                                    </span>
                                    <span
                                      className={`shrink-0 rounded px-2 py-0.5 text-xs font-medium ${colors.badge} ${colors.badgeText}`}
                                    >
                                      {service?.name || "Event"}
                                    </span>
                                    <span className="flex-1 truncate text-sm text-foreground">
                                      {event.name}
                                      {multiDay && (
                                        <span className="ml-2 text-xs text-muted-foreground">
                                          ({formatDateRange(event.dates)})
                                        </span>
                                      )}
                                    </span>
                                    {roleInfo && (
                                      <span className="shrink-0 rounded-md bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
                                        {roleInfo.icon} {roleInfo.label}
                                      </span>
                                    )}
                                  </div>
                                  {/* Mobile layout */}
                                  <div className="flex flex-col gap-2 sm:hidden">
                                    <div className="flex items-center justify-between gap-2">
                                      <span
                                        className={`shrink-0 rounded px-2 py-0.5 text-xs font-medium ${colors.badge} ${colors.badgeText}`}
                                      >
                                        {service?.name || "Event"}
                                      </span>
                                      {roleInfo && (
                                        <span className="shrink-0 rounded-md bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
                                          {roleInfo.icon} {roleInfo.label}
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-sm font-medium text-foreground">
                                      {event.name}
                                    </p>
                                    <span className="text-xs text-muted-foreground">
                                      {multiDay
                                        ? `${formatDateRange(event.dates)} · ${formatTimeRange(event.dates)}`
                                        : formatTimeRange(event.dates)}
                                    </span>
                                  </div>
                                </m.div>
                              </Link>
                            );
                          })}
                        </div>
                      </m.div>
                    );
                  },
                )}
              </div>
            )}
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Expired Invite Card ───────────────────────────────────────

/**
 * An invitation that lapsed before it was answered.
 *
 * Deliberately inert — no Accept, no Decline, no link. These used to drop out
 * of the tab the moment they lapsed, which read as the invitation never having
 * arrived; this says what actually happened. Reopening one is the admin's move,
 * since re-inviting is what resets the window, so there is nothing to press.
 */
function ExpiredInviteCard({
  event,
  index,
  isMounted,
  getServiceType,
}: {
  event: Event;
  index: number;
  isMounted: boolean;
  getServiceType: (id: string) => ServiceType | undefined;
}) {
  const service = getServiceType(event.serviceTypeId);
  const colors = getColorClasses(service?.color || "indigo");
  const assignment = event.assignments[0] ?? null;
  const roleInfo = assignment
    ? volunteerRoleConfig[assignment.role as VolunteerRole]
    : null;

  return (
    <m.div
      initial={isMounted ? { opacity: 0, y: 20 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: isMounted ? index * 0.05 : 0 }}
      className={`overflow-hidden rounded-lg border border-border border-l-[3px] bg-muted/20 p-4 ${colors.border}`}
    >
      <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
        <span className="rounded-md bg-slate-500/10 px-2 py-0.5 text-[11px] font-medium text-slate-500">
          Invite expired
        </span>
        {roleInfo && (
          <span className="text-xs text-muted-foreground">
            {roleInfo.icon} {roleInfo.label}
          </span>
        )}
      </div>

      <p className="truncate text-sm font-medium text-muted-foreground">
        {event.name}
      </p>

      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Calendar className="h-3.5 w-3.5 shrink-0" />
          {formatDateRange(event.dates)}
        </span>
        <span className="flex items-center gap-1.5">
          <MapPin className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{event.location}</span>
        </span>
      </div>

      <p className="mt-2.5 text-xs text-muted-foreground">
        This invitation ran out before it was answered. Ask an admin to send a
        new one if you can still serve.
      </p>
    </m.div>
  );
}

// ─── Pending Event Card ────────────────────────────────────────

function PendingEventCard({
  event,
  organizationId,
  index,
  isMounted,
  getServiceType,
  canManage,
}: {
  event: Event;
  organizationId: string;
  index: number;
  isMounted: boolean;
  getServiceType: (id: string) => ServiceType | undefined;
  canManage: boolean;
}) {
  const [isAccepting, startAccept] = useTransition();
  const [isDeclining, startDecline] = useTransition();

  const service = getServiceType(event.serviceTypeId);
  const role = event.assignments[0]?.role ?? null;
  const roleInfo = role ? volunteerRoleConfig[role as VolunteerRole] : null;
  const colors = getColorClasses(service?.color || "indigo");
  const assignedBy = event.assignments[0]?.assignedBy?.firstName ?? null;
  const isBusy = isAccepting || isDeclining;

  function handleAccept() {
    startAccept(async () => {
      const result = await acceptEventInvitation(organizationId, event.id);
      result.success
        ? toast.success("Event Successfully Accepted", { position: "bottom-center" })
        : toast.error(`${result.error}`, { position: "bottom-center" })
    });
  }

  function handleDecline() {
    startDecline(async () => {
      const result = await declineEventInvitation(organizationId, event.id);
      result.success ? toast.success("Event Declined", { position: "bottom-center" }) : toast.error(`${result.error}`, { position: "bottom-center" });
    });
  }

  // Pending invites aren't viewable until accepted, so only managers — who
  // reach the event page via their role — get a clickable card.
  const details = (
    <>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <span
          className={`rounded px-2 py-0.5 text-xs font-medium ${colors.badge} ${colors.badgeText}`}
        >
          {service?.name || "Event"}
        </span>
        <span className="rounded-md bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
          {roleInfo?.icon} {roleInfo?.label}
        </span>
      </div>

      <h3 className="mb-2 text-base font-semibold text-foreground">
        {event.name}
      </h3>

      <div className="mb-2 flex flex-col gap-1 text-sm text-muted-foreground sm:flex-row sm:flex-wrap sm:gap-x-4 sm:gap-y-1">
        <span className="flex items-center gap-1.5">
          <Calendar className="h-3.5 w-3.5 shrink-0" />
          {formatDateRange(event.dates)}
        </span>
        <span className="flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5 shrink-0" />
          {formatTimeRange(event.dates)}
        </span>
        <span className="flex items-center gap-1.5">
          <MapPin className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{event.location}</span>
        </span>
      </div>

      {assignedBy && (
        <p className="text-xs text-muted-foreground">Assigned By: {assignedBy}</p>
      )}
    </>
  );

  return (
    <m.div
      initial={isMounted ? { opacity: 0, y: 20 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: isMounted ? index * 0.05 : 0 }}
      whileHover={{ scale: 1.01 }}
      className={`group overflow-hidden rounded-lg border border-border border-l-[3px] bg-card transition-shadow duration-200 hover:shadow-md ${colors.border}`}
    >
      {canManage ? (
        <Link
          href={`/dashboard/organizations/${organizationId}/events/${event.id}`}
          className="block p-4"
        >
          {details}
        </Link>
      ) : (
        <div className="p-4">{details}</div>
      )}

      <div className="border-t border-border" />
      <div className="flex gap-2 p-3 sm:gap-3">
        <m.div whileTap={{ scale: 0.97 }} className="flex-1">
          <Button
            className="h-10 w-full bg-emerald-600 text-white hover:bg-emerald-700 cursor-pointer sm:h-11"
            onClick={handleAccept}
            disabled={isBusy}
          >
            {isAccepting ? (
              <Spinner />
            ) : (
              <>
                <Check className="mr-1.5 h-4 w-4 sm:mr-2" />
                <span>Accept</span>
              </>
            )}
          </Button>
        </m.div>
        <m.div whileTap={{ scale: 0.97 }} className="flex-1">
          <Button
            variant="outline"
            className="h-10 w-full border-destructive text-destructive hover:bg-destructive/10 cursor-pointer sm:h-11"
            onClick={handleDecline}
            disabled={isBusy}
          >
            {isDeclining ? (
              <Spinner />
            ) : (
              <>
                <X className="mr-1.5 h-4 w-4 sm:mr-2" />
                <span>Decline</span>
              </>
            )}
          </Button>
        </m.div>
      </div>
    </m.div>
  );
}
