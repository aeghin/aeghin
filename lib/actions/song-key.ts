"use server";

import prisma from "@/lib/prisma";
import { currentUser } from "@/lib/services/user";
import { songKeySchema, type SongKeyInput } from "@/lib/validations/song-key";
import { revalidatePath, updateTag } from "next/cache";

type ActionResponse = { success: true } | { success: false; error: string };

/**
 * How a caller expires cache tags. `updateTag` throws inside a Route Handler,
 * so the mobile routes pass `revalidateTag`; every web call site keeps the
 * default. Not exported: a "use server" module may only export async functions.
 */
type TagInvalidator = (tag: string) => void;

/**
 * Resolves the name to store on an entry.
 *
 * A library-linked entry always snapshots the Song's own title and artist, so
 * the client can't send a name that disagrees with the song it points at. A
 * freehand entry takes what was typed — nothing else knows what it is.
 * Returns null when the songId doesn't name a live song in this org.
 */
const resolveEntryName = async (
  songId: string | null,
  organizationId: string,
  typed: { title: string; artist: string },
  // Adding a song requires it to be live in the library. Editing an entry you
  // already own must keep working after an admin retires that song — the note
  // is yours, and retirement is a soft delete the library can undo.
  allowRetired = false,
): Promise<{ title: string; artist: string } | null> => {
  if (!songId) return typed;

  const song = await prisma.song.findFirst({
    where: {
      id: songId,
      organizationId,
      ...(allowRetired ? {} : { deletedAt: null }),
    },
    select: { title: true, artist: true },
  });

  return song;
};

/**
 * Records — or re-records — the key the caller sings one song in.
 *
 * Linked entries upsert on @@unique([userId, songId]), so saving a song
 * already in the journal rewrites it rather than doubling it. Freehand entries
 * have no such key — NULL songIds don't collide in Postgres — so they insert,
 * and editing one goes through `updateSongKey`.
 *
 * Membership in the org is the only permission: the entry is the caller's own,
 * so no volunteer-role check gates writing it.
 */
export const saveSongKey = async (
  input: SongKeyInput,
  touch: TagInvalidator = updateTag,
): Promise<ActionResponse> => {
  try {
    const user = await currentUser();

    if (!user) return { success: false, error: "Unauthorized" };

    const parsed = songKeySchema.safeParse(input);

    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0].message };
    }

    const { organizationId, songId, title, artist, pitch, keyQuality, notes } =
      parsed.data;

    const membership = await prisma.membership.findUnique({
      where: {
        userId_organizationId: { userId: user.id, organizationId },
      },
      select: { id: true },
    });

    if (!membership) {
      return { success: false, error: "Unable to locate membership" };
    }

    const name = await resolveEntryName(songId, organizationId, { title, artist });

    if (!name) {
      return { success: false, error: "That song is no longer in the library" };
    }

    const data = {
      title: name.title,
      artist: name.artist,
      pitch,
      keyQuality,
      notes: notes || null,
    };

    if (songId) {
      await prisma.songKeyEntry.upsert({
        where: { userId_songId: { userId: user.id, songId } },
        create: { userId: user.id, organizationId, songId, ...data },
        update: data,
      });
    } else {
      await prisma.songKeyEntry.create({
        data: { userId: user.id, organizationId, songId: null, ...data },
      });
    }

    touch(`user-${user.id}-keys-${organizationId}`);
    revalidatePath(`/dashboard/organizations/${organizationId}`);

    return { success: true };
  } catch {
    return { success: false, error: "Unable to save your key. Try again." };
  }
};

/**
 * Edits one entry in place.
 *
 * Addressed by entry id rather than song id, because a freehand entry has no
 * song to address it by. The name is re-resolved on the way through, so a
 * linked entry stays in step with its song and a freehand one keeps whatever
 * was typed.
 */
export const updateSongKey = async (
  entryId: string,
  input: SongKeyInput,
  touch: TagInvalidator = updateTag,
): Promise<ActionResponse> => {
  try {
    const user = await currentUser();

    if (!user) return { success: false, error: "Unauthorized" };

    if (!entryId) return { success: false, error: "No data provided" };

    const parsed = songKeySchema.safeParse(input);

    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0].message };
    }

    const { organizationId, songId, title, artist, pitch, keyQuality, notes } =
      parsed.data;

    const name = await resolveEntryName(
      songId,
      organizationId,
      { title, artist },
      true,
    );

    if (!name) return { success: false, error: "That song isn't in this library" };

    // Scoped by owner and org in the same statement, so a forged id or org
    // updates nothing rather than reaching another member's journal.
    const updated = await prisma.songKeyEntry.updateMany({
      where: { id: entryId, userId: user.id, organizationId },
      data: {
        title: name.title,
        artist: name.artist,
        pitch,
        keyQuality,
        notes: notes || null,
      },
    });

    if (updated.count === 0) {
      return { success: false, error: "Unable to locate that entry" };
    }

    touch(`user-${user.id}-keys-${organizationId}`);
    revalidatePath(`/dashboard/organizations/${organizationId}`);

    return { success: true };
  } catch {
    return { success: false, error: "Unable to save your key. Try again." };
  }
};

/** Drops one entry from the caller's journal. */
export const deleteSongKey = async (
  entryId: string,
  organizationId: string,
  touch: TagInvalidator = updateTag,
): Promise<ActionResponse> => {
  try {
    const user = await currentUser();

    if (!user) return { success: false, error: "Unauthorized" };

    if (!entryId || !organizationId) {
      return { success: false, error: "No data provided" };
    }

    const deleted = await prisma.songKeyEntry.deleteMany({
      where: { id: entryId, userId: user.id, organizationId },
    });

    if (deleted.count === 0) {
      return { success: false, error: "Unable to locate that entry" };
    }

    touch(`user-${user.id}-keys-${organizationId}`);
    revalidatePath(`/dashboard/organizations/${organizationId}`);

    return { success: true };
  } catch {
    return { success: false, error: "Unable to remove your key. Try again." };
  }
};
