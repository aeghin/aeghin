import "server-only";

import prisma from "@/lib/prisma";
import { cacheLife, cacheTag } from "next/cache";

import type { SongKeyEntry } from "@/lib/types";

/**
 * The caller's own key journal for one organization.
 *
 * Scoped on the row's own organizationId, so freehand entries — which have no
 * song to scope through — are included. Two tags: their journal, plus
 * `org-…-songs`, because a linked row renders the song's live title and
 * library key, the same reason `getEventDetailsById` carries the songs tag.
 *
 * The song join is deliberately unfiltered by `deletedAt`: retiring a song
 * from the library shouldn't silently blank a singer's entry, and the snapshot
 * would only show the same title anyway.
 */
export const getUserSongKeys = async (
  userId: string,
  organizationId: string,
): Promise<SongKeyEntry[]> => {
  "use cache";

  cacheLife("hours");
  cacheTag(`user-${userId}-keys-${organizationId}`);
  cacheTag(`org-${organizationId}-songs`);

  const entries = await prisma.songKeyEntry.findMany({
    where: { userId, organizationId },
    select: {
      id: true,
      organizationId: true,
      songId: true,
      title: true,
      artist: true,
      pitch: true,
      keyQuality: true,
      notes: true,
      updatedAt: true,
      song: {
        select: {
          title: true,
          artist: true,
          defaultPitch: true,
          defaultKeyQuality: true,
          spotifyUrl: true,
          youtubeUrl: true,
        },
      },
    },
  });

  // Sorted on the resolved display name rather than in SQL: a linked row shows
  // the song's live title, which a rename can move out of snapshot order.
  return entries.sort((a, b) =>
    (a.song?.title ?? a.title).localeCompare(b.song?.title ?? b.title),
  );
};
