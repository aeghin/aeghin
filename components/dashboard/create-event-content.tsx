"use client";

import type React from "react";
import {
  useState,
  useMemo,
  useCallback,
  useEffect,
  useRef,
  useTransition,
  useOptimistic,
} from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { m, AnimatePresence } from "motion/react";
import { format, eachDayOfInterval, isBefore, startOfDay, addDays } from "date-fns";
import type { DateRange } from "react-day-picker";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

import {
  CalendarOff,
  CalendarPlus,
  Loader2,
  Check,
  MapPin,
  Clock,
  ArrowLeft,
  ArrowRight,
  Send,
  Calendar,
  CheckCircle2,
  AlertCircle,
  Plus,
  X,
  TriangleAlert,
  LayoutTemplate,
  Search,
  ChevronRight,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { VolunteerRole } from "@/generated/prisma/enums";
import { volunteerRoleConfig } from "@/lib/config/roles";
import { WEEKDAY_LABELS } from "@/lib/config/weekdays";
import type { EventTemplateWithServiceType } from "@/lib/types";
import {
  createEventSchema,
  type CreateEventFormData,
} from "@/lib/validations/event";

import { checkMemberAvailability } from "@/lib/actions/event";
import { createServiceType } from "@/lib/actions/service-type";
import { createEvent } from "@/lib/actions/event";

import { Switch } from "@/components/ui/switch";

import { getServiceColors as getColorClasses } from "@/lib/config/service-types-config";

const newTypeColorOptions = [
  "indigo",
  "amber",
  "emerald",
  "pink",
  "violet",
  "red",
  "blue",
  "cyan",
];

const volunteerRoleEntries = Object.entries(volunteerRoleConfig) as [
  VolunteerRole,
  { label: string; icon: string },
][];


const getSelectedDates = (range: DateRange | undefined): Date[] => {
  if (!range?.from) return [];
  if (!range.to || range.from.getTime() === range.to.getTime())
    return [range.from];
  return eachDayOfInterval({ start: range.from, end: range.to });
};

const EMPTY_EVENT_DEFAULTS = {
  serviceTypeId: "",
  name: "",
  description: "",
  dateRange: { from: undefined, to: undefined },
  dayTimes: {},
  location: "",
  rolesNeeded: [],
  expiresAt: 3,
  smartSchedulingEnabled: false,
};


const templateToFormValues = (
  template: EventTemplateWithServiceType,
): CreateEventFormData => {
  const today = startOfDay(new Date());
  // Days until the template's first weekday — never 0, so "next Sunday" on a Sunday means in 7 days
  const offset = ((template.dayOfWeek - today.getDay() + 7) % 7) || 7;
  const firstDate = addDays(today, offset);

  const dayTimes: CreateEventFormData["dayTimes"] = {};
  for (const day of template.days) {
    const key = format(addDays(firstDate, day.dayOffset), "yyyy-MM-dd");
    dayTimes[key] = { startTime: day.startTime, endTime: day.endTime };
  }

  return {
    serviceTypeId: template.serviceTypeId,
    name: template.name,
    description: template.description,
    dateRange: {
      from: firstDate,
      to: addDays(firstDate, template.days.length - 1),
    },
    dayTimes,
    location: template.location,
    rolesNeeded: template.rolesNeeded,
    expiresAt: template.expiresInDays,
    smartSchedulingEnabled: template.smartSchedulingEnabled,
  };
};

export type Member = {
  id: string;
  userId: string;
  volunteerRoles: VolunteerRole[];
  organizationId: string;
  createdAt: Date;
  updatedAt: Date;
  user: {
    email: string;
    firstName: string;
    lastName: string;
    userImageUrl: string | null;
  };
};

export type ServiceType = {
  id: string;
  name: string;
  color: string;
};

export type MemberConflict = {
  eventName: string;
  startTime: string;
  endTime: string;
};

export type MemberBlockout = {
  startDate: string;
  endDate: string;
};

function formatConflictTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    timeZone: "UTC",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/** Blockout days are stored as UTC midnight, so they render with timeZone: "UTC" */
function formatBlockoutDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
  });
}

/** Format a raw "HH:mm" time-input value as 12-hour time (e.g. "14:30" -> "2:30 PM") */
function formatDayTime(time: string): string {
  if (!time) return "";
  return new Date(`1970-01-01T${time}:00Z`).toLocaleTimeString("en-US", {
    timeZone: "UTC",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

interface CreateEventPageContentProps {
  organizationId: string;
  organizationName: string;
  members: Member[];
  serviceTypes: ServiceType[];
  templates: EventTemplateWithServiceType[];
  initialTemplateId?: string;
}

export function CreateEventPageContent({
  organizationId,
  organizationName,
  members,
  serviceTypes,
  templates,
  initialTemplateId,
}: CreateEventPageContentProps) {
  const router = useRouter();

  const [optimisticServiceTypes, addOptimisticServiceType] = useOptimistic(
    serviceTypes,
    (current, newType: ServiceType) => [...current, newType],
  );

  const [step, setStep] = useState<1 | 2>(1);
  const [isCheckingAvailability, setIsCheckingAvailability] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [isCreatingNewType, setIsCreatingNewType] = useState(false);
  const [newTypeName, setNewTypeName] = useState("");
  const [newTypeColor, setNewTypeColor] = useState("indigo");

  const [roleAssignments, setRoleAssignments] = useState<
    Record<VolunteerRole, string[]>
  >({} as Record<VolunteerRole, string[]>);

  const [memberConflicts, setMemberConflicts] = useState<
    Record<string, MemberConflict>
  >({});

  const [memberBlockouts, setMemberBlockouts] = useState<
    Record<string, MemberBlockout>
  >({});

  // Warning modal state for assigning a conflicting member
  const [conflictWarning, setConflictWarning] = useState<{
    role: VolunteerRole;
    memberId: string;
    memberName: string;
    conflict: MemberConflict;
  } | null>(null);

  // Role picker modal — which role's member list is open, and its search text
  const [pickerRole, setPickerRole] = useState<VolunteerRole | null>(null);
  const [pickerSearch, setPickerSearch] = useState("");

  // React Hook Form
  const form = useForm<CreateEventFormData>({
    resolver: zodResolver(createEventSchema),
    defaultValues: EMPTY_EVENT_DEFAULTS,
  });

  const {
    watch,
    setValue,
    trigger,
    reset,
    formState: { errors },
  } = form;

  // Watch form values for rendering
  const watchedServiceTypeId = watch("serviceTypeId");
  const watchedName = watch("name");
  const watchedDescription = watch("description");
  const watchedDateRange = watch("dateRange");
  const watchedDayTimes = watch("dayTimes");
  const watchedLocation = watch("location");
  const watchedRolesNeeded = watch("rolesNeeded");
  const watchedExpiresAt = watch("expiresAt");
  const watchedSmartScheduling = watch("smartSchedulingEnabled");

  // The role grid tests every known role against this, so keep it keyed.
  const rolesNeededSet = new Set(watchedRolesNeeded);

  const selectedServiceType = optimisticServiceTypes.find(
    (t) => t.id === watchedServiceTypeId,
  );
  const serviceColors = selectedServiceType
    ? getColorClasses(selectedServiceType.color)
    : null;

  const selectedDates = useMemo(
    () => getSelectedDates(watchedDateRange as DateRange | undefined),
    [watchedDateRange],
  );

  const membersByRole = useMemo(() => {
    const map: Record<string, Member[]> = {};
    for (const role of Object.keys(volunteerRoleConfig)) {
      map[role] = members.filter((m) =>
        m.volunteerRoles?.includes(role as VolunteerRole),
      );
    }
    return map;
  }, [members]);

  const formatName = (name: string) =>
    name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();

  const [isPending, startTransition] = useTransition();
  const [isCreating, startCreateTransition] = useTransition();

  const [selectedTemplateId, setSelectedTemplateId] = useState("");

  const applyTemplate = useCallback(
    (template: EventTemplateWithServiceType) => {
      reset(templateToFormValues(template));
      setSelectedTemplateId(template.id);
      // People are never templated, and conflicts were computed for the old dates
      setRoleAssignments({} as Record<VolunteerRole, string[]>);
      setMemberConflicts({});
      setMemberBlockouts({});
      setError(null);
    },
    [reset],
  );

  // Apply ?templateId= once on mount. Client-only on purpose: the
  // next-occurrence date math reads the clock, and running it during SSR
  // could disagree with the browser and cause a hydration mismatch.
  const appliedInitialTemplate = useRef(false);
  useEffect(() => {
    if (appliedInitialTemplate.current) return;
    appliedInitialTemplate.current = true;
    const template = templates.find((t) => t.id === initialTemplateId);
    if (template) applyTemplate(template);
  }, [templates, initialTemplateId, applyTemplate]);

  const handleTemplateChange = (value: string) => {
    if (value === "blank") {
      reset(EMPTY_EVENT_DEFAULTS);
      setSelectedTemplateId("");
      setRoleAssignments({} as Record<VolunteerRole, string[]>);
      setMemberConflicts({});
      setMemberBlockouts({});
      setError(null);
      return;
    }

    const template = templates.find((t) => t.id === value);
    if (template) applyTemplate(template);
  };

  const handleDateRangeChange = useCallback(
    (range: DateRange | undefined) => {
      setValue(
        "dateRange",
        {
          from: range?.from ?? undefined,
          to: range?.to ?? undefined,
        } as CreateEventFormData["dateRange"],
        { shouldValidate: false },
      );

      // Initialize blank time slots for newly selected dates
      if (range?.from) {
        const dates = getSelectedDates(range);
        const currentTimes = form.getValues("dayTimes");
        const updated: Record<string, { startTime: string; endTime: string }> =
          {};

        for (const date of dates) {
          const key = format(date, "yyyy-MM-dd");
          updated[key] = currentTimes[key] || { startTime: "", endTime: "" };
        }

        setValue("dayTimes", updated);
      } else {
        setValue("dayTimes", {});
      }
    },
    [setValue, form],
  );

  const handleDayStartTimeChange = (dateKey: string, time: string) => {
    const current = form.getValues(`dayTimes.${dateKey}`);
    setValue(`dayTimes.${dateKey}`, {
      startTime: time,
      endTime: current?.endTime || "",
    });
  };

  const handleDayEndTimeChange = (dateKey: string, time: string) => {
    const current = form.getValues(`dayTimes.${dateKey}`);
    setValue(`dayTimes.${dateKey}`, {
      startTime: current?.startTime || "",
      endTime: time,
    });
  };

  const handleCreateNewType = () => {
    if (!newTypeName.trim()) return;

    startTransition(async () => {
      const result = await createServiceType(
        newTypeName,
        newTypeColor,
        organizationId
      );

      if (result.success) {
        if (result.serviceType) {
          addOptimisticServiceType(result.serviceType);
          setValue("serviceTypeId", result.serviceType.id);
        }
        setIsCreatingNewType(false);
        setNewTypeName("");
        setNewTypeColor("indigo");
      } else {
        setError(result.error);
      }
    });
  };

  const handleClose = () => {
    reset();
    setStep(1);
    setError(null);
    setIsSuccess(false);
    setRoleAssignments({} as Record<VolunteerRole, string[]>);
    setPickerRole(null);
    setPickerSearch("");
    setMemberConflicts({});
    setMemberBlockouts({});
    router.replace(`/dashboard/organizations/${organizationId}`);
  };

  const handleRoleToggle = (role: VolunteerRole) => {
    const current = form.getValues("rolesNeeded");
    const updated = current.includes(role)
      ? current.filter((r) => r !== role)
      : [...current, role];
    setValue("rolesNeeded", updated, { shouldValidate: true });
  };

  const handleAssignMember = (
    role: VolunteerRole,
    memberId: string,
    checked: boolean,
  ) => {
    // Blockouts are a hard block — never assignable, no override
    if (checked && memberBlockouts[memberId]) return;

    // If checking a conflicting member, show the warning modal instead of assigning directly
    if (checked && memberConflicts[memberId]) {
      const member = members.find((m) => m.userId === memberId);
      if (member) {
        setConflictWarning({
          role,
          memberId,
          memberName: `${formatName(member.user.firstName)} ${formatName(member.user.lastName)}`,
          conflict: memberConflicts[memberId],
        });
      }
      return;
    }

    setRoleAssignments((prev) => {
      const current = prev[role] || [];
      if (checked) {
        return { ...prev, [role]: [...current, memberId] };
      }
      return { ...prev, [role]: current.filter((id) => id !== memberId) };
    });
  };

  const handleConfirmConflictAssignment = () => {
    if (!conflictWarning) return;
    const { role, memberId } = conflictWarning;
    setRoleAssignments((prev) => {
      const current = prev[role] || [];
      return { ...prev, [role]: [...current, memberId] };
    });
    setConflictWarning(null);
  };

  const handleNext = async () => {
    // Validate step 1 fields only
    const valid = await trigger([
      "serviceTypeId",
      "name",
      "dateRange",
      "dayTimes",
      "location",
      "rolesNeeded",
    ]);

    if (!valid) return;

    setIsCheckingAvailability(true);
    setError(null);

    try {
      const { conflicts, blockouts } = await checkMemberAvailability({
        organizationId,
        dates: selectedDates.map((d) => {
          const key = format(d, "yyyy-MM-dd");
          const times = watchedDayTimes[key];
          return {
            date: key,
            startTime: new Date(`${key}T${times.startTime}:00Z`).toISOString(),
            endTime: new Date(`${key}T${times.endTime}:00Z`).toISOString(),
          };
        }),
      });
      setMemberConflicts(conflicts);
      setMemberBlockouts(blockouts);

      // Picks persist when going Back to change dates — drop anyone whose
      // blockout covers the new dates, since blockouts can't be overridden.
      setRoleAssignments((prev) => {
        const pruned = {} as Record<VolunteerRole, string[]>;
        for (const [role, userIds] of Object.entries(prev)) {
          pruned[role as VolunteerRole] = userIds.filter(
            (id) => !blockouts[id],
          );
        }
        return pruned;
      });

      setStep(2);
    } catch (err) {
      setError("Failed to check member availability. Please try again.");
    } finally {
      setIsCheckingAvailability(false);
    }
  };

  const onSubmit = async (data: CreateEventFormData) => {
    setError(null);

    const dayTimesISO = Object.fromEntries(
      Object.entries(data.dayTimes).map(([key, times]) => [
        key,
        {
          startTime: new Date(`${key}T${times.startTime}:00Z`).toISOString(),
          endTime: new Date(`${key}T${times.endTime}:00Z`).toISOString(),
        },
      ]),
    );

    startCreateTransition(async () => {
      try {
        const result = await createEvent(
          { ...data, dayTimes: dayTimesISO, roleAssignments },
          organizationId,
        );

        if (!result.success) {
          setError(result.error);
          return;
        }

        setIsSuccess(true);
        setTimeout(() => handleClose(), 2000);
      } catch {
        setError("Something went wrong. Please try again.");
      }
    });
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (step === 1) {
      handleNext();
      return;
    }
    // Step 2 — run full form validation + submit
    form.handleSubmit(onSubmit)(e);
  };

  // Check if all day times are filled for the "Next" button
  const allTimesSet =
    selectedDates.length > 0 &&
    selectedDates.every((d) => {
      const key = format(d, "yyyy-MM-dd");
      const times = watchedDayTimes[key];
      return times?.startTime && times?.endTime;
    });

  const canProceedToStep2 =
    watchedName &&
    selectedDates.length > 0 &&
    allTimesSet &&
    watchedLocation &&
    watchedRolesNeeded.length > 0;

  const assignedCount = Object.values(roleAssignments).flat().length;

  // Members shown in the open role-picker modal, filtered by its search text
  const pickerMembers = pickerRole ? membersByRole[pickerRole] || [] : [];
  const pickerAssigned = pickerRole ? roleAssignments[pickerRole] || [] : [];
  const pickerAssignedSet = new Set(pickerAssigned);
  const pickerQuery = pickerSearch.trim().toLowerCase();
  const pickerFiltered = pickerQuery
    ? pickerMembers.filter(
        (member) =>
          `${member.user.firstName} ${member.user.lastName}`
            .toLowerCase()
            .includes(pickerQuery) ||
          member.user.email.toLowerCase().includes(pickerQuery),
      )
    : pickerMembers;

  // Success state
  if (isSuccess) {
    return (
      <div className="flex min-h-[calc(100dvh-3.5rem)] items-center justify-center px-6">
          <m.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="text-center"
          >
            <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500/10">
              <CheckCircle2 className="h-10 w-10 text-emerald-600" />
            </div>
            <h1 className="mb-2 text-2xl font-bold">Event Created</h1>
            <p className="text-muted-foreground">
              {watchedName} has been created for {organizationName}.
              {assignedCount > 0 &&
                ` Invites sent to ${assignedCount} volunteer${assignedCount > 1 ? "s" : ""}.`}
            </p>
            <p className="mt-4 text-sm text-muted-foreground">Redirecting...</p>
          </m.div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100dvh-3.5rem)] flex-col">
      {/* Conflict Warning Modal */}
      <Dialog
        open={!!conflictWarning}
        onOpenChange={() => setConflictWarning(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TriangleAlert className="h-5 w-5 text-amber-500" />
              Scheduling Conflict
            </DialogTitle>
            <DialogDescription>
              {conflictWarning && (
                <>
                  <span className="font-medium text-foreground">
                    {conflictWarning.memberName}
                  </span>{" "}
                  is already assigned to{" "}
                  <span className="font-medium text-foreground">
                    {conflictWarning.conflict.eventName}
                  </span>{" "}
                  from {formatConflictTime(conflictWarning.conflict.startTime)} –{" "}
                  {formatConflictTime(conflictWarning.conflict.endTime)} on this day. Assigning them
                  may cause a time overlap.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              className="mr-2"
              variant="outline"
              onClick={() => setConflictWarning(null)}
            >
              Cancel
            </Button>
            <Button variant="default" onClick={handleConfirmConflictAssignment}>
              Assign Anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Header */}
      <m.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="mx-auto flex w-full max-w-screen-2xl flex-col gap-6 px-4 pt-6 sm:px-6 sm:pt-8">
          <Link
            href={`/dashboard/organizations/${organizationId}`}
            onClick={handleClose}
            className="group inline-flex w-fit items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
            Back to {organizationName}
          </Link>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-linear-to-br from-primary/20 to-primary/10 text-primary shadow-lg shadow-primary/10">
                <CalendarPlus className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                  Create Event
                </h1>
                <p className="text-sm text-muted-foreground">
                  {organizationName}
                </p>
              </div>
            </div>
            {/* Step indicator */}
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-xs font-medium text-muted-foreground sm:hidden">
                Step {step} of 2
              </p>
              <div className="hidden items-center gap-1 rounded-full border border-border/40 bg-card p-1 sm:flex">
                <div
                  className={cn(
                    "flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm transition-colors",
                    step === 1
                      ? "bg-primary font-medium text-primary-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  {step === 1 ? (
                    <span className="text-xs font-semibold">1</span>
                  ) : (
                    <Check className="h-3.5 w-3.5 text-emerald-500" />
                  )}
                  Event Details
                </div>
                <div
                  className={cn(
                    "flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm transition-colors",
                    step === 2
                      ? "bg-primary font-medium text-primary-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  <span className="text-xs font-semibold">2</span>
                  Invite Volunteers
                </div>
              </div>
            </div>
          </div>
        </div>
      </m.div>

      {/* Main Content */}
      <form onSubmit={handleFormSubmit} className="flex flex-1 flex-col">
        <div className="mx-auto w-full max-w-screen-2xl flex-1 px-4 py-6 sm:px-6">
          {/* Error Banner */}
          {error && (
            <m.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-6 flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400"
            >
              <AlertCircle className="h-5 w-5 shrink-0" />
              <p>{error}</p>
              <button
                type="button"
                onClick={() => setError(null)}
                className="ml-auto shrink-0 rounded-md p-1 hover:bg-red-100 dark:hover:bg-red-500/20"
              >
                <span className="sr-only">Dismiss</span>
                <X className="h-4 w-4" />
              </button>
            </m.div>
          )}

          <AnimatePresence mode="wait">
              {step === 1 ? (
                <m.div
                  key="step1"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.2 }}
                >
                  {/* Start from template */}
                  {templates.length > 0 && (
                    <div className="mb-2 flex flex-col gap-3 rounded-2xl border border-border/40 bg-linear-to-br from-card via-card to-primary/5 p-4 sm:flex-row sm:items-center">
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                          <LayoutTemplate className="h-4 w-4 text-primary" />
                        </div>
                        <div className="min-w-0">
                          <Label className="text-sm">Start from template</Label>
                          <p className="text-xs text-muted-foreground">
                            Pre-fills everything — you just pick the people
                          </p>
                        </div>
                      </div>
                      <Select
                        value={selectedTemplateId}
                        onValueChange={handleTemplateChange}
                      >
                        <SelectTrigger className="w-full sm:ml-auto sm:w-64">
                          <SelectValue placeholder="Choose a template..." />
                        </SelectTrigger>
                        <SelectContent>
                          {templates.map((template) => (
                            <SelectItem key={template.id} value={template.id}>
                              <div className="flex flex-col items-start">
                                <span>{template.name}</span>
                                <span className="text-xs text-muted-foreground">
                                  Every {WEEKDAY_LABELS[template.dayOfWeek]}
                                  {template.days.length > 1 &&
                                    ` – ${WEEKDAY_LABELS[(template.dayOfWeek + template.days.length - 1) % 7]}`}
                                </span>
                              </div>
                            </SelectItem>
                          ))}
                          {selectedTemplateId && (
                            <SelectItem value="blank">Start blank</SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {/* Section 01 — Basic information */}
                  <section className="pb-8 pt-4 sm:pb-10">
                    <div className="mb-6 flex items-start gap-4">
                      <span className="pt-1 font-mono text-sm font-semibold tracking-widest text-primary/70">
                        01
                      </span>
                      <div className="flex flex-col gap-0.5">
                        <h2 className="text-lg font-semibold tracking-tight">
                          Basic information
                        </h2>
                        <p className="text-sm text-muted-foreground">
                          Name the event and give it a service type
                        </p>
                      </div>
                    </div>
                    <div className="grid gap-6 md:grid-cols-2">
                          {/* Service Type */}
                          <div className="space-y-2">
                            <Label>Service Type</Label>
                            {!isCreatingNewType ? (
                              <div className="flex gap-2">
                                <Select
                                  value={watchedServiceTypeId}
                                  onValueChange={(val) => {
                                    if (!val) return;
                                    setValue("serviceTypeId", val, {
                                      shouldValidate: true,
                                    });
                                  }}
                                >
                                  <SelectTrigger className="flex-1">
                                    <SelectValue placeholder="Select a service type..." />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {optimisticServiceTypes.map((type) => {
                                      const colors = getColorClasses(
                                        type.color,
                                      );
                                      return (
                                        <SelectItem
                                          key={type.id}
                                          value={type.id}
                                        >
                                          <div className="flex items-center gap-2">
                                            <div
                                              className={cn(
                                                "h-2 w-2 rounded-full",
                                                colors.dot,
                                              )}
                                            />
                                            {type.name}
                                          </div>
                                        </SelectItem>
                                      );
                                    })}
                                  </SelectContent>
                                </Select>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="icon"
                                  onClick={() => setIsCreatingNewType(true)}
                                >
                                  <Plus className="h-4 w-4" />
                                </Button>
                              </div>
                            ) : (
                              <div className="space-y-3 rounded-lg border p-3">
                                <div className="flex gap-2">
                                  <Input
                                    placeholder="New service type name..."
                                    value={newTypeName}
                                    onChange={(e) =>
                                      setNewTypeName(e.target.value)
                                    }
                                    autoFocus
                                  />
                                  <Button
                                    type="button"
                                    size="sm"
                                    onClick={handleCreateNewType}
                                    disabled={isPending}
                                  >
                                    {isPending ? (
                                      <Loader2 className="h-3 w-3 animate-spin" />
                                    ) : (
                                      "Add"
                                    )}
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                      setIsCreatingNewType(false);
                                      setNewTypeName("");
                                      setNewTypeColor("indigo");
                                    }}
                                  >
                                    <X className="h-4 w-4" />
                                  </Button>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-muted-foreground">
                                    Color:
                                  </span>
                                  <div className="flex gap-1.5">
                                    {newTypeColorOptions.map((color) => {
                                      const colors = getColorClasses(color);
                                      return (
                                        <button
                                          key={color}
                                          type="button"
                                          onClick={() => setNewTypeColor(color)}
                                          className={cn(
                                            "h-5 w-5 rounded-full transition-all",
                                            colors.dot,
                                            newTypeColor === color
                                              ? "ring-2 ring-offset-1 ring-primary"
                                              : "hover:scale-110",
                                          )}
                                        />
                                      );
                                    })}
                                  </div>
                                </div>
                              </div>
                            )}
                            {errors.serviceTypeId && (
                              <p className="text-xs text-red-500">
                                {errors.serviceTypeId.message}
                              </p>
                            )}
                          </div>

                          {/* Event Name */}
                          <div className="space-y-2">
                            <Label htmlFor="name">Event Name *</Label>
                            <Input
                              id="name"
                              placeholder="e.g., Sunday Morning Worship"
                              value={watchedName}
                              onChange={(e) =>
                                setValue("name", e.target.value, {
                                  shouldValidate: true,
                                })
                              }
                            />
                            {errors.name && (
                              <p className="text-xs text-red-500">
                                {errors.name.message}
                              </p>
                            )}
                          </div>

                          {/* Description */}
                          <div className="space-y-2 md:col-span-2">
                            <Label htmlFor="description">Description</Label>
                            <Textarea
                              id="description"
                              placeholder="Add details about this event..."
                              value={watchedDescription}
                              onChange={(e) =>
                                setValue("description", e.target.value)
                              }
                              rows={3}
                            />
                          </div>
                    </div>
                  </section>

                  {/* Section 02 — Schedule & location */}
                  <section className="border-t border-border/40 py-8 sm:py-10">
                    <div className="mb-6 flex items-start gap-4">
                      <span className="pt-1 font-mono text-sm font-semibold tracking-widest text-primary/70">
                        02
                      </span>
                      <div className="flex flex-col gap-0.5">
                        <h2 className="text-lg font-semibold tracking-tight">
                          Schedule & location
                        </h2>
                        <p className="text-sm text-muted-foreground">
                          Pick the dates, times, and where it happens
                        </p>
                      </div>
                    </div>
                    <div className="grid gap-6 md:grid-cols-2">
                          {/* Date Range Picker */}
                          <div className="space-y-2">
                            <Label>Event Date(s) *</Label>
                            <Popover>
                              <PopoverTrigger asChild>
                                <Button
                                  variant="outline"
                                  className={cn(
                                    "w-full justify-start text-left font-normal",
                                    !watchedDateRange?.from &&
                                      "text-muted-foreground",
                                  )}
                                >
                                  <Calendar className="mr-2 h-4 w-4" />
                                  {watchedDateRange?.from ? (
                                    watchedDateRange.to &&
                                    watchedDateRange.from.getTime() !==
                                      watchedDateRange.to.getTime() ? (
                                      <>
                                        {format(
                                          watchedDateRange.from,
                                          "EEE, MMM d",
                                        )}{" "}
                                        –{" "}
                                        {format(
                                          watchedDateRange.to,
                                          "EEE, MMM d, yyyy",
                                        )}
                                      </>
                                    ) : (
                                      format(
                                        watchedDateRange.from,
                                        "EEEE, MMMM d, yyyy",
                                      )
                                    )
                                  ) : (
                                    <span>Pick a date or date range</span>
                                  )}
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent
                                className="w-auto p-0"
                                align="start"
                              >
                                <CalendarComponent
                                  mode="range"
                                  selected={watchedDateRange as DateRange}
                                  onSelect={handleDateRangeChange}
                                  numberOfMonths={2}
                                  disabled={(date) =>
                                    isBefore(date, startOfDay(new Date()))
                                  }
                                />
                              </PopoverContent>
                            </Popover>
                            {errors.dateRange?.from && (
                              <p className="text-xs text-red-500">
                                {errors.dateRange.from.message}
                              </p>
                            )}
                          </div>

                          {/* Location */}
                          <div className="space-y-2">
                            <Label htmlFor="location">Location *</Label>
                            <div className="relative">
                              <MapPin className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                              <Input
                                id="location"
                                className="pl-10"
                                placeholder="e.g., Main Sanctuary"
                                value={watchedLocation}
                                onChange={(e) =>
                                  setValue("location", e.target.value, {
                                    shouldValidate: true,
                                  })
                                }
                              />
                            </div>
                            {errors.location && (
                              <p className="text-xs text-red-500">
                                {errors.location.message}
                              </p>
                            )}
                          </div>
                    </div>

                          {/* Per-day start/end time inputs */}
                          {selectedDates.length > 0 && (
                            <div className="mt-6 flex flex-col gap-3">
                              <Label>Start & End Times *</Label>
                              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                                {selectedDates.map((date) => {
                                  const key = format(date, "yyyy-MM-dd");
                                  const dayLabel = format(date, "EEEE, MMM d");
                                  const times = watchedDayTimes[key];
                                  const dayErrors = errors.dayTimes?.[
                                    key as keyof typeof errors.dayTimes
                                  ] as
                                    | {
                                        startTime?: { message?: string };
                                        endTime?: { message?: string };
                                      }
                                    | undefined;

                                  return (
                                    <div
                                      key={key}
                                      className="flex flex-col gap-2 rounded-xl border border-border/40 bg-card/50 p-3"
                                    >
                                      <p className="text-sm font-medium">
                                        {dayLabel}
                                      </p>
                                      <div className="flex items-center gap-2">
                                        <div className="flex items-center gap-1.5 flex-1">
                                          <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                                          <Input
                                            type="time"
                                            value={times?.startTime || ""}
                                            onChange={(e) =>
                                              handleDayStartTimeChange(
                                                key,
                                                e.target.value,
                                              )
                                            }
                                            className="w-full"
                                          />
                                        </div>
                                        <span className="text-sm text-muted-foreground shrink-0">
                                          to
                                        </span>
                                        <div className="flex-1">
                                          <Input
                                            type="time"
                                            value={times?.endTime || ""}
                                            onChange={(e) =>
                                              handleDayEndTimeChange(
                                                key,
                                                e.target.value,
                                              )
                                            }
                                            className="w-full"
                                          />
                                        </div>
                                      </div>
                                      {(dayErrors?.startTime ||
                                        dayErrors?.endTime) && (
                                        <p className="text-xs text-red-500">
                                          {dayErrors?.startTime?.message ||
                                            dayErrors?.endTime?.message}
                                        </p>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                  </section>

                  {/* Section 03 — Volunteer roles */}
                  <section className="border-t border-border/40 py-8 sm:py-10">
                    <div className="mb-6 flex items-start gap-4">
                      <span className="pt-1 font-mono text-sm font-semibold tracking-widest text-primary/70">
                        03
                      </span>
                      <div className="flex flex-col gap-0.5">
                        <h2 className="text-lg font-semibold tracking-tight">
                          Volunteer roles
                        </h2>
                        <p className="text-sm text-muted-foreground">
                          Select the roles required for this event
                        </p>
                        {errors.rolesNeeded && (
                          <p className="text-xs text-red-500">
                            {errors.rolesNeeded.message}
                          </p>
                        )}
                      </div>
                    </div>
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                          {volunteerRoleEntries.map(([role, config]) => {
                            const isSelected = rolesNeededSet.has(role);
                            const availableCount =
                              membersByRole[role]?.length || 0;
                            return (
                              <button
                                key={role}
                                type="button"
                                onClick={() => handleRoleToggle(role)}
                                className={cn(
                                  "flex items-center gap-3 rounded-xl border p-4 text-left transition-all",
                                  isSelected
                                    ? "border-primary bg-primary/5 ring-1 ring-primary"
                                    : "border-border/60 bg-card/50 hover:border-primary/50 hover:bg-muted/50",
                                )}
                              >
                                <span className="text-xl">{config.icon}</span>
                                <div className="flex-1 min-w-0">
                                  <p className="font-medium truncate">
                                    {config.label}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {availableCount} available
                                  </p>
                                </div>
                                <div
                                  className={cn(
                                    "flex h-5 w-5 items-center justify-center rounded-full border transition-colors",
                                    isSelected
                                      ? "border-primary bg-primary text-primary-foreground"
                                      : "border-muted-foreground/30",
                                  )}
                                >
                                  {isSelected && <Check className="h-3 w-3" />}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                  </section>
                </m.div>
              ) : (
                <m.div
                  key="step2"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.2 }}
                >
                  {/* Event Summary */}
                  <div className="relative overflow-hidden rounded-2xl border border-border/40 bg-linear-to-br from-card via-card to-primary/5 p-5 sm:p-6">
                    <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-primary/5 blur-3xl" />
                      <div className="relative flex flex-wrap items-center gap-x-4 gap-y-2">
                        {serviceColors && (
                          <Badge
                            className={cn(
                              "gap-1.5",
                              serviceColors.badge,
                              serviceColors.badgeText,
                            )}
                          >
                            <span
                              className={cn(
                                "h-2 w-2 rounded-full",
                                serviceColors.dot,
                              )}
                            />
                            {selectedServiceType?.name}
                          </Badge>
                        )}
                        <h2 className="text-xl font-bold tracking-tight sm:text-2xl">
                          {watchedName}
                        </h2>
                        <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                          <MapPin className="h-4 w-4" />
                          {watchedLocation}
                        </span>
                      </div>

                      {/* Per-day schedule summary */}
                      <div className="relative mt-4 flex flex-wrap gap-2">
                        {selectedDates.map((date) => {
                          const key = format(date, "yyyy-MM-dd");
                          const times = watchedDayTimes[key];
                          return (
                            <div
                              key={key}
                              className="flex items-center gap-2 rounded-lg border border-border/40 bg-background/60 px-3 py-1.5 text-sm"
                            >
                              <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                              <span className="font-medium">
                                {format(date, "EEE, MMM d")}
                              </span>
                              {times?.startTime && times?.endTime && (
                                <>
                                  <span className="text-muted-foreground">
                                    ·
                                  </span>
                                  <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                                  <span className="text-muted-foreground">
                                    {formatDayTime(times.startTime)} -{" "}
                                    {formatDayTime(times.endTime)}
                                  </span>
                                </>
                              )}
                            </div>
                          );
                        })}
                      </div>
                  </div>

                  {/* Invitation Expiry */}
                  <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-border/40 bg-card/50 p-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="text-sm font-medium">Response Deadline</p>
                          <p className="text-xs text-muted-foreground">
                            How long members have to accept or decline
                          </p>
                        </div>
                      </div>
                      <Select
                        value={String(watchedExpiresAt)}
                        onValueChange={(val) =>
                          setValue("expiresAt", Number(val), { shouldValidate: true })
                        }
                      >
                        <SelectTrigger className="w-full sm:w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="3">3 days</SelectItem>
                          <SelectItem value="5">5 days</SelectItem>
                          <SelectItem value="7">7 days</SelectItem>
                        </SelectContent>
                      </Select>
                  </div>

                  {/* Smart Scheduling — per event, not org-wide */}
                  <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-border/40 bg-card/50 p-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-center gap-2">
                        <Zap className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="text-sm font-medium">Auto-fill Declines</p>
                          <p className="text-xs text-muted-foreground">
                            Invite the next best available member when someone
                            declines
                          </p>
                        </div>
                      </div>
                      <Switch
                        size="lg"
                        checked={watchedSmartScheduling}
                        onCheckedChange={(checked) =>
                          setValue("smartSchedulingEnabled", checked, {
                            shouldValidate: true,
                          })
                        }
                        aria-label="Toggle auto-fill for this event"
                        className="cursor-pointer self-start sm:self-auto"
                      />
                  </div>

                  {/* Role Assignments — compact rows; picking happens in a modal */}
                  <div className="mt-8 overflow-hidden rounded-2xl border border-border/40 bg-card/50">
                    {watchedRolesNeeded.map((role) => {
                      const config = volunteerRoleConfig[role];
                      const availableMembers = membersByRole[role] || [];
                      const assignedToRole = roleAssignments[role] || [];
                      const assignedToRoleSet = new Set(assignedToRole);
                      const assignedMembers = availableMembers.filter((m) =>
                        assignedToRoleSet.has(m.userId),
                      );

                      return (
                        <button
                          key={role}
                          type="button"
                          disabled={availableMembers.length === 0}
                          onClick={() => {
                            setPickerSearch("");
                            setPickerRole(role);
                          }}
                          className="flex w-full items-center gap-3 border-b border-border/40 px-4 py-4 text-left transition-colors last:border-b-0 hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-60 sm:px-5"
                        >
                          <span className="text-lg">{config.icon}</span>
                          <div className="min-w-0 flex-1">
                            <p className="font-medium">{config.label}</p>
                            <p className="text-xs text-muted-foreground">
                              {availableMembers.length === 0
                                ? "No members available for this role"
                                : assignedToRole.length > 0
                                  ? `${assignedToRole.length} assigned · ${availableMembers.length} available`
                                  : `${availableMembers.length} available`}
                            </p>
                          </div>
                          {assignedMembers.length > 0 && (
                            <div className="flex -space-x-2">
                              {assignedMembers.slice(0, 4).map((member) => (
                                <Avatar
                                  key={member.id}
                                  className="h-7 w-7 border-2 border-background"
                                >
                                  <AvatarImage
                                    src={member.user.userImageUrl ?? undefined}
                                    alt={`${member.user.firstName} ${member.user.lastName}`}
                                  />
                                  <AvatarFallback className="bg-primary/10 text-xs font-medium text-primary">
                                    {member.user.firstName.charAt(0)}
                                  </AvatarFallback>
                                </Avatar>
                              ))}
                              {assignedMembers.length > 4 && (
                                <div className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-background bg-muted text-[10px] font-medium">
                                  +{assignedMembers.length - 4}
                                </div>
                              )}
                            </div>
                          )}
                          {availableMembers.length > 0 && (
                            <span className="flex shrink-0 items-center gap-1 text-sm font-medium text-primary">
                              <span className="hidden sm:inline">
                                {assignedToRole.length > 0 ? "Manage" : "Assign"}
                              </span>
                              <ChevronRight className="h-4 w-4" />
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {/* Role picker modal — same member cards, same blockout/conflict guards */}
                  <Dialog
                    open={pickerRole !== null}
                    onOpenChange={(open) => {
                      if (!open) setPickerRole(null);
                    }}
                  >
                    <DialogContent className="sm:max-w-2xl">
                      {pickerRole && (
                        <>
                          <DialogHeader>
                            <DialogTitle className="flex items-center gap-2">
                              <span className="text-lg">
                                {volunteerRoleConfig[pickerRole].icon}
                              </span>
                              Assign {volunteerRoleConfig[pickerRole].label}
                            </DialogTitle>
                            <DialogDescription>
                              {pickerAssigned.length} assigned ·{" "}
                              {pickerMembers.length} available
                            </DialogDescription>
                          </DialogHeader>

                          {pickerMembers.length > 5 && (
                            <div className="relative">
                              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                              <Input
                                value={pickerSearch}
                                onChange={(e) => setPickerSearch(e.target.value)}
                                placeholder="Search by name or email..."
                                className="pl-9"
                              />
                            </div>
                          )}

                          {pickerFiltered.length > 0 ? (
                            <div className="grid max-h-[55vh] gap-3 overflow-y-auto pr-1 sm:grid-cols-2">
                              {pickerFiltered.map((member) => {
                                const isAssigned = pickerAssignedSet.has(
                                  member.userId,
                                );
                                const conflict = memberConflicts[member.userId];
                                const blockout = memberBlockouts[member.userId];

                                return (
                                  <label
                                    key={member.id}
                                    className={cn(
                                      "flex items-center gap-3 rounded-xl border p-3 transition-all",
                                      blockout
                                        ? "cursor-not-allowed border-border bg-muted/40 opacity-70"
                                        : isAssigned
                                          ? "cursor-pointer border-primary bg-primary/5"
                                          : conflict
                                            ? "cursor-pointer border-amber-200 bg-amber-50/50 dark:border-amber-500/20 dark:bg-amber-500/5"
                                            : "cursor-pointer border-border hover:bg-muted/50",
                                    )}
                                  >
                                    <Checkbox
                                      checked={isAssigned}
                                      disabled={!!blockout}
                                      onCheckedChange={(checked) =>
                                        handleAssignMember(
                                          pickerRole,
                                          member.userId,
                                          checked as boolean,
                                        )
                                      }
                                    />
                                    <div className="flex items-center gap-3 flex-1 min-w-0">
                                      <Avatar className="h-8 w-8 shrink-0">
                                        <AvatarImage
                                          src={member.user.userImageUrl ?? undefined}
                                          alt={`${member.user.firstName} ${member.user.lastName}`}
                                        />
                                        <AvatarFallback className="bg-primary/10 text-sm font-medium text-primary">
                                          {member.user.firstName.charAt(0)}
                                        </AvatarFallback>
                                      </Avatar>
                                      <div className="min-w-0">
                                        <p className="font-medium truncate">
                                          {member.user.firstName}{" "}
                                          {formatName(member.user.lastName)}
                                        </p>
                                        <p className="text-xs text-muted-foreground truncate">
                                          {member.user.email}
                                        </p>
                                        {blockout ? (
                                          <p className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1 mt-0.5">
                                            <CalendarOff className="h-3 w-3 shrink-0" />
                                            Blocked out ·{" "}
                                            {formatBlockoutDate(blockout.startDate)}
                                            {blockout.endDate !== blockout.startDate && (
                                              <> – {formatBlockoutDate(blockout.endDate)}</>
                                            )}
                                          </p>
                                        ) : conflict ? (
                                          <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1 mt-0.5">
                                            <TriangleAlert className="h-3 w-3 shrink-0" />
                                            {conflict.eventName} ·{" "}
                                            {formatConflictTime(conflict.startTime)} -{" "}
                                            {formatConflictTime(conflict.endTime)}
                                          </p>
                                        ) : null}
                                      </div>
                                    </div>
                                  </label>
                                );
                              })}
                            </div>
                          ) : (
                            <p className="rounded-xl border border-dashed border-border/60 px-4 py-6 text-center text-sm text-muted-foreground">
                              No members match your search
                            </p>
                          )}

                          <DialogFooter>
                            <Button
                              type="button"
                              onClick={() => setPickerRole(null)}
                            >
                              Done
                            </Button>
                          </DialogFooter>
                        </>
                      )}
                    </DialogContent>
                  </Dialog>
                </m.div>
              )}
          </AnimatePresence>
        </div>

        {/* Sticky action bar */}
        <div className="sticky bottom-0 z-10 border-t border-border/40 bg-background/80 backdrop-blur-md">
          <div className="mx-auto flex w-full max-w-screen-2xl items-center justify-between gap-3 px-4 py-4 sm:px-6">
            {step === 1 ? (
              <>
                <Button type="button" variant="outline" onClick={handleClose}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={!canProceedToStep2 || isCheckingAvailability}
                >
                  {isCheckingAvailability ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      Next: Invite Volunteers
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </>
                  )}
                </Button>
              </>
            ) : (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setStep(1)}
                >
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back
                </Button>
                <Button type="submit" disabled={isCreating}>
                  {isCreating ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating...
                    </>
                  ) : assignedCount > 0 ? (
                    <>
                      <Send className="mr-2 h-4 w-4" />
                      Create & Send Invites ({assignedCount})
                    </>
                  ) : (
                    <>
                      <CalendarPlus className="mr-2 h-4 w-4" />
                      Create Event
                    </>
                  )}
                </Button>
              </>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}
