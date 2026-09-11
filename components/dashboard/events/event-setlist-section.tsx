import { Music, ArrowUpRight, FileText, AudioLines } from "lucide-react";
import { YoutubeIcon, SpotifyIcon } from "@/components/icons/brand-icons";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EditSetlistButton } from "./edit-setlist-button";
import { cn } from "@/lib/utils";
import { colorClasses } from "@/lib/config/service-types-config";
import { formatKey } from "@/lib/constants/key";
import { InvitationStatus, VolunteerRole } from "@/generated/prisma/enums";
import { SongVocalistAssign } from "./song-vocalist-assign";
import { SongKeySaveButton } from "./song-key-save-button";
import type { EventDetails, SetlistSong, SongKeyEntry } from "@/lib/types";

interface EventSetlistSectionProps {
  event: EventDetails
  orgId: string
  canManage: boolean
  /** The caller sings on this event, so each row offers a one-tap save. */
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
  const serviceColors = colorClasses[event.serviceType.color];

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
        : [[k.songId, { pitch: k.pitch, keyQuality: k.keyQuality }] as const],
    ),
  );

  // Accepted Lead/BGV vocalists for this event — the pool you can assign to songs.
  const vocalistCandidates = event.assignments
    .filter(
      (a) =>
        a.status === InvitationStatus.ACCEPTED &&
        (a.role === VolunteerRole.LEAD_VOCALIST || a.role === VolunteerRole.BGVS),
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
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <Music className={cn("h-4 w-4", serviceColors.badgeText)} />
            Setlist
          </CardTitle>
          {canManage && (
            <div className="flex items-center gap-2">
              {songs.length > 0 && (
                <EditSetlistButton
                  eventId={event.id}
                  eventName={event.name}
                  initialSongs={songs}
                  serviceColor={event.serviceType.color}
                />
              )}
              <Button asChild variant="outline" size="sm">
                <a href={editorHref}>
                  Open Editor
                  <ArrowUpRight className="ml-1 h-3.5 w-3.5" />
                </a>
              </Button>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {songs.length > 0 ? (
          <div className="space-y-1">
            {songs.map((song, idx) => (
              <div
                key={song.id}
                className="group flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-muted/50"
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted text-[11px] font-bold text-muted-foreground">
                  {idx + 1}
                </span>
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium leading-tight truncate">
                      {song.title}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {song.artist}
                    </p>
                  </div>

                  {(song.spotifyUrl || song.youtubeUrl || (song.attachments && song.attachments.length > 0)) && (
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
                          <YoutubeIcon className="h-6 w-6" />
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
                            className={
                              isPdf
                                ? "text-muted-foreground transition-colors hover:text-red-500"
                                : "text-muted-foreground transition-colors hover:text-sky-500"
                            }
                          >
                            <Icon className="h-4.5 w-4.5" />
                            <span className="sr-only">{attachment.name}</span>
                          </a>
                        );
                      })}
                    </div>
                  )}
                </div>
                <SongVocalistAssign
                  setlistSongId={song.id}
                  candidates={vocalistCandidates}
                  assigned={assignedBySong.get(song.id) ?? []}
                  canManage={canManage}
                  serviceColor={event.serviceType.color}
                />
                {canSaveKeys && (
                  <SongKeySaveButton
                    organizationId={orgId}
                    songId={song.songId}
                    title={song.title}
                    artist={song.artist}
                    pitch={song.pitch}
                    keyQuality={song.keyQuality}
                    savedKey={myKeyBySongId.get(song.songId) ?? null}
                  />
                )}
                <div className="flex items-center gap-2 shrink-0">
                  <Badge
                    variant="outline"
                    className="text-[10px] font-mono px-1.5 py-0"
                  >
                    {formatKey(song.pitch, song.keyQuality)}
                  </Badge>
                  <span className="text-[12px] text-muted-foreground font-mono w-14 text-right">
                    {song.bpm} bpm
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex h-24 items-center justify-center rounded-xl border border-dashed border-border/40 bg-muted/10">
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
      </CardContent>
    </Card>
  )
}