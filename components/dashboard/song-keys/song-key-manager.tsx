"use client";

import { useMemo, useState } from "react";
import {
  ArrowUpDown,
  ChevronDown,
  Mic2,
  Plus,
  Search,
  SearchX,
  SlidersHorizontal,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DETAIL_CARD } from "@/components/dashboard/events/event-detail-parts";
import { cn } from "@/lib/utils";
import { KEY_OPTIONS, formatKey } from "@/lib/constants/key";
import { SongKeyDialog, type SongKeyTarget } from "./song-key-dialog";
import { SongKeyRow } from "./song-key-row";

import type { LibrarySong, SongKeyEntry } from "@/lib/types";

type SortKey = "title" | "artist" | "recent" | "key";

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "title", label: "Title (A–Z)" },
  { value: "artist", label: "Artist (A–Z)" },
  { value: "recent", label: "Recently saved" },
  { value: "key", label: "Key" },
];

// A linked entry shows its song's live name; the snapshot is the fallback for
// one whose song row is gone.
const titleOf = (entry: SongKeyEntry) => entry.song?.title ?? entry.title;
const artistOf = (entry: SongKeyEntry) => entry.song?.artist ?? entry.artist;
const themesOf = (entry: SongKeyEntry) => entry.song?.themes ?? [];

/** Where a key falls in the picker's order, so a list of keys reads C, Cm, C#… */
const keyRank = (entry: SongKeyEntry) => {
  const index = KEY_OPTIONS.findIndex(
    (option) => option.pitch === entry.pitch && option.quality === entry.keyQuality,
  );
  return index === -1 ? KEY_OPTIONS.length : index;
};

const toggled = (set: Set<string>, value: string) => {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
};

interface SongKeyManagerProps {
  organizationId: string;
  entries: SongKeyEntry[];
  /** The org library — the pool you can add from. */
  catalog: LibrarySong[];
}

/**
 * My keys: the key each song is sung in, private to whoever is signed in. The
 * event page's card style — a header with the count and Add, a search with key,
 * theme and sort menus like the Song Library's, then one row per song led by
 * its key.
 */
export function SongKeyManager({ organizationId, entries, catalog }: SongKeyManagerProps) {
  const [query, setQuery] = useState("");
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [selectedThemes, setSelectedThemes] = useState<Set<string>>(new Set());
  const [commentsOnly, setCommentsOnly] = useState(false);
  const [sort, setSort] = useState<SortKey>("title");
  const [target, setTarget] = useState<SongKeyTarget | null>(null);
  const [open, setOpen] = useState(false);

  const journal = useMemo(
    () =>
      new Map(entries.flatMap((e) => (e.songId === null ? [] : [[e.songId, e] as const]))),
    [entries],
  );

  // Only the keys and themes you actually have, each with how many songs.
  const keyOptions = useMemo(() => {
    const byLabel = new Map<string, { label: string; rank: number; count: number }>();
    for (const entry of entries) {
      const label = formatKey(entry.pitch, entry.keyQuality);
      const option = byLabel.get(label) ?? { label, rank: keyRank(entry), count: 0 };
      option.count += 1;
      byLabel.set(label, option);
    }
    return [...byLabel.values()].sort((a, b) => a.rank - b.rank || a.label.localeCompare(b.label));
  }, [entries]);

  const themeOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of entries) {
      for (const theme of themesOf(entry)) counts.set(theme, (counts.get(theme) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([theme, count]) => ({ theme, count }))
      .sort((a, b) => a.theme.localeCompare(b.theme));
  }, [entries]);

  const openDialog = (entry: SongKeyEntry | null) => {
    setTarget((current) => ({ entry, token: (current?.token ?? 0) + 1 }));
    setOpen(true);
  };

  const withComments = entries.filter((e) => Boolean(e.notes));

  // A filter whose last song was just edited out of it drops away rather than
  // leaving an empty list behind.
  const activeKeys = new Set(keyOptions.filter((o) => selectedKeys.has(o.label)).map((o) => o.label));
  const activeThemes = new Set(
    themeOptions.filter((o) => selectedThemes.has(o.theme)).map((o) => o.theme),
  );
  const onlyComments = commentsOnly && withComments.length > 0;

  const q = query.trim().toLowerCase();

  const visible = entries
    .filter((entry) => {
      if (onlyComments && !entry.notes) return false;
      if (activeKeys.size > 0 && !activeKeys.has(formatKey(entry.pitch, entry.keyQuality))) {
        return false;
      }
      if (activeThemes.size > 0 && !themesOf(entry).some((t) => activeThemes.has(t))) {
        return false;
      }
      if (q) {
        return (
          titleOf(entry).toLowerCase().includes(q) ||
          artistOf(entry).toLowerCase().includes(q) ||
          themesOf(entry).some((t) => t.toLowerCase().includes(q)) ||
          (entry.notes ?? "").toLowerCase().includes(q)
        );
      }
      return true;
    })
    .sort((a, b) => {
      switch (sort) {
        case "title":
          return titleOf(a).localeCompare(titleOf(b));
        case "artist":
          return artistOf(a).localeCompare(artistOf(b)) || titleOf(a).localeCompare(titleOf(b));
        case "recent":
          return b.updatedAt.getTime() - a.updatedAt.getTime();
        case "key":
          return keyRank(a) - keyRank(b) || titleOf(a).localeCompare(titleOf(b));
      }
    });

  const narrowed = q.length > 0 || activeKeys.size > 0 || activeThemes.size > 0;

  const clearFilters = () => {
    setQuery("");
    setSelectedKeys(new Set());
    setSelectedThemes(new Set());
    setCommentsOnly(false);
  };

  return (
    <div className={DETAIL_CARD}>
      <div className="flex items-center gap-3 px-4 pt-4 pb-3 sm:px-5 sm:pt-5">
        <span className="flex size-7.5 shrink-0 items-center justify-center rounded-[10px] bg-primary/12 text-primary">
          <Mic2 aria-hidden className="size-[15px]" />
        </span>

        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] leading-5 font-bold tracking-tight text-foreground">My keys</h2>
          <p className="truncate text-xs text-muted-foreground tabular-nums">
            {`${entries.length} ${entries.length === 1 ? "song" : "songs"} · only you can see these`}
          </p>
        </div>

        <button
          type="button"
          onClick={() => openDialog(null)}
          className="inline-flex h-8.5 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-[10px] border border-primary bg-primary px-3 text-[12.5px] font-semibold whitespace-nowrap text-primary-foreground shadow-[0_1px_0_rgb(0_0_0/0.05)] transition-colors hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <Plus className="size-3.5" />
          Add song
        </button>
      </div>

      {entries.length > 0 && (
        <div className="flex flex-col gap-3 px-4 pb-3 sm:px-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search your keys…"
                aria-label="Search your keys by song, artist, theme or comment"
                className="h-9 pr-9 pl-9"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="absolute top-1/2 right-2 flex h-6 w-6 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  aria-label="Clear search"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              {keyOptions.length > 1 && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="h-9 gap-2">
                      <SlidersHorizontal className="h-3.5 w-3.5" />
                      Key
                      {activeKeys.size > 0 && (
                        <Badge variant="secondary" className="ml-0.5 h-5 min-w-5 rounded-full px-1.5 tabular-nums">
                          {activeKeys.size}
                        </Badge>
                      )}
                      <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="max-h-80 w-48 overflow-y-auto">
                    <DropdownMenuLabel>Filter by your key</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {keyOptions.map((option) => (
                      <DropdownMenuCheckboxItem
                        key={option.label}
                        checked={activeKeys.has(option.label)}
                        onCheckedChange={() => setSelectedKeys((prev) => toggled(prev, option.label))}
                        onSelect={(e) => e.preventDefault()}
                      >
                        <span className="font-mono">{option.label}</span>
                        <span className="ml-auto text-xs text-muted-foreground tabular-nums">{option.count}</span>
                      </DropdownMenuCheckboxItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}

              {themeOptions.length > 0 && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="h-9 gap-2">
                      <SlidersHorizontal className="h-3.5 w-3.5" />
                      Theme
                      {activeThemes.size > 0 && (
                        <Badge variant="secondary" className="ml-0.5 h-5 min-w-5 rounded-full px-1.5 tabular-nums">
                          {activeThemes.size}
                        </Badge>
                      )}
                      <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="max-h-80 w-56 overflow-y-auto">
                    <DropdownMenuLabel>Filter by theme</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {themeOptions.map((option) => (
                      <DropdownMenuCheckboxItem
                        key={option.theme}
                        checked={activeThemes.has(option.theme)}
                        onCheckedChange={() => setSelectedThemes((prev) => toggled(prev, option.theme))}
                        onSelect={(e) => e.preventDefault()}
                        className="capitalize"
                      >
                        {option.theme}
                        <span className="ml-auto text-xs text-muted-foreground tabular-nums">{option.count}</span>
                      </DropdownMenuCheckboxItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="h-9 gap-2" aria-label="Sort">
                    <ArrowUpDown className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">
                      {SORT_OPTIONS.find((o) => o.value === sort)?.label}
                    </span>
                    <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuLabel>Sort by</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {SORT_OPTIONS.map((option) => (
                    <DropdownMenuCheckboxItem
                      key={option.value}
                      checked={sort === option.value}
                      onCheckedChange={() => setSort(option.value)}
                      onSelect={(e) => e.preventDefault()}
                    >
                      {option.label}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {withComments.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {[
                { value: false, label: "All", count: entries.length },
                { value: true, label: "With comments", count: withComments.length },
              ].map((chip) => (
                <button
                  key={chip.label}
                  type="button"
                  onClick={() => setCommentsOnly(chip.value)}
                  aria-pressed={onlyComments === chip.value}
                  className={cn(
                    "inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition-colors",
                    onlyComments === chip.value
                      ? "border-primary bg-primary/12 text-primary"
                      : "border-border bg-card text-foreground hover:bg-muted",
                  )}
                >
                  {chip.label}
                  <span className="text-xs tabular-nums opacity-70">{chip.count}</span>
                </button>
              ))}
            </div>
          )}

          {narrowed && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">
                {visible.length} result{visible.length === 1 ? "" : "s"}
              </span>
              {[...activeKeys].map((label) => (
                <button
                  key={`k-${label}`}
                  type="button"
                  onClick={() => setSelectedKeys((prev) => toggled(prev, label))}
                  className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-border bg-secondary/40 px-2.5 py-0.5 font-mono text-xs font-medium transition-colors hover:bg-secondary"
                >
                  {label}
                  <X className="h-3 w-3 opacity-60" />
                </button>
              ))}
              {[...activeThemes].map((theme) => (
                <button
                  key={`t-${theme}`}
                  type="button"
                  onClick={() => setSelectedThemes((prev) => toggled(prev, theme))}
                  className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-border bg-secondary/40 px-2.5 py-0.5 text-xs font-medium capitalize transition-colors hover:bg-secondary"
                >
                  {theme}
                  <X className="h-3 w-3 opacity-60" />
                </button>
              ))}
              <button
                type="button"
                onClick={clearFilters}
                className="cursor-pointer text-xs font-medium text-muted-foreground underline-offset-2 hover:underline"
              >
                Clear all
              </button>
            </div>
          )}
        </div>
      )}

      <div className="border-t border-border">
        {entries.length === 0 ? (
          <CardMessage
            icon={<Mic2 className="h-7 w-7 text-muted-foreground/50" />}
            title="No keys saved yet"
            body="Save a song from an event's setlist with its ⋮, or add one here."
          />
        ) : visible.length === 0 ? (
          <CardMessage
            icon={<SearchX className="h-7 w-7 text-muted-foreground/50" />}
            title="No matches"
            body={q ? `Nothing in your keys matches “${query.trim()}”.` : "Nothing in your keys matches those filters."}
            action={
              <Button variant="outline" size="sm" onClick={clearFilters} className="mt-2">
                Clear filters
              </Button>
            }
          />
        ) : (
          <div className="divide-y divide-border/60">
            {visible.map((entry) => (
              <SongKeyRow key={entry.id} entry={entry} onEdit={() => openDialog(entry)} />
            ))}
          </div>
        )}
      </div>

      <SongKeyDialog
        organizationId={organizationId}
        target={target}
        open={open}
        onOpenChange={setOpen}
        catalog={catalog}
        journal={journal}
      />
    </div>
  );
}

function CardMessage({
  icon,
  title,
  body,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      {icon}
      <p className="text-sm font-semibold">{title}</p>
      <p className="max-w-xs text-xs text-muted-foreground">{body}</p>
      {action}
    </div>
  );
}
