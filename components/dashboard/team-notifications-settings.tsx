"use client";

import { useOptimistic, useTransition } from "react";
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
import { Switch } from "@/components/ui/switch";
import { VolunteerRole, type RoleCategory as Team } from "@/generated/prisma/enums";
import { setTeamLead, setTeamWatcher } from "@/lib/actions/team-notifications";
import { teamLabel, teamOfRole, volunteerRoleConfig } from "@/lib/config/roles";
import type {
  TeamNotificationSettings,
  TeamPerson,
  TeamSettings,
} from "@/lib/services/team-notifications";

interface TeamNotificationsSettingsProps {
  organizationId: string;
  settings: TeamNotificationSettings;
  /** The signed-in user, whose own heads-up switch this is. */
  viewerId: string;
  /** Owners choose leads and who else is notified; admins only themselves. */
  isOwner: boolean;
}

type Change =
  | { kind: "lead"; team: Team; userId: string | null }
  | { kind: "watch"; team: Team; userId: string; watching: boolean };

const NO_LEAD = "none";

const fullName = (person: TeamPerson) => `${person.firstName} ${person.lastName}`;

/** Each team's roles, in the roster's order: "Pianist, Aux Keys, …". */
const rolesOf = (team: Team) =>
  Object.values(VolunteerRole)
    .filter((role) => teamOfRole(role) === team)
    .map((role) => volunteerRoleConfig[role].label)
    .join(", ");

/**
 * Who is asked to act when one of a team's roles opens up, and who else gets
 * a heads-up — the organization's half of staffing alerts. Owners set it for
 * everybody; an admin sees it, and switches their own heads-up on or off.
 */
export const TeamNotificationsSettings = ({
  organizationId,
  settings,
  viewerId,
  isOwner,
}: TeamNotificationsSettingsProps) => {
  const [, startTransition] = useTransition();

  const managersById = new Map(settings.managers.map((m) => [m.userId, m]));

  const [teams, applyOptimistic] = useOptimistic(
    settings.teams,
    (current: TeamSettings[], change: Change): TeamSettings[] =>
      current.map((entry) => {
        if (entry.team !== change.team) return entry;

        if (change.kind === "lead") {
          const lead = change.userId ? managersById.get(change.userId) ?? null : null;

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
  );

  const run = (change: Change, success: string) => {
    startTransition(async () => {
      applyOptimistic(change);

      const result =
        change.kind === "lead"
          ? await setTeamLead({ organizationId, team: change.team, userId: change.userId })
          : await setTeamWatcher({
              organizationId,
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

  const chooseLead = (team: Team, value: string) => {
    const userId = value === NO_LEAD ? null : value;
    const person = userId ? managersById.get(userId) : null;

    run(
      { kind: "lead", team, userId },
      person
        ? `${fullName(person)} now leads ${teamLabel(team)}`
        : `${teamLabel(team)} has no lead`,
    );
  };

  const setWatching = (team: Team, userId: string, watching: boolean) => {
    const person = managersById.get(userId);
    const who = userId === viewerId ? "You'll" : person ? `${person.firstName} will` : "They'll";

    run(
      { kind: "watch", team, userId, watching },
      watching
        ? `${who} get a heads-up about ${teamLabel(team)}`
        : userId === viewerId
          ? `You won't hear about ${teamLabel(team)} unless you're asked to act`
          : `${person?.firstName ?? "They"} won't hear about ${teamLabel(team)} anymore`,
    );
  };

  return (
    <section className="rounded-xl border border-border/40 bg-secondary/10 p-5">
      <div className="flex items-center gap-2">
        <BellRing className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">Staffing Alerts</h3>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        When a role opens up — somebody declines, an invitation expires, or a
        member leaves — the team&apos;s lead is asked to fill it, and everyone on
        &quot;Also notify&quot; gets a heads-up that the lead has it. With no lead,
        whoever sent the invitation is asked, then the event&apos;s creator.
        {isOwner ? "" : " Only an owner can change leads or add other people."}
      </p>

      <ul className="mt-3 divide-y divide-border/40 overflow-hidden rounded-xl border border-border/40 bg-background/50">
        {teams.map(({ team, lead, watchers }) => {
          const label = teamLabel(team);
          const youLead = lead?.userId === viewerId;
          const youWatch = watchers.some((w) => w.userId === viewerId);
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
                {isOwner ? (
                  <Select
                    value={lead?.userId ?? NO_LEAD}
                    onValueChange={(value) => chooseLead(team, value)}
                  >
                    <SelectTrigger
                      className="h-8 w-full sm:w-64"
                      aria-label={`${label} lead`}
                    >
                      {/* Spelled out rather than read off the open list, so the
                          server render already shows who leads. */}
                      <SelectValue>
                        {lead ? `${fullName(lead)}${youLead ? " (you)" : ""}` : "No lead"}
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
                ) : (
                  <span className="text-sm">
                    {lead ? (
                      fullName(lead)
                    ) : (
                      <span className="italic text-muted-foreground">No lead</span>
                    )}
                  </span>
                )}

                <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Also notify
                </span>
                <div className="flex flex-wrap items-center gap-1.5">
                  {watchers.map((watcher) => (
                    <span
                      key={watcher.userId}
                      className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-secondary/40 py-0.5 pl-2.5 pr-1.5 text-xs font-medium"
                    >
                      {watcher.userId === viewerId ? "You" : fullName(watcher)}
                      {isOwner && (
                        <button
                          type="button"
                          onClick={() => setWatching(team, watcher.userId, false)}
                          className="cursor-pointer rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                          aria-label={`Stop notifying ${fullName(watcher)} about ${label}`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </span>
                  ))}

                  {isOwner ? (
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
                              setWatching(team, manager.userId, checked === true)
                            }
                            onSelect={(event) => event.preventDefault()}
                          >
                            {fullName(manager)}
                            {manager.userId === viewerId ? " (you)" : ""}
                          </DropdownMenuCheckboxItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : watchers.length === 0 ? (
                    <span className="text-sm italic text-muted-foreground">Nobody</span>
                  ) : null}
                </div>
              </div>

              <label className="flex items-center justify-between gap-3 rounded-lg bg-secondary/30 px-3 py-2">
                <span className="text-sm">
                  {youLead
                    ? `You lead ${label}, so you're asked to fill its roles`
                    : `Notify me about ${label}`}
                </span>
                {youLead ? null : (
                  <Switch
                    checked={youWatch}
                    onCheckedChange={(checked) => setWatching(team, viewerId, checked)}
                    aria-label={`Notify me about ${label}`}
                  />
                )}
              </label>
            </li>
          );
        })}
      </ul>
    </section>
  );
};
