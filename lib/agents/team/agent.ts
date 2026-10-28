import { ToolLoopAgent, tool, stepCountIs, InferAgentUIMessage } from "ai";
import type { RoleCategory as Team, VoiceType, VolunteerRole } from "@/generated/prisma/enums";
import { teamLabel, voiceTypeLabel, volunteerRoleConfig } from "@/lib/config/roles";
import type { RoleEligibility } from "@/lib/types";
import {
  GATEWAY_CACHING,
  availabilityLines,
  proposalAccepted,
  shortRefs,
  toAvailability,
} from "@/lib/agents/shared";
import { proposeInvitesInputSchema } from "./schema";

// Imported for its types by the Fill with AI dialog: keep it free of
// `server-only`, Prisma and lib/services. `build.ts` reads the data.

export type TeamAgentViewer = { userId: string; name: string; firstName: string };

/** One block of the event, as wall clock. */
export type TeamEventDay = { date: string; startTime: string; endTime: string };

export type TeamEvent = {
  name: string;
  serviceTypeName: string;
  days: TeamEventDay[];
  location: string;
  rehearsal: TeamEventDay | null;
};

/** Where one person asked into a role on this event stands. */
export type TeamSpotPerson = {
  name: string;
  status: "accepted" | "deciding" | "declined" | "lapsed" | "canceled";
  /**
   * The last day to answer, while they're deciding, on the organization's
   * clock as people write it ("Oct 29, 2026"): the model repeats what it's given.
   */
  answerBy: string | null;
};

/** One role on the event, against how many it needs. */
export type TeamRoleState = {
  role: VolunteerRole;
  needed: number;
  /** Spots nobody has said yes to and nobody is deciding on. */
  open: number;
  people: TeamSpotPerson[];
};

/** One team the person can staff here. */
export type TeamScope = {
  team: Team;
  /** In charge of it — its lead, this event's cover, else the creator — or only its backup. */
  inCharge: boolean;
  /** Whoever's in charge, by name: a backup's note says who they're backing up. */
  inChargeName: string;
  roles: TeamRoleState[];
};

export type TeamAgentMember = {
  userId: string;
  name: string;
  volunteerRoles: VolunteerRole[];
  /** A singer's voice type: null unless they hold a role that sings and have one set. */
  voiceType: VoiceType | null;
};

export type ProposedInvite = {
  userId: string;
  name: string;
  role: VolunteerRole;
  reason: string;
};

/** A pick the server turned down. Surfaced, never silently dropped. */
export type InviteWarning = {
  name: string;
  role: VolunteerRole;
  reason: string;
};

export type TeamProposal = {
  picks: ProposedInvite[];
  note: string;
  warnings: InviteWarning[];
  /** Spots still open once these picks say yes, by role. */
  stillOpen: { role: VolunteerRole; count: number }[];
};

export type ProposeInvitesOutput =
  /** `refill`: picks were dropped from roles that still have open spots. */
  | { ok: true; proposal: TeamProposal; refill: boolean }
  | { ok: false; error: string };

const STATUS: Record<TeamSpotPerson["status"], string> = {
  accepted: "said yes",
  deciding: "deciding",
  declined: "declined",
  lapsed: "let the invite lapse",
  canceled: "can't make it anymore",
};

const dayLines = (days: TeamEventDay[]) =>
  days.map((d) => `${d.date} ${d.startTime}-${d.endTime}`).join(", ");

export function createTeamFillAgent(opts: {
  orgName: string;
  viewer: TeamAgentViewer;
  /** YYYY-MM-DD on the organization's clock. */
  today: string;
  event: TeamEvent;
  scope: TeamScope[];
  /** Who's free for each open role, before anybody already asked is taken out. */
  eligibility: RoleEligibility[];
  /** Everyone with a row on this event, whatever it says: never asked again from here. */
  alreadyAsked: Set<string>;
  /** People on this event in roles outside these teams, live: one role each. */
  elsewhere: { name: string; role: VolunteerRole }[];
  roster: TeamAgentMember[];
}) {
  const { orgName, viewer, today, event, scope, eligibility, alreadyAsked, elsewhere, roster } = opts;
  const you = viewer.firstName;

  const { ref, resolve } = shortRefs(roster.map((m) => m.userId));
  const memberById = new Map(roster.map((m) => [m.userId, m]));

  const roleStates = new Map(scope.flatMap((s) => s.roles.map((r) => [r.role, r])));

  // Free and not asked here before, best first: the only people a pick can be.
  // The person asking is marked, so an answer calls them "you".
  const free = eligibility.map((entry) => ({
    ...entry,
    eligible: entry.eligible
      .filter((c) => !alreadyAsked.has(c.userId))
      .map((c) => (c.userId === viewer.userId ? { ...c, name: `${c.name} (you)` } : c)),
  }));
  const freeByRole = new Map(free.map((entry) => [entry.role, new Set(entry.eligible.map((c) => c.userId))]));

  const teamRows = scope
    .map((s) => {
      const footing = s.inCharge
        ? `${you} is in charge of it`
        : `${s.inChargeName} is in charge of it and heard first; ${you} is the backup on Also notify, so fill only what's still open, and your note tells ${you} they're backing up ${s.inChargeName}`;

      const roles = s.roles
        .map((r) => {
          const people = r.people.length
            ? r.people
                .map((p) => `${p.name} ${STATUS[p.status]}${p.answerBy ? ` (until ${p.answerBy})` : ""}`)
                .join("; ")
            : "nobody asked yet";

          return `  - ${volunteerRoleConfig[r.role].label} (${r.role}): ${r.needed} needed, ${r.open} open. ${people}.`;
        })
        .join("\n");

      return `- ${teamLabel(s.team)} — ${footing}.\n${roles}`;
    })
    .join("\n");

  const voiceOf = (userId: string) => memberById.get(userId)?.voiceType ?? null;

  const freeRows = free.length
    ? free.map((entry) => availabilityLines(toAvailability(entry, ref, voiceOf))).join("\n\n")
    : "(no open spots)";

  const elsewhereRows = elsewhere.length
    ? elsewhere.map((p) => `${p.name} (${volunteerRoleConfig[p.role].label})`).join(", ")
    : "nobody";

  const rosterRows = roster
    .map(
      (m) =>
        `- ${m.name}${m.userId === viewer.userId ? " (you)" : ""} | ${m.volunteerRoles.map((role) => volunteerRoleConfig[role].label).join(", ") || "no roles"}${
          m.voiceType ? ` | ${voiceTypeLabel(m.voiceType)}` : ""
        }`,
    )
    .join("\n");

  const instructions = `You help ${viewer.name} staff "${event.name}" for "${orgName}": ${event.serviceTypeName}, ${dayLines(event.days)}, at ${event.location}.${
    event.rehearsal ? ` Rehearsal ${dayLines([event.rehearsal])} (informational: it never makes anyone unavailable).` : ""
  }
You suggest invitations. Nothing is sent until ${you} presses Invite on your card, and every pick is checked again then. Your note and answers speak to ${you} as "you", never by name.

TODAY IS ${today}.

THE TEAMS YOU'RE FILLING
${teamRows}
Only these teams. Every other team's spots belong to whoever is in charge of it.

WHO'S FREE FOR THE OPEN SPOTS (ref name: record), best first
${freeRows}
Anybody already asked on this event is left out of these lists: they said yes, they're deciding, or they declined or let it lapse. Nobody is asked twice from here; ${you} can invite somebody again from their row on the Team card.
On this event in other roles, one role each: ${elsewhereRows}.

MEMBERS (name | roles | voice type, for a singer who has one), for questions about anyone:
${rosterRows}

HOW TO WORK
- Asked to fill spots, call proposeInvites with picks for the open spots — fill every one you can — and put your explanation in its note; the card shows it.
- To change a proposal, call proposeInvites again with the whole new set.
- Questions don't need a proposal. "Who's free for drums?", "Why not Dan?", "Who hasn't served lately?" — answer just that question in a sentence or two from the lists above. Write it for the person asking: the facts and what they mean — never your own steps, checks or lists, or apologies.

PICKING PEOPLE
- Each person free comes with how often they say yes, how often they've served in the last 60 days and when they last did, and how many events they're already booked for ahead.
- Start from the top of each list, then rotate: prefer someone rested over someone who has served most recent weeks or is booked solid ahead.
- Every reason is one short sentence built from those facts, e.g. "Rested — last served Sep 14, while Dan served 4 of the last 5 Sundays." Never state anything you weren't given.
- Mention someone's invite record only when it decided the pick, written as "accepted 2 of 3 invites they answered". Under 3 answers it says little, so lean on how rested they are instead.
- Honour named requests whenever the person is in WHO'S FREE for that role. When they aren't, say exactly why — can't serve (blocked out with the dates, or serving another event then), already asked on this event, already on it in another role, or doesn't hold the role — and offer the best alternative.
- Leaving a spot open is fine. Say which and why in your note.
- Asked why somebody wasn't picked, answer from the facts and give the numbers.

VOICE TYPES
Some singers have a voice type, shown after their name: Soprano, Alto, Tenor, Baritone or Bass. It counts only when ${you} brings voice types up — "two sopranos", "an alto", "who are our altos?", "a mix of parts":
- When they do, do exactly what they asked: a spot they want for a soprano goes only to somebody shown as Soprano, and you fill only what they asked for. When too few are free, leave those spots open and say so in your note. Never hand them to another voice type unless ${you} said another will do.
- When they don't, pick singers exactly as you would if voice types didn't exist, and never mention one — not in reasons, the note or answers.
- Somebody with no voice type shown doesn't have one. Never guess it.

HARD RULES — the server enforces these
- Use refs exactly as written in WHO'S FREE. Never invent one, never pass a name.
- Never more picks for a role than its open spots.
- One role per person, and never anybody already on this event.
- Only roles in the teams above.`;

  const proposeInvites = tool({
    description:
      "Deliver invitations for the open spots, for the user to review and send. Call it again with the whole new set for any change.",
    inputSchema: proposeInvitesInputSchema,
    // Every pick re-checked against the lists the model was given: free,
    // never asked here, the role in these teams, within its open spots.
    execute: async ({ picks, note }): Promise<ProposeInvitesOutput> => {
      const accepted: ProposedInvite[] = [];
      const warnings: InviteWarning[] = [];
      const claimed = new Set<string>();
      const taken = new Map<VolunteerRole, number>();

      for (const pick of picks) {
        const userId = resolve(pick.person);
        const member = userId ? memberById.get(userId) : undefined;
        const label = member?.name ?? pick.person;
        const state = roleStates.get(pick.role);

        if (!userId || !member) {
          warnings.push({ name: label, role: pick.role, reason: "Not a member of this organization." });
          continue;
        }
        if (!state) {
          warnings.push({ name: label, role: pick.role, reason: "That role isn't on the teams you're filling." });
          continue;
        }
        if (alreadyAsked.has(userId)) {
          warnings.push({ name: label, role: pick.role, reason: "Already asked on this event." });
          continue;
        }
        if (claimed.has(userId)) {
          warnings.push({ name: label, role: pick.role, reason: "Already picked for another role." });
          continue;
        }
        if (!freeByRole.get(pick.role)?.has(userId)) {
          warnings.push({
            name: label,
            role: pick.role,
            reason: member.volunteerRoles.includes(pick.role)
              ? "Can't serve then."
              : "Doesn't hold this volunteer role.",
          });
          continue;
        }
        if ((taken.get(pick.role) ?? 0) >= state.open) {
          warnings.push({ name: label, role: pick.role, reason: `${volunteerRoleConfig[pick.role].label} has no open spot left.` });
          continue;
        }

        claimed.add(userId);
        taken.set(pick.role, (taken.get(pick.role) ?? 0) + 1);
        accepted.push({ userId, name: member.name, role: pick.role, reason: pick.reason });
      }

      if (accepted.length === 0) {
        return {
          ok: false,
          error: `None of those picks can be invited: ${warnings.map((w) => `${w.name} — ${w.reason}`).join("; ")}`,
        };
      }

      const stillOpen = [...roleStates.values()]
        .map((r) => ({ role: r.role, count: r.open - (taken.get(r.role) ?? 0) }))
        .filter((r) => r.count > 0);

      return {
        ok: true,
        // A pick dropped from a role that still has an open spot: somebody
        // else on the lists may fit, so the agent gets a round to look.
        refill: warnings.some((w) => stillOpen.some((r) => r.role === w.role)),
        proposal: { picks: accepted, note, warnings, stillOpen },
      };
    },
    toModelOutput: ({ output }) => ({
      type: "text",
      value: output.ok
        ? [
            `Proposal shown on the card: ${output.proposal.picks
              .map((p) => `${volunteerRoleConfig[p.role].label} — ${p.name} (${ref(p.userId)})`)
              .join("; ")}.`,
            output.proposal.stillOpen.length
              ? `Still open: ${output.proposal.stillOpen.map((r) => `${volunteerRoleConfig[r.role].label} ×${r.count}`).join(", ")}.`
              : "",
            output.proposal.warnings.length
              ? `Turned down: ${output.proposal.warnings.map((w) => `${w.name} for ${volunteerRoleConfig[w.role].label} — ${w.reason}`).join("; ")}`
              : "",
            output.refill
              ? "Those leave spots open. Pick someone else for them from WHO'S FREE, or leave them open and say why in the note. Then call proposeInvites again with the whole set."
              : "",
          ]
            .filter(Boolean)
            .join("\n")
        : `Rejected: ${output.error}`,
    }),
  });

  return new ToolLoopAgent({
    model: "anthropic/claude-sonnet-5.5",
    instructions,
    tools: { proposeInvites },
    // Who's free is already in the instructions, so a fill is one call; the cap
    // leaves room to fix a rejected proposal.
    stopWhen: [proposalAccepted("proposeInvites"), stepCountIs(4)],
    providerOptions: GATEWAY_CACHING,
  });
}

export type TeamFillAgentUIMessage = InferAgentUIMessage<
  ReturnType<typeof createTeamFillAgent>
>;
