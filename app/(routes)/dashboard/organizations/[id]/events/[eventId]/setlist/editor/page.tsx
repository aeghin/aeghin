import { notFound } from "next/navigation";
// import { getOrgSongCatalog } from "@/lib/services/songs"
import { SetlistEditor } from "@/components/dashboard/events/setlist-editor";

import { currentUser } from "@/lib/services/user";
import { getUserMembershipRole } from "@/lib/services/organization";
import { getEventDetailsById } from "@/lib/services/events";
import { OrgRole } from "@/generated/prisma/enums";
import type { SetlistSong } from "@/lib/types";
import { getOrganizationSongs } from "@/lib/services/songs";
import { getAiSetlistAccess, getAiProAccess } from "@/lib/billing/entitlements";
import { versionLinks } from "@/lib/arrangements";


interface PageProps {
  params: Promise<{ id: string; eventId: string }>
};

export default async function SetlistEditPage({ params }: PageProps) {

  const [{ id: orgId, eventId }, user] = await Promise.all([
    params,
    currentUser(),
  ]);

  if (!user) notFound();

  const [membership, event, catalog] = await Promise.all([
    getUserMembershipRole(user.id, orgId),
    getEventDetailsById(eventId, orgId),
    getOrganizationSongs(orgId),
  ]);

  const canManage =
    membership?.role === OrgRole.ADMIN || membership?.role === OrgRole.OWNER;

  const canSubscribe = membership?.role === OrgRole.OWNER;

  if (!event || !canManage) notFound();

  const [hasPremium, hasPro] = await Promise.all([
    getAiSetlistAccess({ userId: user.id, orgId }),
    getAiProAccess({ userId: user.id, orgId }),
  ]);
  const canUseAi = hasPremium || hasPro;

  const backHref = `/dashboard/organizations/${orgId}/events/${eventId}`;

  const initialSongs: SetlistSong[] = event.setlistSongs.map((s) => ({
      id: s.id,
      songId: s.songId,
      arrangementId: s.arrangementId,
      arrangementName: s.arrangement?.name ?? null,
      position: s.position,
      pitch: s.pitch,
      keyQuality: s.keyQuality,
      bpm: s.bpm,
      timeSignature: s.timeSignature,
      title: s.song.title,
      artist: s.song.artist,
      ...versionLinks(s.song, s.arrangement),
    }));

  return (
    <SetlistEditor
      eventId={event.id}
      eventName={event.name}
      orgId={orgId}
      backHref={backHref}
      initialSongs={initialSongs}
      serviceColor={event.serviceType.color}
      catalog={catalog}
      canUseAi={canUseAi}
      hasPro={hasPro}
      canSubscribe={canSubscribe}
    />
  )
}