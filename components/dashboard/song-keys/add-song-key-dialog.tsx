"use client";

import { useMemo, useState, useTransition } from "react";
import { Check, Loader2, Plus, Search } from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  KEY_OPTIONS,
  decodeKey,
  encodeKey,
  formatKey,
} from "@/lib/constants/key";
import { MAX_KEY_NOTE_LENGTH } from "@/lib/validations/song-key";
import { saveSongKey } from "@/lib/actions/song-key";
import type { LibrarySong } from "@/lib/types";

interface AddSongKeyDialogProps {
  organizationId: string;
  catalog: LibrarySong[];
  /** Songs already journalled — picking one rewrites its key. */
  journalledSongIds: Set<string>;
}

export function AddSongKeyDialog({
  organizationId,
  catalog,
  journalledSongIds,
}: AddSongKeyDialogProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<LibrarySong | null>(null);
  const [encoded, setEncoded] = useState<string | undefined>(undefined);
  const [notes, setNotes] = useState("");
  const [isSaving, startSaving] = useTransition();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q
      ? catalog.filter(
          (s) =>
            s.title.toLowerCase().includes(q) ||
            s.artist.toLowerCase().includes(q),
        )
      : catalog;
    return [...base].sort((a, b) => a.title.localeCompare(b.title));
  }, [catalog, query]);

  const reset = () => {
    setQuery("");
    setSelected(null);
    setEncoded(undefined);
    setNotes("");
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) reset();
  };

  // Picking a song seeds the key from the library default — most of the time
  // that is already the right answer, so the singer only changes it when it
  // isn't.
  const handleSelect = (song: LibrarySong) => {
    setSelected(song);
    setEncoded(encodeKey(song.defaultPitch, song.defaultKeyQuality));
  };

  const isAlreadySaved = selected ? journalledSongIds.has(selected.id) : false;

  const handleSave = () => {
    if (!selected || !encoded) return;
    const { pitch, quality } = decodeKey(encoded);

    startSaving(async () => {
      const result = await saveSongKey({
        organizationId,
        songId: selected.id,
        title: selected.title,
        artist: selected.artist,
        pitch,
        keyQuality: quality,
        notes,
      });

      if (result.success) {
        toast.success(
          isAlreadySaved ? "Key updated" : "Added to your keys",
          { position: "bottom-center" },
        );
        handleOpenChange(false);
      } else {
        toast.error(result.error, { position: "bottom-center" });
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" className="w-full shrink-0 sm:w-auto">
          <Plus className="h-4 w-4 sm:mr-1.5" />
          <span className="hidden sm:inline">Add Song</span>
          <span className="sm:hidden">Add a song to my keys</span>
        </Button>
      </DialogTrigger>

      <DialogContent className="max-h-[90svh] gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="border-b px-5 py-4 text-left">
          <DialogTitle>Add to my keys</DialogTitle>
          <DialogDescription>
            Pick a song from the library and set the key you sing it in.
          </DialogDescription>
        </DialogHeader>

        <div className="border-b px-5 py-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search the library…"
              className="h-9 pl-9"
            />
          </div>
        </div>

        <ScrollArea className="max-h-64 flex-1">
          {filtered.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-muted-foreground">
              {catalog.length === 0
                ? "The library is empty — an admin adds songs to it."
                : "No songs match that search."}
            </p>
          ) : (
            <div className="p-1.5">
              {filtered.map((song) => {
                const isSelected = selected?.id === song.id;
                const alreadySaved = journalledSongIds.has(song.id);

                return (
                  <button
                    key={song.id}
                    type="button"
                    onClick={() => handleSelect(song)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-colors",
                      isSelected ? "bg-primary/10" : "hover:bg-muted/60",
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium leading-tight">
                        {song.title}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {song.artist}
                        {alreadySaved && " · already in your keys"}
                      </p>
                    </div>
                    <span className="shrink-0 font-mono text-xs text-muted-foreground">
                      {formatKey(song.defaultPitch, song.defaultKeyQuality)}
                    </span>
                    {isSelected && (
                      <Check className="h-4 w-4 shrink-0 text-primary" />
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </ScrollArea>

        {selected && (
          <div className="space-y-3 border-t px-5 py-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{selected.title}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {selected.artist}
                </p>
              </div>
              <Select value={encoded} onValueChange={setEncoded}>
                <SelectTrigger className="h-9 w-24 shrink-0 font-mono text-sm">
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
            </div>

            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={MAX_KEY_NOTE_LENGTH}
              rows={2}
              placeholder="Notes — capo, where it sits, what to watch for…"
              className="text-sm"
            />
          </div>
        )}

        <DialogFooter className="border-t px-5 py-3">
          <Button
            onClick={handleSave}
            disabled={!selected || !encoded || isSaving}
            className="w-full sm:w-auto"
          >
            {isSaving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : isAlreadySaved ? (
              "Update my key"
            ) : (
              "Save my key"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
