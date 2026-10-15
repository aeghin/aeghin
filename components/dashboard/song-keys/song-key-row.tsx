"use client";

import { MessageSquareText } from "lucide-react";

import { SpotifyIcon, YoutubeIcon } from "@/components/icons/brand-icons";
import { formatKey } from "@/lib/constants/key";
import type { SongKeyEntry } from "@/lib/types";
import { KeyTile } from "./key-tile";

interface SongKeyRowProps {
  entry: SongKeyEntry;
  /** Opens the dialog: the key, the comment, and removing it. */
  onEdit: () => void;
}

/**
 * One line of the key journal, led by the key itself: your key, the song and
 * your comment. No library key or step count beside it — not every singer
 * reads those, and the key you sing is the answer the page is opened for.
 */
export function SongKeyRow({ entry, onEdit }: SongKeyRowProps) {
  // A linked entry shows its song's live name; the snapshot is the fallback
  // for one whose song row is gone.
  const displayTitle = entry.song?.title ?? entry.title;
  const displayArtist = entry.song?.artist ?? entry.artist;

  return (
    <div className="flex items-center gap-3 px-4 transition-colors hover:bg-muted/40 sm:px-5">
      <button
        type="button"
        onClick={onEdit}
        aria-label={`${displayTitle} by ${displayArtist}, your key ${formatKey(entry.pitch, entry.keyQuality)}. Edit`}
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 py-3 text-left focus-visible:outline-none"
      >
        <KeyTile pitch={entry.pitch} quality={entry.keyQuality} />

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm leading-tight font-semibold">{displayTitle}</p>
          <p className="truncate text-xs text-muted-foreground">{displayArtist}</p>
          {entry.notes && (
            <p className="mt-1 flex items-start gap-1.5 text-xs text-muted-foreground">
              <MessageSquareText aria-label="Comment" className="mt-px h-3 w-3 shrink-0 opacity-60" />
              <span className="line-clamp-2 min-w-0">{entry.notes}</span>
            </p>
          )}
        </div>
      </button>

      {(entry.song?.spotifyUrl || entry.song?.youtubeUrl) && (
        <div className="flex shrink-0 items-center gap-0.5">
          {entry.song?.spotifyUrl && (
            <a
              href={entry.song.spotifyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-emerald-600"
              aria-label="Open in Spotify"
            >
              <SpotifyIcon className="h-4 w-4" />
            </a>
          )}
          {entry.song?.youtubeUrl && (
            <a
              href={entry.song.youtubeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-red-600"
              aria-label="Open in YouTube"
            >
              <YoutubeIcon className="h-4.5 w-4.5" />
            </a>
          )}
        </div>
      )}
    </div>
  );
}
