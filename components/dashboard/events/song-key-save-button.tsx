"use client";

import { useTransition } from "react";
import { BookmarkCheck, BookmarkPlus, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { formatKey } from "@/lib/constants/key";
import { saveSongKey } from "@/lib/actions/song-key";
import type { KeyQuality, Pitch } from "@/generated/prisma/enums";

interface SongKeySaveButtonProps {
  organizationId: string;
  /** The library song — a setlist can't hold anything else. */
  songId: string;
  title: string;
  artist: string;
  /** The setlist key for this event — what gets copied across. */
  pitch: Pitch;
  keyQuality: KeyQuality;
  /** The caller's journal entry for this song, if they already have one. */
  savedKey: { pitch: Pitch; keyQuality: KeyQuality } | null;
}

export function SongKeySaveButton({
  organizationId,
  songId,
  title,
  artist,
  pitch,
  keyQuality,
  savedKey,
}: SongKeySaveButtonProps) {
  const [isPending, startTransition] = useTransition();

  const setlistKey = formatKey(pitch, keyQuality);
  const journalKey = savedKey ? formatKey(savedKey.pitch, savedKey.keyQuality) : null;

  // Three states, because overwriting a key you already wrote down should
  // never be silent: unsaved, saved at this key, saved at a different one.
  const isSaved = journalKey === setlistKey;
  const isStale = Boolean(journalKey) && !isSaved;

  const label = isSaved
    ? `In your journal as ${setlistKey}`
    : isStale
      ? `Your journal says ${journalKey} — update to ${setlistKey}`
      : `Save ${setlistKey} to your journal`;

  const handleClick = () => {
    if (isSaved) return;

    startTransition(async () => {
      const result = await saveSongKey({
        organizationId,
        songId,
        title,
        artist,
        pitch,
        keyQuality,
        notes: "",
      });

      result.success
        ? toast.success(
            isStale ? `Updated to ${setlistKey}` : `Saved ${setlistKey} to your keys`,
            { position: "top-center" },
          )
        : toast.error(result.error, { position: "top-center" });
    });
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={label}
          onClick={handleClick}
          disabled={isPending || isSaved}
          className={cn(
            "h-6 w-6 shrink-0 rounded-full transition-all disabled:opacity-100",
            isSaved
              ? "text-primary"
              : isStale
                ? "text-amber-600 hover:text-amber-700 dark:text-amber-500"
                : "text-muted-foreground hover:text-foreground",
          )}
        >
          {isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : isSaved ? (
            <BookmarkCheck className="h-3.5 w-3.5" />
          ) : (
            <BookmarkPlus className="h-3.5 w-3.5" />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  );
}
