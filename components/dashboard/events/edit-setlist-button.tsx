"use client"

import { useState } from "react";
import { Pencil } from "lucide-react";
import { SetlistEditorModal } from "./setlist-editor-modal";
import { detailButtonClass, detailIconClass } from "./event-detail-parts";
import type { SetlistSong } from "@/lib/types";

interface EditSetlistButtonProps {
  eventId: string
  eventName: string
  initialSongs: SetlistSong[]
  serviceColor: string
}

export function EditSetlistButton({
  eventId,
  eventName,
  initialSongs,
  serviceColor,
}: EditSetlistButtonProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        className={detailButtonClass(serviceColor)}
        onClick={() => setOpen(true)}
      >
        <Pencil className={detailIconClass(serviceColor)} />
        Edit
      </button>
      <SetlistEditorModal
        open={open}
        onOpenChange={setOpen}
        eventId={eventId}
        eventName={eventName}
        initialSongs={initialSongs}
        serviceColor={serviceColor}
      />
    </>
  )
}