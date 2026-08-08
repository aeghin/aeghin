"use client"

import { useMemo, useState } from "react";
import { ChevronDown, Plus, Search, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { colorClasses } from "@/lib/config/service-types-config";
import type { SetlistSong } from "@/lib/types";
import { Song } from "@/generated/prisma/client";

interface CatalogPickerProps {
  catalog: Song[]
  draftSongIds: Set<string>
  onAdd: (songs: SetlistSong[]) => void
  serviceColor: string
}

type SortKey = "title" | "artist" | "bpm"

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "title", label: "Title (A–Z)" },
  { value: "artist", label: "Artist (A–Z)" },
  { value: "bpm", label: "BPM (low to high)" },
]

export function CatalogPicker({
  catalog,
  draftSongIds,
  onAdd,
  serviceColor,
}: CatalogPickerProps) {
  const serviceColors = colorClasses[serviceColor];

  const [query, setQuery] = useState("")
  const [selectedThemes, setSelectedThemes] = useState<Set<string>>(new Set())
  const [selectedArtists, setSelectedArtists] = useState<Set<string>>(new Set())
  const [sort, setSort] = useState<SortKey>("title")

  const allThemes = useMemo(() => {
    const set = new Set<string>()
    for (const s of catalog) for (const t of s.themes) set.add(t)
    return Array.from(set).sort()
  }, [catalog])

  const allArtists = useMemo(() => {
    const set = new Set<string>()
    for (const s of catalog) set.add(s.artist)
    return Array.from(set).sort()
  }, [catalog])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    let result = catalog.filter((s) => {
      if (q) {
        const matches =
          s.title.toLowerCase().includes(q) ||
          s.artist.toLowerCase().includes(q) ||
          s.themes.some((t) => t.toLowerCase().includes(q))
        if (!matches) return false
      }
      if (selectedThemes.size > 0 && !s.themes.some((t) => selectedThemes.has(t))) return false
      if (selectedArtists.size > 0 && !selectedArtists.has(s.artist)) return false
      return true
    })

    result = [...result].sort((a, b) => {
      switch (sort) {
        case "title": return a.title.localeCompare(b.title)
        case "artist": return a.artist.localeCompare(b.artist)
        case "bpm": return a.bpm - b.bpm
      }
    })

    return result
  }, [catalog, query, selectedThemes, selectedArtists, sort])

  const toggleTheme = (theme: string) =>
    setSelectedThemes((prev) => {
      const next = new Set(prev)
      next.has(theme) ? next.delete(theme) : next.add(theme)
      return next
    })

  const toggleArtist = (artist: string) =>
    setSelectedArtists((prev) => {
      const next = new Set(prev)
      next.has(artist) ? next.delete(artist) : next.add(artist)
      return next
    })

  const clearFilters = () => {
    setQuery("")
    setSelectedThemes(new Set())
    setSelectedArtists(new Set())
    setSort("title")
  }

  const hasActiveFilters = query.length > 0 || selectedThemes.size > 0 || selectedArtists.size > 0

  const addSong = (song: Song) => {
    const newSetlistSong = {
      id: crypto.randomUUID(),
      songId: song.id,
      title: song.title,
      artist: song.artist,
      pitch: song.defaultPitch ?? undefined,
      keyQuality: song.defaultKeyQuality ?? undefined,
      bpm: song.bpm,
      timeSignature: song.timeSignature,
      spotifyUrl: song.spotifyUrl,
      youtubeUrl: song.youtubeUrl,
      position: 0,
    } as SetlistSong

    onAdd([newSetlistSong])
  }

  return (
    <Card>
      <CardContent className="space-y-2.5 p-3">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search songs, artists or themes"
            className="h-8 pl-8 pr-7 text-xs"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Filter row */}
        <div className="flex items-center gap-1.5">
          {/* Theme filter */}
          {allThemes.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className={cn(
                    "h-7 gap-1 px-2 text-[11px]",
                    selectedThemes.size > 0 &&
                      cn(
                        serviceColors.borderSoft,
                        serviceColors.tint,
                        serviceColors.badgeText,
                      )
                  )}
                >
                  Theme
                  {selectedThemes.size > 0 && (
                    <Badge variant="secondary" className="h-4 rounded-sm px-1 text-[10px]">
                      {selectedThemes.size}
                    </Badge>
                  )}
                  <ChevronDown className="h-3 w-3 opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-44">
                <DropdownMenuLabel className="text-xs">Filter by theme</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <ScrollArea className="max-h-48">
                  {allThemes.map((theme) => (
                    <DropdownMenuCheckboxItem
                      key={theme}
                      checked={selectedThemes.has(theme)}
                      onCheckedChange={() => toggleTheme(theme)}
                      className="text-xs capitalize"
                    >
                      {theme}
                    </DropdownMenuCheckboxItem>
                  ))}
                </ScrollArea>
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {/* Artist filter */}
          {allArtists.length > 1 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className={cn(
                    "h-7 gap-1 px-2 text-[11px]",
                    selectedArtists.size > 0 &&
                      cn(
                        serviceColors.borderSoft,
                        serviceColors.tint,
                        serviceColors.badgeText,
                      )
                  )}
                >
                  Artist
                  {selectedArtists.size > 0 && (
                    <Badge variant="secondary" className="h-4 rounded-sm px-1 text-[10px]">
                      {selectedArtists.size}
                    </Badge>
                  )}
                  <ChevronDown className="h-3 w-3 opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-48">
                <DropdownMenuLabel className="text-xs">Filter by artist</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <ScrollArea className="max-h-48">
                  {allArtists.map((artist) => (
                    <DropdownMenuCheckboxItem
                      key={artist}
                      checked={selectedArtists.has(artist)}
                      onCheckedChange={() => toggleArtist(artist)}
                      className="text-xs"
                    >
                      {artist}
                    </DropdownMenuCheckboxItem>
                  ))}
                </ScrollArea>
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {/* Sort */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 gap-1 px-2 text-[11px] ml-auto">
                {SORT_OPTIONS.find((o) => o.value === sort)?.label ?? "Sort"}
                <ChevronDown className="h-3 w-3 opacity-50" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuLabel className="text-xs">Sort by</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {SORT_OPTIONS.map((opt) => (
                <DropdownMenuCheckboxItem
                  key={opt.value}
                  checked={sort === opt.value}
                  onCheckedChange={() => setSort(opt.value)}
                  className="text-xs"
                >
                  {opt.label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Active filter summary */}
        {hasActiveFilters && (
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-muted-foreground">
              {filtered.length} result{filtered.length === 1 ? "" : "s"}
            </span>
            <button
              onClick={clearFilters}
              className="text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              Clear filters
            </button>
          </div>
        )}

        {/* Song list */}
        <ScrollArea className="h-96 pr-2 [&>[data-slot=scroll-area-viewport]>div]:block!">
          <div className="space-y-1">
            {filtered.length === 0 ? (
              <p className="py-8 text-center text-xs text-muted-foreground">
                {catalog.length === 0
                  ? "No songs in catalog yet."
                  : "No songs match."}
              </p>
            ) : (
              filtered.map((song) => {
                const alreadyAdded = draftSongIds.has(song.id)
                return (
                  <div
                    key={song.id}
                    className="flex items-center gap-2 rounded-md p-2 hover:bg-muted/50"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium">{song.title}</p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {song.artist} · {song.bpm} bpm · {song.timeSignature}
                      </p>
                    </div>
                    <Button
                      size="icon"
                      variant={alreadyAdded ? "ghost" : "outline"}
                      className="h-7 w-7 shrink-0"
                      disabled={alreadyAdded}
                      onClick={() => addSong(song)}
                      aria-label={alreadyAdded ? "Already added" : `Add ${song.title}`}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )
              })
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  )
}
