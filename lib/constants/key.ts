import { z } from "zod";
import { Pitch, KeyQuality } from "@/generated/prisma/enums";

export const PITCH_LABELS: Record<Pitch, string> = {
  C: "C",
  C_SHARP: "C#",
  D_FLAT: "Db",
  D: "D",
  D_SHARP: "D#",
  E_FLAT: "Eb",
  E: "E",
  F: "F",
  F_SHARP: "F#",
  G_FLAT: "Gb",
  G: "G",
  G_SHARP: "G#",
  A_FLAT: "Ab",
  A: "A",
  A_SHARP: "A#",
  B_FLAT: "Bb",
  B: "B",
};

export type KeyOption = {
  pitch: Pitch
  quality: KeyQuality
  label: string
};

export const KEY_OPTIONS: KeyOption[] = [
  { pitch: "C", quality: "MAJOR", label: "C" },
  { pitch: "C", quality: "MINOR", label: "Cm" },
  { pitch: "C_SHARP", quality: "MAJOR", label: "C#" },
  { pitch: "C_SHARP", quality: "MINOR", label: "C#m" },
  { pitch: "D_FLAT", quality: "MAJOR", label: "Db" },
  { pitch: "D", quality: "MAJOR", label: "D" },
  { pitch: "D", quality: "MINOR", label: "Dm" },
  { pitch: "D_SHARP", quality: "MINOR", label: "D#m" },
  { pitch: "E_FLAT", quality: "MAJOR", label: "Eb" },
  { pitch: "E_FLAT", quality: "MINOR", label: "Ebm" },
  { pitch: "E", quality: "MAJOR", label: "E" },
  { pitch: "E", quality: "MINOR", label: "Em" },
  { pitch: "F", quality: "MAJOR", label: "F" },
  { pitch: "F", quality: "MINOR", label: "Fm" },
  { pitch: "F_SHARP", quality: "MAJOR", label: "F#" },
  { pitch: "F_SHARP", quality: "MINOR", label: "F#m" },
  { pitch: "G_FLAT", quality: "MAJOR", label: "Gb" },
  { pitch: "G", quality: "MAJOR", label: "G" },
  { pitch: "G", quality: "MINOR", label: "Gm" },
  { pitch: "G_SHARP", quality: "MINOR", label: "G#m" },
  { pitch: "A_FLAT", quality: "MAJOR", label: "Ab" },
  { pitch: "A", quality: "MAJOR", label: "A" },
  { pitch: "A", quality: "MINOR", label: "Am" },
  { pitch: "A_SHARP", quality: "MINOR", label: "A#m" },
  { pitch: "B_FLAT", quality: "MAJOR", label: "Bb" },
  { pitch: "B_FLAT", quality: "MINOR", label: "Bbm" },
  { pitch: "B", quality: "MAJOR", label: "B" },
  { pitch: "B", quality: "MINOR", label: "Bm" },
];

export const formatKey = (pitch: Pitch, quality: KeyQuality) => {
  return `${PITCH_LABELS[pitch]}${quality === "MINOR" ? "m" : ""}`
};

export const encodeKey = (pitch: Pitch, quality: KeyQuality) =>
  `${pitch}|${quality}`

export const decodeKey = (encoded: string): { pitch: Pitch; quality: KeyQuality } => {
  const [pitch, quality] = encoded.split("|")
  return { pitch: pitch as Pitch, quality: quality as KeyQuality }
};

/** The pitches each quality is written in, in the picker's order: 14 apiece. */
export const PITCHES_BY_QUALITY: Record<KeyQuality, Pitch[]> = {
  MAJOR: KEY_OPTIONS.filter((option) => option.quality === "MAJOR").map((option) => option.pitch),
  MINOR: KEY_OPTIONS.filter((option) => option.quality === "MINOR").map((option) => option.pitch),
};

const SEMITONE: Record<Pitch, number> = {
  C: 0,
  C_SHARP: 1,
  D_FLAT: 1,
  D: 2,
  D_SHARP: 3,
  E_FLAT: 3,
  E: 4,
  F: 5,
  F_SHARP: 6,
  G_FLAT: 6,
  G: 7,
  G_SHARP: 8,
  A_FLAT: 8,
  A: 9,
  A_SHARP: 10,
  B_FLAT: 10,
  B: 11,
};

/**
 * The same note spelled the way the other quality writes it, so switching Db
 * major to minor lands on C#m rather than on a key nobody writes. Mirrored in
 * the Expo app's `lib/config/keys.ts`.
 */
export function respell(pitch: Pitch, quality: KeyQuality): Pitch {
  const options = PITCHES_BY_QUALITY[quality];
  if (options.includes(pitch)) return pitch;
  return options.find((option) => SEMITONE[option] === SEMITONE[pitch]) ?? pitch;
}

export const pitchSchema = z.enum(Pitch);
export const keyQualitySchema = z.enum(KeyQuality);
export type { Pitch, KeyQuality };