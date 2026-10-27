"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, Loader2, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Toggle } from "@/components/ui/toggle";

import { cn } from "@/lib/utils";
import { colorClasses } from "@/lib/config/service-types-config";
import { RoleCategory as Team, VolunteerRole } from "@/generated/prisma/enums";
import { TEAM_ORDER, teamLabel, teamOfRole, volunteerRoleConfig } from "@/lib/config/roles";
import { addEventRoles } from "@/lib/actions/event";
import type { EventTeamLead } from "@/lib/services/team-notifications";
import { detailButtonClass, detailIconClass } from "./event-detail-parts";

const volunteerRoleEntries = Object.entries(volunteerRoleConfig) as [
  VolunteerRole,
  { label: string; icon: string },
][];

interface AddEventRolesDialogProps {
  organizationId: string;
  eventId: string;
  /** Roles already on the event — shown as locked in */
  existingRoles: VolunteerRole[];
  serviceColor: string;
  /** Who handles each team on this event: whoever covers it here, else the service type's lead. */
  teamLeads: Partial<Record<Team, EventTeamLead>>;
  currentUserId: string;
  className?: string;
}

export function AddEventRolesDialog({
  organizationId,
  eventId,
  existingRoles,
  serviceColor,
  teamLeads,
  currentUserId,
  className,
}: AddEventRolesDialogProps) {
  const serviceColors = colorClasses[serviceColor];
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<VolunteerRole[]>([]);
  const [fillMyself, setFillMyself] = useState<Team[]>([]);
  const [isSaving, startSaving] = useTransition();

  const existing = new Set(existingRoles);
  const selectedSet = new Set(selected);

  // The teams the picked roles bring onto the event that somebody else would
  // be told to staff. The create form's "Who handles open spots" never
  // offered them, so the adder can take one on here before that happens.
  const rosterTeams = new Set(existingRoles.map(teamOfRole));

  const newTeams = TEAM_ORDER.flatMap((team) => {
    const handler = teamLeads[team];

    return !rosterTeams.has(team) &&
      selected.some((role) => teamOfRole(role) === team) &&
      handler &&
      handler.person.userId !== currentUserId
      ? [{ team, name: `${handler.person.firstName} ${handler.person.lastName}` }]
      : [];
  });

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setSelected([]);
      setFillMyself([]);
    }
  };

  const toggleRole = (role: VolunteerRole) => {
    if (existing.has(role)) return;

    setSelected((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role],
    );
  };

  const handleSave = () => {
    startSaving(async () => {
      const result = await addEventRoles(organizationId, eventId, {
        roles: selected,
        // Only teams still on offer: one whose roles were unpicked again is left out.
        fillMyself: fillMyself.filter((team) => newTeams.some((entry) => entry.team === team)),
      });

      if (!result.success) {
        toast.error(result.error, { position: "top-center" });
        return;
      }

      toast.success(
        `Added ${selected.length} ${selected.length === 1 ? "role" : "roles"}`,
        { position: "top-center" },
      );

      handleOpenChange(false);
    });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <button
          type="button"
          className={cn(detailButtonClass(serviceColor), className)}
        >
          <Plus className={detailIconClass(serviceColor)} />
          Add roles
        </button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add roles to this event</DialogTitle>
          <DialogDescription>
            Roles show up on the team roster as open slots you can invite into.
          </DialogDescription>
        </DialogHeader>

        <div className="grid max-h-[55vh] gap-3 overflow-y-auto pr-1 sm:grid-cols-2">
          {volunteerRoleEntries.map(([role, config]) => {
            const alreadyOnEvent = existing.has(role);
            const isSelected = selectedSet.has(role);

            return (
              <button
                key={role}
                type="button"
                disabled={alreadyOnEvent}
                onClick={() => toggleRole(role)}
                className={cn(
                  "flex items-center gap-3 rounded-xl border p-4 text-left transition-all",
                  alreadyOnEvent
                    ? "cursor-not-allowed border-border bg-muted/40 opacity-70"
                    : isSelected
                      ? cn(
                          "cursor-pointer ring-1",
                          serviceColors.borderSolid,
                          serviceColors.tint,
                          serviceColors.ring,
                        )
                      : cn(
                          "cursor-pointer border-border/60 bg-card/50 hover:bg-muted/50",
                          serviceColors.borderHover,
                        ),
                )}
              >
                <span className="text-xl">{config.icon}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{config.label}</p>
                  {/* Only picks roles: who can fill one is the invite
                      dialog's question, asked with the availability check. */}
                  {alreadyOnEvent && (
                    <p className="text-xs text-muted-foreground">
                      Already on this event
                    </p>
                  )}
                </div>
                <div
                  className={cn(
                    "flex h-5 w-5 items-center justify-center rounded-full border transition-colors",
                    isSelected || alreadyOnEvent
                      ? cn(
                          serviceColors.borderSolid,
                          serviceColors.solid,
                          "text-primary-foreground",
                        )
                      : "border-muted-foreground/30",
                  )}
                >
                  {(isSelected || alreadyOnEvent) && (
                    <Check className="h-3 w-3" />
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {newTeams.length > 0 && (
          <div className="space-y-2">
            {newTeams.map(({ team, name }) => {
              const mine = fillMyself.includes(team);

              return (
                <div
                  key={team}
                  className="flex flex-col gap-2 rounded-xl border border-border/60 p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <p className="text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">
                      {teamLabel(team)} is new on this event.
                    </span>{" "}
                    {mine
                      ? `You'll fill it, so ${name} won't be asked to.`
                      : `${name} will be asked to fill it.`}
                  </p>
                  <Toggle
                    variant="outline"
                    size="sm"
                    pressed={mine}
                    onPressedChange={(pressed) =>
                      setFillMyself((prev) =>
                        pressed ? [...prev, team] : prev.filter((t) => t !== team),
                      )
                    }
                    className={cn("shrink-0 px-3 text-xs transition-all", serviceColors.toggleOn)}
                  >
                    I&apos;ll fill it myself
                  </Toggle>
                </div>
              );
            })}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            className="mr-2"
            onClick={() => handleOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className={cn(serviceColors.solid, serviceColors.solidHover)}
            onClick={handleSave}
            disabled={selected.length === 0 || isSaving}
          >
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Adding...
              </>
            ) : (
              <>
                Add {selected.length > 0 && `(${selected.length})`}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
