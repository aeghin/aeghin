"use client";

import { useState, useTransition } from "react";
import { Check, LayoutTemplate, Plus, Save, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { VolunteerRole } from "@/generated/prisma/enums";
import { volunteerRoleConfig } from "@/lib/config/roles";
import { WEEKDAY_LABELS } from "@/lib/config/weekdays";
import { colorClasses } from "@/lib/config/service-types-config";
import {
  eventTemplateSchema,
  type EventTemplateInput,
} from "@/lib/validations/event-template";
import {
  createEventTemplate,
  updateEventTemplate,
} from "@/lib/actions/event-template";

import type { EventTemplateWithServiceType } from "@/lib/types";

export type ServiceTypeOption = {
  id: string;
  name: string;
  color: string;
};

const volunteerRoleEntries = Object.entries(volunteerRoleConfig) as [
  VolunteerRole,
  { label: string; icon: string },
][];

const getFormValues = (
  orgId: string,
  template: EventTemplateWithServiceType,
): EventTemplateInput => ({
  organizationId: orgId,
  serviceTypeId: template.serviceTypeId,
  name: template.name,
  description: template.description,
  location: template.location,
  dayOfWeek: template.dayOfWeek,
  days: template.days.map((day) => ({
    startTime: day.startTime,
    endTime: day.endTime,
  })),
  rolesNeeded: template.rolesNeeded,
  expiresInDays: template.expiresInDays,
  smartSchedulingEnabled: template.smartSchedulingEnabled,
});

interface TemplateModalProps {
  organizationId: string;
  serviceTypes: ServiceTypeOption[];
  template?: EventTemplateWithServiceType;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export function TemplateModal({
  organizationId,
  serviceTypes,
  template,
  open,
  onOpenChange,
}: TemplateModalProps) {

  const isEditing = Boolean(template);

  const [isPending, startTransition] = useTransition();

  const form = useForm<EventTemplateInput>({
    resolver: zodResolver(eventTemplateSchema),
    mode: "onChange",
    defaultValues: {
      organizationId,
      serviceTypeId: "",
      name: "",
      description: "",
      location: "",
      dayOfWeek: 0,
      days: [{ startTime: "", endTime: "" }],
      rolesNeeded: [],
      expiresInDays: 3,
      smartSchedulingEnabled: false,
    },
    values: template ? getFormValues(organizationId, template) : undefined,
  });

  const { isValid } = form.formState;

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "days",
  });

  // Row weekdays derive from the First Day select: row index = days after it
  const watchedDayOfWeek = form.watch("dayOfWeek");
  const dayLabel = (index: number) =>
    WEEKDAY_LABELS[(watchedDayOfWeek + index) % 7];

  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = open !== undefined;
  const isOpen = isControlled ? open : internalOpen;
  const setOpen = (next: boolean) => {
    if (!isControlled) setInternalOpen(next);
    onOpenChange?.(next);
  };

  const handleClose = (next: boolean) => {
    if (!next) form.reset();
    setOpen(next);
  };

  const handleSubmit = (data: EventTemplateInput) => {
    startTransition(async () => {
      const result = template
        ? await updateEventTemplate(template.id, data)
        : await createEventTemplate(data);

      if (result.success) {
        toast.success(
          isEditing
            ? "Template has been updated"
            : `${data.name} is ready to use`,
          { position: "top-center" },
        );
        handleClose(false);
      } else {
        toast.error(result.error, { position: "top-center" });
      };
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      {!isControlled && (
        <DialogTrigger asChild>
          <Button
            size="sm"
            className="gap-2 shadow-lg shadow-primary/20 transition-all hover:scale-105 hover:shadow-primary/30"
          >
            <Plus className="h-4 w-4" />
            New Template
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="sm:max-w-140 max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <LayoutTemplate className="h-4 w-4" />
            </span>
            {isEditing ? "Edit template" : "New event template"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Update this template's details. Events already created from it are not affected."
              : "Save the details of a recurring event once, then pre-fill the create-event form with a click."}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)}>
            <div className="space-y-5 py-2">
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Template Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Sunday Service" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="location"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Location</FormLabel>
                      <FormControl>
                        <Input placeholder="Main Hall" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="What is this event about? (optional)"
                        className="resize-none"
                        rows={2}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="serviceTypeId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Service Type</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select a service type..." />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {serviceTypes.map((type) => {
                          const colors =
                            colorClasses[type.color] || colorClasses.indigo;
                          return (
                            <SelectItem key={type.id} value={type.id}>
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
                    {serviceTypes.length === 0 && (
                      <p className="text-xs text-muted-foreground">
                        No service types yet — create one from the create-event
                        page first.
                      </p>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="dayOfWeek"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>First Day</FormLabel>
                      <Select
                        value={String(field.value)}
                        onValueChange={(v) => field.onChange(Number(v))}
                      >
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {WEEKDAY_LABELS.map((label, index) => (
                            <SelectItem key={label} value={String(index)}>
                              {label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="expiresInDays"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Response Deadline</FormLabel>
                      <Select
                        value={String(field.value)}
                        onValueChange={(v) => field.onChange(Number(v))}
                      >
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="3">3 days</SelectItem>
                          <SelectItem value="5">5 days</SelectItem>
                          <SelectItem value="7">7 days</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="smartSchedulingEnabled"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border border-border/40 p-3">
                    <div className="space-y-0.5 pr-3">
                      <FormLabel>Auto-fill Declines</FormLabel>
                      <p className="text-xs text-muted-foreground">
                        Events from this template start with auto-fill on
                      </p>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        className="cursor-pointer"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Daily Schedule</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={fields.length >= 7}
                    onClick={() => append({ startTime: "", endTime: "" })}
                  >
                    <Plus className="h-4 w-4" />
                    Add {dayLabel(fields.length)}
                  </Button>
                </div>
                {fields.map((dayField, index) => (
                  <div
                    key={dayField.id}
                    className="space-y-2 rounded-lg border p-3"
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">{dayLabel(index)}</p>
                      {fields.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-muted-foreground"
                          onClick={() => remove(index)}
                        >
                          <X className="h-4 w-4" />
                          <span className="sr-only">Remove day</span>
                        </Button>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <FormField
                        control={form.control}
                        name={`days.${index}.startTime`}
                        render={({ field }) => (
                          <FormItem className="flex-1">
                            <FormControl>
                              <Input type="time" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <span className="shrink-0 text-sm text-muted-foreground">
                        to
                      </span>
                      <FormField
                        control={form.control}
                        name={`days.${index}.endTime`}
                        render={({ field }) => (
                          <FormItem className="flex-1">
                            <FormControl>
                              <Input type="time" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <FormField
                control={form.control}
                name="rolesNeeded"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Roles Needed</FormLabel>
                    <div className="grid grid-cols-2 gap-2">
                      {volunteerRoleEntries.map(([role, config]) => {
                        const selected = field.value.includes(role);
                        return (
                          <button
                            key={role}
                            type="button"
                            onClick={() =>
                              field.onChange(
                                selected
                                  ? field.value.filter((r) => r !== role)
                                  : [...field.value, role],
                              )
                            }
                            className={cn(
                              "flex cursor-pointer items-center gap-2 rounded-lg border p-2.5 text-sm transition-all",
                              selected
                                ? "border-primary bg-primary/5 font-medium"
                                : "text-muted-foreground hover:bg-secondary/50",
                            )}
                          >
                            <span>{config.icon}</span>
                            {config.label}
                            {selected && (
                              <Check className="ml-auto h-4 w-4 text-primary" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <DialogFooter className="mt-6">
              <Button
                type="button"
                variant="outline"
                disabled={isPending}
                onClick={() => handleClose(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isPending || !isValid || serviceTypes.length === 0}
              >
                {isPending ? (
                  <>
                    <Spinner className="inline-start" /> Saving...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" />
                    {isEditing ? "Save Changes" : "Create Template"}
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
