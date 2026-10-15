"use client";

import { cn } from "@/lib/utils";
import {
  PITCHES_BY_QUALITY,
  PITCH_LABELS,
  formatKey,
  respell,
} from "@/lib/constants/key";
import type { KeyQuality, Pitch } from "@/generated/prisma/enums";

const QUALITIES: { value: KeyQuality; label: string }[] = [
  { value: "MAJOR", label: "Major" },
  { value: "MINOR", label: "Minor" },
];

interface KeyPickerProps {
  pitch: Pitch;
  quality: KeyQuality;
  onChange: (pitch: Pitch, quality: KeyQuality) => void;
}

/** Every key as one click: major or minor, then the note. As on the phone. */
export function KeyPicker({ pitch, quality, onChange }: KeyPickerProps) {
  return (
    <div className="space-y-2.5">
      <div role="radiogroup" aria-label="Major or minor" className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
        {QUALITIES.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={option.value === quality}
            onClick={() => onChange(respell(pitch, option.value), option.value)}
            className={cn(
              "h-8 cursor-pointer rounded-md text-sm font-medium transition-colors",
              option.value === quality
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div role="radiogroup" aria-label="Key" className="grid grid-cols-7 gap-1.5">
        {PITCHES_BY_QUALITY[quality].map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={option === pitch}
            aria-label={formatKey(option, quality)}
            onClick={() => onChange(option, quality)}
            className={cn(
              "h-10 cursor-pointer rounded-[10px] border text-sm font-semibold transition-colors",
              option === pitch
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card hover:bg-muted",
            )}
          >
            {PITCH_LABELS[option]}
          </button>
        ))}
      </div>
    </div>
  );
}
