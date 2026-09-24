"use client";

import { useState, useTransition } from "react";
import { Music, Plus, Save, X } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { YoutubeIcon, SpotifyIcon } from "@/components/icons/brand-icons";
import { SongAttachments } from "@/components/dashboard/songs/song-attachments";

import { Pitch, KeyQuality } from "@/generated/prisma/enums";
import { songSchema, songSchemaInput } from "@/lib/validations/song";
import { addSongToLibrary, updateSongInLibrary } from "@/lib/actions/song";
import { PlanLimitReached } from "@/components/dashboard/plan-limit-reached";
import { toast } from "sonner";

import type { LibrarySong, StorageUsage } from "@/lib/types";

const PITCH_LABELS: Record<Pitch, string> = {
  C: "C",
  C_SHARP: "C♯",
  D_FLAT: "D♭",
  D: "D",
  D_SHARP: "D♯",
  E_FLAT: "E♭",
  E: "E",
  F: "F",
  F_SHARP: "F♯",
  G_FLAT: "G♭",
  G: "G",
  G_SHARP: "G♯",
  A_FLAT: "A♭",
  A: "A",
  A_SHARP: "A♯",
  B_FLAT: "B♭",
  B: "B",
} as const;

const TIME_SIGNATURES = ["4/4", "3/4", "6/8", "12/8", "2/4", "5/4"];

const COMMON_THEMES = [
  "Worship",
  "Praise",
  "Thanksgiving",
  "Communion",
  "Christmas",
  "Easter",
  "Salvation",
  "Grace",
  "Faithfulness",
  "Hope",
  "Love",
  "Jesus",
  "Cross",
  "Resurrection",
];

const getFormValues = (orgId: string, song: LibrarySong): songSchemaInput => ({
  organizationId: orgId,
  title: song.title,
  artist: song.artist,
  bpm: song.bpm,
  timeSignature: song.timeSignature,
  defaultPitch: song.defaultPitch,
  defaultKeyQuality: song.defaultKeyQuality,
  spotifyUrl: song.spotifyUrl ?? "",
  youtubeUrl: song.youtubeUrl ?? "",
  themes: song.themes,
});

interface SongModalProps {
  orgId: string;
  song?: LibrarySong;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  // Adding only: the Free plan's cap, and whether the library is at it.
  orgName?: string;
  songLimit?: number | null;
  limitReached?: boolean;
  canUpgrade?: boolean;
  // Editing only: the library's storage, for the attachments section.
  storage?: StorageUsage | null;
};

export function SongModal({ orgId, song, open, onOpenChange, orgName, songLimit = null, limitReached = false, canUpgrade = false, storage = null }: SongModalProps) {

  const isEditing = Boolean(song);

  const [themeInput, setThemeInput] = useState("");
  const [isPending, startTransition] = useTransition();
  // The server's refusal, for when it knew the library was full and this page didn't.
  const [limitMessage, setLimitMessage] = useState<string | null>(null);

  const form = useForm<songSchemaInput>({
    resolver: zodResolver(songSchema),
    mode: "onChange",
    defaultValues: {
      organizationId: orgId,
      title: "",
      artist: "",
      timeSignature: "4/4",
      spotifyUrl: "",
      youtubeUrl: "",
      themes: [],
    },
    values: song ? getFormValues(orgId, song) : undefined,
  });

  const { isValid } = form.formState;

  const themes = form.watch("themes");
  const themeSet = new Set(themes);

  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = open !== undefined;
  const isOpen = isControlled ? open : internalOpen;
  const setOpen = (next: boolean) => {
    if (!isControlled) setInternalOpen(next);
    onOpenChange?.(next);
  };

  const handleClose = (next: boolean) => {
    if (!next) {
        form.reset();
        setThemeInput("");
        setLimitMessage(null);
      }
      setOpen(next);
  };

  const addTheme = (raw: string) => {
    const value = raw.trim().toLowerCase();
    if (!value) return;
    const current = form.getValues("themes");
    if (current.includes(value)) return;
    form.setValue("themes", [...current, value], { shouldValidate: true });
    setThemeInput("");
  };

  const removeTheme = (value: string) => {
    const current = form.getValues("themes");
    form.setValue("themes", current.filter((t) => t !== value), { shouldValidate: true });
  };

  const handleThemeKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTheme(themeInput);
    } else if (e.key === "Backspace" && themeInput === "") {
      const current = form.getValues("themes");
      if (current.length > 0) {
        form.setValue("themes", current.slice(0, -1), { shouldValidate: true });
      }
    }
  };

  const handleSubmit = (data: songSchemaInput) => {
      startTransition(async () => {
        const result = song
          ? await updateSongInLibrary(song.id, data)
          : await addSongToLibrary(data);

        if (result.success) {
          toast.success(
            isEditing
              ? `Song has been updated 🎵`
              : `${data.title} has been added to the song library 🎵`,
            { position: "top-center" },
          );
          handleClose(false);
        } else if (result.code === "SONG_LIMIT") {
          setLimitMessage(result.error);
        } else {
          toast.error(result.error, { position: "top-center" });
        };
      });
  };

  const trigger = !isControlled && (
    <DialogTrigger asChild>
      <Button
        size="sm"
        className="gap-2 shadow-lg shadow-primary/20 transition-all hover:scale-105 hover:shadow-primary/30"
      >
        <Plus className="h-4 w-4" />
        Add Song
      </Button>
    </DialogTrigger>
  );

  // Adding only — an edit never takes a new spot.
  if (!isEditing && (limitReached || limitMessage !== null)) {
    return (
      <Dialog open={isOpen} onOpenChange={handleClose}>
        {trigger}
        <DialogContent className="sm:max-w-120">
          <PlanLimitReached
            icon={Music}
            title="Song limit reached"
            description={
              songLimit !== null
                ? `${orgName ?? "Your organization"} has reached the Free plan's ${songLimit}-song limit.`
                : limitMessage ?? ""
            }
            hint="Or remove a song you no longer use to free a spot."
            organizationId={orgId}
            organizationName={orgName}
            canUpgrade={canUpgrade}
            onClose={() => handleClose(false)}
          />
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      {trigger}
      <DialogContent className="sm:max-w-140 max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Music className="h-4 w-4" />
            </span>
            {isEditing ? "Edit song" : "Add a song"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Update this song's details. Changes apply everywhere it's used."
              : "Add a song to your library so anyone on the team can find it when building setlists."}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)}>
            <div className="space-y-5 py-2">
              {/* Required fields */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2 space-y-1.5">
                  <FormField 
                    control={form.control}
                    name="title"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Title</FormLabel>
                        <FormControl>
                          <Input {...field} disabled={isPending} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="sm:col-span-2 space-y-1.5">
                  <FormField 
                    control={form.control}
                    name="artist"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Artist</FormLabel>
                        <FormControl>
                          <Input {...field} disabled={isPending} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="space-y-1.5">
                  <FormField 
                    control={form.control}
                    name="bpm"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>BPM</FormLabel>
                        <FormControl>
                          <Input type="number" {...field} value={field.value ?? ""} onChange={(e) => { const v = e.target.valueAsNumber; field.onChange(Number.isNaN(v) ? undefined : v); }} disabled={isPending} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="space-y-1.5">
                 <FormField
                      control={form.control}
                      name="timeSignature"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Time Signature</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {TIME_SIGNATURES.map((ts) => (
                                <SelectItem key={ts} value={ts}>
                                  {ts}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                </div>
              </div>

              {/* Default key */}
              <div className="space-y-1.5">
                  <div className="grid grid-cols-2 gap-2">
                    <FormField
                      control={form.control}
                      name="defaultPitch"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Default key</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value ?? ""}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Pitch" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {Object.values(Pitch).map((pitch) => (
                                <SelectItem key={pitch} value={pitch}>
                                  {PITCH_LABELS[pitch]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="defaultKeyQuality"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Quality</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value ?? ""}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Quality" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value={KeyQuality.MAJOR}>Major</SelectItem>
                              <SelectItem value={KeyQuality.MINOR}>Minor</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Used as a starting point in setlists; team members can
                    transpose per event.
                  </p>
                </div>

              {/* Links */}
              <div className="space-y-3">
                  <FormField
                    control={form.control}
                    name="spotifyUrl"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Spotify</FormLabel>
                        <div className="relative">
                          <SpotifyIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                          <FormControl>
                            <Input
                              {...field}
                              placeholder="Spotify URL"
                              className="pl-9"
                              disabled={isPending}
                            />
                          </FormControl>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="youtubeUrl"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>YouTube</FormLabel>
                        <div className="relative">
                          <YoutubeIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                          <FormControl>
                            <Input
                              {...field}
                              placeholder="YouTube URL"
                              className="pl-9"
                              disabled={isPending}
                            />
                          </FormControl>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <p className="text-xs text-muted-foreground">
                    Add at least one so the team has something to open from the
                    setlist.
                  </p>
                </div>

              {/* Attachments (existing songs only) */}
              {song && (
                <SongAttachments
                  songId={song.id}
                  organizationId={orgId}
                  attachments={song.attachments}
                  storage={storage}
                />
              )}

              {/* Themes */}
              <FormField
                control={form.control}
                name="themes"
                render={() => (
                  <FormItem>
                    <FormLabel>Themes</FormLabel>
                    <div className="rounded-md border bg-background p-2">
                      <div className="flex flex-wrap gap-1.5">
                        {themes.map((theme) => (
                          <Badge
                            key={theme}
                            variant="secondary"
                            className="gap-1 pl-2 pr-1 capitalize"
                          >
                            {theme}
                            <button
                              type="button"
                              onClick={() => removeTheme(theme)}
                              className="ml-0.5 rounded-sm p-0.5 transition-colors hover:bg-foreground/10"
                              aria-label={`Remove ${theme}`}
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        ))}
                        <FormControl>
                          <input
                            value={themeInput}
                            onChange={(e) => setThemeInput(e.target.value)}
                            onKeyDown={handleThemeKeyDown}
                            onBlur={() => themeInput && addTheme(themeInput)}
                            placeholder={themes.length === 0 ? "Add a theme..." : ""}
                            className="flex-1 min-w-30 bg-transparent px-2 py-0.5 text-sm outline-none"
                          />
                        </FormControl>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {COMMON_THEMES.filter((t) => !themeSet.has(t.toLowerCase()))
                        .slice(0, 8)
                        .map((suggestion) => (
                          <button
                            key={suggestion}
                            type="button"
                            onClick={() => addTheme(suggestion)}
                            className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2 py-0.5 text-xs capitalize text-muted-foreground transition-colors hover:border-primary/50 hover:bg-primary/5 hover:text-foreground"
                          >
                            <Plus className="h-3 w-3" />
                            {suggestion}
                          </button>
                        ))}
                    </div>
                    <FormMessage />
                    <p className="text-xs text-muted-foreground">
                      Press Enter or comma to add. Themes help your team filter the
                      library when planning a service.
                    </p>
                  </FormItem>
                )}
              />
            </div>
            <DialogFooter className="gap-2 sm:gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleClose(false)}
                disabled={isPending}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={!isValid || isPending}
                className="gap-1.5"
              >
                {isPending ? (
                  <Spinner className="h-4 w-4" />
                ) : isEditing ? (
                  <Save className="h-4 w-4" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                {isPending
                  ? isEditing
                    ? "Saving..."
                    : "Adding..."
                  : isEditing
                    ? "Save changes"
                    : "Add song"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
