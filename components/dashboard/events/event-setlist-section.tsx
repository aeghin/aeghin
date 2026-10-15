import { Music, ArrowUpRight, FileText, AudioLines } from "lucide-react";
import { YoutubeIcon, SpotifyIcon } from "@/components/icons/brand-icons";
import { Badge } from "@/components/ui/badge";
import { EditSetlistButton } from "./edit-setlist-button";
import { DETAIL_CARD, DetailCardHeader, detailButtonClass, detailIconClass } from "./event-detail-parts";
import { cn } from "@/lib/utils";
import { formatKey } from "@/lib/constants/key";
import { InvitationStatus } from "@/generated/prisma/enums";
import { volunteerRoleConfig } from "@/lib/config/roles";
import { SongVocalistAssign } from "./song-vocalist-assign";
import { SongKeyCard } from "./song-key-card";
import type { EventDetails, SetlistSong, SongKeyEntry } from "@/lib/types";

interface EventSetlistSectionProps {
  event: EventDetails
  orgId: string
  canManage: boolean
  /** The caller sings on this event, so each row gets a ⋮ with its key card. */
  canSaveKeys: boolean
  myKeys: SongKeyEntry[]
}

export function EventSetlistSection({
  event,
  orgId,
  canManage,
  canSaveKeys,
  myKeys,
}: EventSetlistSectionProps) {
  const serviceColor = event.serviceType.color;

  const songs: SetlistSong[] = event.setlistSongs.map((s) => ({
    id: s.id,
    songId: s.songId,
    position: s.position,
    pitch: s.pitch,
    keyQuality: s.keyQuality,
    bpm: s.bpm,
    timeSignature: s.timeSignature,
    title: s.song.title,
    artist: s.song.artist,
    youtubeUrl: s.song.youtubeUrl,
    spotifyUrl: s.song.spotifyUrl,
    attachments: s.song.attachments,
  }));
  const editorHref = `/dashboard/organizations/${orgId}/events/${event.id}/setlist/editor`;

  // Keyed on the library song, not the setlist row — the journal outlives any
  // one event. Freehand entries carry no songId and can never match.
  const myKeyBySongId = new Map(
    myKeys.flatMap((k) =>
      k.songId === null
        ? []
        : [[k.songId, { pitch: k.pitch, keyQuality: k.keyQuality, notes: k.notes }] as const],
    ),
  );

  // Accepted singers for this event — the pool you can assign to songs.
  const vocalistCandidates = event.assignments
    .filter(
      (a) =>
        a.status === InvitationStatus.ACCEPTED &&
        volunteerRoleConfig[a.role].sings,
    )
    .map((a) => ({
      userId: a.userId,
      firstName: a.user.firstName,
      lastName: a.user.lastName,
      userImageUrl: a.user.userImageUrl,
      role: a.role,
    }));

  // Current assignments per setlist song, keyed by SetlistSong id.
  const assignedBySong = new Map(
    event.setlistSongs.map((s) => [
      s.id,
      s.setlistSongAssignment.map((a) => ({
        userId: a.userId,
        firstName: a.user.firstName,
        lastName: a.user.lastName,
        userImageUrl: a.user.userImageUrl,
      })),
    ]),
  );

  return (
    <div className={DETAIL_CARD}>
      <DetailCardHeader
        icon={Music}
        title="Setlist"
        subtitle={
          songs.length > 0
            ? `${songs.length} ${songs.length === 1 ? "song" : "songs"}`
            : undefined
        }
        serviceColor={serviceColor}
        trailing={
          canManage ? (
            <div className="flex shrink-0 items-center gap-2">
              {songs.length > 0 && (
                <EditSetlistButton
                  eventId={event.id}
                  eventName={event.name}
                  initialSongs={songs}
                  serviceColor={serviceColor}
                />
              )}
              <a href={editorHref} className={detailButtonClass(serviceColor)}>
                <span className="sm:hidden">Editor</span>
                <span className="hidden sm:inline">Open editor</span>
                <ArrowUpRight className={detailIconClass(serviceColor)} />
              </a>
            </div>
          ) : undefined
        }
      />
      {/* The rows are as they were; only the inset moves, so the numbers line
          up under the header's icon. */}
      <div className="px-1 pb-2 sm:px-2 sm:pb-3">
        {songs.length > 0 ? (
          <div className="space-y-1">
            {songs.map((song, idx) => {
              const assigned = assignedBySong.get(song.id) ?? [];
              const hasMedia = Boolean(
                song.spotifyUrl ||
                  song.youtubeUrl ||
                  (song.attachments && song.attachments.length > 0),
              );
              // An empty people cell still costs a gap, so skip it outright.
              const showPeople = canManage || assigned.length > 0;

              return (
                // Mobile: two grid rows — the title owns the first, every control
                // sits on the second, and a singer's ⋮ gets a column of its own.
                // From sm up the inner wrapper becomes `display: contents` and
                // its children rejoin the flex row.
                <div
                  key={song.id}
                  className={cn(
                    "group grid items-center gap-x-3 gap-y-2 rounded-lg px-3 py-2.5 transition-colors hover:bg-muted/50 sm:flex sm:gap-3",
                    canSaveKeys ? "grid-cols-[1.5rem_1fr_auto]" : "grid-cols-[1.5rem_1fr]",
                  )}
                >
                  <span className="col-start-1 row-start-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted text-[11px] font-bold text-muted-foreground">
                    {idx + 1}
                  </span>

                  {/* On mobile the key sits at the end of the title line and the
                      tempo at the end of the artist line, as on the phone. */}
                  <div className="col-start-2 row-start-1 min-w-0">
                    <p className="text-sm font-medium leading-tight truncate max-sm:pr-12">
                      {song.title}
                    </p>
                    <div className="flex items-baseline gap-2">
                      <p className="min-w-0 flex-1 text-xs text-muted-foreground truncate">
                        {song.artist}
                      </p>
                      <span className="shrink-0 font-mono text-xs text-muted-foreground sm:hidden">
                        {song.bpm} bpm · {song.timeSignature}
                      </span>
                    </div>
                  </div>

                  <div className="col-start-2 row-start-2 flex flex-wrap items-center justify-end gap-x-3 gap-y-2 sm:contents">
                    {hasMedia && (
                      <div className="flex shrink-0 flex-wrap items-center gap-0.5 max-sm:mr-auto sm:ml-2 sm:flex-nowrap sm:gap-3">
                        {song.spotifyUrl && (
                          <a
                            href={song.spotifyUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-muted-foreground transition-colors hover:text-green-500 max-sm:flex max-sm:h-7 max-sm:w-7 max-sm:items-center max-sm:justify-center max-sm:rounded-md"
                          >
                            <SpotifyIcon className="h-4.5 w-4.5 sm:h-5 sm:w-5" />
                          </a>
                        )}
                        {song.youtubeUrl && (
                          <a
                            href={song.youtubeUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-muted-foreground transition-colors hover:text-red-500 max-sm:flex max-sm:h-7 max-sm:w-7 max-sm:items-center max-sm:justify-center max-sm:rounded-md"
                          >
                            <YoutubeIcon className="h-5 w-5 sm:h-6 sm:w-6" />
                          </a>
                        )}
                        {song.attachments?.map((attachment) => {
                          const isPdf = attachment.type === "application/pdf";
                          const Icon = isPdf ? FileText : AudioLines;
                          return (
                            <a
                              key={attachment.id}
                              href={attachment.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              title={attachment.name}
                              className={cn(
                                "text-muted-foreground transition-colors max-sm:flex max-sm:h-7 max-sm:w-7 max-sm:items-center max-sm:justify-center max-sm:rounded-md",
                                isPdf ? "hover:text-foreground" : "hover:text-sky-500",
                              )}
                            >
                              <Icon className="h-4.5 w-4.5" />
                              <span className="sr-only">{attachment.name}</span>
                            </a>
                          );
                        })}
                      </div>
                    )}

                    {/* Holds the slack the old flex-1 title wrapper used to carry,
                        keeping the desktop row's spacing identical. */}
                    <div aria-hidden className="hidden sm:block sm:flex-1" />

                    {showPeople && (
                      <div className="flex shrink-0 items-center gap-3">
                        <SongVocalistAssign
                          setlistSongId={song.id}
                          candidates={vocalistCandidates}
                          assigned={assigned}
                          canManage={canManage}
                          serviceColor={event.serviceType.color}
                        />
                      </div>
                    )}
                  </div>

                  {/* Last in the DOM for the desktop row, but placed back up on
                      the title line on mobile. */}
                  <div className="col-start-2 row-start-1 flex shrink-0 items-center gap-2 justify-self-end max-sm:self-start">
                    <Badge
                      variant="outline"
                      className="text-xs font-mono px-2 py-0"
                    >
                      {formatKey(song.pitch, song.keyQuality)}
                    </Badge>
                    <span className="hidden text-[13px] text-muted-foreground font-mono w-28 text-right sm:inline">
                      {song.bpm} bpm · {song.timeSignature}
                    </span>
                  </div>

                  {canSaveKeys && (
                    <div className="col-start-3 row-start-1 flex shrink-0 items-center">
                      <SongKeyCard
                        organizationId={orgId}
                        songId={song.songId}
                        title={song.title}
                        artist={song.artist}
                        pitch={song.pitch}
                        keyQuality={song.keyQuality}
                        savedKey={myKeyBySongId.get(song.songId) ?? null}
                        serviceColor={serviceColor}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="mx-3 mb-2 flex h-24 items-center justify-center rounded-xl border border-dashed border-border/40 bg-muted/10">
            <div className="text-center">
              <Music className="mx-auto mb-1.5 h-6 w-6 text-muted-foreground/30" />
              <p className="text-xs text-muted-foreground">
                {canManage
                  ? "No setlist yet. Open the editor to add songs."
                  : "No setlist added yet."}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}