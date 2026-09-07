"use client";

import { Reorder } from "motion/react";
import { GripVertical, Music, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  KEY_OPTIONS,
  encodeKey,
  decodeKey,
  formatKey,
} from "@/lib/constants/key";
import type { SetlistSong } from "@/lib/types";
import { SpotifyIcon, YoutubeIcon } from "@/components/icons/brand-icons";
import { cn } from "@/lib/utils";
import { colorClasses } from "@/lib/config/service-types-config";

interface SetlistDraftProps {
  songs: SetlistSong[];
  onChange: (songs: SetlistSong[]) => void;
  serviceColor: string;
}

export function SetlistDraft({ songs, onChange, serviceColor }: SetlistDraftProps) {
  const serviceColors = colorClasses[serviceColor];

  const updateSong = <K extends keyof SetlistSong>(
    id: string,
    field: K,
    value: SetlistSong[K],
  ) => {
    onChange(songs.map((s) => (s.id === id ? { ...s, [field]: value } : s)));
  };

  const updateKey = (id: string, encoded: string) => {
    const { pitch, quality } = decodeKey(encoded);
    onChange(
      songs.map((s) =>
        s.id === id ? { ...s, pitch, keyQuality: quality } : s,
      ),
    );
  };

  const removeSong = (id: string) => {
    onChange(songs.filter((s) => s.id !== id));
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <Music className={cn("h-4 w-4", serviceColors.badgeText)} />
          Setlist
          <span className="ml-auto text-xs font-normal text-muted-foreground">
            {songs.length} {songs.length === 1 ? "song" : "songs"}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {songs.length === 0 ? (
          <div className="flex h-32 items-center justify-center rounded-xl border border-dashed border-border/40 bg-muted/10">
            <p className="text-xs text-muted-foreground">
              No songs yet. Add from the catalog or generate with AI.
            </p>
          </div>
        ) : (
          <Reorder.Group
            axis="y"
            values={songs}
            onReorder={onChange}
            className="space-y-2"
          >
            {songs.map((song, idx) => (
              <Reorder.Item
                key={song.id}
                value={song}
                className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-2"
              >
                <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-muted-foreground/60 active:cursor-grabbing" />

                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted text-[11px] font-bold text-muted-foreground">
                  {idx + 1}
                </span>

                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium leading-tight">
                      {song.title}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {song.artist}
                    </p>
                  </div>

                  {(song.spotifyUrl || song.youtubeUrl) && (
                    <div className="flex shrink-0 items-center gap-3 ml-2">
                      {song.spotifyUrl && (
                        <a
                          href={song.spotifyUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-muted-foreground transition-colors hover:text-green-500"
                        >
                          <SpotifyIcon className="h-5 w-5" />
                        </a>
                      )}
                      {song.youtubeUrl && (
                        <a
                          href={song.youtubeUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-muted-foreground transition-colors hover:text-red-500"
                        >
                          <YoutubeIcon className="h-5 w-5" />
                        </a>
                      )}
                    </div>
                  )}
                </div>

                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive sm:order-last sm:h-7 sm:w-7"
                  onClick={() => removeSong(song.id)}
                  aria-label={`Remove ${song.title}`}
                >
                  <X className="h-4 w-4" />
                </Button>

                <div className="flex w-full items-center gap-2 pl-8 sm:w-auto sm:pl-0">
                  <Select
                    value={
                      song.pitch && song.keyQuality
                        ? encodeKey(song.pitch, song.keyQuality)
                        : undefined
                    }
                    onValueChange={(v) => updateKey(song.id, v)}
                  >
                    <SelectTrigger className="h-7 w-full min-w-0 flex-1 font-mono text-xs sm:w-20 sm:flex-none">
                      <SelectValue placeholder="Key">
                        {song.pitch && song.keyQuality
                          ? formatKey(song.pitch, song.keyQuality)
                          : null}
                      </SelectValue>
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

                  <Input
                    type="number"
                    value={song.bpm || ""}
                    onChange={(e) =>
                      updateSong(song.id, "bpm", Number(e.target.value))
                    }
                    className="h-9 w-full flex-1 text-center font-mono text-xs sm:h-7 sm:w-16 sm:flex-none"
                    placeholder="BPM"
                  />

                  <Input
                    value={song.timeSignature}
                    onChange={(e) =>
                      updateSong(song.id, "timeSignature", e.target.value)
                    }
                    className="h-9 w-full flex-1 text-center font-mono text-xs sm:h-7 sm:w-14 sm:flex-none"
                    placeholder="4/4"
                  />
                </div>
              </Reorder.Item>
            ))}
          </Reorder.Group>
        )}
      </CardContent>
    </Card>
  );
}
