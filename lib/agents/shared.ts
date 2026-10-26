import type { StopCondition, ToolSet } from "ai";
import type { VolunteerRole } from "@/generated/prisma/enums";
import { volunteerRoleConfig } from "@/lib/config/roles";
import type { RoleEligibility } from "@/lib/types";

// Shared by the agents, which client components import for their types: keep
// it free of `server-only`, Prisma and lib/services.

/**
 * Gateway prompt caching. Each step and each follow-up re-reads the
 * instructions and the conversation so far; cached, that re-read costs a
 * tenth of the price.
 */
export const GATEWAY_CACHING = { gateway: { caching: "auto" } };

/**
 * Short handles for ids in a prompt: the first block of each id ("3f2b8c1e"
 * for 3f2b8c1e-…). A full id costs the model about 22 tokens to read and as
 * many again to write back; this costs about 4. Taken from the id itself, so
 * a member keeps the same handle from one message to the next. Two ids that
 * share a first block both keep the whole id.
 *
 * Handles never leave the agent: tools turn them back into ids before
 * checking anything, and anything that isn't a known handle or id is refused.
 */
export function shortRefs(ids: Iterable<string>) {
  const unique = [...new Set(ids)];
  const firstBlock = (id: string) => id.split("-")[0];

  const counts = new Map<string, number>();

  for (const id of unique) {
    counts.set(firstBlock(id), (counts.get(firstBlock(id)) ?? 0) + 1);
  }

  const refOf = new Map<string, string>();
  const idOf = new Map<string, string>();

  for (const id of unique) {
    const ref = counts.get(firstBlock(id)) === 1 ? firstBlock(id) : id;

    refOf.set(id, ref);
    idOf.set(ref, id);
  }

  return {
    /** The handle for an id; the id itself when it isn't one of these. */
    ref: (id: string) => refOf.get(id) ?? id,
    /** The id behind a handle — or a full id the model wrote out — else null. */
    resolve: (value: string) =>
      idOf.get(value.trim()) ?? (refOf.has(value.trim()) ? value.trim() : null),
  };
}

/**
 * Stops an agent's loop as soon as its proposal tool was accepted. The card
 * carries the explanation, so another full call only to say "here it is" is
 * paid for and adds nothing. A rejected proposal doesn't stop it: the model
 * reads why and tries again.
 *
 * A proposal that had to drop picks from spots somebody else could still
 * fill (`refill`) gets one more round, so the model can look for them rather
 * than leave a hole on the card. A second proposal ends it either way.
 */
export const proposalAccepted =
  (toolName: string): StopCondition<ToolSet> =>
  ({ steps }) => {
    const accepted = steps.flatMap((step) =>
      step.toolResults.filter(
        (result) =>
          result.toolName === toolName &&
          (result.output as { ok?: unknown } | undefined)?.ok === true,
      ),
    );

    const latest = steps.at(-1)?.toolResults.find((result) => accepted.includes(result));

    if (!latest) return false;

    return (latest.output as { refill?: unknown }).refill !== true || accepted.length > 1;
  };

/** One person free for a role, as an agent's tools hand them over. */
export type AvailabilityCandidate = {
  ref: string;
  name: string;
  /** Invitations they said yes to, out of `responded`. */
  accepted: number;
  responded: number;
  /** Times they served in the last 60 days, and the last day they did. */
  recentServes: number;
  lastServedOn: string | null;
  /** Other events ahead they've said yes to or are deciding on. */
  upcoming: number;
};

/** Somebody who holds the role but can't serve, and why. */
export type AvailabilityExclusion = {
  name: string;
  reason: "conflict" | "blockout";
  /** The clashing event's name, or the blockout's dates. */
  detail: string;
};

/** One role's availability. */
export type AvailabilityRole = {
  role: VolunteerRole;
  /** Everyone holding the role, the unavailable included. */
  totalQualified: number;
  /** Everyone free, best first. */
  eligible: AvailabilityCandidate[];
  excluded: AvailabilityExclusion[];
};

/** A role's eligibility with ids swapped for handles, ready for a tool's output. */
export const toAvailability = (
  entry: RoleEligibility,
  ref: (id: string) => string,
): AvailabilityRole => ({
  role: entry.role,
  totalQualified: entry.totalQualified,
  eligible: entry.eligible.map((candidate) => ({
    ref: ref(candidate.userId),
    name: candidate.name,
    accepted: candidate.accepted,
    responded: candidate.responded,
    recentServes: candidate.recentServes,
    lastServedOn: candidate.lastServedOn,
    upcoming: candidate.upcoming,
  })),
  excluded: entry.excluded.map(({ name, reason, detail }) => ({ name, reason, detail })),
});

/**
 * "accepted 9 of 10 invites they answered", or "hasn't answered an invite
 * yet". Lapsed invites were never answered, so they aren't in the count.
 */
const yesRate = ({ accepted, responded }: AvailabilityCandidate) =>
  responded === 0
    ? "hasn't answered an invite yet"
    : `accepted ${accepted} of ${responded} ${responded === 1 ? "invite" : "invites"} they answered`;

/** "served 3× in 60 days, last 2026-10-26", or "hasn't served in 60 days". */
const served = ({ recentServes, lastServedOn }: AvailabilityCandidate) =>
  recentServes === 0
    ? "hasn't served in 60 days"
    : `served ${recentServes}× in 60 days, last ${lastServedOn}`;

/**
 * One role's availability as the lines a model reads — the same facts as the
 * tool's output in a fraction of the tokens, since JSON repeats every key for
 * every person. Every follow-up re-reads earlier results this way too.
 */
export function availabilityLines(entry: AvailabilityRole): string {
  const label = volunteerRoleConfig[entry.role].label;

  const lines = [
    `${label} (${entry.role}) — ${entry.eligible.length} free of ${entry.totalQualified}:`,
    ...entry.eligible.map(
      (c) =>
        `- ${c.ref} ${c.name}: ${yesRate(c)} · ${served(c)}${
          c.upcoming > 0 ? ` · ${c.upcoming} more booked ahead` : ""
        }`,
    ),
  ];

  if (entry.eligible.length === 0) lines.push("- nobody free");

  if (entry.excluded.length > 0) {
    lines.push(
      `Can't serve: ${entry.excluded
        .map((x) =>
          x.reason === "blockout"
            ? `${x.name} (blocked out ${x.detail})`
            : `${x.name} (serving "${x.detail}" then)`,
        )
        .join("; ")}`,
    );
  }

  return lines.join("\n");
}
