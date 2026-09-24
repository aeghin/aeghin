"use client"

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowUpDown,
  AudioLines,
  ChevronDown,
  FileText,
  Music,
  Search,
  SlidersHorizontal,
  X
} from "lucide-react";
import { m } from "motion/react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

import { SongModal } from "@/components/dashboard/songs/song-modal";
import { EditSongDetails } from "@/components/dashboard/songs/song-edit";

import { KeyQuality } from "@/generated/prisma/enums";
import { formatKey } from "@/lib/constants/key";
import { PLAN_LIMITS, type OrgPlan } from "@/lib/config/plans";
import { YoutubeIcon, SpotifyIcon } from "@/components/icons/brand-icons";
import type { LibrarySong as Song, StorageUsage } from "@/lib/types";

interface SongLibraryProps {
  songs: Song[]
  orgId: string
  orgName: string
  canManage: boolean
  songLimit: number | null
  canUpgrade: boolean
  plan: OrgPlan
};

type SortKey = "title" | "artist" | "bpm";

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "title", label: "Title (A–Z)" },
  { value: "artist", label: "Artist (A–Z)" },
  { value: "bpm", label: "BPM (low to high)" },
];

function formatSongKey(song: Song) {
  if (!song.defaultPitch) return "—"
  return formatKey(song.defaultPitch, song.defaultKeyQuality)
}

function SongLinks({ song }: { song: Song }) {
  return (
    <>
      {song.spotifyUrl && (
        <a
          href={song.spotifyUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-emerald-600"
          aria-label="Open in Spotify"
        >
          <SpotifyIcon className="h-4 w-4" />
        </a>
      )}
      {song.youtubeUrl && (
        <a
          href={song.youtubeUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-red-600"
          aria-label="Open in YouTube"
        >
          <YoutubeIcon className="h-4.5 w-4.5" />
        </a>
      )}
    </>
  )
}

function SongAttachments({ song, max }: { song: Song; max?: number }) {
  if (song.attachments.length === 0) {
    return <span className="text-xs text-muted-foreground">—</span>
  }
  const shown = max ? song.attachments.slice(0, max) : song.attachments
  const extra = song.attachments.length - shown.length
  return (
    <>
      {shown.map((attachment) => {
        const isPdf = attachment.type === "application/pdf"
        const Icon = isPdf ? FileText : AudioLines
        return (
          <a
            key={attachment.id}
            href={attachment.url}
            target="_blank"
            rel="noopener noreferrer"
            title={attachment.name}
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted",
              isPdf ? "hover:text-red-600" : "hover:text-sky-600",
            )}
            aria-label={`Open ${attachment.name}`}
          >
            <Icon className="h-4 w-4" />
          </a>
        )
      })}
      {extra > 0 && (
        <span className="px-1 text-[10px] font-medium text-muted-foreground">
          +{extra}
        </span>
      )}
    </>
  )
}

export function SongLibrary({ songs, orgId, orgName, canManage, songLimit, canUpgrade, plan }: SongLibraryProps) {

  // Only managers add songs, so only they see the cap.
  const showSongLimit = canManage && songLimit !== null;
  const songLimitReached = songLimit !== null && songs.length >= songLimit;

  // Only managers upload, so only they get it.
  const storage: StorageUsage | null = canManage
    ? {
        used: songs.reduce((total, song) => total + song.attachments.reduce((sum, file) => sum + file.size, 0), 0),
        limit: PLAN_LIMITS[plan].storage,
        nextPlan: plan === "free" ? "premium" : plan === "premium" ? "pro" : null,
        canUpgrade,
      }
    : null;

  const [query, setQuery] = useState("")
  const [selectedThemes, setSelectedThemes] = useState<Set<string>>(new Set())
  const [selectedArtists, setSelectedArtists] = useState<Set<string>>(new Set())
  const [sort, setSort] = useState<SortKey>("title")

  // Derive available filter options
  const allThemes = useMemo(() => {
    const set = new Set<string>()
    for (const s of songs) for (const t of s.themes) set.add(t)
    return Array.from(set).sort()
  }, [songs])

  const allArtists = useMemo(() => {
    const set = new Set<string>()
    for (const s of songs) set.add(s.artist)
    return Array.from(set).sort()
  }, [songs])

  // Filter + sort
  const filteredSongs = useMemo(() => {
    const q = query.trim().toLowerCase()
    let result = songs.filter((song) => {
      if (q) {
        const matchesQuery =
          song.title.toLowerCase().includes(q) ||
          song.artist.toLowerCase().includes(q) ||
          song.themes.some((t) => t.toLowerCase().includes(q))
        if (!matchesQuery) return false
      }
      if (selectedThemes.size > 0 && !song.themes.some((t) => selectedThemes.has(t))) {
        return false
      }
      if (selectedArtists.size > 0 && !selectedArtists.has(song.artist)) {
        return false
      }
      return true
    })

    result = [...result].sort((a, b) => {
      switch (sort) {
        case "title":
          return a.title.localeCompare(b.title)
        case "artist":
          return a.artist.localeCompare(b.artist)
        case "bpm":
          return a.bpm - b.bpm
      }
    })

    return result
  }, [songs, query, selectedThemes, selectedArtists, sort])

  const activeFilterCount = selectedThemes.size + selectedArtists.size
  const hasActiveFilters = activeFilterCount > 0 || query.length > 0

  const toggleTheme = (theme: string) => {
    setSelectedThemes((prev) => {
      const next = new Set(prev)
      if (next.has(theme)) next.delete(theme)
      else next.add(theme)
      return next
    })
  }

  const toggleArtist = (artist: string) => {
    setSelectedArtists((prev) => {
      const next = new Set(prev)
      if (next.has(artist)) next.delete(artist)
      else next.add(artist)
      return next
    })
  }

  const clearFilters = () => {
    setQuery("")
    setSelectedThemes(new Set())
    setSelectedArtists(new Set())
  }

  return (
    <div className="mx-auto w-full max-w-screen-2xl px-4 py-6 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
          <Link
            href={`/dashboard/organizations/${orgId}`}
            className="group inline-flex items-center gap-1.5 hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-1" />
            {orgName}
          </Link>
        </div>

        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className="flex items-center gap-2.5 text-2xl font-bold tracking-tight">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Music className="h-4.5 w-4.5" />
              </span>
              Song Library
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {showSongLimit ? (
                <span className={songLimitReached ? "font-medium text-amber-600 dark:text-amber-400" : undefined}>
                  {songs.length} / {songLimit} songs{songLimitReached ? " · Free limit reached" : ""}
                </span>
              ) : (
                `${songs.length} song${songs.length === 1 ? "" : "s"}`
              )}
              {" · search by title, artist or theme"}
            </p>
          </div>

          {canManage && (
            <SongModal
              orgId={orgId}
              orgName={orgName}
              songLimit={songLimit}
              limitReached={songLimitReached}
              canUpgrade={canUpgrade}
            />
          )}
        </div>
      </div>

      {/* Toolbar */}
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search songs, artists or themes..."
            className="h-10 pl-9 pr-9"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Theme filter */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="h-10 gap-2">
                <SlidersHorizontal className="h-3.5 w-3.5" />
                Theme
                {selectedThemes.size > 0 && (
                  <Badge variant="secondary" className="ml-0.5 h-5 min-w-5 rounded-full px-1.5 tabular-nums">
                    {selectedThemes.size}
                  </Badge>
                )}
                <ChevronDown className="h-3.5 w-3.5 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-80 w-56 overflow-y-auto">
              <DropdownMenuLabel>Filter by theme</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {allThemes.map((theme) => (
                <DropdownMenuCheckboxItem
                  key={theme}
                  checked={selectedThemes.has(theme)}
                  onCheckedChange={() => toggleTheme(theme)}
                  onSelect={(e) => e.preventDefault()}
                  className="capitalize"
                >
                  {theme}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Artist filter */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="h-10 gap-2">
                <SlidersHorizontal className="h-3.5 w-3.5" />
                Artist
                {selectedArtists.size > 0 && (
                  <Badge variant="secondary" className="ml-0.5 h-5 min-w-5 rounded-full px-1.5 tabular-nums">
                    {selectedArtists.size}
                  </Badge>
                )}
                <ChevronDown className="h-3.5 w-3.5 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-80 w-56 overflow-y-auto">
              <DropdownMenuLabel>Filter by artist</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {allArtists.map((artist) => (
                <DropdownMenuCheckboxItem
                  key={artist}
                  checked={selectedArtists.has(artist)}
                  onCheckedChange={() => toggleArtist(artist)}
                  onSelect={(e) => e.preventDefault()}
                >
                  {artist}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Sort */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="h-10 gap-2">
                <ArrowUpDown className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">
                  {SORT_OPTIONS.find((o) => o.value === sort)?.label}
                </span>
                <ChevronDown className="h-3.5 w-3.5 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Sort by</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {SORT_OPTIONS.map((opt) => (
                <DropdownMenuCheckboxItem
                  key={opt.value}
                  checked={sort === opt.value}
                  onCheckedChange={() => setSort(opt.value)}
                  onSelect={(e) => e.preventDefault()}
                >
                  {opt.label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Active filter chips */}
      {hasActiveFilters && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            {filteredSongs.length} result{filteredSongs.length === 1 ? "" : "s"}
          </span>
          {Array.from(selectedThemes).map((theme) => (
            <button
              key={`t-${theme}`}
              type="button"
              onClick={() => toggleTheme(theme)}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary/40 px-2.5 py-0.5 text-xs font-medium capitalize transition-colors hover:bg-secondary"
            >
              {theme}
              <X className="h-3 w-3 opacity-60" />
            </button>
          ))}
          {Array.from(selectedArtists).map((artist) => (
            <button
              key={`a-${artist}`}
              type="button"
              onClick={() => toggleArtist(artist)}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary/40 px-2.5 py-0.5 text-xs font-medium transition-colors hover:bg-secondary"
            >
              {artist}
              <X className="h-3 w-3 opacity-60" />
            </button>
          ))}
          <button
            type="button"
            onClick={clearFilters}
            className="text-xs font-medium text-muted-foreground underline-offset-2 hover:underline"
          >
            Clear all
          </button>
        </div>
      )}

      {/* Results */}
      {filteredSongs.length === 0 ? (
        <Card className="flex flex-col items-center justify-center gap-2 py-16 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
            <Music className="h-5 w-5 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium">No songs match your filters</p>
          <p className="text-xs text-muted-foreground">Try clearing filters or searching for something else.</p>
          {hasActiveFilters && (
            <Button variant="outline" size="sm" onClick={clearFilters} className="mt-2">
              Clear filters
            </Button>
          )}
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          {/* Header row (desktop) */}
          <div
            className={cn(
              "hidden items-center gap-4 border-b border-border/60 bg-muted/30 px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground md:grid",
              canManage
                ? "grid-cols-[1fr_180px_64px_84px_72px_72px_120px_44px]"
                : "grid-cols-[1fr_180px_64px_84px_72px_72px_120px]",
            )}
          >
            <span>Song</span>
            <span>Themes</span>
            <span>Key</span>
            <span className="text-right">BPM</span>
            <span className="text-right">Time</span>
            <span className="text-center">Links</span>
            <span className="text-center">Attachments</span>
          </div>

          <ul className="divide-y divide-border/60">
            {filteredSongs.map((song, idx) => (
              <m.li
                key={song.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: Math.min(idx * 0.015, 0.2) }}
                className="px-4 py-3 transition-colors hover:bg-muted/30"
              >
                {/* ── Mobile (spread row + themes) ── */}
                <div className="md:hidden">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium leading-tight">{song.title}</p>
                      <p className="truncate text-xs text-muted-foreground">{song.artist}</p>
                    </div>
                    <span className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
                      {formatSongKey(song)} · {song.bpm} · {song.timeSignature}
                    </span>
                    <div className="flex shrink-0 items-center gap-1">
                      <SongLinks song={song} />
                      <SongAttachments song={song} max={3} />
                    </div>
                    {canManage && <EditSongDetails song={song} orgId={orgId} storage={storage} />}
                  </div>
                  {song.themes.length > 0 && (
                    <div className="mt-2 flex flex-wrap items-center gap-1">
                      {song.themes.slice(0, 3).map((theme) => (
                        <Badge
                          key={theme}
                          variant="secondary"
                          className="px-1.5 py-0 text-[10px] font-medium capitalize"
                        >
                          {theme}
                        </Badge>
                      ))}
                      {song.themes.length > 3 && (
                        <span className="text-[10px] text-muted-foreground">
                          +{song.themes.length - 3}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* ── Desktop table row ── */}
                <div
                  className={cn(
                    "hidden md:grid md:items-center md:gap-4",
                    canManage
                      ? "md:grid-cols-[1fr_180px_64px_84px_72px_72px_120px_44px]"
                      : "md:grid-cols-[1fr_180px_64px_84px_72px_72px_120px]",
                  )}
                >
                {/* Song */}
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium leading-tight">{song.title}</p>
                  <p className="truncate text-xs text-muted-foreground">{song.artist}</p>
                </div>

                {/* Themes */}
                <div className="flex flex-wrap items-center gap-1">
                  {song.themes.slice(0, 2).map((theme) => (
                    <Badge
                      key={theme}
                      variant="secondary"
                      className="px-1.5 py-0 text-[10px] font-medium capitalize"
                    >
                      {theme}
                    </Badge>
                  ))}
                  {song.themes.length > 2 && (
                    <span className="text-[10px] text-muted-foreground">
                      +{song.themes.length - 2}
                    </span>
                  )}
                </div>

                {/* Key */}
                <div className="md:text-left">
                  <Badge
                    variant="outline"
                    className={cn(
                      "px-1.5 py-0 font-mono text-[10px]",
                      song.defaultKeyQuality === KeyQuality.MINOR
                        ? "border-violet-500/30 text-violet-700 dark:text-violet-400"
                        : "",
                    )}
                  >
                    {formatSongKey(song)}
                  </Badge>
                </div>

                {/* BPM */}
                <div className="font-mono text-xs text-muted-foreground tabular-nums md:text-right">
                  {song.bpm}
                </div>

                <div className="font-mono text-xs text-muted-foreground tabular-nums md:text-right">
                  {song.timeSignature}
                </div>

                {/* Links */}
                <div className="flex items-center gap-1 md:justify-center">
                  <SongLinks song={song} />
                </div>

                {/* Attachments */}
                <div className="flex flex-wrap items-center gap-1 md:justify-center">
                  <SongAttachments song={song} />
                </div>

                {/* Actions */}
                {canManage && (
                  <div className="flex md:justify-center">
                    <EditSongDetails song={song} orgId={orgId} storage={storage} />
                  </div>
                )}
                </div>
              </m.li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}
