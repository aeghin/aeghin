import { ToolLoopAgent, tool, stepCountIs, InferAgentUIMessage } from "ai";
import { VolunteerRole } from "@/generated/prisma/enums";
import type { RoleEligibility } from "@/lib/types";
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
  expiresInDays: number;
  smartSchedulingEnabled: boolean;
  serviceTypeId: string;
};

export type AgentRosterMember = {
  userId: string;
  name: string;
  volunteerRoles: VolunteerRole[];
};

export type EventAgentDeps = {
  checkAvailability: (input: {
    days: DraftDay[];
    roles: VolunteerRole[];
    maxPerRole?: number;
  }) => Promise<RoleEligibility[]>;
};

export type DraftDay = { date: string; startTime: string; endTime: string };

export type DraftAssignment = {
  userId: string;
  name: string;
  role: VolunteerRole;
  reason: string;
};

/** A pick the server rejected. Surfaced, never silently dropped. */
export type DraftWarning = {
  name: string;
  role: VolunteerRole;
  reason: string;
};

export type EventDraft = {
  serviceTypeId: string;
  serviceTypeName: string;
  serviceTypeColor: string;
  name: string;
  description: string;
  location: string;
  days: DraftDay[];
  rolesNeeded: VolunteerRole[];
  assignments: DraftAssignment[];
  expiresInDays: 3 | 5 | 7;
  smartSchedulingEnabled: boolean;
  summary: string;
  warnings: DraftWarning[];
  unfilledRoles: VolunteerRole[];
};

export type ProposeEventOutput =
  | { ok: true; draft: EventDraft }
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

function buildInstructions(opts: {
  orgName: string;
  today: string;
  serviceTypes: AgentServiceType[];
  templates: AgentTemplate[];
  roster: AgentRosterMember[];
}) {
  const { orgName, today, serviceTypes, templates, roster } = opts;

  const todayWeekday = WEEKDAYS[new Date(`${today}T00:00:00Z`).getUTCDay()];

  const serviceTypeRows = serviceTypes
    .map((t) => `- ${t.id} | ${t.name}`)
    .join("\n");

  const templateRows = templates.length
    ? templates
        .map(
          (t) =>
            `- "${t.name}" | every ${WEEKDAYS[t.dayOfWeek]} | ${t.location} | serviceTypeId ${t.serviceTypeId} | ${t.days
              .map((d) => `day+${d.dayOffset} ${d.startTime}-${d.endTime}`)
              .join(", ")} | roles: ${t.rolesNeeded.join(", ")} | expires ${t.expiresInDays}d | smartScheduling ${t.smartSchedulingEnabled}`,
        )
        .join("\n")
    : "(none)";

  const rosterRows = roster
    .map((m) => `- ${m.userId} | ${m.name} | ${m.volunteerRoles.join(", ") || "no roles"}`)
    .join("\n");

  return `You draft events for "${orgName}". An owner or admin describes what they want; you produce a complete draft they review and approve. You never create anything — your proposal pre-fills their form, and they press the button.

TODAY IS ${today} (${todayWeekday}).

SERVICE TYPES (id | name):
${serviceTypeRows}
Every event is filed under one of these. There are no others and you cannot create one. If none of them really fits what they asked for, use the closest and say in your summary which one you used and that it may not be the right home — never let a mismatch pass silently.

TEMPLATES — the org's own recurring patterns. If one matches what they asked for, follow it for times, location, roles and service type:
${templateRows}

ROSTER (userId | name | volunteer roles):
${rosterRows}

HOW TO WORK
1. Work out the dates first. "Next Sunday" means the next occurrence AFTER today — if today is Sunday, that's seven days out, not today.
2. Call checkAvailability with those days and every role the event needs. It returns, per role, who is free and ranked best-first, plus who is excluded and why.
3. Pick people. Then call proposeEvent. Always finish with proposeEvent — never write the final plan as prose.

PICKING PEOPLE
- The ranked list is ordered by reliability (how often they accept). Taking the top of each list is a sound default.
- Rotate deliberately. Each candidate carries recentServes and lastServedOn. If your most reliable person has served far more than the rest, pick someone rested and say so in their reason — that is the main thing you add over a plain ranking.
- Never pick anyone in the excluded list. They have a real conflict or a blockout, and the server will reject them.
- Honour explicit requests ("put Marcus on drums") whenever that person is eligible. If they aren't, say who and why, and offer the best alternative.
- Leaving a slot empty is fine and often correct. Say which roles you left open and why.

HARD RULES — the server enforces these and will reject the draft
- Event name: 25 characters maximum. Location: 20 characters maximum.
- Dates are calendar dates (YYYY-MM-DD) and times are 24-hour clock times (HH:mm). Never send a timezone, an offset, or an ISO instant.
- Multi-day events must be CONSECUTIVE days. You cannot draft two separate Sundays as one event — that is two events, so draft one and tell the user.
- One person holds at most ONE role per event. Never assign the same person twice.
- expiresInDays is exactly 3, 5, or 7.
- Every assignment's role must also appear in rolesNeeded.
- Use exact userIds and serviceTypeIds from the lists above. Never invent one, never pass a name where an id belongs.`;
}

export function createEventDraftAgent(opts: {
  orgName: string;
  /** YYYY-MM-DD in the org's own reckoning. Anchors all relative dates. */
  today: string;
  serviceTypes: AgentServiceType[];
  templates: AgentTemplate[];
  roster: AgentRosterMember[];
  deps: EventAgentDeps;
}) {
  const { orgName, today, serviceTypes, templates, roster, deps } = opts;

  const serviceTypeById = new Map(serviceTypes.map((t) => [t.id, t]));
  const memberById = new Map(roster.map((m) => [m.userId, m]));

  const checkAvailability = tool({
    description:
      "Who can serve on given days, per role — ranked by reliability, with rotation history, plus who is excluded and why. Call this before proposing.",
    inputSchema: checkAvailabilityInputSchema,
    execute: async ({ days, roles }) => {
      const roleEligibility = await deps.checkAvailability({ days, roles });
      return { days, roles: roleEligibility };
    },
  });

  const proposeEvent = tool({
    description:
      "Deliver the finished draft for the user to review and approve. Call this once you've settled the dates and the people.",
    inputSchema: proposeEventInputSchema,
    // Runs on the server. Every id, date and pick is re-checked against live
    // data here — the model's output is a suggestion, not a source of truth.
    execute: async (input): Promise<ProposeEventOutput> => {
      const serviceType = serviceTypeById.get(input.serviceTypeId);
      if (!serviceType) {
        return {
          ok: false,
          error: `Unknown serviceTypeId "${input.serviceTypeId}". Use one of: ${serviceTypes
            .map((t) => `${t.id} (${t.name})`)
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

      const rolesNeeded = [...new Set(input.rolesNeeded)];

      // Verify against the FINAL dates, uncapped — a capped list would wrongly
      // reject an eligible member who happened to rank low.
      const eligibility = await deps.checkAvailability({
        days,
        roles: rolesNeeded,
        maxPerRole: Number.MAX_SAFE_INTEGER,
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
        const member = memberById.get(pick.userId);
        const label = member?.name ?? pick.userId;

        if (!member) {
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
        if (claimed.has(pick.userId)) {
          warnings.push({
            name: label,
            role: pick.role,
            reason: "Already assigned another role on this event.",
          });
          continue;
        }

        const excluded = exclusionByRole.get(pick.role)?.get(pick.userId);
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
        if (!eligibleByRole.get(pick.role)?.has(pick.userId)) {
          warnings.push({
            name: label,
            role: pick.role,
            reason: "No longer available for these dates.",
          });
          continue;
        }

        claimed.add(pick.userId);
        assignments.push({
          userId: pick.userId,
          name: member.name,
          role: pick.role,
          reason: pick.reason,
        });
      }

      const filled = new Set(assignments.map((a) => a.role));

      return {
        ok: true,
        draft: {
          serviceTypeId: serviceType.id,
          serviceTypeName: serviceType.name,
          serviceTypeColor: serviceType.color,
          name: input.name,
          description: input.description,
          location: input.location,
          days,
          rolesNeeded,
          assignments,
          expiresInDays: input.expiresInDays,
          smartSchedulingEnabled: input.smartSchedulingEnabled,
          summary: input.summary,
          warnings,
          unfilledRoles: rolesNeeded.filter((r) => !filled.has(r)),
        },
      };
    },
  });

  return new ToolLoopAgent({
    model: "anthropic/claude-sonnet-5",
    instructions: buildInstructions({
      orgName,
      today,
      serviceTypes,
      templates,
      roster,
    }),
    tools: { checkAvailability, proposeEvent },
    // stopWhen defaults to a SINGLE step, which would halt the loop right after
    // checkAvailability and never reach proposeEvent. This budget covers the
    // normal check -> propose path plus a few rounds of correcting a rejection.
    stopWhen: stepCountIs(8),
  });
}

export type EventDraftAgentUIMessage = InferAgentUIMessage<
  ReturnType<typeof createEventDraftAgent>
>;
