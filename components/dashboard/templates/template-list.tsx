"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Calendar,
  CalendarClock,
  CalendarPlus,
  Clock,
  EllipsisVertical,
  MapPin,
  Pencil,
  Trash2,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

import { cn } from "@/lib/utils";
import { volunteerRoleConfig } from "@/lib/config/roles";
import { WEEKDAY_LABELS } from "@/lib/config/weekdays";
import { colorClasses } from "@/lib/config/service-types-config";
import {
  TemplateModal,
  type ServiceTypeOption,
} from "@/components/dashboard/templates/template-modal";
import { ConfirmTemplateDeleteModal } from "@/components/dashboard/templates/confirm-template-delete-modal";

import type { EventTemplateWithServiceType } from "@/lib/types";

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

interface TemplateCardProps {
  template: EventTemplateWithServiceType;
  serviceTypes: ServiceTypeOption[];
  organizationId: string;
  smartSchedulingAvailable: boolean;
}

const TemplateCard = ({
  template,
  serviceTypes,
  organizationId,
  smartSchedulingAvailable,
}: TemplateCardProps) => {

  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const colors =
    colorClasses[template.serviceType.color] || colorClasses.indigo;

  return (
    <div className="flex flex-col rounded-xl border border-border/40 bg-card p-4 shadow-sm transition-all hover:shadow-md">
      <div className="flex items-start justify-between gap-2">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
            colors.badge,
            colors.badgeText,
          )}
        >
          <span className={cn("h-1.5 w-1.5 rounded-full", colors.dot)} />
          {template.serviceType.name}
        </span>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground"
            >
              <EllipsisVertical className="h-4 w-4" />
              <span className="sr-only">Template actions</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Actions</DropdownMenuLabel>
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                setEditOpen(true);
              }}
            >
              <Pencil className="h-4 w-4" />
              Edit template
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onSelect={(e) => {
                e.preventDefault();
                setDeleteOpen(true);
              }}
            >
              <Trash2 className="h-4 w-4" />
              Delete template
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <h3 className="mt-3 font-semibold">{template.name}</h3>
      {template.description && (
        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
          {template.description}
        </p>
      )}

      <div className="mt-3 space-y-1.5 text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 shrink-0" />
          Every {WEEKDAY_LABELS[template.dayOfWeek]}
          {template.days.length > 1 &&
            ` – ${WEEKDAY_LABELS[(template.dayOfWeek + template.days.length - 1) % 7]}`}
        </div>
        {template.days.map((day) => (
          <div key={day.dayOffset} className="flex items-center gap-2">
            <Clock className="h-4 w-4 shrink-0" />
            {template.days.length > 1 && (
              <span className="w-8 shrink-0">
                {WEEKDAY_LABELS[(template.dayOfWeek + day.dayOffset) % 7].slice(0, 3)}
              </span>
            )}
            {formatDayTime(day.startTime)} – {formatDayTime(day.endTime)}
          </div>
        ))}
        {template.rehearsalStartTime && template.rehearsalEndTime && (
          <div className="flex items-center gap-2">
            <CalendarClock className="h-4 w-4 shrink-0" />
            <span>
              Rehearsal{" "}
              {WEEKDAY_LABELS[
                (((template.dayOfWeek + (template.rehearsalDayOffset ?? 0)) % 7) +
                  7) %
                  7
              ].slice(0, 3)}{" "}
              {formatDayTime(template.rehearsalStartTime)} –{" "}
              {formatDayTime(template.rehearsalEndTime)}
            </span>
          </div>
        )}
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 shrink-0" />
          {template.location}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {template.rolesNeeded.map((role) => {
          const config = volunteerRoleConfig[role];
          return (
            <span
              key={role}
              title={config.label}
              className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-secondary/50 text-sm"
            >
              {config.icon}
            </span>
          );
        })}
      </div>

      <Button asChild size="sm" className="mt-4 w-full gap-2">
        <Link
          href={`/dashboard/organizations/${organizationId}/events/create?templateId=${template.id}`}
        >
          <CalendarPlus className="h-4 w-4" />
          Use Template
        </Link>
      </Button>

      <TemplateModal
        organizationId={organizationId}
        serviceTypes={serviceTypes}
        smartSchedulingAvailable={smartSchedulingAvailable}
        template={template}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
      <ConfirmTemplateDeleteModal
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        templateId={template.id}
        organizationId={organizationId}
        templateName={template.name}
      />
    </div>
  );
};

interface TemplateListProps {
  templates: EventTemplateWithServiceType[];
  serviceTypes: ServiceTypeOption[];
  organizationId: string;
  smartSchedulingAvailable: boolean;
}

export const TemplateList = ({
  templates,
  serviceTypes,
  organizationId,
  smartSchedulingAvailable,
}: TemplateListProps) => (
  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
    {templates.map((template) => (
      <TemplateCard
        key={template.id}
        template={template}
        serviceTypes={serviceTypes}
        organizationId={organizationId}
        smartSchedulingAvailable={smartSchedulingAvailable}
      />
    ))}
  </div>
);
