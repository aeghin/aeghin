"use server";

import prisma from "@/lib/prisma";
import { currentUser } from "@/lib/services/user";
import { InvitationStatus, OrgRole, VolunteerRole } from "@/generated/prisma/enums";
import type { KeyQuality, Pitch } from "@/generated/prisma/enums";
import { revalidatePath, updateTag } from "next/cache";
import type { SetlistSong } from "@/lib/types";

type ActionResponse = { success: true } | { success: false; error: string };

/**
 * How a caller expires cache tags. `updateTag` throws inside a Route Handler,
 * so the mobile routes pass `revalidateTag`; every web call site keeps the
 * default. Not exported: a "use server" module may only export async functions.
 */
type TagInvalidator = (tag: string) => void;

// The per-row columns a setlist save writes, shared by inserts and updates.
type SetlistRowData = {
  position: number;
  pitch: Pitch;
  keyQuality: KeyQuality;
  bpm: number;
  timeSignature: string;
};

export const saveSetlist = async (
  eventId: string,
  songs: SetlistSong[],
  touch: TagInvalidator = updateTag,
): Promise<ActionResponse> => {
  try {
    const user = await currentUser();
    if (!user) return { success: false, error: "Unauthorized" };

    const event = await prisma.event.findFirst({
      where: {
        id: eventId,
        organization: {
          memberships: {
            some: {
              userId: user.id,
              role: { in: [OrgRole.OWNER, OrgRole.ADMIN] },
            },
          },
        },
      },
      select: { organizationId: true },
    });

    if (!event) return { success: false, error: "Unauthorized" };

    const { organizationId } = event;

    if (songs.length > 0) {
      const songIds = songs.map((s) => s.songId);
      const uniqueSongIds = new Set(songIds);

      if (uniqueSongIds.size !== songIds.length) {
        return { success: false, error: "Duplicate songs in setlist" };
      };

      const validSongs = await prisma.song.count({
        where: {
          id: { in: songIds },
          organizationId,
          deletedAt: null,
        },
      });

      if (validSongs !== uniqueSongIds.size) {
        return {
          success: false,
          error: "One or more songs do not belong to this organization",
        };
      }
    }

    await prisma.$transaction(async (tx) => {
      const existing = await tx.setlistSong.findMany({
        where: { eventId },
        select: { id: true, songId: true },
      });

      const existingIdBySongId = new Map(existing.map((s) => [s.songId, s.id]));
      const incomingSongIds = new Set(songs.map((s) => s.songId));

      // Delete only songs removed from the setlist (cascades their assignments).
      const removedIds = existing
        .filter((s) => !incomingSongIds.has(s.songId))
        .map((s) => s.id);
      if (removedIds.length > 0) {
        await tx.setlistSong.deleteMany({ where: { id: { in: removedIds } } });
      }

      // Upsert surviving + new songs, refreshing position/key/bpm. Surviving
      // rows keep their id so per-song assignments are preserved across edits.
      const updates: { id: string; data: SetlistRowData }[] = [];
      const creates: (SetlistRowData & { eventId: string; songId: string })[] = [];

      songs.forEach((s, idx) => {
        const data = {
          position: idx,
          pitch: s.pitch,
          keyQuality: s.keyQuality,
          bpm: s.bpm,
          timeSignature: s.timeSignature,
        };
        const existingId = existingIdBySongId.get(s.songId);
        if (existingId) updates.push({ id: existingId, data });
        else creates.push({ eventId, songId: s.songId, ...data });
      });

      // New rows share a shape, so they go in one insert. Updates each carry
      // their own values, so they fan out instead.
      if (creates.length > 0) {
        await tx.setlistSong.createMany({ data: creates });
      }
      await Promise.all(
        updates.map(({ id, data }) => tx.setlistSong.update({ where: { id }, data })),
      );
    });

    touch(`event-${eventId}-org-${organizationId}-details`);
    revalidatePath(`/dashboard/organizations/${organizationId}/events/${eventId}`);
    revalidatePath(`/dashboard/organizations/${organizationId}/events/${eventId}/setlist/editor`);

    return { success: true };
  } catch {
    return { success: false, error: "Unable to save setlist" };
  }
};

// Authorize the caller as OWNER/ADMIN of the org that owns this setlist song's
// event. Returns the ids needed for cache revalidation, or null if not allowed.
const authorizeSetlistSong = async (
  userId: string,
  setlistSongId: string,
): Promise<{ eventId: string; organizationId: string } | null> => {
  const setlistSong = await prisma.setlistSong.findFirst({
    where: {
      id: setlistSongId,
      event: {
        organization: {
          memberships: {
            some: { userId, role: { in: [OrgRole.OWNER, OrgRole.ADMIN] } },
          },
        },
      },
    },
    select: {
      eventId: true,
      event: { select: { organizationId: true } },
    },
  });

  if (!setlistSong) return null;

  return {
    eventId: setlistSong.eventId,
    organizationId: setlistSong.event.organizationId,
  };
};

export const assignSongVocalist = async (
  setlistSongId: string,
  userId: string,
  touch: TagInvalidator = updateTag,
): Promise<ActionResponse> => {
  try {
    const user = await currentUser();
    if (!user) return { success: false, error: "Unauthorized" };

    const ids = await authorizeSetlistSong(user.id, setlistSongId);
    if (!ids) return { success: false, error: "Unauthorized" };

    const { eventId, organizationId } = ids;

    // Only accepted Lead/BGV vocalists on this event may be assigned.
    const vocalist = await prisma.eventAssignment.findFirst({
      where: {
        eventId,
        userId,
        status: InvitationStatus.ACCEPTED,
        role: { in: [VolunteerRole.LEAD_VOCALIST, VolunteerRole.BGVS] },
      },
      select: { id: true },
    });

    if (!vocalist) {
      return {
        success: false,
        error: "User is not an accepted vocalist for this event",
      };
    }

    // Idempotent — @@unique([setlistSongId, userId]) makes re-assigning a no-op.
    await prisma.setlistSongAssignment.upsert({
      where: { setlistSongId_userId: { setlistSongId, userId } },
      create: { setlistSongId, userId },
      update: {},
    });

    touch(`event-${eventId}-org-${organizationId}-details`);
    touch(`user-${userId}-songs-${organizationId}`);
    revalidatePath(`/dashboard/organizations/${organizationId}/events/${eventId}`);

    return { success: true };
  } catch {
    return { success: false, error: "Unable to assign vocalist" };
  }
};

export const unassignSongVocalist = async (
  setlistSongId: string,
  userId: string,
  touch: TagInvalidator = updateTag,
): Promise<ActionResponse> => {
  try {
    const user = await currentUser();
    if (!user) return { success: false, error: "Unauthorized" };

    const ids = await authorizeSetlistSong(user.id, setlistSongId);
    if (!ids) return { success: false, error: "Unauthorized" };

    const { eventId, organizationId } = ids;

    // deleteMany so removing an already-absent assignment is a no-op.
    await prisma.setlistSongAssignment.deleteMany({
      where: { setlistSongId, userId },
    });

    touch(`event-${eventId}-org-${organizationId}-details`);
    touch(`user-${userId}-songs-${organizationId}`);
    revalidatePath(`/dashboard/organizations/${organizationId}/events/${eventId}`);

    return { success: true };
  } catch {
    return { success: false, error: "Unable to unassign vocalist" };
  }
};
