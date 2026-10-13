"use client";

import { useState, useMemo, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { m, AnimatePresence } from "motion/react";
import {
  Calendar,
  Clock,
  MapPin,
  Check,
  X,
  CheckCircle2,
  ClockAlert,
  Hourglass,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { InvitationStatus } from "@/generated/prisma/enums";
import { capitalizeName } from "@/lib/names";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  acceptEventInvitation,
  declineEventInvitation,
} from "@/lib/actions/event";
import { Spinner } from "@/components/ui/spinner";
import { ServiceTypeFilter } from "@/components/dashboard/events/service-type-filter";
import {
  EventCard,
  MetaLine,
  RoleChip,
  ServiceBadge,
} from "@/components/dashboard/events/event-card";
import {
  MonthStepper,
  ScopeFilter,
} from "@/components/dashboard/events/events-controls";
import { UpNextCard, findUpNext } from "@/components/dashboard/up-next-card";
import type { Staffing } from "@/lib/staffing";
import { getServiceColors as getColorClasses } from "@/lib/config/service-types-config";
import {
  dayKey,
  formatDateRange,
  formatTimeRange,
} from "@/lib/event-format";
import { floatingNow } from "@/lib/time-zone";
import {
  getAnchorDateInScope,
  isEventInTimeScope,
  isEventPast,
  nextChange,
  startOfFloatingDay,
  type TimeScope,
} from "@/lib/time-scope";

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
  rolesNeeded: string[];
  rehearsalStart?: Date | string | null;
  rehearsalEnd?: Date | string | null;
  /** Only on All Events — see `getOrgEvents`. */
  staffing?: Staffing;
}

// ─── Color config ───────────────────────────────────────────────
// Palette lives in lib/config/service-types-config.ts — see getServiceColors.

// ─── Date helpers ───────────────────────────────────────────────
//
// Which period an event belongs to, and the day it groups under, live in
// lib/time-scope.ts; how its dates read lives in lib/event-format.ts — both
// shared rule for rule with the phone.

/** Earliest startTime across all EventDates */
function getEarliestDate(dates: EventDate[]): Date {
  return new Date(
    Math.min(...dates.map((d) => new Date(d.startTime).getTime())),
  );
}

/** The role a card shows: an accepted one outranks a pending one. */
function cardRole(event: Event): string | null {
  return (
    event.assignments.find((a) => a.status === InvitationStatus.ACCEPTED)?.role ??
    event.assignments.find((a) => a.status === InvitationStatus.PENDING)?.role ??
    null
  );
}

function getMonthYear(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
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
 * How long is left to answer an invitation: `"Expires in 2 days"`, or in
 * hours once under a day, when it's worth colouring. Counted from the real
 * instant like hasLiveInvite, so it reads the same in every browser's zone.
 */
function formatExpiry(expiresAt: Date, now: Date): { label: string; urgent: boolean } {
  const hours = (expiresAt.getTime() - now.getTime()) / 3_600_000;

  if (hours < 24) {
    const left = Math.max(1, Math.floor(hours));
    return { label: `Expires in ${left} ${left === 1 ? "hour" : "hours"}`, urgent: true };
  }

  const days = Math.floor(hours / 24);
  return { label: `Expires in ${days} ${days === 1 ? "day" : "days"}`, urgent: false };
}

// ─── Component types ────────────────────────────────────────────

type TabType = "pending" | "schedule" | "all";

interface MemberEventsDashboardProps {
  events: Event[];
  /** All org events — only supplied for owners/admins; powers the "All Events" tab. */
  allEvents?: Event[];
  serviceTypes: ServiceType[];
  /** The caller's own order for the service-type pills. */
  serviceTypeOrder: string[];
  organizationId: string;
  canManage: boolean;
  /** The organization's zone: what "today" is, against event times written in its wall clock. */
  timeZone: string;
}

// Motion only scale-corrects borderRadius when it's a number or a px string —
// a rem value is passed through uncorrected and the corners visibly stretch flat
// while the fill slides between tabs. This is `--radius` (0.5rem) in px, so
// keep it in sync by hand if that token ever changes.
const TAB_FILL_RADIUS = {
  borderTopLeftRadius: 8,
  borderTopRightRadius: 8,
};

// ─── Component ──────────────────────────────────────────────────

export function MemberEventsDashboard({
  events,
  allEvents = [],
  serviceTypes,
  serviceTypeOrder,
  organizationId,
  canManage,
  timeZone,
}: MemberEventsDashboardProps) {
  const [activeTab, setActiveTab] = useState<TabType>(() =>
    events.some((e) => hasLiveInvite(e, new Date())) ? "pending" : "schedule",
  );
  const [timeScope, setTimeScope] = useState<TimeScope>("upcoming");
  const [selectedServiceType, setSelectedServiceType] = useState<string | null>(
    null,
  );
  const router = useRouter();

  // The organization's clock, which event times are written in. Read again
  // when the list would change — a block ending, an invitation lapsing, the
  // church's midnight — and the server's half of the page (the Upcoming
  // banner, the counts) refreshed with it, so a finished service leaves at
  // its end time without a reload, as on the phone.
  const [instant, setInstant] = useState(() => Date.now());
  const churchNow = useMemo(
    () => floatingNow(timeZone, new Date(instant)),
    [timeZone, instant],
  );
  const today = useMemo(() => startOfFloatingDay(churchNow), [churchNow]);

  // A month cursor: only its year and month are read. Started from the
  // church's today, so the server render and the browser agree on it.
  const [currentMonth, setCurrentMonth] = useState(
    () => new Date(today.getUTCFullYear(), today.getUTCMonth(), 1),
  );
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Expiry is a real instant, not the church's wall clock — see hasLiveInvite.
  const now = useMemo(() => new Date(instant), [instant]);

  const due = nextChange(
    [...events, ...allEvents].flatMap((event) => event.dates),
    events.flatMap((event) =>
      event.assignments
        .filter((assignment) => assignment.status === InvitationStatus.PENDING)
        .map((assignment) => assignment.expiresAt),
    ),
    timeZone,
    churchNow,
    instant,
  );

  useEffect(() => {
    // A second late, so the server is sure to read the same side of it.
    const timer = setTimeout(() => {
      setInstant(Date.now());
      router.refresh();
    }, Math.max(0, due - Date.now()) + 1000);
    return () => clearTimeout(timer);
  }, [due, router]);

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
    () => pendingEvents.filter((e) => !isEventPast(e.dates, churchNow)),
    [pendingEvents, churchNow],
  );

  const nonPastAcceptedEvents = useMemo(
    () => acceptedEvents.filter((e) => !isEventPast(e.dates, churchNow)),
    [acceptedEvents, churchNow],
  );

  // Pending hides the period controls, as on the phone, so only the service
  // filter applies: every invitation still to come is listed, whatever period
  // the other tabs were left on.
  const filteredPendingEvents = useMemo(() => {
    return nonPastPendingEvents.filter(
      (event) => !selectedServiceType || event.serviceTypeId === selectedServiceType,
    );
  }, [nonPastPendingEvents, selectedServiceType]);

  // Same filtering as the live list, so the tab stays coherent when a service
  // type is selected.
  const filteredExpiredEvents = useMemo(() => {
    return expiredEvents.filter(
      (event) =>
        (!selectedServiceType || event.serviceTypeId === selectedServiceType) &&
        !isEventPast(event.dates, churchNow),
    );
  }, [expiredEvents, selectedServiceType, churchNow]);

  const filteredAcceptedEvents = useMemo(() => {
    return acceptedEvents
      .filter((event) => {
        const inScope = isEventInTimeScope(
          event.dates,
          timeScope,
          currentMonth,
          churchNow,
        );
        const matchesService =
          !selectedServiceType || event.serviceTypeId === selectedServiceType;
        const notPast =
          timeScope === "past" || !isEventPast(event.dates, churchNow);
        return inScope && matchesService && notPast;
      })
      .sort(
        (a, b) =>
          getEarliestDate(a.dates).getTime() -
          getEarliestDate(b.dates).getTime(),
      );
  }, [acceptedEvents, timeScope, currentMonth, selectedServiceType, churchNow]);

  // My Schedule on Upcoming only, as on the phone: narrowed to a week or a
  // month, a card announcing something outside that window contradicts the
  // list under it. It follows the service filter for the same reason.
  const upNext = useMemo(
    () =>
      activeTab === "schedule" && timeScope === "upcoming"
        ? findUpNext(
            acceptedEvents.filter(
              (e) => !selectedServiceType || e.serviceTypeId === selectedServiceType,
            ),
            churchNow,
          )
        : null,
    [activeTab, timeScope, acceptedEvents, selectedServiceType, churchNow],
  );

  // The card is the list's first event, so the list picks up after it.
  const scheduleEvents = useMemo(
    () => filteredAcceptedEvents.filter((e) => e.id !== upNext?.event.id),
    [filteredAcceptedEvents, upNext],
  );

  const groupedAcceptedEvents = useMemo(() => {
    const groups: Record<string, Event[]> = {};

    scheduleEvents.forEach((event) => {
      const anchorDate = getAnchorDateInScope(
        event.dates,
        timeScope,
        currentMonth,
        churchNow,
      );
      const key = dayKey(anchorDate);

      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(event);
    });

    return Object.entries(groups).sort(
      ([a], [b]) => new Date(a).getTime() - new Date(b).getTime(),
    );
  }, [scheduleEvents, timeScope, currentMonth, churchNow]);

  // ── All-events derivations (managers only) ──────────────────

  const nonPastAllEvents = useMemo(
    () => allEvents.filter((e) => !isEventPast(e.dates, churchNow)),
    [allEvents, churchNow],
  );

  const filteredAllEvents = useMemo(() => {
    return allEvents
      .filter((event) => {
        const inScope = isEventInTimeScope(
          event.dates,
          timeScope,
          currentMonth,
          churchNow,
        );
        const matchesService =
          !selectedServiceType || event.serviceTypeId === selectedServiceType;
        const notPast =
          timeScope === "past" || !isEventPast(event.dates, churchNow);
        return inScope && matchesService && notPast;
      })
      .sort(
        (a, b) =>
          getEarliestDate(a.dates).getTime() -
          getEarliestDate(b.dates).getTime(),
      );
  }, [allEvents, timeScope, currentMonth, selectedServiceType, churchNow]);

  const groupedAllEvents = useMemo(() => {
    const groups: Record<string, Event[]> = {};

    filteredAllEvents.forEach((event) => {
      const anchorDate = getAnchorDateInScope(
        event.dates,
        timeScope,
        currentMonth,
        churchNow,
      );
      const key = dayKey(anchorDate);

      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(event);
    });

    return Object.entries(groups).sort(
      ([a], [b]) => new Date(a).getTime() - new Date(b).getTime(),
    );
  }, [filteredAllEvents, timeScope, currentMonth, churchNow]);

  // ── Helpers ─────────────────────────────────────────────────

  const pendingCount = nonPastPendingEvents.length;
  const scheduleCount = nonPastAcceptedEvents.length;
  const allCount = nonPastAllEvents.length;

  const stepMonth = (delta: number) =>
    setCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));

  // "My Schedule" and "All Events" share the same grouped rendering; only the
  // source set differs by active tab.
  const groupedSchedule =
    activeTab === "all" ? groupedAllEvents : groupedAcceptedEvents;

  const todayKey = dayKey(today);

  // The Up Next card wears the solid tile; without one, the next day's cards do.
  const nextKey = upNext
    ? undefined
    : groupedSchedule.find(([key]) => key >= todayKey)?.[0];

  const eventHref = (eventId: string) =>
    `/dashboard/organizations/${organizationId}/events/${eventId}`;

  // ── JSX ─────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
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
              My schedule
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
                All events
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

      {/* Time Scope — hidden on Pending, which lists every invitation still to come */}
      {activeTab !== "pending" && (
        <m.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="flex flex-col gap-3 sm:flex-row sm:items-center"
        >
          <ScopeFilter value={timeScope} onChange={setTimeScope} />

          <AnimatePresence initial={false}>
            {(timeScope === "month" || timeScope === "past") && (
              <m.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <MonthStepper
                  label={getMonthYear(currentMonth)}
                  onPrevious={() => stepMonth(-1)}
                  onNext={() => stepMonth(1)}
                />
              </m.div>
            )}
          </AnimatePresence>
        </m.div>
      )}

      {/* Service Type Filters */}
      <ServiceTypeFilter
        serviceTypes={serviceTypes}
        serviceTypeOrder={serviceTypeOrder}
        organizationId={organizationId}
        selected={selectedServiceType}
        onSelect={setSelectedServiceType}
      />

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
                className="flex flex-col items-center justify-center rounded-xl border border-border bg-card px-6 py-16 text-center"
              >
                {/* A tint rather than a pale fill, so it holds in dark mode. */}
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15">
                  <CheckCircle2 className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
                </div>
                <p className="text-sm font-medium text-foreground">
                  You&apos;re all caught up
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  No invitations are waiting on you.
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
                    now={now}
                  />
                ))}

                {filteredExpiredEvents.length > 0 && (
                  <div className="space-y-3 pt-2">
                    <p className="text-[11px] font-bold tracking-wider text-muted-foreground uppercase">
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
            <div className="space-y-4">
              {upNext && (
                <m.div
                  initial={isMounted ? { opacity: 0, y: 10 } : false}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-2"
                >
                  <p className="text-xs font-medium text-muted-foreground">Up next</p>
                  <UpNextCard
                    upNext={upNext}
                    service={getServiceType(upNext.event.serviceTypeId)}
                    href={eventHref(upNext.event.id)}
                    today={todayKey}
                    now={churchNow}
                  />
                </m.div>
              )}

              {groupedSchedule.length === 0 ? (
                upNext ? null : (
                  <m.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="flex flex-col items-center justify-center rounded-xl border border-border bg-card px-6 py-16 text-center"
                  >
                    <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-secondary">
                      <Calendar className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <p className="text-sm font-medium text-foreground">
                      {activeTab === "all" ? "No events" : "No scheduled events"}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {timeScope === "past"
                        ? "No past events found"
                        : activeTab === "all"
                          ? "No events in this period"
                          : "Check back later for new assignments"}
                    </p>
                  </m.div>
                )
              ) : (
                // Every other period drops finished events, so the whole Past
                // list recedes together, as on the phone.
                <div
                  className={`flex flex-col gap-3 ${timeScope === "past" ? "opacity-60" : ""}`}
                >
                  {upNext && (
                    <p className="pt-2 text-xs font-medium text-muted-foreground">Later</p>
                  )}
                  {groupedSchedule
                    .flatMap(([key, dayEvents]) =>
                      dayEvents.map((event) => ({ key, event })),
                    )
                    .map(({ key, event }, index) => (
                      <m.div
                        key={event.id}
                        initial={isMounted ? { opacity: 0, y: 10 } : false}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{
                          delay: isMounted ? Math.min(index, 10) * 0.03 : 0,
                        }}
                      >
                        <EventCard
                          href={eventHref(event.id)}
                          event={event}
                          service={getServiceType(event.serviceTypeId)}
                          role={cardRole(event)}
                          day={key}
                          today={todayKey}
                          now={churchNow}
                          highlight={key === nextKey}
                          staffing={activeTab === "all" ? event.staffing : null}
                        />
                      </m.div>
                    ))}
                </div>
              )}
            </div>
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
 *
 * Flatter than a live card on purpose, as on the phone: no service stripe, no
 * buttons, muted text. It's a record, and mustn't compete with the cards above
 * it that still want an answer.
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
  // The sweep may not have written EXPIRED yet — see hasExpiredInvite.
  const assignment =
    event.assignments.find((a) => a.status === InvitationStatus.EXPIRED) ??
    event.assignments.find((a) => a.status === InvitationStatus.PENDING) ??
    null;

  return (
    <m.div
      initial={isMounted ? { opacity: 0, y: 20 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: isMounted ? index * 0.05 : 0 }}
      className="space-y-2 rounded-xl border border-border bg-muted/30 px-3.5 py-3 opacity-80 sm:px-4"
    >
      <div className="flex items-center gap-2">
        <ServiceBadge service={service} />
        <span className="flex-1" />
        {assignment && <RoleChip role={assignment.role} />}
      </div>

      <p className="line-clamp-2 text-[15px] leading-5 font-semibold tracking-tight text-muted-foreground">
        {event.name}
      </p>

      <div className="flex flex-col gap-1 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4">
        <MetaLine icon={Calendar}>{formatDateRange(event.dates)}</MetaLine>
        <MetaLine icon={MapPin}>{event.location}</MetaLine>
      </div>

      <div className="flex items-center gap-1.5 pt-0.5">
        <Pill label="Invite expired" icon={Hourglass} />
        <p className="min-w-0 flex-1 text-[11.5px] text-muted-foreground">
          Ran out before it was answered. Ask an admin for a new one.
        </p>
      </div>
    </m.div>
  );
}

/** A tinted capsule for a countdown or a lapse — red when it's urgent. */
function Pill({
  label,
  icon: Icon,
  urgent,
}: {
  label: string;
  icon: LucideIcon;
  urgent?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
        urgent ? "bg-destructive/10 text-destructive" : "bg-secondary text-muted-foreground",
      )}
    >
      <Icon aria-hidden className="size-2.5" />
      {label}
    </span>
  );
}

// ─── Pending Event Card ────────────────────────────────────────

/**
 * An invitation waiting on an answer, as on the phone: taller and louder than
 * a schedule card, because it's the only one that asks for something.
 * Everything above the buttons is what's needed to answer — when, where, who
 * asked, and how long is left.
 */
function PendingEventCard({
  event,
  organizationId,
  index,
  isMounted,
  getServiceType,
  canManage,
  now,
}: {
  event: Event;
  organizationId: string;
  index: number;
  isMounted: boolean;
  getServiceType: (id: string) => ServiceType | undefined;
  canManage: boolean;
  /** The real instant, which expiry counts down from. */
  now: Date;
}) {
  const [isAccepting, startAccept] = useTransition();
  const [isDeclining, startDecline] = useTransition();

  const service = getServiceType(event.serviceTypeId);
  const assignment =
    event.assignments.find((a) => a.status === InvitationStatus.PENDING) ??
    event.assignments[0] ??
    null;
  const colors = getColorClasses(service?.color || "indigo");
  const assignedBy = assignment?.assignedBy
    ? capitalizeName(assignment.assignedBy.firstName)
    : null;
  const expiry = assignment ? formatExpiry(assignment.expiresAt, now) : null;
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
    <div className="space-y-2.5 py-3.5 pr-3.5 pl-[15px] sm:py-4 sm:pr-4 sm:pl-5">
      <div className="flex items-center gap-2">
        <ServiceBadge service={service} />
        <span className="flex-1" />
        {assignment && <RoleChip role={assignment.role} />}
      </div>

      <h3 className="line-clamp-2 text-base leading-snug font-semibold tracking-tight text-foreground">
        {event.name}
      </h3>

      <div className="flex flex-col gap-1.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4">
        <MetaLine icon={Calendar}>{formatDateRange(event.dates)}</MetaLine>
        <MetaLine icon={Clock}>{formatTimeRange(event.dates)}</MetaLine>
        <MetaLine icon={MapPin}>{event.location}</MetaLine>
      </div>

      <div className="flex items-center gap-2 pt-0.5">
        <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
          {assignedBy && `Assigned by ${assignedBy}`}
        </p>
        {expiry && (
          <Pill
            label={expiry.label}
            icon={expiry.urgent ? ClockAlert : Hourglass}
            urgent={expiry.urgent}
          />
        )}
      </div>
    </div>
  );

  return (
    <m.div
      initial={isMounted ? { opacity: 0, y: 20 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: isMounted ? index * 0.05 : 0 }}
      className="relative overflow-hidden rounded-xl border border-border bg-card"
    >
      <span aria-hidden className={cn("absolute inset-y-0 left-0 w-[3px]", colors.solid)} />

      {canManage ? (
        <Link
          href={`/dashboard/organizations/${organizationId}/events/${event.id}`}
          className="block transition-colors hover:bg-secondary/40 focus-visible:bg-secondary/40 focus-visible:outline-none"
        >
          {details}
        </Link>
      ) : (
        details
      )}

      {/* Accept leads, filled; Decline is the same size, outlined. Full width
          on a phone, as in the app; from sm the pair sits at the right instead
          of stretching across a wide card. The default variant underneath both,
          since outline's dark-mode border would override Decline's red. */}
      <div className="flex gap-2.5 border-t border-border p-3 sm:justify-end">
        <m.div whileTap={{ scale: 0.97 }} className="flex-1 sm:w-36 sm:flex-none">
          <Button
            className="h-11 w-full rounded-xl bg-emerald-600 text-[15px] font-semibold text-white hover:bg-emerald-700 sm:h-10 sm:text-sm"
            onClick={handleAccept}
            disabled={isBusy}
          >
            {isAccepting ? (
              <Spinner />
            ) : (
              <>
                <Check className="size-3.5" />
                Accept
              </>
            )}
          </Button>
        </m.div>
        <m.div whileTap={{ scale: 0.97 }} className="flex-1 sm:w-36 sm:flex-none">
          <Button
            className="h-11 w-full rounded-xl border border-destructive/45 bg-destructive/5 text-[15px] font-semibold text-destructive hover:bg-destructive/10 sm:h-10 sm:text-sm"
            onClick={handleDecline}
            disabled={isBusy}
          >
            {isDeclining ? (
              <Spinner />
            ) : (
              <>
                <X className="size-3.5" />
                Decline
              </>
            )}
          </Button>
        </m.div>
      </div>
    </m.div>
  );
}
