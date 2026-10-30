import { ToolLoopAgent, tool, stepCountIs, InferAgentUIMessage } from "ai";
import type { RoleCategory as Team, VoiceType, VolunteerRole } from "@/generated/prisma/enums";
import { ROLE_ORDER, TEAM_ORDER, teamLabel, teamOfRole, teamsOfRoles, voiceTypeLabel, volunteerRoleConfig } from "@/lib/config/roles";
import type { RoleEligibility } from "@/lib/types";
import { spotsFor, storedRoleSpots, type RoleSpots } from "@/lib/role-spots";
import {
  GATEWAY_CACHING,
  availabilityLines,
  proposalAccepted,
  shortRefs,
  toAvailability,
  type AvailabilityRole,
} from "@/lib/agents/shared";
import {
  checkAvailabilityInputSchema,
  proposeEventInputSchema,
} from "./schema";

// This module is imported for its types by a client component, exactly like the
// setlist agent. It must never pull in `server-only`, Prisma, or anything from
// lib/services — the route fetches and hands the data in through `deps`.

export type AgentServiceType = { id: string; name: string; color: string };

export type AgentTemplate = {
  name: string;
  dayOfWeek: number;
  location: string;
  description: string;
  days: { dayOffset: number; startTime: string; endTime: string }[];
  rolesNeeded: VolunteerRole[];
  roleSpots?: RoleSpots;
  expiresInDays: number;
  smartSchedulingEnabled: boolean;
  /** Offset from the template's first day: 0 same day, negative before it. */
  rehearsalDayOffset: number | null;
  rehearsalStartTime: string | null;
  rehearsalEndTime: string | null;
  serviceTypeId: string;
};

export type AgentRosterMember = {
  userId: string;
  name: string;
  volunteerRoles: VolunteerRole[];
  /** A singer's voice type: null unless they hold a role that sings and have one set. */
  voiceType: VoiceType | null;
  /** An admin or owner: somebody who can cover a team. */
  manager: boolean;
};

/** The person drafting, who creates the event when they approve it. */
export type AgentViewer = { userId: string; name: string; firstName: string };

/**
 * Each service type's team leads, by service type id, when the lead is
 * somebody other than the person drafting. A team left out is theirs to staff.
 */
export type AgentTeamLeads = Record<
  string,
  Partial<Record<Team, { userId: string; name: string }>>
>;

export type EventAgentDeps = {
  checkAvailability: (input: {
    days: DraftDay[];
    roles: VolunteerRole[];
  }) => Promise<RoleEligibility[]>;
};

export type DraftDay = { date: string; startTime: string; endTime: string };

export type DraftAssignment = {
  userId: string;
  name: string;
  role: VolunteerRole;
  reason: string;
};

/** A pick the server rejected or left to somebody else. Surfaced, never silently dropped. */
export type DraftWarning = {
  name: string;
  role: VolunteerRole;
  reason: string;
};

/** Who's in charge of one team on a draft: its lead, a cover, or the person drafting. */
export type DraftTeam = {
  team: Team;
  /** Their full name; the card says "You" when `you`. */
  name: string;
  you: boolean;
  /** Handling it for this event only, rather than as the team's lead. */
  cover: boolean;
};

/** A team handed to somebody for this event only, saved with the event. */
export type DraftCover = { team: Team; userId: string; name: string };

export type EventDraft = {
  serviceTypeId: string;
  serviceTypeName: string;
  serviceTypeColor: string;
  name: string;
  description: string;
  location: string;
  days: DraftDay[];
  rolesNeeded: VolunteerRole[];
  /** How many each role needs, for the roles needing more than one. */
  roleSpots: RoleSpots;
  assignments: DraftAssignment[];
  expiresInDays: 3 | 5 | 7;
  smartSchedulingEnabled: boolean;
  /** Resolved to a real date, unlike the template's offset. Null = none. */
  rehearsal: DraftDay | null;
  summary: string;
  warnings: DraftWarning[];
  unfilledRoles: VolunteerRole[];
  /** Who's in charge of each team. Absent from drafts made before teams. */
  teams?: DraftTeam[];
  /** Absent from drafts made before covers. */
  covers?: DraftCover[];
};

export type CheckAvailabilityOutput = {
  days: DraftDay[];
  roles: AvailabilityRole[];
};

export type ProposeEventOutput =
  /** `refill`: picks were dropped from spots on this person's teams somebody else could still fill. */
  | { ok: true; draft: EventDraft; refill: boolean }
  | { ok: false; error: string };

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

/** Days since epoch for a YYYY-MM-DD string, or null if it isn't a real date. */
function dayNumber(iso: string): number | null {
  const [y, m, d] = iso.split("-").map(Number);
  const utc = Date.UTC(y, m - 1, d);
  const back = new Date(utc);
  // Rejects rollovers like 2026-02-30, which Date.UTC silently accepts.
  if (
    back.getUTCFullYear() !== y ||
    back.getUTCMonth() !== m - 1 ||
    back.getUTCDate() !== d
  ) {
    return null;
  }
  return Math.floor(utc / 86_400_000);
}

const dayLines = (days: DraftDay[]) =>
  days.map((d) => `${d.date} ${d.startTime}-${d.endTime}`).join(", ");

function buildInstructions(opts: {
  orgName: string;
  viewer: AgentViewer;
  today: string;
  serviceTypes: AgentServiceType[];
  templates: AgentTemplate[];
  roster: AgentRosterMember[];
  teamLeads: AgentTeamLeads;
  ref: (id: string) => string;
}) {
  const { orgName, viewer, today, serviceTypes, templates, roster, teamLeads, ref } = opts;
  const you = viewer.firstName;

  const todayWeekday = WEEKDAYS[new Date(`${today}T00:00:00Z`).getUTCDay()];

  // Who's in charge of each team for each service type: the card names them,
  // and they're told when the event is created.
  const serviceTypeRows = serviceTypes
    .map((t) => {
      const leads = teamLeads[t.id] ?? {};
      const teams = TEAM_ORDER.map((team) => {
        const lead = leads[team];
        return `${teamLabel(team)}: ${lead ? `${lead.name} (lead)` : "you"}`;
      }).join(" · ");

      return `- ${ref(t.id)} | ${t.name} | ${teams}`;
    })
    .join("\n");

  // Every role with its name and team, so "drums" or "the band" maps onto
  // the ids without the model guessing from the ids alone.
  const roleRows = ROLE_ORDER.map(
    (role) =>
      `- ${role} | ${volunteerRoleConfig[role].label} | ${teamLabel(teamOfRole(role))}`,
  ).join("\n");

  const templateRows = templates.length
    ? templates
        .map(
          (t) =>
            `- "${t.name}" | every ${WEEKDAYS[t.dayOfWeek]} | ${t.location} | service type ${ref(t.serviceTypeId)} | ${t.days
              .map((d) => `day+${d.dayOffset} ${d.startTime}-${d.endTime}`)
              .join(", ")} | roles: ${t.rolesNeeded
              .map((role) => {
                const count = spotsFor(t.roleSpots ?? {}, role);
                return count > 1 ? `${role} x${count}` : role;
              })
              .join(", ")} | expires ${t.expiresInDays}d | smartScheduling ${t.smartSchedulingEnabled}${
              t.rehearsalDayOffset !== null &&
              t.rehearsalStartTime &&
              t.rehearsalEndTime
                ? ` | rehearsal day${t.rehearsalDayOffset >= 0 ? "+" : ""}${t.rehearsalDayOffset} ${t.rehearsalStartTime}-${t.rehearsalEndTime}`
                : " | no rehearsal"
            }`,
        )
        .join("\n")
    : "(none)";

  const rosterRows = roster
    .map(
      (m) =>
        `- ${ref(m.userId)} | ${m.name}${m.userId === viewer.userId ? " (you)" : ""} | ${
          m.volunteerRoles.map((role) => volunteerRoleConfig[role].label).join(", ") || "no roles"
        }${m.manager ? " · admin or owner" : ""}${m.voiceType ? ` | ${voiceTypeLabel(m.voiceType)}` : ""}`,
    )
    .join("\n");

  return `You plan events for "${orgName}" with ${viewer.name}, who is creating one. You draft it — dates, times, place, roles, rehearsal — and pick its people. You never create anything: your draft fills a card, and ${you} presses the button.

TODAY IS ${today} (${todayWeekday}).

SERVICE TYPES (ref | name | who's in charge of each team when ${you} creates the event):
${serviceTypeRows}
Every event is filed under one of these. There are no others and you cannot create one. If none of them really fits what they asked for, use the closest and say in your summary which one you used and that it may not be the right home — never let a mismatch pass silently.

ROLES (id | name | team):
${roleRows}
Read what they ask for by name and by team — "the band" means the Band roles here. In your summary and reasons, call a role by its name, never its id.

TEMPLATES — the org's own recurring patterns. Use one ONLY when they ask for it by name or plainly describe that service ("the youth gathering", "Sunday morning"). Never reach for one to fill in something they simply did not mention. When you do use one, take its times, location, roles and service type:
${templateRows}

MEMBERS (ref | name | roles | voice type, for a singer who has one):
${rosterRows}

WHO'S IN CHARGE
Each team on an event has one person in charge of it: the team's lead for that service type, or ${you} when it has none.
- Pick people for every team the event needs, including the ones somebody else leads. When ${you} creates the event, the invites go out and each lead is told who was invited to their team and what's still open. The card says so.
- When ${you} asks to leave a team to its lead — "let James pick the band" — leave that team's spots open for James, who is told to fill them.
- "I'll handle the band this week" makes ${you} the cover for that team on this event, and "Kevin covers the band" hands it to another admin or owner: put either in covers. A cover is in charge of the team on this event only. The regular lead is told either way.
- Only admins and owners can cover a team.

WHAT THEY ASKED FOR WINS
Anything they state is settled — the day, the date, the time, the location, the roles. Never replace it with a template's usual value, or with whatever this organization normally does. A template's weekday is a default for when they named no day; if they named one, that is the day, and no template overrides it. Where their request and a template disagree, follow them.
Anything they didn't mention keeps its default: smartSchedulingEnabled stays off unless they ask for auto-fill or the template you use has it on, and expiresInDays comes from that template, else 3.

REHEARSALS
Most events have one, and "rehearsal" on proposeEvent is where it goes: a single block with one date and a start and end clock time, in the same formats as the event days. Set it when they mention a rehearsal, or when a template you are using carries one — a template's rehearsal comes along with its times and roles, so dropping it would quietly lose something the org set up. Otherwise leave it out. Never invent a rehearsal they did not ask for.
A template's rehearsal is written as an offset from its FIRST day, so "rehearsal day-3 19:00-21:00" on a Sunday service falling on 2026-09-20 resolves to 2026-09-17 19:00-21:00. Resolve it against the dates you actually drafted, not the template's usual weekday.
A rehearsal is informational. It never makes anyone unavailable, it is not part of the days you pass to checkAvailability, and it must not change who you pick.

HOW TO WORK
1. Work out the dates first. "Next Sunday" means the next occurrence AFTER today — if today is Sunday, that's seven days out, not today.
2. Call checkAvailability with those event days — never the rehearsal — and the roles you're staffing. It returns everyone free for each role, best first, with their record, plus everyone who can't serve and why.
3. Pick people, then call proposeEvent with the complete draft. Always deliver a draft through proposeEvent, never as prose, and put your explanation in its summary — the card shows it.
4. To change a draft, call proposeEvent again with the whole updated draft. When the change touches who can serve — new days or times, an added role, or someone named for a role you haven't checked — call checkAvailability first: every role for new days or times, otherwise just the roles the change touches. A new name, place, description, deadline, rehearsal or auto-fill setting doesn't change who can serve, so go straight to proposeEvent.
When the days move, a weekday in the name moves with them: "Sunday Service" on a Saturday becomes "Saturday Service", unless they chose that name themselves.
Questions don't need a new draft. "Who's free for drums?", "Why isn't Sarah on it?", "Who hasn't served lately?" — call checkAvailability first for the roles the question is about, even if you checked earlier in this chat, then answer just that question in a sentence or two from what it returns and the member list. Write it for the person asking: the facts and what they mean — never your own steps or checks, a review of the rest of the draft, or apologies.

PICKING PEOPLE
- Each person free comes with how often they say yes, how often they've served in the last 60 days and when they last did, and how many events they're already booked for ahead.
- Start from the top of each list, then rotate: prefer someone rested over someone who has served most recent weeks or is booked solid ahead.
- Every reason is one short sentence built from those facts, e.g. "Rested — last served Sep 14, while Marcus served 4 of the last 5 Sundays." Never state anything you weren't given.
- Mention someone's invite record only when it decided the pick, written as "accepted 2 of 3 invites they answered". Under 3 answers it says little, so lean on how rested they are instead.
- Honour named requests whenever the person can serve. When they can't, say exactly why — blocked out (with the dates), serving another event then (name it), or doesn't hold the role — and offer the best alternative.
- Never pick anyone who can't serve, and never give one person two roles.
- Leaving a spot open is fine; say why in your summary.
- Asked why somebody wasn't picked, answer from the facts: they can't serve and why, they don't hold the role, or they ranked lower — and give the numbers.
- Some roles need more than one person — three BGVs, two guitarists, a template's "BGVS x3". Set roleSpots for those and assign up to that many. Every assignment is somebody wanted there, never a backup, so never assign more people to a role than it needs.

VOICE TYPES
Some singers have a voice type, shown after their name: Soprano, Alto, Tenor, Baritone or Bass. It counts only when ${you} brings voice types up — "two sopranos", "an alto", "who are our altos?", "a mix of parts":
- When they do, every singer you pick for a voice type they asked for must be shown with it. When too few are free, leave those spots open and say so in your summary. Never hand them to another voice type unless ${you} said another will do.
- When they don't, pick singers exactly as you would if voice types didn't exist, and never mention one — not in reasons, the summary or answers.
- Somebody with no voice type shown doesn't have one. Never guess it.

HARD RULES — the server enforces these and will reject the draft
- Event name: 25 characters maximum. Location: 20 characters maximum.
- Dates are calendar dates (YYYY-MM-DD) and times are 24-hour clock times (HH:mm). Never send a timezone, an offset, or an ISO instant.
- Multi-day events must be CONSECUTIVE days. You cannot draft two separate Sundays as one event — that is two events, so draft one and tell the user.
- One person holds at most ONE role per event. Never assign the same person twice.
- expiresInDays is exactly 3, 5, or 7.
- Every assignment's role must also appear in rolesNeeded.
- Use refs exactly as written above for people and service types. Never invent one, never pass a name where a ref belongs.
- A rehearsal, if you send one, must be a real date, not in the past, on or before the event's last day, and end after it starts.`;
}

export function createEventDraftAgent(opts: {
  orgName: string;
  viewer: AgentViewer;
  /** YYYY-MM-DD in the org's own reckoning. Anchors all relative dates. */
  today: string;
  serviceTypes: AgentServiceType[];
  templates: AgentTemplate[];
  roster: AgentRosterMember[];
  teamLeads: AgentTeamLeads;
  deps: EventAgentDeps;
}) {
  const { orgName, viewer, today, serviceTypes, templates, roster, teamLeads, deps } = opts;

  const serviceTypeById = new Map(serviceTypes.map((t) => [t.id, t]));
  const memberById = new Map(roster.map((m) => [m.userId, m]));
  const { ref, resolve } = shortRefs([
    ...roster.map((m) => m.userId),
    ...serviceTypes.map((t) => t.id),
  ]);

  const checkAvailability = tool({
    description:
      "Everyone free for each role on given event days — best first, with how often they say yes, how often and how recently they've served, and what they're already booked for ahead — plus everyone who can't serve and why. Call it before picking people, and to answer questions about who's free.",
    inputSchema: checkAvailabilityInputSchema,
    execute: async ({ days, roles }): Promise<CheckAvailabilityOutput> => {
      const eligibility = await deps.checkAvailability({ days, roles });
      const voiceOf = (userId: string) => memberById.get(userId)?.voiceType ?? null;
      return { days, roles: eligibility.map((entry) => toAvailability(entry, ref, voiceOf)) };
    },
    // The same facts as lines rather than JSON, which repeats every key for
    // every person — re-read again by every follow-up in this chat.
    toModelOutput: ({ output }) => ({
      type: "text",
      value: [`Days: ${dayLines(output.days)}`, ...output.roles.map(availabilityLines)].join("\n\n"),
    }),
  });

  const proposeEvent = tool({
    description:
      "Deliver the finished draft for the user to review and approve. Call this once you've settled the dates and the people, and again with the whole draft for any change.",
    inputSchema: proposeEventInputSchema,
    // Runs on the server. Every ref, date and pick is re-checked against live
    // data here — the model's output is a suggestion, not a source of truth.
    execute: async (input): Promise<ProposeEventOutput> => {
      const serviceTypeId = resolve(input.serviceType);
      const serviceType = serviceTypeId ? serviceTypeById.get(serviceTypeId) : undefined;

      if (!serviceType) {
        return {
          ok: false,
          error: `Unknown service type "${input.serviceType}". Use one of: ${serviceTypes
            .map((t) => `${ref(t.id)} (${t.name})`)
            .join(", ")}`,
        };
      }

      // Dates: real, ordered, consecutive, not in the past, end after start.
      const days = [...input.days].sort((a, b) => a.date.localeCompare(b.date));
      const numbers: number[] = [];

      for (const day of days) {
        const n = dayNumber(day.date);
        if (n === null) {
          return { ok: false, error: `"${day.date}" is not a real date.` };
        }
        if (day.date < today) {
          return {
            ok: false,
            error: `${day.date} is in the past. Today is ${today}.`,
          };
        }
        if (day.endTime <= day.startTime) {
          return {
            ok: false,
            error: `On ${day.date} the end time (${day.endTime}) must be after the start time (${day.startTime}).`,
          };
        }
        numbers.push(n);
      }

      for (let i = 1; i < numbers.length; i += 1) {
        if (numbers[i] === numbers[i - 1]) {
          return { ok: false, error: `${days[i].date} is listed twice.` };
        }
        if (numbers[i] !== numbers[i - 1] + 1) {
          return {
            ok: false,
            error: `Event days must be consecutive, but ${days[i - 1].date} is followed by ${days[i].date}. Draft one event for the first block and tell the user the rest need separate events.`,
          };
        }
      }

      let rehearsal: DraftDay | null = null;

      if (input.rehearsal) {
        const { date, startTime, endTime } = input.rehearsal;

        if (dayNumber(date) === null) {
          return { ok: false, error: `The rehearsal date "${date}" is not a real date.` };
        }
        if (date < today) {
          return {
            ok: false,
            error: `The rehearsal on ${date} is in the past. Today is ${today}.`,
          };
        }
        if (endTime <= startTime) {
          return {
            ok: false,
            error: `The rehearsal's end time (${endTime}) must be after its start time (${startTime}).`,
          };
        }

        const lastDay = days[days.length - 1].date;

        if (date > lastDay) {
          return {
            ok: false,
            error: `The rehearsal on ${date} falls after the event's last day (${lastDay}). A rehearsal runs on or before the event.`,
          };
        }

        rehearsal = { date, startTime, endTime };
      }

      const rolesNeeded = [...new Set(input.rolesNeeded)];
      const leads = teamLeads[serviceType.id] ?? {};

      // Covers: a team handed to somebody for this event only. Admins and
      // owners only, one per team; naming the team's usual handler changes
      // nothing, so it's dropped — as createEvent drops it.
      const covers: DraftCover[] = [];

      for (const pick of input.covers) {
        const userId = resolve(pick.person);
        const member = userId ? memberById.get(userId) : undefined;

        if (!userId || !member) {
          return { ok: false, error: `Unknown person "${pick.person}" covering ${teamLabel(pick.team)}. Use a ref from the member list.` };
        }
        if (!member.manager) {
          return { ok: false, error: `${member.name} can't cover ${teamLabel(pick.team)} — only admins and owners can.` };
        }
        if (covers.some((cover) => cover.team === pick.team)) {
          return { ok: false, error: `${teamLabel(pick.team)} can have one cover, not two.` };
        }

        const usual = leads[pick.team]?.userId ?? viewer.userId;

        if (userId !== usual) covers.push({ team: pick.team, userId, name: member.name });
      }

      const handlerOf = (team: Team) => {
        const cover = covers.find((entry) => entry.team === team);
        if (cover) return { userId: cover.userId, name: cover.name, cover: true };

        const lead = leads[team];
        if (lead) return { userId: lead.userId, name: lead.name, cover: false };

        return { userId: viewer.userId, name: viewer.name, cover: false };
      };

      // Verify against the FINAL dates, uncapped — a capped list would wrongly
      // reject an eligible member who happened to rank low.
      const eligibility = await deps.checkAvailability({
        days,
        roles: rolesNeeded,
      });

      const eligibleByRole = new Map(
        eligibility.map((e) => [
          e.role,
          new Set(e.eligible.map((c) => c.userId)),
        ]),
      );
      const exclusionByRole = new Map(
        eligibility.map((e) => [
          e.role,
          new Map(e.excluded.map((x) => [x.userId, x])),
        ]),
      );

      const assignments: DraftAssignment[] = [];
      const warnings: DraftWarning[] = [];
      const claimed = new Set<string>();

      for (const pick of input.assignments) {
        const userId = resolve(pick.person);
        const member = userId ? memberById.get(userId) : undefined;
        const label = member?.name ?? pick.person;

        if (!userId || !member) {
          warnings.push({
            name: label,
            role: pick.role,
            reason: "Not a member of this organization.",
          });
          continue;
        }
        if (!rolesNeeded.includes(pick.role)) {
          warnings.push({
            name: label,
            role: pick.role,
            reason: "That role isn't one this event asked for.",
          });
          continue;
        }

        if (!member.volunteerRoles.includes(pick.role)) {
          warnings.push({
            name: label,
            role: pick.role,
            reason: "Doesn't hold this volunteer role.",
          });
          continue;
        }
        // EventAssignment is unique on (eventId, userId): one role per person.
        if (claimed.has(userId)) {
          warnings.push({
            name: label,
            role: pick.role,
            reason: "Already assigned another role on this event.",
          });
          continue;
        }

        const excluded = exclusionByRole.get(pick.role)?.get(userId);
        if (excluded) {
          warnings.push({
            name: label,
            role: pick.role,
            reason:
              excluded.reason === "conflict"
                ? `Already serving "${excluded.detail}" at that time.`
                : `Has a blockout (${excluded.detail}).`,
          });
          continue;
        }
        if (!eligibleByRole.get(pick.role)?.has(userId)) {
          warnings.push({
            name: label,
            role: pick.role,
            reason: "No longer available for these dates.",
          });
          continue;
        }

        claimed.add(userId);
        assignments.push({
          userId,
          name: member.name,
          role: pick.role,
          reason: pick.reason,
        });
      }

      // As many as asked for, and never fewer than the people picked for it.
      const roleSpots = storedRoleSpots(
        Object.fromEntries(
          rolesNeeded.map((role) => [
            role,
            Math.max(
              input.roleSpots?.[role] ?? 1,
              assignments.filter((a) => a.role === role).length,
            ),
          ]),
        ),
        rolesNeeded,
      );

      const teams: DraftTeam[] = teamsOfRoles(rolesNeeded).map((team) => {
        const handler = handlerOf(team);

        return {
          team,
          name: handler.name,
          you: handler.userId === viewer.userId,
          cover: handler.cover,
        };
      });

      const unfilledRoles = rolesNeeded.filter(
        (r) => assignments.filter((a) => a.role === r).length < spotsFor(roleSpots, r),
      );

      // A pick dropped from a spot still open: somebody else may be free for
      // it, so the agent gets a round to look.
      const refill = warnings.some((w) => unfilledRoles.includes(w.role));

      return {
        ok: true,
        refill,
        draft: {
          serviceTypeId: serviceType.id,
          serviceTypeName: serviceType.name,
          serviceTypeColor: serviceType.color,
          name: input.name,
          description: input.description,
          location: input.location,
          days,
          rolesNeeded,
          roleSpots,
          assignments,
          expiresInDays: input.expiresInDays,
          smartSchedulingEnabled: input.smartSchedulingEnabled,
          rehearsal,
          summary: input.summary,
          warnings,
          unfilledRoles,
          teams,
          covers,
        },
      };
    },
    // What a follow-up needs to edit the draft — names with their refs — not
    // the whole card again.
    toModelOutput: ({ output }) => ({
      type: "text",
      value: output.ok
        ? [
            `Draft shown on the card: "${output.draft.name}", ${dayLines(output.draft.days)}, ${output.draft.serviceTypeName}.`,
            `Picked: ${
              output.draft.assignments
                .map((a) => `${volunteerRoleConfig[a.role].label} — ${a.name} (${ref(a.userId)})`)
                .join("; ") || "nobody"
            }.`,
            `Teams: ${(output.draft.teams ?? [])
              .map((t) => `${teamLabel(t.team)} — ${t.you ? "you" : t.name}${t.cover ? " (covering)" : ""}`)
              .join("; ")}.`,
            output.draft.warnings.length
              ? `Not picked: ${output.draft.warnings.map((w) => `${w.name} for ${volunteerRoleConfig[w.role].label} — ${w.reason}`).join("; ")}`
              : "",
            output.refill
              ? "Those leave spots open. Replace them with someone free — call checkAvailability for those roles first, as your list may be out of date — or leave them open and say why in the summary. Then call proposeEvent again with the whole draft."
              : "",
          ]
            .filter(Boolean)
            .join("\n")
        : `Rejected: ${output.error}`,
    }),
  });

  return new ToolLoopAgent({
    model: "anthropic/claude-sonnet-5.5",
    instructions: buildInstructions({
      orgName,
      viewer,
      today,
      serviceTypes,
      templates,
      roster,
      teamLeads,
      ref,
    }),
    tools: { checkAvailability, proposeEvent },
    // Ends the moment a draft is accepted: the card carries the summary, so a
    // further call only to say "here it is" would be a full read for nothing.
    // The cap covers check -> propose plus a few rounds of fixing a rejection.
    stopWhen: [proposalAccepted("proposeEvent"), stepCountIs(6)],
    providerOptions: GATEWAY_CACHING,
  });
}

export type EventDraftAgentUIMessage = InferAgentUIMessage<
  ReturnType<typeof createEventDraftAgent>
>;
