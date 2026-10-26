import { z } from "zod";
import { Pitch, KeyQuality } from "@/generated/prisma/enums";

// What the model is allowed to send when it proposes a setlist.
// It only picks songs by ref + (optional) key; everything else is hydrated
// server-side from the catalog, so the model can't invent metadata.
export const proposeSetlistInputSchema = z.object({
  title: z
    .string()
    .describe('Short name for this proposal, e.g. "Sunday AM — Surrender".'),
  songs: z
    .array(
      z.object({
        song: z
          .string()
          .describe("Ref of a song from the provided catalog."),
        pitch: z
          .enum(Pitch)
          .optional()
          .describe(
            "Only set to transpose; omit to use the catalog default key.",
          ),
        keyQuality: z.enum(KeyQuality).optional(),
        reason: z
          .string()
          .describe("One short sentence: why this song, here, in the flow."),
      }),
    )
    .min(1)
    .describe("Songs in playing order."),
  note: z
    .string()
    .describe(
      "One or two sentences shown on the card: the flow and key choices, and any song worth adding to the library that isn't in it yet.",
    ),
});

export type ProposeSetlistInput = z.infer<typeof proposeSetlistInputSchema>;
