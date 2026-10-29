"use client";

import { useTransition } from "react";
import {
  ArrowRight,
  BookmarkPlus,
  Loader2,
  MessageSquareText,
  Mic2,
  MoreVertical,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tip } from "@/components/tip";
import { useTip } from "@/hooks/use-tip";
import { cn } from "@/lib/utils";
import { formatKey } from "@/lib/constants/key";
import { saveSongKey } from "@/lib/actions/song-key";
import { detailButtonClass, detailIconClass } from "./event-detail-parts";
import type { KeyQuality, Pitch } from "@/generated/prisma/enums";

interface SongKeyCardProps {
  organizationId: string;
  /** The library song — a setlist can't hold anything else. */
  songId: string;
  title: string;
  artist: string;
  /** The setlist key for this event — what gets copied across. */
  pitch: Pitch;
  keyQuality: KeyQuality;
  /** The caller's journal entry for this song, if they already have one. */
  savedKey: { pitch: Pitch; keyQuality: KeyQuality; notes: string | null } | null;
  serviceColor: string;
}

/**
 * A setlist song's ⋮, for the singers on the event: a small card with the key
 * in the middle, your comment, and the one thing to do about it.
 *
 * Three states, because overwriting a key you already wrote down should never
 * be silent: Save while it isn't in My keys, nothing to press once it is, and
 * Update with both keys in view when yours differs.
 */
export function SongKeyCard({
  organizationId,
  songId,
  title,
  artist,
  pitch,
  keyQuality,
  savedKey,
  serviceColor,
}: SongKeyCardProps) {
  const [isPending, startTransition] = useTransition();

  const eventKey = formatKey(pitch, keyQuality);
  const yourKey = savedKey ? formatKey(savedKey.pitch, savedKey.keyQuality) : null;

  const isSaved = yourKey === eventKey;
  const isStale = yourKey !== null && !isSaved;

  // The card stays open and turns into the saved state, so only a failure
  // needs a toast.
  const save = () => {
    startTransition(async () => {
      const result = await saveSongKey({
        organizationId,
        songId,
        title,
        artist,
        pitch,
        keyQuality,
        // The save is an upsert that writes whatever notes it is handed, so
        // the comment you already wrote goes back up unchanged.
        notes: savedKey?.notes ?? "",
      });

      if (!result.success) toast.error(result.error, { position: "top-center" });
    });
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`My keys: ${title}`}
          // Revealed by hovering the row with a mouse; a touch screen has no
          // hover, so there it always shows.
          className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none group-hover:opacity-100 group-focus-within:opacity-100 data-[state=open]:bg-muted data-[state=open]:text-foreground data-[state=open]:opacity-100 pointer-fine:opacity-0"
        >
          <MoreVertical className="size-4" />
        </button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-64 p-4 text-center">
        <p className="truncate text-sm leading-tight font-semibold">{title}</p>
        <p className="truncate text-xs text-muted-foreground">{artist}</p>

        <div className="mt-4 flex items-center justify-center gap-5">
          {isStale && yourKey ? (
            <>
              <KeyFigure value={yourKey} label="Your key" />
              <ArrowRight aria-hidden className="size-4 text-muted-foreground" />
              <KeyFigure value={eventKey} label="This event" />
            </>
          ) : (
            <KeyFigure value={eventKey} label={isSaved ? "Your key" : "This event"} />
          )}
        </div>

        <p className="mt-2 text-xs text-muted-foreground">
          {isSaved ? "The same as this event" : isStale ? "This event is in a different key" : "Not in My keys yet"}
        </p>

        {savedKey?.notes && (
          <p className="mt-3 flex items-start gap-1.5 rounded-lg bg-muted/60 px-3 py-2 text-left text-xs text-muted-foreground">
            <MessageSquareText aria-label="Comment" className="mt-px size-3 shrink-0 opacity-60" />
            <span className="line-clamp-4 min-w-0">{savedKey.notes}</span>
          </p>
        )}

        {!isSaved && (
          <button
            type="button"
            onClick={save}
            disabled={isPending}
            className={cn(detailButtonClass(serviceColor, { primary: true }), "mt-4 w-full")}
          >
            {isPending ? (
              <Loader2 className={cn(detailIconClass(serviceColor, true), "animate-spin")} />
            ) : isStale ? (
              <RefreshCw className={detailIconClass(serviceColor, true)} />
            ) : (
              <BookmarkPlus className={detailIconClass(serviceColor, true)} />
            )}
            {isStale ? `Update to ${eventKey}` : `Save ${eventKey} to My keys`}
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}

/** For a singer's first setlist: under the first song, pointing up at its ⋮. */
export function SongKeySaveTip({ userId }: { userId: string }) {
  const tip = useTip("saveKey", userId);

  if (!tip.show) return null;

  // Inset like the rows, so the arrow lands under the ⋮.
  return (
    <div className="px-2 pb-1">
      <Tip
        icon={Mic2}
        title="Save the key you sing"
        message={
          // A mouse only brings the ⋮ out by pointing at the song.
          <>
            <span className="pointer-coarse:hidden">
              Point at a song and open its ⋮ to keep its key in My keys.
            </span>
            <span className="hidden pointer-coarse:inline">
              Open ⋮ on a song to keep its key in My keys.
            </span>
          </>
        }
        align="end"
        onDismiss={tip.dismiss}
      />
    </div>
  );
}

/** One key, large, with what it is under it. */
function KeyFigure({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col items-center">
      <span className="text-3xl leading-none font-bold tracking-tight">{value}</span>
      <span className="mt-1.5 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
        {label}
      </span>
    </div>
  );
}
