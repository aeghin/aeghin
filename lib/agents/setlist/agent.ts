import { ToolLoopAgent, tool, stepCountIs, InferAgentUIMessage } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { Pitch, KeyQuality } from "@/generated/prisma/enums";
import { GATEWAY_CACHING, proposalAccepted, shortRefs } from "@/lib/agents/shared";
import { proposeSetlistInputSchema } from "./schema";

// Minimal view of a catalog song the agent reasons over (org-scoped).
export type AgentCatalogSong = {
  id: string;
  title: string;
  artist: string;
  bpm: number;
  timeSignature: string;
  defaultPitch: Pitch;
  defaultKeyQuality: KeyQuality;
  themes: string[];
  spotifyUrl: string | null;
  youtubeUrl: string | null;
};

// Shape the client applies into the draft (mirrors SetlistSong fields).
export type ProposedSetlistSong = {
  songId: string;
  title: string;
  artist: string;
  bpm: number;
  timeSignature: string;
  pitch: Pitch;
  keyQuality: KeyQuality;
  spotifyUrl: string | null;
  youtubeUrl: string | null;
  reason: string;
};

export type SetlistTier = "premium" | "pro";

export type ProposeSetlistOutput = {
  /** Every pick was a catalog song: the loop can stop at the card. */
  ok: boolean;
  title: string;
  /** Shown on the card. Absent from proposals made before notes. */
  note?: string;
  songs: ProposedSetlistSong[];
  skipped: string[];
};

const TIER_MODEL: Record<SetlistTier, string> = {
  premium: "anthropic/claude-haiku-5.5",
  pro: "anthropic/claude-sonnet-5.5",
};

function buildInstructions(
  orgName: string,
  catalog: AgentCatalogSong[],
  tier: SetlistTier,
  ref: (id: string) => string,
) {
  const rows = catalog
    .map(
      (s) =>
        `- ${ref(s.id)} | "${s.title}" — ${s.artist} | key ${s.defaultPitch}/${s.defaultKeyQuality} | ${s.bpm}bpm ${s.timeSignature} | themes: ${s.themes.join(", ") || "—"}`,
    )
    .join("\n");

  const scope =
    tier === "pro"
      ? `You are well versed in music theory, and you may use web search to research songs, artists, and what other worship teams play. You may name and recommend songs that are NOT in this library — in your note or a reply, never in the setlist itself.`
      : `You are well versed in music theory. You have no web access and work strictly from this organization's song library. Never name, recommend, or describe a song that is not in the library below — not in the setlist, and not in chat. If the library can't cover what the user is asking for, say so plainly and suggest they add songs to their library.`;

  const idRule =
    tier === "pro"
      ? `- Only library songs can be added to the setlist, so the proposeSetlist call must contain ONLY refs from the library above. When you recommend a song that isn't in the library, keep it in your note or reply and tell the user to add it to their library first if they want it in the setlist. Never put a non-library song in the tool call.`
      : `- Choose songs strictly by their exact ref from the library above. Never invent songs or refs.`;

  return `You are a setlist assistant for "${orgName}". You help a worship/music leader build an event setlist. ${scope}

LIBRARY (ref | title — artist | key | tempo | themes):
${rows}

How to work:
${idRule}
- Use each song's themes to match what the user asks for (e.g. "communion", "surrender", "Christmas").
- Think about flow: key compatibility between adjacent songs, a sensible tempo/energy arc, and theme coherence.
- Keep each song in its library key unless the user asks to transpose.
- Always deliver a setlist through proposeSetlist, never as plain text, and put your explanation in its note — the card shows it. To change one, call proposeSetlist again with the whole new list.
- Questions about songs, keys or flow don't need a new setlist: answer just that question in a sentence or two — never your own steps or checks, or apologies.
- If the library is too small or lacks fitting songs, say so honestly instead of forcing it.`;
}

export function createSetlistAgent(opts: {
  tier: SetlistTier,
  orgName: string;
  catalog: AgentCatalogSong[];
}) {
  const { tier, orgName, catalog } = opts;
  const byId = new Map(catalog.map((s) => [s.id, s]));
  const { ref, resolve } = shortRefs(catalog.map((s) => s.id));

  const proposeSetlist = tool({
    description:
      "Deliver a finished setlist for the user to review and apply. Call this once you've settled on the songs.",
    inputSchema: proposeSetlistInputSchema,
    // Runs on the server: validates every ref against the org catalog and
    // hydrates real metadata. The model cannot smuggle in foreign songs.
    execute: async ({ title, songs, note }): Promise<ProposeSetlistOutput> => {
      const resolved: ProposedSetlistSong[] = [];
      const skipped: string[] = [];
      const seen = new Set<string>();

      for (const item of songs) {
        const id = resolve(item.song);
        const song = id ? byId.get(id) : undefined;
        if (!id || !song || seen.has(id)) {
          skipped.push(item.song);
          continue;
        }
        seen.add(id);
        resolved.push({
          songId: song.id,
          title: song.title,
          artist: song.artist,
          bpm: song.bpm,
          timeSignature: song.timeSignature,
          pitch: item.pitch ?? song.defaultPitch,
          keyQuality: item.keyQuality ?? song.defaultKeyQuality,
          spotifyUrl: song.spotifyUrl || null,
          youtubeUrl: song.youtubeUrl || null,
          reason: item.reason,
        });
      }

      // Anything skipped keeps the loop going, so the model can fix it.
      return { ok: skipped.length === 0, title, note, songs: resolved, skipped };
    },
    // The list a follow-up needs to edit it, by title and ref.
    toModelOutput: ({ output }) => ({
      type: "text",
      value: [
        `Setlist shown on the card: ${output.songs
          .map((s, i) => `${i + 1}. ${s.title} (${ref(s.songId)}) in ${s.pitch}/${s.keyQuality}`)
          .join("; ")}.`,
        output.skipped.length ? `Skipped, not in the library: ${output.skipped.join(", ")}.` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    }),
  });


  const tools = (
    tier === "pro"
      ? { proposeSetlist, web_search: anthropic.tools.webSearch_20260209({ maxUses: 2 }) }
      : { proposeSetlist }
  ) as {
    proposeSetlist: typeof proposeSetlist;
    web_search: ReturnType<typeof anthropic.tools.webSearch_20260209>;
  };

  return new ToolLoopAgent({
    model: TIER_MODEL[tier],
    instructions: buildInstructions(orgName, catalog, tier, ref),
    tools,
    // Ends at a clean proposal: the card carries the note, so a further call
    // only to say "here it is" would re-read the whole catalog for nothing.
    stopWhen: [proposalAccepted("proposeSetlist"), stepCountIs(4)],
    providerOptions: GATEWAY_CACHING,
  });
}


export type SetlistAgentUIMessage = InferAgentUIMessage<
  ReturnType<typeof createSetlistAgent>
>;
