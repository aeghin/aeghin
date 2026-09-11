import { z } from "zod/v4";
import { pitchSchema, keyQualitySchema } from "@/lib/constants/key";

export const MAX_KEY_NOTE_LENGTH = 280;
const MAX_NAME_LENGTH = 120;

/**
 * One journal entry. `songId` null means the song isn't in the org's library —
 * then title and artist are the only record of what it is, so they're required.
 * For a linked entry the action re-reads both off the Song row and ignores
 * whatever the client sent, so a library entry can never drift or be spoofed.
 */
export const songKeySchema = z
  .object({
    organizationId: z.uuid(),
    songId: z.uuid().nullable(),
    title: z.string().trim().max(MAX_NAME_LENGTH, "Song title is too long"),
    artist: z.string().trim().max(MAX_NAME_LENGTH, "Artist name is too long"),
    pitch: pitchSchema,
    keyQuality: keyQualitySchema,
    // Empty is allowed and stored as null — same shape the song links use.
    notes: z
      .string()
      .trim()
      .max(MAX_KEY_NOTE_LENGTH, `Keep notes under ${MAX_KEY_NOTE_LENGTH} characters`),
  })
  .refine((d) => d.songId !== null || d.title.length > 0, {
    message: "Song title required",
    path: ["title"],
  })
  .refine((d) => d.songId !== null || d.artist.length > 0, {
    message: "Artist name required",
    path: ["artist"],
  });

export type SongKeyInput = z.infer<typeof songKeySchema>;
