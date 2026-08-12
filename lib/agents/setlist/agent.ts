import { ToolLoopAgent, tool, InferAgentUIMessage } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { Pitch, KeyQuality } from "@/generated/prisma/enums";
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

const TIER_MODEL: Record<SetlistTier, string> = {
  premium: "anthropic/claude-haiku-4.5",
  pro: "anthropic/claude-sonnet-5",
};

function buildInstructions(orgName: string, catalog: AgentCatalogSong[], tier: SetlistTier) {
  const rows = catalog
    .map(
      (s) =>
        `- ${s.id} | "${s.title}" — ${s.artist} | key ${s.defaultPitch}/${s.defaultKeyQuality} | ${s.bpm}bpm ${s.timeSignature} | themes: ${s.themes.join(", ") || "—"}`,
    )
    .join("\n");

  const scope =
    tier === "pro"
      ? `You are well versed in music theory, and you may use web search to research songs, artists, and what other worship teams play. You may name and recommend songs that are NOT in this catalog — but only in your chat explanation.`
      : `You are well versed in music theory. You have no web access and work strictly from this organization's song catalog. Never name, recommend, or describe a song that is not in the catalog below — not in the setlist, and not in chat. If the catalog can't cover what the user is asking for, say so plainly and suggest they add songs to their library.`;

  const idRule =
    tier === "pro"
      ? `- Only catalog songs can be added to the setlist, so the proposeSetlist call must contain ONLY ids from the catalog above. When you recommend a song that isn't in the catalog, keep it in chat and tell the user to add it to their catalog first if they want it in the setlist. Never put a non-catalog song in the tool call.`
      : `- Choose songs strictly by their exact id from the catalog above. Never invent songs or ids.`;

  return `You are a setlist assistant for "${orgName}". You help a worship/music leader build an event setlist. ${scope}

CATALOG (id | title — artist | key | tempo | themes):
${rows}

How to work:
${idRule}
- Use each song's themes to match what the user asks for (e.g. "communion", "surrender", "Christmas").
- Think about flow: key compatibility between adjacent songs, a sensible tempo/energy arc, and theme coherence.
- Keep each song in its catalog key unless the user asks to transpose.
- Explain your thinking briefly in chat (1–3 sentences), then ALWAYS call the proposeSetlist tool to deliver the list — never write the final setlist as plain text.
- If the catalog is too small or lacks fitting songs, say so honestly instead of forcing it.`;
}

export function createSetlistAgent(opts: {
  tier: SetlistTier,
  orgName: string;
  catalog: AgentCatalogSong[];
}) {
  const { tier, orgName, catalog } = opts;
  const byId = new Map(catalog.map((s) => [s.id, s]));

  const proposeSetlist = tool({
    description:
      "Deliver a finished setlist for the user to review and apply. Call this once you've settled on the songs.",
    inputSchema: proposeSetlistInputSchema,
    // Runs on the server: validates every id against the org catalog and
    // hydrates real metadata. The model cannot smuggle in foreign songs.
    execute: async ({ title, songs }) => {
      const resolved: ProposedSetlistSong[] = [];
      const skipped: string[] = [];
      const seen = new Set<string>();

      for (const item of songs) {
        const song = byId.get(item.songId);
        if (!song || seen.has(item.songId)) {
          skipped.push(item.songId);
          continue;
        }
        seen.add(item.songId);
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

      return { title, songs: resolved, skipped };
    },
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
    instructions: buildInstructions(orgName, catalog, tier),
    tools,
  });
}


export type SetlistAgentUIMessage = InferAgentUIMessage<
  ReturnType<typeof createSetlistAgent>
>;
