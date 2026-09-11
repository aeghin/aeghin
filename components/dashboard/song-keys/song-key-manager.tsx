"use client";

import { useMemo, useState } from "react";
import { Mic2, Music } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { AddSongKeyDialog } from "./add-song-key-dialog";
import { SongKeyRow } from "./song-key-row";

import type { LibrarySong, SongKeyEntry } from "@/lib/types";

interface SongKeyManagerProps {
  organizationId: string;
  entries: SongKeyEntry[];
  /** The org library — the pool you can add from. */
  catalog: LibrarySong[];
}

export function SongKeyManager({
  organizationId,
  entries,
  catalog,
}: SongKeyManagerProps) {
  const [query, setQuery] = useState("");

  // Songs already journalled are still pickable — re-picking one is how you
  // change its key from the dialog — but the dialog labels them as such.
  const journalledSongIds = useMemo(
    () => new Set(entries.flatMap((e) => (e.songId === null ? [] : [e.songId]))),
    [entries],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((e) => {
      const title = e.song?.title ?? e.title;
      const artist = e.song?.artist ?? e.artist;
      return title.toLowerCase().includes(q) || artist.toLowerCase().includes(q);
    });
  }, [entries, query]);

  return (
    <Card className="overflow-hidden rounded-xl border-border/40 bg-linear-to-br from-card to-card/80 shadow-sm">
      <CardHeader className="flex flex-col gap-3 border-b border-border/40 bg-secondary/20 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
            <Mic2 className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <CardTitle className="text-lg font-semibold">My Keys</CardTitle>
            <p className="text-sm text-muted-foreground">
              The key you sing each song in — yours only, nobody else sees it
            </p>
          </div>
        </div>

        <AddSongKeyDialog
          organizationId={organizationId}
          catalog={catalog}
          journalledSongIds={journalledSongIds}
        />
      </CardHeader>

      <CardContent className="p-0">
        {entries.length === 0 ? (
          <div className="flex h-50 flex-col items-center justify-center gap-2 px-6 text-center text-muted-foreground">
            <Music className="h-10 w-10 opacity-20" />
            <p className="text-sm font-medium">No keys saved yet</p>
            <p className="text-xs">
              Add a song here, or save one straight from an event&apos;s setlist
            </p>
          </div>
        ) : (
          <>
            {entries.length > 6 && (
              <div className="border-b border-border/40 px-4 py-3 sm:px-6">
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search your keys…"
                  className="h-9"
                />
              </div>
            )}

            {visible.length === 0 ? (
              <p className="px-6 py-10 text-center text-sm text-muted-foreground">
                No songs match &ldquo;{query}&rdquo;
              </p>
            ) : (
              <div className="divide-y divide-border/40">
                {visible.map((entry) => (
                  <SongKeyRow
                    key={entry.id}
                    entry={entry}
                    organizationId={organizationId}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
