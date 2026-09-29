"use client";

import { UserCog } from "lucide-react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { RoleCategory as Team } from "@/generated/prisma/enums";
import { teamLabel } from "@/lib/config/roles";

/** Somebody who can handle a team: an admin or owner. */
export type TeamLeadPerson = {
  userId: string;
  firstName: string;
  lastName: string;
};

/**
 * This event's picks, by team — only the teams handed to somebody other than
 * the default. A team left out follows the service type.
 */
export type TeamLeadPicks = Partial<Record<Team, string>>;

/**
 * Who a team with no lead falls to: the event's creator while they can still
 * act on it, else the owners.
 */
export type TeamLeadFallback = {
  /** The creator's id, so the list doesn't offer them twice. Null for the owners. */
  userId: string | null;
  /** "You", "Adam Smith" or "The owners". */
  name: string;
  /** "you", "Adam" or "the owners", for "Reset to …". */
  short: string;
};

/** Everything the picker needs besides its value. */
export type TeamLeadChoices = {
  /** Teams this event has roles in, in roster order. */
  teams: Team[];
  /** The service type's lead for each team: what a team follows unless changed here. */
  defaults: Partial<Record<Team, TeamLeadPerson>>;
  /** Admins and owners: anybody who can handle a team. */
  managers: TeamLeadPerson[];
  /** The signed-in user, named "You". */
  viewerId: string;
  /** Who a team with no lead falls to. */
  fallback: TeamLeadFallback;
  /** The service type the defaults come from, e.g. "Worship". */
  serviceTypeName: string | null;
};

/** What the create form needs to prefill the picker for whichever service type is chosen. */
export type ServiceTypeTeamLeads = {
  /** Each live service type's leads, by service type id. */
  byServiceType: Record<string, Partial<Record<Team, TeamLeadPerson>>>;
  /** Admins and owners: anybody who can handle a team. */
  managers: TeamLeadPerson[];
  /** The signed-in user, named "You". */
  viewerId: string;
};

/** The picks as the create and edit actions take them. */
export const teamLeadPicksInput = (picks: TeamLeadPicks) =>
  (Object.entries(picks) as [Team, string][]).map(([team, userId]) => ({
    team,
    userId,
  }));

const DEFAULT = "default";

interface EventTeamLeadsFieldProps {
  choices: TeamLeadChoices;
  value: TeamLeadPicks;
  onChange: (next: TeamLeadPicks) => void;
  disabled?: boolean;
}

/**
 * "Who handles open spots": every team starts on its default — the service
 * type's lead from Settings, or with no lead whoever the alerts fall to — and
 * can be handed to somebody else for this event only, the week the band lead
 * is away, with nothing to switch back afterwards.
 */
export function EventTeamLeadsField({
  choices,
  value,
  onChange,
  disabled = false,
}: EventTeamLeadsFieldProps) {
  const { teams, defaults, managers, viewerId, fallback, serviceTypeName } = choices;

  if (teams.length === 0) return null;

  const nameOf = (person: TeamLeadPerson) =>
    person.userId === viewerId ? "You" : `${person.firstName} ${person.lastName}`;

  const pick = (team: Team, next: string) => {
    const updated: TeamLeadPicks = { ...value };
    const defaultId = defaults[team]?.userId ?? fallback.userId;

    if (next === DEFAULT || next === defaultId) {
      delete updated[team];
    } else {
      updated[team] = next;
    }

    onChange(updated);
  };

  return (
    <div className="rounded-2xl border border-border/40 bg-card/50 p-4">
      <div className="flex items-center gap-2">
        <UserCog className="h-4 w-4 text-muted-foreground" />
        <p className="text-sm font-medium">Who handles open spots</p>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Filled in from Settings{serviceTypeName ? ` for ${serviceTypeName}` : ""}.
        Change one and it only applies to this event.
      </p>

      <ul className="mt-3 space-y-2.5">
        {teams.map((team) => {
          const label = teamLabel(team);
          const lead = defaults[team];

          // Always a real person: the lead, or whoever a team without one
          // falls to.
          const defaultId = lead?.userId ?? fallback.userId;
          const defaultName = lead ? nameOf(lead) : fallback.name;
          const defaultShort = lead
            ? lead.userId === viewerId
              ? "you"
              : lead.firstName
            : fallback.short;

          const chosen = value[team];
          const covering = chosen
            ? managers.find((manager) => manager.userId === chosen)
            : undefined;

          return (
            <li
              key={team}
              className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3"
            >
              <span className="w-24 shrink-0 text-sm font-medium">{label}</span>

              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                <Select
                  value={covering ? covering.userId : DEFAULT}
                  onValueChange={(next) => pick(team, next)}
                  disabled={disabled}
                >
                  <SelectTrigger
                    className="h-9 w-full min-w-0 sm:w-56"
                    aria-label={`Who handles ${label}`}
                  >
                    {/* Spelled out rather than read off the open list, so the
                        closed trigger always names somebody. */}
                    <SelectValue>{covering ? nameOf(covering) : defaultName}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={DEFAULT}>{defaultName} — Default</SelectItem>
                    {managers
                      .filter((manager) => manager.userId !== defaultId)
                      .map((manager) => (
                        <SelectItem key={manager.userId} value={manager.userId}>
                          {nameOf(manager)}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>

                {covering ? (
                  <>
                    <span className="shrink-0 rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400">
                      This event only
                    </span>
                    <button
                      type="button"
                      onClick={() => pick(team, DEFAULT)}
                      disabled={disabled}
                      className="shrink-0 cursor-pointer text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed"
                    >
                      Reset to {defaultShort}
                    </button>
                  </>
                ) : (
                  <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                    Default
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
