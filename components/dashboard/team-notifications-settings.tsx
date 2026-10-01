"use client";

import { useOptimistic, useState, useTransition } from "react";
import { BellRing, Plus, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { RoleCategory as Team } from "@/generated/prisma/enums";
import { setTeamLead, setTeamWatcher } from "@/lib/actions/team-notifications";
import { rolesOfTeam, teamLabel, volunteerRoleConfig } from "@/lib/config/roles";
import { colorClasses } from "@/lib/config/service-types-config";
import { cn } from "@/lib/utils";
import type {
  ServiceTypeTeams,
  TeamNotificationSettings,
  TeamPerson,
} from "@/lib/services/team-notifications";

interface TeamNotificationsSettingsProps {
  organizationId: string;
  settings: TeamNotificationSettings;
  /** The signed-in user, named "you". */
  viewerId: string;
}

type Change =
  | { kind: "lead"; serviceTypeId: string; team: Team; userId: string | null }
  | {
      kind: "watch";
      serviceTypeId: string;
      team: Team;
      userId: string;
      watching: boolean;
    };

const NO_LEAD = "none";

const fullName = (person: TeamPerson) => `${person.firstName} ${person.lastName}`;

/** Each team's roles, in the roster's order: "Pianist, Aux Keys, …". */
const rolesOf = (team: Team) =>
  rolesOfTeam(team)
    .map((role) => volunteerRoleConfig[role].label)
    .join(", ");

/**
 * Who is asked to act when one of a team's roles opens up on each service
 * type's events, and who else gets a heads-up — the organization's half of
 * staffing alerts. The other half is on each event: a team can be handed to
 * somebody else for that event only.
 */
export const TeamNotificationsSettings = ({
  organizationId,
  settings,
  viewerId,
}: TeamNotificationsSettingsProps) => {
  const [, startTransition] = useTransition();

  const [selectedId, setSelectedId] = useState<string | null>(
    settings.serviceTypes[0]?.serviceTypeId ?? null,
  );

  const managersById = new Map(settings.managers.map((m) => [m.userId, m]));

  const [serviceTypes, applyOptimistic] = useOptimistic(
    settings.serviceTypes,
    (current: ServiceTypeTeams[], change: Change): ServiceTypeTeams[] =>
      current.map((serviceType) => {
        if (serviceType.serviceTypeId !== change.serviceTypeId) return serviceType;

        return {
          ...serviceType,
          teams: serviceType.teams.map((entry) => {
            if (entry.team !== change.team) return entry;

            if (change.kind === "lead") {
              const lead = change.userId
                ? managersById.get(change.userId) ?? null
                : null;

              return {
                ...entry,
                lead,
                watchers: entry.watchers.filter((w) => w.userId !== change.userId),
              };
            }

            const person = managersById.get(change.userId);

            return {
              ...entry,
              watchers: change.watching
                ? person && !entry.watchers.some((w) => w.userId === change.userId)
                  ? [...entry.watchers, person]
                  : entry.watchers
                : entry.watchers.filter((w) => w.userId !== change.userId),
            };
          }),
        };
      }),
  );

  // A service type deleted since the page loaded falls back to the first.
  const selected =
    serviceTypes.find((serviceType) => serviceType.serviceTypeId === selectedId) ??
    serviceTypes[0];

  const run = (change: Change, success: string) => {
    startTransition(async () => {
      applyOptimistic(change);

      const result =
        change.kind === "lead"
          ? await setTeamLead({
              organizationId,
              serviceTypeId: change.serviceTypeId,
              team: change.team,
              userId: change.userId,
            })
          : await setTeamWatcher({
              organizationId,
              serviceTypeId: change.serviceTypeId,
              team: change.team,
              userId: change.userId,
              watching: change.watching,
            });

      if (result.success) {
        toast.success(success, { position: "top-center" });
      } else {
        toast.error(result.error, { position: "top-center" });
      }
    });
  };

  const nameOf = (person: TeamPerson) =>
    person.userId === viewerId ? "You" : fullName(person);

  const chooseLead = (serviceType: ServiceTypeTeams, team: Team, value: string) => {
    const userId = value === NO_LEAD ? null : value;
    const person = userId ? managersById.get(userId) : null;

    run(
      { kind: "lead", serviceTypeId: serviceType.serviceTypeId, team, userId },
      person
        ? `${userId === viewerId ? "You now lead" : `${fullName(person)} now leads`} ${teamLabel(team)} for ${serviceType.name}`
        : `${teamLabel(team)} has no lead for ${serviceType.name}`,
    );
  };

  const setWatching = (
    serviceType: ServiceTypeTeams,
    team: Team,
    userId: string,
    watching: boolean,
  ) => {
    const person = managersById.get(userId);
    const who = userId === viewerId ? "You'll" : person ? `${person.firstName} will` : "They'll";

    run(
      {
        kind: "watch",
        serviceTypeId: serviceType.serviceTypeId,
        team,
        userId,
        watching,
      },
      watching
        ? `${who} get a heads-up about ${serviceType.name}'s ${teamLabel(team)}`
        : `${userId === viewerId ? "You" : person?.firstName ?? "They"} won't hear about ${serviceType.name}'s ${teamLabel(team)} anymore`,
    );
  };

  return (
    <section className="rounded-xl border border-border/40 bg-secondary/10 p-5">
      <div className="flex items-center gap-2">
        <BellRing className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">Staffing Alerts</h3>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        When a spot opens up — somebody declines, an invitation expires, or a
        member leaves — that team&apos;s lead for the service is asked to fill
        it, and everyone on &quot;Also notify&quot; gets a heads-up. With no
        lead, the event&apos;s creator is asked. Any event can hand a team to
        someone else for that event only.
      </p>

      {!selected ? (
        <p className="mt-3 text-sm italic text-muted-foreground">
          Add a service type to choose who handles its teams.
        </p>
      ) : (
        <>
          {serviceTypes.length > 1 && (
            <div
              className="mt-3 flex flex-wrap gap-1.5"
              role="tablist"
              aria-label="Service type"
            >
              {serviceTypes.map((serviceType) => {
                const active = serviceType.serviceTypeId === selected.serviceTypeId;
                const colors = colorClasses[serviceType.color];

                return (
                  <button
                    key={serviceType.serviceTypeId}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setSelectedId(serviceType.serviceTypeId)}
                    className={cn(
                      "inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                      active
                        ? "border-foreground/20 bg-background text-foreground shadow-sm"
                        : "border-border/60 text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <span className={cn("h-2 w-2 rounded-full", colors?.dot)} />
                    {serviceType.name}
                  </button>
                );
              })}
            </div>
          )}

          <ul className="mt-3 divide-y divide-border/40 overflow-hidden rounded-xl border border-border/40 bg-background/50">
            {selected.teams.map(({ team, lead, watchers }) => {
              const label = teamLabel(team);
              const addable = settings.managers.filter((m) => m.userId !== lead?.userId);

              return (
                <li key={team} className="space-y-3 px-4 py-3.5">
                  <div>
                    <p className="text-sm font-semibold">{label}</p>
                    <p className="text-xs text-muted-foreground">{rolesOf(team)}</p>
                  </div>

                  <div className="grid items-center gap-x-4 gap-y-2 sm:grid-cols-[7rem_1fr]">
                    <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                      Lead
                    </span>
                    <Select
                      value={lead?.userId ?? NO_LEAD}
                      onValueChange={(value) => chooseLead(selected, team, value)}
                    >
                      <SelectTrigger
                        className="h-8 w-full sm:w-64"
                        aria-label={`${label} lead for ${selected.name}`}
                      >
                        {/* Spelled out rather than read off the open list, so the
                            server render already shows who leads. */}
                        <SelectValue>
                          {lead ? nameOf(lead) : "No lead · goes to the event's creator"}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NO_LEAD}>No lead</SelectItem>
                        {settings.managers.map((manager) => (
                          <SelectItem key={manager.userId} value={manager.userId}>
                            {fullName(manager)}
                            {manager.userId === viewerId ? " (you)" : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                      Also notify
                    </span>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {watchers.map((watcher) => (
                        <span
                          key={watcher.userId}
                          className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-secondary/40 py-0.5 pl-2.5 pr-1.5 text-xs font-medium"
                        >
                          {nameOf(watcher)}
                          <button
                            type="button"
                            onClick={() => setWatching(selected, team, watcher.userId, false)}
                            className="cursor-pointer rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                            aria-label={`Stop notifying ${fullName(watcher)} about ${label}`}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}

                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-6 cursor-pointer gap-1 rounded-full px-2 text-xs text-muted-foreground hover:text-foreground"
                          >
                            <Plus className="h-3 w-3" />
                            Add
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="w-56">
                          <DropdownMenuLabel className="text-xs">
                            Heads-up about {label}
                          </DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          {addable.map((manager) => (
                            <DropdownMenuCheckboxItem
                              key={manager.userId}
                              checked={watchers.some((w) => w.userId === manager.userId)}
                              onCheckedChange={(checked) =>
                                setWatching(selected, team, manager.userId, checked === true)
                              }
                              onSelect={(event) => event.preventDefault()}
                            >
                              {fullName(manager)}
                              {manager.userId === viewerId ? " (you)" : ""}
                            </DropdownMenuCheckboxItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
};
