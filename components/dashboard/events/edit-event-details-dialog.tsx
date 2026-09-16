"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { format, eachDayOfInterval } from "date-fns";
import type { DateRange } from "react-day-picker";
import {
  AlertTriangle,
  Calendar,
  CalendarClock,
  Clock,
  Loader2,
  MapPin,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

import { cn } from "@/lib/utils";
import { colorClasses } from "@/lib/config/service-types-config";
import { checkMemberAvailability, editEventDetails } from "@/lib/actions/event";
import {
  editEventDetailsSchema,
  EMPTY_REHEARSAL,
  type RehearsalFormValue,
} from "@/lib/validations/event";

type DayTimes = Record<string, { startTime: string; endTime: string }>;

export type EditableEventDates = {
  startTime: Date;
  endTime: Date;
}[];

export type EditableAssignee = {
  userId: string;
  firstName: string;
  lastName: string;
};

type AffectedAssignee = {
  userId: string;
  name: string;
  reason: string;
};

const formatDay = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
  });

const getSelectedDates = (range: DateRange | undefined): Date[] => {
  if (!range?.from) return [];
  if (!range.to || range.from.getTime() === range.to.getTime())
    return [range.from];
  return eachDayOfInterval({ start: range.from, end: range.to });
};

/** A "YYYY-MM-DD" key as LOCAL midnight, which is what the calendar selects in. */
const toLocalMidnight = (key: string) => {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
};

const toFormShape = (dates: EditableEventDates) => {
  const sorted = [...dates].sort(
    (a, b) => a.startTime.getTime() - b.startTime.getTime(),
  );

  const dayTimes: DayTimes = {};

  for (const date of sorted) {
    const key = date.startTime.toISOString().slice(0, 10);
    dayTimes[key] = {
      startTime: date.startTime.toISOString().slice(11, 16),
      endTime: date.endTime.toISOString().slice(11, 16),
    };
  }

  const keys = Object.keys(dayTimes);

  const dateRange: DateRange | undefined = keys.length
    ? {
        from: toLocalMidnight(keys[0]),
        to: toLocalMidnight(keys[keys.length - 1]),
      }
    : undefined;

  return { dayTimes, dateRange };
};

/**
 * Stored rehearsal columns back into the form's wall-clock strings. Sliced off
 * the ISO string rather than read with local getters, for the same reason
 * toFormShape does it: these are floating-UTC times, not instants.
 */
const toRehearsalFormShape = (
  start: Date | null,
  end: Date | null,
): RehearsalFormValue => {
  if (!start) return EMPTY_REHEARSAL;

  return {
    date: start.toISOString().slice(0, 10),
    startTime: start.toISOString().slice(11, 16),
    endTime: end ? end.toISOString().slice(11, 16) : "",
  };
};

interface EditEventDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventId: string;
  organizationId: string;
  serviceColor: string;
  initial: {
    name: string;
    description: string;
    location: string;
    dates: EditableEventDates;
    rehearsalStart: Date | null;
    rehearsalEnd: Date | null;
  };
  assignees: EditableAssignee[];
}

export function EditEventDetailsDialog({
  open,
  onOpenChange,
  eventId,
  organizationId,
  serviceColor,
  initial,
  assignees,
}: EditEventDetailsDialogProps) {
  const serviceColors = colorClasses[serviceColor];

  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description);
  const [location, setLocation] = useState(initial.location);
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [dayTimes, setDayTimes] = useState<DayTimes>({});
  const [rehearsal, setRehearsal] =
    useState<RehearsalFormValue>(EMPTY_REHEARSAL);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [affected, setAffected] = useState<AffectedAssignee[]>([]);
  const [isSaving, startSaving] = useTransition();

  const initialRef = useRef(initial);
  initialRef.current = initial;

  useEffect(() => {
    if (!open) return;

    const current = initialRef.current;
    const seeded = toFormShape(current.dates);

    setName(current.name);
    setDescription(current.description);
    setLocation(current.location);
    setDateRange(seeded.dateRange);
    setDayTimes(seeded.dayTimes);
    setRehearsal(
      toRehearsalFormShape(current.rehearsalStart, current.rehearsalEnd),
    );
    setErrors({});
    setAffected([]);
  }, [open]);

  const selectedDates = getSelectedDates(dateRange);

  const handleDateRangeChange = (range: DateRange | undefined) => {
    setDateRange(range);
    setAffected([]);

    setDayTimes((prev) => {
      const next: DayTimes = {};

      for (const date of getSelectedDates(range)) {
        const key = format(date, "yyyy-MM-dd");
        next[key] = prev[key] ?? { startTime: "", endTime: "" };
      }

      return next;
    });
  };

  const handleTimeChange = (
    key: string,
    field: "startTime" | "endTime",
    value: string,
  ) => {
    setAffected([]);
    setDayTimes((prev) => ({
      ...prev,
      [key]: { ...prev[key], [field]: value },
    }));
  };

  const handleRehearsalChange = (
    field: keyof RehearsalFormValue,
    value: string,
  ) => {
    setRehearsal((prev) => ({ ...prev, [field]: value }));
  };

  const handleOpenChange = (next: boolean) => {
    if (isSaving) return;
    onOpenChange(next);
  };

  const handleSave = () => {
    const parsed = editEventDetailsSchema.safeParse({
      eventId,
      organizationId,
      name,
      description,
      location,
      dateRange,
      dayTimes,
      rehearsal,
    });

    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};

      for (const issue of parsed.error.issues) {
        const path = issue.path.join(".");
        if (!fieldErrors[path]) fieldErrors[path] = issue.message;
      }

      setErrors(fieldErrors);
      return;
    }

    if (Object.keys(parsed.data.dayTimes).length === 0) {
      setErrors({ dateRange: "Pick at least one day" });
      return;
    }

    setErrors({});
    setAffected([]);

    const dayTimesISO = Object.fromEntries(
      Object.entries(parsed.data.dayTimes).map(([key, times]) => [
        key,
        {
          startTime: new Date(`${key}T${times.startTime}:00Z`).toISOString(),
          endTime: new Date(`${key}T${times.endTime}:00Z`).toISOString(),
        },
      ]),
    );

    // Always sent, blank included — the action reads a present-but-blank
    // rehearsal as "clear it", and a missing one as "leave it alone".
    const rehearsalISO =
      rehearsal.date && rehearsal.startTime && rehearsal.endTime
        ? {
            date: rehearsal.date,
            startTime: new Date(
              `${rehearsal.date}T${rehearsal.startTime}:00Z`,
            ).toISOString(),
            endTime: new Date(
              `${rehearsal.date}T${rehearsal.endTime}:00Z`,
            ).toISOString(),
          }
        : EMPTY_REHEARSAL;

    startSaving(async () => {
      if (assignees.length > 0) {
        try {
          const { conflicts, blockouts } = await checkMemberAvailability({
            organizationId,
            excludeEventId: eventId,
            dates: Object.entries(dayTimesISO).map(([key, times]) => ({
              date: key,
              startTime: times.startTime,
              endTime: times.endTime,
            })),
          });

          const clashes: AffectedAssignee[] = [];

          for (const assignee of assignees) {
            const blockout = blockouts[assignee.userId];
            const conflict = conflicts[assignee.userId];

            if (!blockout && !conflict) continue;

            clashes.push({
              userId: assignee.userId,
              name: `${assignee.firstName} ${assignee.lastName}`,
              reason: blockout
                ? `Unavailable ${formatDay(blockout.startDate)} – ${formatDay(blockout.endDate)}`
                : `Already serving at ${conflict.eventName}`,
            });
          }

          if (clashes.length > 0) {
            setAffected(clashes);
            return;
          }
        } catch {
          toast.error("Couldn't check volunteer availability", {
            position: "top-center",
          });
          return;
        }
      }

      const result = await editEventDetails({
        ...parsed.data,
        dayTimes: dayTimesISO,
        rehearsal: rehearsalISO,
      });

      if (!result.success) {
        toast.error(result.error, { position: "top-center" });
        return;
      }

      toast.success("Event details updated", { position: "top-center" });
      onOpenChange(false);
    });
  };

  const dateError = errors["dateRange.from"] || errors.dateRange;

  const hasRehearsal = Boolean(
    rehearsal.date || rehearsal.startTime || rehearsal.endTime,
  );

  const rehearsalError =
    errors["rehearsal.date"] ||
    errors["rehearsal.startTime"] ||
    errors["rehearsal.endTime"];

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit event details</DialogTitle>
          <DialogDescription>
            Changes apply to everyone already assigned to this event.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] min-w-0 space-y-5 overflow-y-auto overflow-x-hidden pr-1">
          {affected.length > 0 && (
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-3">
              <p className="flex items-start gap-2 text-sm font-medium text-amber-700 dark:text-amber-400">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  These dates don&apos;t work for {affected.length}{" "}
                  {affected.length === 1 ? "volunteer" : "volunteers"}
                </span>
              </p>
              <ul className="mt-2 space-y-1.5 pl-6">
                {affected.map((person) => (
                  <li key={person.userId} className="min-w-0 text-sm">
                    <span className="font-medium text-foreground">
                      {person.name}
                    </span>
                    <span className="text-muted-foreground">
                      {" — "}
                      {person.reason}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-2.5 pl-6 text-xs text-muted-foreground">
                Remove them from the team roster or pick different dates, then
                save again.
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="edit-event-name">Event name *</Label>
            <Input
              id="edit-event-name"
              value={name}
              maxLength={25}
              placeholder="e.g., Sunday Morning Service"
              onChange={(e) => setName(e.target.value)}
            />
            {errors.name && (
              <p className="text-xs text-red-500">{errors.name}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-event-description">Description</Label>
            <Textarea
              id="edit-event-description"
              value={description}
              rows={3}
              placeholder="Anything the team should know"
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div className="min-w-0 space-y-2">
              <Label>Event date(s) *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full min-w-0 justify-start text-left font-normal",
                      !dateRange?.from && "text-muted-foreground",
                    )}
                  >
                    <Calendar className="mr-2 h-4 w-4 shrink-0" />
                    <span className="truncate">
                      {dateRange?.from
                        ? dateRange.to &&
                          dateRange.from.getTime() !== dateRange.to.getTime()
                          ? `${format(dateRange.from, "MMM d")} – ${format(dateRange.to, "MMM d, yyyy")}`
                          : format(dateRange.from, "EEE, MMM d, yyyy")
                        : "Pick a date or date range"}
                    </span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  className="w-auto max-w-[calc(100vw-2rem)] p-0"
                  align="start"
                >
                  <CalendarComponent
                    mode="range"
                    selected={dateRange}
                    onSelect={handleDateRangeChange}
                    numberOfMonths={2}
                    className="max-h-[60vh] overflow-y-auto md:max-h-none"
                  />
                </PopoverContent>
              </Popover>
              {dateError && (
                <p className="text-xs text-red-500">{dateError}</p>
              )}
            </div>

            <div className="min-w-0 space-y-2">
              <Label htmlFor="edit-event-location">Location *</Label>
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="edit-event-location"
                  className="pl-10"
                  value={location}
                  maxLength={20}
                  placeholder="e.g., Main Sanctuary"
                  onChange={(e) => setLocation(e.target.value)}
                />
              </div>
              {errors.location && (
                <p className="text-xs text-red-500">{errors.location}</p>
              )}
            </div>
          </div>

          {selectedDates.length > 0 && (
            <div className="flex flex-col gap-3">
              <Label>Start & end times *</Label>
              <div className="grid gap-3 sm:grid-cols-2">
                {selectedDates.map((date) => {
                  const key = format(date, "yyyy-MM-dd");
                  const times = dayTimes[key];
                  const dayError =
                    errors[`dayTimes.${key}.startTime`] ||
                    errors[`dayTimes.${key}.endTime`];

                  return (
                    <div
                      key={key}
                      className={cn(
                        "flex min-w-0 flex-col gap-2.5 rounded-xl border border-border/40 bg-card/50 p-3",
                        serviceColors.focusBorder,
                      )}
                    >
                      <p className="flex min-w-0 items-center gap-1.5 text-sm font-medium">
                        <Clock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span className="truncate">
                          {format(date, "EEEE, MMM d")}
                        </span>
                      </p>

                      <div className="grid grid-cols-2 gap-2">
                        <div className="min-w-0 space-y-1">
                          <Label
                            htmlFor={`start-${key}`}
                            className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
                          >
                            Start
                          </Label>
                          <Input
                            id={`start-${key}`}
                            type="time"
                            className="w-full px-2"
                            value={times?.startTime || ""}
                            onChange={(e) =>
                              handleTimeChange(key, "startTime", e.target.value)
                            }
                          />
                        </div>
                        <div className="min-w-0 space-y-1">
                          <Label
                            htmlFor={`end-${key}`}
                            className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
                          >
                            End
                          </Label>
                          <Input
                            id={`end-${key}`}
                            type="time"
                            className="w-full px-2"
                            value={times?.endTime || ""}
                            onChange={(e) =>
                              handleTimeChange(key, "endTime", e.target.value)
                            }
                          />
                        </div>
                      </div>

                      {dayError && (
                        <p className="text-xs text-red-500">{dayError}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Rehearsal — optional, and display-only: it stays out of the
              availability check that gates saving. */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Label>Rehearsal</Label>
              <span className="text-xs text-muted-foreground">Optional</span>
            </div>

            <div
              className={cn(
                "flex min-w-0 flex-col gap-2.5 rounded-xl border border-border/40 bg-card/50 p-3",
                serviceColors.focusBorder,
              )}
            >
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full min-w-0 justify-start text-left font-normal",
                      !rehearsal.date && "text-muted-foreground",
                    )}
                  >
                    <CalendarClock className="mr-2 h-4 w-4 shrink-0" />
                    <span className="truncate">
                      {rehearsal.date
                        ? format(
                            toLocalMidnight(rehearsal.date),
                            "EEE, MMM d, yyyy",
                          )
                        : "Pick a rehearsal date"}
                    </span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  className="w-auto max-w-[calc(100vw-2rem)] p-0"
                  align="start"
                >
                  <CalendarComponent
                    mode="single"
                    selected={
                      rehearsal.date
                        ? toLocalMidnight(rehearsal.date)
                        : undefined
                    }
                    onSelect={(date) =>
                      handleRehearsalChange(
                        "date",
                        date ? format(date, "yyyy-MM-dd") : "",
                      )
                    }
                    className="max-h-[60vh] overflow-y-auto md:max-h-none"
                  />
                </PopoverContent>
              </Popover>

              <div className="grid grid-cols-2 gap-2">
                <div className="min-w-0 space-y-1">
                  <Label
                    htmlFor="rehearsal-start"
                    className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
                  >
                    Start
                  </Label>
                  <Input
                    id="rehearsal-start"
                    type="time"
                    className="w-full px-2"
                    value={rehearsal.startTime}
                    onChange={(e) =>
                      handleRehearsalChange("startTime", e.target.value)
                    }
                  />
                </div>
                <div className="min-w-0 space-y-1">
                  <Label
                    htmlFor="rehearsal-end"
                    className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
                  >
                    End
                  </Label>
                  <Input
                    id="rehearsal-end"
                    type="time"
                    className="w-full px-2"
                    value={rehearsal.endTime}
                    onChange={(e) =>
                      handleRehearsalChange("endTime", e.target.value)
                    }
                  />
                </div>
              </div>

              {rehearsalError && (
                <p className="text-xs text-red-500">{rehearsalError}</p>
              )}

              {hasRehearsal && (
                <button
                  type="button"
                  onClick={() => setRehearsal(EMPTY_REHEARSAL)}
                  className="self-start text-xs text-muted-foreground transition-all hover:text-foreground"
                >
                  Clear rehearsal
                </button>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            className="mr-2"
            onClick={() => handleOpenChange(false)}
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className={cn(serviceColors.solid, serviceColors.solidHover)}
            onClick={handleSave}
            disabled={isSaving}
          >
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              "Save changes"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
