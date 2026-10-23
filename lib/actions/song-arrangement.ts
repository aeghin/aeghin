"use server"

import prisma from "@/lib/prisma";
import { currentUser } from "@/lib/services/user";
import { type songArrangementInput, songArrangementSchema } from "@/lib/validations/song";
import { UTApi } from "uploadthing/server";
import { OrgRole } from "@/generated/prisma/enums";
import { revalidatePath, updateTag } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { getOrganizationTimeZone } from "@/lib/services/organization";
import { floatingNow } from "@/lib/time-zone";


type ActionResponse = { success: true } | { success: false; error: string };

/**
 * How an action expires its cache tags. `updateTag` throws inside a Route
 * Handler, so mobile routes pass `revalidateTag`; every web call site keeps the
 * default. Not exported: a "use server" module may only export async functions.
 */
type TagInvalidator = (tag: string) => void;

const DUPLICATE_NAME = "This song already has an arrangement with that name";

/** Whether the caller may change this organization's library: an owner or admin. */
const canManageLibrary = async (userId: string, organizationId: string) => {
    const membership = await prisma.membership.findUnique({
        where: { userId_organizationId: { userId, organizationId } },
        select: { role: true },
    });

    return membership !== null && membership.role !== OrgRole.MEMBER;
};

/** A new arrangement on a library song. Its files are added after, as a song's are. */
export const addSongArrangement = async (
    organizationId: string,
    songId: string,
    input: songArrangementInput,
    touch: TagInvalidator = updateTag,
): Promise<ActionResponse> => {

    try {

        const user = await currentUser();

        if (!user) return { success: false, error: "Unauthorized" };

        const parsed = songArrangementSchema.safeParse(input);

        if (!parsed.success) return { success: false, error: parsed.error.issues[0].message };

        if (!(await canManageLibrary(user.id, organizationId))) return { success: false, error: "Unauthorized" };

        const song = await prisma.song.findUnique({
            where: { id: songId, organizationId, deletedAt: null },
            select: { id: true }
        });

        if (!song) return { success: false, error: "Song not found." };

        const { name, useSongLinks, spotifyUrl, youtubeUrl } = parsed.data;

        await prisma.songArrangement.create({
            data: {
                name,
                useSongLinks,
                // Its own links are kept only while it doesn't use the song's.
                spotifyUrl: useSongLinks ? null : spotifyUrl || null,
                youtubeUrl: useSongLinks ? null : youtubeUrl || null,
                songId
            }
        });

        touch(`org-${organizationId}-songs`);
        revalidatePath(`/dashboard/organizations/${organizationId}/songs`);

        return { success: true };

    } catch (err) {

        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
            return { success: false, error: DUPLICATE_NAME };
        }
        console.log(err);
        return { success: false, error: "Something went wrong. Try again" };
    }
}

/** Renames an arrangement or changes its links. Every setlist that plays it follows. */
export const updateSongArrangement = async (
    organizationId: string,
    arrangementId: string,
    input: songArrangementInput,
    touch: TagInvalidator = updateTag,
): Promise<ActionResponse> => {

    try {

        const user = await currentUser();

        if (!user) return { success: false, error: "Unauthorized" };

        const parsed = songArrangementSchema.safeParse(input);

        if (!parsed.success) return { success: false, error: parsed.error.issues[0].message };

        if (!(await canManageLibrary(user.id, organizationId))) return { success: false, error: "Unauthorized" };

        const arrangement = await prisma.songArrangement.findFirst({
            where: { id: arrangementId, song: { organizationId, deletedAt: null } },
            select: { id: true }
        });

        if (!arrangement) return { success: false, error: "Arrangement not found." };

        const { name, useSongLinks, spotifyUrl, youtubeUrl } = parsed.data;

        await prisma.songArrangement.update({
            where: { id: arrangementId },
            data: {
                name,
                useSongLinks,
                // Its own links are kept only while it doesn't use the song's.
                spotifyUrl: useSongLinks ? null : spotifyUrl || null,
                youtubeUrl: useSongLinks ? null : youtubeUrl || null
            }
        });

        touch(`org-${organizationId}-songs`);
        revalidatePath(`/dashboard/organizations/${organizationId}/songs`);

        return { success: true };

    } catch (err) {

        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
            return { success: false, error: DUPLICATE_NAME };
        }
        console.log(err);
        return { success: false, error: "Something went wrong. Try again" };
    }
}

/**
 * Deletes an arrangement along with its files. Refused while an upcoming
 * setlist plays it, naming those events, as deleting a song is. A past setlist
 * that played it lists the Original from then on.
 */
export const deleteSongArrangement = async (
    organizationId: string,
    arrangementId: string,
    touch: TagInvalidator = updateTag,
): Promise<ActionResponse> => {

    try {

        const user = await currentUser();

        if (!user) return { success: false, error: "Unauthorized" };

        if (!(await canManageLibrary(user.id, organizationId))) return { success: false, error: "Unauthorized" };

        const arrangement = await prisma.songArrangement.findFirst({
            where: { id: arrangementId, song: { organizationId, deletedAt: null } },
            select: {
                name: true,
                attachments: { select: { key: true } }
            }
        });

        if (!arrangement) return { success: false, error: "Arrangement not found." };

        // Not over yet at the church, whose wall clock event times are.
        const ahead = floatingNow(await getOrganizationTimeZone(organizationId));

        const upcoming = await prisma.setlistSong.findMany({
            where: {
                arrangementId,
                event: { dates: { some: { endTime: { gte: ahead } } } }
            },
            select: { event: { select: { name: true } } }
        });

        if (upcoming.length > 0) {
            const names = upcoming.map((s) => s.event.name);
            const shown = names.slice(0, 3).join(", ");
            const rest = names.length > 3 ? ` and ${names.length - 3} more` : "";

            return {
                success: false,
                error: `${arrangement.name} is on the setlist for ${shown}${rest}. Switch those setlists to another arrangement first.`
            };
        }

        // Its file rows go with it, and a past setlist's pick turns back to the Original.
        await prisma.songArrangement.delete({ where: { id: arrangementId } });

        // Best effort, as for a song: a file left at UploadThing must not turn
        // a finished delete into an error.
        if (arrangement.attachments.length > 0) {
            try {
                await new UTApi().deleteFiles(arrangement.attachments.map((a) => a.key));
            } catch (err) {
                console.log(err);
            }
        }

        touch(`org-${organizationId}-songs`);
        revalidatePath(`/dashboard/organizations/${organizationId}/songs`);

        return { success: true };

    } catch (err) {
        console.log(err);
        return { success: false, error: "Something went wrong. Try again" };
    }
}
