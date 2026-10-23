"use client"

import { useState, useTransition } from "react";
import { Reorder } from "motion/react";
import { GripVertical } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { saveSetlist } from "@/lib/actions/song-setlist";
import { cn } from "@/lib/utils";
import { colorClasses } from "@/lib/config/service-types-config";

import {
  KEY_OPTIONS,
  encodeKey,
  decodeKey,
  formatKey,
} from "@/lib/constants/key";
import type { SetlistSong } from "@/lib/types";

interface SetlistEditorModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  eventId: string
  eventName: string
  initialSongs: SetlistSong[]
  serviceColor: string
}

export function SetlistEditorModal({
  open,
  onOpenChange,
  eventId,
  initialSongs,
  serviceColor,
}: SetlistEditorModalProps) {
  const serviceColors = colorClasses[serviceColor]

  const [songs, setSongs] = useState<SetlistSong[]>(initialSongs)
  const [isPending, startTransition] = useTransition()

  const updateKey = (id: string, encoded: string) => {
    const { pitch, quality } = decodeKey(encoded)
    setSongs((prev) =>
      prev.map((s) =>
        s.id === id ? { ...s, pitch, keyQuality: quality } : s,
      ),
    )
  }

  const handleSave = () => {
    startTransition(async () => {
      const result = await saveSetlist(eventId, songs)

      if (result.success) {
        toast.success("Setlist saved", { position: "top-center" });
        onOpenChange(false);
      } else {
        toast.error(result.error, { position: "top-center" });
      }
    })
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">Edit setlist</DialogTitle>
          <DialogDescription>
            Drag to reorder songs and set the key for each.
          </DialogDescription>
        </DialogHeader>

        <Reorder.Group
          axis="y"
          values={songs}
          onReorder={setSongs}
          className="space-y-1"
        >
          {songs.map((song) => (
            <Reorder.Item
              key={song.id}
              value={song}
              className="flex items-center gap-2 rounded-md bg-muted/30 px-2 py-1.5"
            >
              <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-muted-foreground/60 active:cursor-grabbing" />

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium leading-tight">
                  {song.title}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {song.artist}
                  {song.arrangementName && ` · ${song.arrangementName}`} · {song.bpm} bpm
                </p>
              </div>

              <Select
                value={encodeKey(song.pitch, song.keyQuality)}
                onValueChange={(v) => updateKey(song.id, v)}
              >
                <SelectTrigger className="h-7 w-20 font-mono text-xs">
                  <SelectValue>
                    {formatKey(song.pitch, song.keyQuality)}
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
            </Reorder.Item>
          ))}
        </Reorder.Group>

        <p className="text-xs text-muted-foreground">
          To add songs or edit BPM, links, or other details, use the editor.
        </p>

        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            className={cn(serviceColors.solid, serviceColors.solidHover)}
            onClick={handleSave}
            disabled={isPending}
          >
            {isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}