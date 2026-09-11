"use client";

import { useState, useTransition } from "react";
import { Check, Loader2, Pencil, StickyNote, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SpotifyIcon, YoutubeIcon } from "@/components/icons/brand-icons";
import {
  KEY_OPTIONS,
  decodeKey,
  encodeKey,
  formatKey,
} from "@/lib/constants/key";
import { MAX_KEY_NOTE_LENGTH } from "@/lib/validations/song-key";
import { deleteSongKey, updateSongKey } from "@/lib/actions/song-key";
import type { SongKeyEntry } from "@/lib/types";

interface SongKeyRowProps {
  entry: SongKeyEntry;
  organizationId: string;
}

export function SongKeyRow({ entry, organizationId }: SongKeyRowProps) {
  // A linked entry shows its song's live name; the snapshot is the fallback
  // for one whose song row is gone.
  const displayTitle = entry.song?.title ?? entry.title;
  const displayArtist = entry.song?.artist ?? entry.artist;

  const [isEditing, setIsEditing] = useState(false);
  const [encoded, setEncoded] = useState(encodeKey(entry.pitch, entry.keyQuality));
  const [notes, setNotes] = useState(entry.notes ?? "");
  const [isSaving, startSaving] = useTransition();
  const [isDeleting, startDeleting] = useTransition();

  const myKey = formatKey(entry.pitch, entry.keyQuality);
  const libraryKey = entry.song
    ? formatKey(entry.song.defaultPitch, entry.song.defaultKeyQuality)
    : null;
  const differsFromLibrary = Boolean(libraryKey) && libraryKey !== myKey;

  const handleSave = () => {
    const { pitch, quality } = decodeKey(encoded);

    startSaving(async () => {
      const result = await updateSongKey(entry.id, {
        organizationId,
        songId: entry.songId,
        title: displayTitle,
        artist: displayArtist,
        pitch,
        keyQuality: quality,
        notes,
      });

      if (result.success) {
        toast.success("Key updated", { position: "bottom-center" });
        setIsEditing(false);
      } else {
        toast.error(result.error, { position: "bottom-center" });
      }
    });
  };

  const handleCancel = () => {
    setEncoded(encodeKey(entry.pitch, entry.keyQuality));
    setNotes(entry.notes ?? "");
    setIsEditing(false);
  };

  const handleDelete = () => {
    startDeleting(async () => {
      const result = await deleteSongKey(entry.id, organizationId);

      result.success
        ? toast.success("Removed from your keys", { position: "bottom-center" })
        : toast.error(result.error, { position: "bottom-center" });
    });
  };

  return (
    <div className="px-4 py-4 sm:px-6">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="truncate text-sm font-medium leading-tight">
              {displayTitle}
            </p>
            {entry.song?.spotifyUrl && (
              <a
                href={entry.song.spotifyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground transition-colors hover:text-emerald-600"
                aria-label="Open in Spotify"
              >
                <SpotifyIcon className="h-3.5 w-3.5" />
              </a>
            )}
            {entry.song?.youtubeUrl && (
              <a
                href={entry.song.youtubeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground transition-colors hover:text-red-600"
                aria-label="Open in YouTube"
              >
                <YoutubeIcon className="h-4 w-4" />
              </a>
            )}
          </div>
          <p className="truncate text-xs text-muted-foreground">{displayArtist}</p>

          {!isEditing && entry.notes && (
            <p className="mt-1.5 flex items-start gap-1.5 text-xs text-muted-foreground">
              <StickyNote className="mt-px h-3 w-3 shrink-0 opacity-60" />
              <span className="min-w-0">{entry.notes}</span>
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {isEditing ? (
            <Select value={encoded} onValueChange={setEncoded}>
              <SelectTrigger className="h-8 w-20 font-mono text-xs">
                <SelectValue placeholder="Key" />
              </SelectTrigger>
              <SelectContent>
                {KEY_OPTIONS.map((opt) => (
                  <SelectItem
                    key={`${opt.pitch}-${opt.quality}`}
                    value={encodeKey(opt.pitch, opt.quality)}
                    className="font-mono text-xs"
                  >
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <div className="flex flex-col items-end gap-0.5">
              <Badge
                variant="outline"
                className="border-primary/40 px-2 py-0 font-mono text-xs font-semibold text-primary"
              >
                {myKey}
              </Badge>
              {differsFromLibrary && (
                <span className="font-mono text-[10px] text-muted-foreground">
                  library {libraryKey}
                </span>
              )}
            </div>
          )}

          {isEditing ? (
            <>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleSave}
                disabled={isSaving}
                className="h-8 w-8 text-muted-foreground hover:text-primary"
              >
                {isSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                <span className="sr-only">Save key</span>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleCancel}
                disabled={isSaving}
                className="h-8 w-8 text-muted-foreground"
              >
                <X className="h-4 w-4" />
                <span className="sr-only">Cancel</span>
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsEditing(true)}
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
              >
                <Pencil className="h-3.5 w-3.5" />
                <span className="sr-only">Edit key</span>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleDelete}
                disabled={isDeleting}
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
              >
                {isDeleting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" />
                )}
                <span className="sr-only">Remove from my keys</span>
              </Button>
            </>
          )}
        </div>
      </div>

      {isEditing && (
        <div className="mt-3">
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={MAX_KEY_NOTE_LENGTH}
            rows={2}
            placeholder="Notes — capo, where it sits, what to watch for…"
            className="text-sm"
          />
          <p className="mt-1 text-right text-[10px] text-muted-foreground">
            {notes.length}/{MAX_KEY_NOTE_LENGTH}
          </p>
        </div>
      )}
    </div>
  );
}
