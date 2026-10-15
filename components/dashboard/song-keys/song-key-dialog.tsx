"use client";

import { useMemo, useState, useTransition } from "react";
import { Check, Loader2, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { formatKey } from "@/lib/constants/key";
import { MAX_KEY_NOTE_LENGTH } from "@/lib/validations/song-key";
import { deleteSongKey, saveSongKey, updateSongKey } from "@/lib/actions/song-key";
import { KeyPicker } from "./key-picker";
import type { KeyQuality, Pitch } from "@/generated/prisma/enums";
import type { LibrarySong, SongKeyEntry } from "@/lib/types";

/**
 * What the dialog opens on: an entry to edit, or none, to pick a song from the
 * library. `token` changes on every open so each one starts a fresh form.
 */
export type SongKeyTarget = {
  entry: SongKeyEntry | null;
  token: number;
};

interface SongKeyDialogProps {
  organizationId: string;
  target: SongKeyTarget | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The org library — the pool an entry can be added from. */
  catalog: LibrarySong[];
  /** Your entry for each library song: picking one of these rewrites it. */
  journal: Map<string, SongKeyEntry>;
}

/** The key journal's one form: adding, editing and removing, as on the phone. */
export function SongKeyDialog({ target, open, onOpenChange, ...props }: SongKeyDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] gap-0 overflow-hidden p-0 sm:max-w-lg">
        {target && (
          <SongKeyForm
            key={`${target.entry?.id ?? "add"}-${target.token}`}
            target={target}
            onDone={() => onOpenChange(false)}
            {...props}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function SongKeyForm({
  organizationId,
  target,
  onDone,
  catalog,
  journal,
}: Omit<SongKeyDialogProps, "target" | "open" | "onOpenChange"> & {
  target: SongKeyTarget;
  onDone: () => void;
}) {
  const { entry } = target;

  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<LibrarySong | null>(null);
  const [pitch, setPitch] = useState<Pitch | null>(entry?.pitch ?? null);
  const [quality, setQuality] = useState<KeyQuality | null>(entry?.keyQuality ?? null);
  const [notes, setNotes] = useState(entry?.notes ?? "");
  const [isSaving, startSaving] = useTransition();
  const [isRemoving, startRemoving] = useTransition();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q
      ? catalog.filter(
          (s) => s.title.toLowerCase().includes(q) || s.artist.toLowerCase().includes(q),
        )
      : catalog;
    return [...base].sort((a, b) => a.title.localeCompare(b.title));
  }, [catalog, query]);

  // A song already journalled opens on what you wrote down for it; anything
  // else seeds from the library default, usually already the right answer.
  const pick = (option: LibrarySong) => {
    const saved = journal.get(option.id);
    setSelected(option);
    setPitch(saved?.pitch ?? option.defaultPitch);
    setQuality(saved?.keyQuality ?? option.defaultKeyQuality);
    setNotes(saved?.notes ?? "");
  };

  const fixed = entry
    ? { title: entry.song?.title ?? entry.title, artist: entry.song?.artist ?? entry.artist }
    : null;

  const library = entry
    ? entry.song
      ? { pitch: entry.song.defaultPitch, quality: entry.song.defaultKeyQuality }
      : null
    : selected
      ? { pitch: selected.defaultPitch, quality: selected.defaultKeyQuality }
      : null;

  // Plain words, and only when yours differs: no step counts to decode.
  const keyHint = (() => {
    if (!pitch || !quality || !library) return null;
    const theirs = formatKey(library.pitch, library.quality);
    return theirs === formatKey(pitch, quality) ? null : `The library has it in ${theirs}`;
  })();

  const alreadySaved = !entry && selected !== null && journal.has(selected.id);
  const ready = (entry !== null || selected !== null) && pitch !== null && quality !== null;
  const busy = isSaving || isRemoving;

  const handleSave = () => {
    if (!pitch || !quality) return;

    startSaving(async () => {
      const result = entry
        ? await updateSongKey(entry.id, {
            organizationId,
            songId: entry.songId,
            title: entry.song?.title ?? entry.title,
            artist: entry.song?.artist ?? entry.artist,
            pitch,
            keyQuality: quality,
            notes,
          })
        : selected
          ? await saveSongKey({
              organizationId,
              songId: selected.id,
              title: selected.title,
              artist: selected.artist,
              pitch,
              keyQuality: quality,
              notes,
            })
          : null;

      if (!result) return;

      if (result.success) {
        toast.success(entry || alreadySaved ? "Key updated" : "Added to your keys", {
          position: "bottom-center",
        });
        onDone();
      } else {
        toast.error(result.error, { position: "bottom-center" });
      }
    });
  };

  const handleRemove = () => {
    if (!entry) return;

    startRemoving(async () => {
      const result = await deleteSongKey(entry.id, organizationId);

      if (result.success) {
        toast.success("Removed from your keys", { position: "bottom-center" });
        onDone();
      } else {
        toast.error(result.error, { position: "bottom-center" });
      }
    });
  };

  return (
    <div className="flex max-h-[90svh] flex-col">
      <DialogHeader className="border-b px-5 py-4 text-left">
        <DialogTitle>{entry ? "Your key" : "Add to my keys"}</DialogTitle>
        <DialogDescription>
          {fixed
            ? `The key you sing ${fixed.title} in.`
            : "Pick a song from the library and set the key you sing it in."}
        </DialogDescription>
      </DialogHeader>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {fixed ? (
          <div className="px-5 pt-4">
            <div className="rounded-xl border bg-muted/40 px-3 py-2.5">
              <p className="truncate text-sm font-semibold">{fixed.title}</p>
              <p className="truncate text-xs text-muted-foreground">{fixed.artist}</p>
            </div>
          </div>
        ) : (
          <>
            <div className="border-b px-5 py-3">
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search the library…"
                  className="h-9 pl-9"
                />
              </div>
            </div>

            <div className="max-h-64 overflow-y-auto">
              {filtered.length === 0 ? (
                <p className="px-5 py-10 text-center text-sm text-muted-foreground">
                  {catalog.length === 0
                    ? "The library is empty — an admin adds songs to it."
                    : "No songs match that search."}
                </p>
              ) : (
                <div className="p-1.5">
                  {filtered.map((option) => {
                    const isSelected = selected?.id === option.id;

                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => pick(option)}
                        className={cn(
                          "flex w-full cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-left transition-colors",
                          isSelected ? "bg-primary/10" : "hover:bg-muted/60",
                        )}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm leading-tight font-medium">{option.title}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {option.artist}
                            {journal.has(option.id) && " · already in your keys"}
                          </p>
                        </div>
                        <span className="shrink-0 font-mono text-xs text-muted-foreground">
                          {formatKey(option.defaultPitch, option.defaultKeyQuality)}
                        </span>
                        {isSelected && <Check className="h-4 w-4 shrink-0 text-primary" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}

        {pitch && quality && (entry || selected) && (
          <div className={cn("space-y-4 px-5 py-4", !fixed && "border-t")}>
            <div className="space-y-2">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-sm font-medium">Your key</p>
                {keyHint && (
                  <p className="truncate text-xs text-muted-foreground tabular-nums">{keyHint}</p>
                )}
              </div>
              <KeyPicker
                pitch={pitch}
                quality={quality}
                onChange={(nextPitch, nextQuality) => {
                  setPitch(nextPitch);
                  setQuality(nextQuality);
                }}
              />
            </div>

            <div className="space-y-1.5">
              <p className="text-sm font-medium">Comments</p>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                maxLength={MAX_KEY_NOTE_LENGTH}
                rows={2}
                placeholder="Capo, where it sits, what to watch for…"
                className="text-sm"
              />
              <p className="text-right text-[10px] text-muted-foreground">
                {notes.length}/{MAX_KEY_NOTE_LENGTH}
              </p>
            </div>
          </div>
        )}
      </div>

      <DialogFooter className="flex-row items-center border-t px-5 py-3 sm:justify-between">
        {entry ? (
          <Button
            type="button"
            variant="ghost"
            onClick={handleRemove}
            disabled={busy}
            className="mr-auto gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            {isRemoving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            Remove
          </Button>
        ) : (
          <span className="hidden sm:block" />
        )}

        <Button onClick={handleSave} disabled={!ready || busy} className="ml-auto">
          {isSaving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : entry ? (
            "Save"
          ) : alreadySaved ? (
            "Update my key"
          ) : (
            "Save my key"
          )}
        </Button>
      </DialogFooter>
    </div>
  );
}
