"use server"

import prisma from "@/lib/prisma";
import { currentUser } from "@/lib/services/user";
import { type songSchemaInput, songSchema, type songAttachmentsInput, songAttachmentsSchema } from "@/lib/validations/song";
import { UTApi } from "uploadthing/server";
import { OrgRole } from "@/generated/prisma/enums";
import { revalidatePath, updateTag } from "next/cache";
import { Prisma } from "@/generated/prisma/client";


type ActionResponse = { success: true } | { success: false; error: string };

/**
 * How an action expires its cache tags.
 *
 * `updateTag` throws outside a Server Action, so the mobile route handlers pass
 * `revalidateTag` instead — the same expiry without the read-your-writes
 * refresh a dashboard render wants and a JSON response has no use for. Same
 * arrangement `lib/actions/event.ts` makes for the invitation routes.
 */
type TagInvalidator = (tag: string) => void;

export const addSongToLibrary = async (
    song: songSchemaInput,
    touch: TagInvalidator = updateTag,
): Promise<ActionResponse> => {

    try {

    const user = await currentUser();

    if (!user) return { success: false, error: "Unauthorized" };

    const parsed = songSchema.safeParse(song);

    if (!parsed.success) return { success: false, error: parsed.error.issues[0].message };

   const { title, artist, bpm, timeSignature, defaultPitch, defaultKeyQuality, spotifyUrl, youtubeUrl, themes, organizationId } = parsed.data;

    const spotify = spotifyUrl || null;
    const youtube = youtubeUrl || null;

    const membership = await prisma.membership.findUnique({
        where: {
            userId_organizationId: {
                userId: user.id,
                organizationId
            }
        }
    }); 

    if (!membership) return { success: false, error: "Unable to locate membership" };

    if (membership.role === OrgRole.MEMBER) return { success: false, error: "Unauthorized" };

    const songExists = await prisma.song.findUnique({
        where: {
            organizationId_title_artist: {
                organizationId,
                title,
                artist
            }
        }
    });

    if (songExists && songExists.deletedAt === null) {
        return { success: false, error: "Song already exists" };
    };

    if (songExists) {
        await prisma.song.update({
            where: { id: songExists.id },
            data: {
                bpm,
                timeSignature,
                defaultPitch,
                defaultKeyQuality,
                spotifyUrl: spotify,
                youtubeUrl: youtube,
                themes,
                deletedAt: null
            }
        });
    } else {
        await prisma.song.create({
            data: {
                title,
                artist,
                bpm,
                timeSignature,
                defaultPitch,
                defaultKeyQuality,
                spotifyUrl: spotify,
                youtubeUrl: youtube,
                themes,
                organizationId
            }
        });
    };

    touch(`org-${organizationId}-songs`);
    revalidatePath(`/dashboard/organizations/${organizationId}/songs`);

    return { success: true };


    } catch (err) {
        console.log(err);
        return { success: false, error: "Something went wrong. Try Again" }
    }

}


    export const updateSongInLibrary = async (
        songId: string,
        song: songSchemaInput,
        touch: TagInvalidator = updateTag,
    ): Promise<ActionResponse> => {

        try {

            const user = await currentUser();

            if (!user) return { success: false, error: "Unauthorized" };

            const parsed = songSchema.safeParse(song);

            if (!parsed.success) return { success: false, error: parsed.error.issues[0].message };

            const { title, artist, bpm, timeSignature, defaultPitch, defaultKeyQuality, spotifyUrl, youtubeUrl, themes, organizationId } = parsed.data;

            const spotify = spotifyUrl || null;
            const youtube = youtubeUrl || null;

            const membership = await prisma.membership.findUnique({
                where: {
                    userId_organizationId: {
                        userId: user.id,
                        organizationId
                    }
                }
            }); 

            if (!membership) return { success: false, error: "Unable to locate membership" };

            if (membership.role === OrgRole.MEMBER) return { success: false, error: "Unauthorized" };

            const songExistsInOrganization = await prisma.song.findUnique({
                where: {
                    id: songId,
                    organizationId: organizationId,
                    deletedAt: null
                }
            });

            if (!songExistsInOrganization) return { success: false, error: "Song not found." };

            await prisma.song.update({
              where: { id: songId, organizationId },
              data: { title, artist, bpm, timeSignature, defaultPitch, defaultKeyQuality, spotifyUrl: spotify, youtubeUrl: youtube, themes }
            });


            touch(`org-${organizationId}-songs`);
            revalidatePath(`/dashboard/organizations/${organizationId}/songs`);

  return { success: true };

  } catch (err) {

      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
          return { success: false, error: "A song with this title and artist already exists" };
      }
      console.log(err);
      return { success: false, error: "Something went wrong, try again." };
  }
}

export const addSongAttachments = async (
    input: songAttachmentsInput,
    touch: TagInvalidator = updateTag,
): Promise<ActionResponse> => {

    try {

        const user = await currentUser();

        if (!user) return { success: false, error: "Unauthorized" };

        const parsed = songAttachmentsSchema.safeParse(input);

        if (!parsed.success) return { success: false, error: parsed.error.issues[0].message };

        const { songId, organizationId, files } = parsed.data;

        const membership = await prisma.membership.findUnique({
            where: {
                userId_organizationId: {
                    userId: user.id,
                    organizationId
                }
            }
        });

        if (!membership) return { success: false, error: "Unable to locate membership" };

        if (membership.role === OrgRole.MEMBER) return { success: false, error: "Unauthorized" };

        const song = await prisma.song.findUnique({
            where: { id: songId, organizationId, deletedAt: null }
        });

        if (!song) return { success: false, error: "Song not found." };

        await prisma.songAttachment.createMany({
            data: files.map((file) => ({
                songId,
                name: file.name,
                url: file.url,
                key: file.key,
                type: file.type,
                size: file.size
            })),
            skipDuplicates: true
        });

        touch(`org-${organizationId}-songs`);
        revalidatePath(`/dashboard/organizations/${organizationId}/songs`);

        return { success: true };

    } catch (err) {
        console.log(err);
        return { success: false, error: "Something went wrong. Try Again" };
    }
}

export const deleteSongAttachment = async (
    attachmentId: string,
    organizationId: string,
    touch: TagInvalidator = updateTag,
): Promise<ActionResponse> => {

    try {

        const user = await currentUser();

        if (!user) return { success: false, error: "Unauthorized" };

        const membership = await prisma.membership.findUnique({
            where: {
                userId_organizationId: {
                    userId: user.id,
                    organizationId
                }
            }
        });

        if (!membership) return { success: false, error: "Unable to locate membership" };

        if (membership.role === OrgRole.MEMBER) return { success: false, error: "Unauthorized" };

        const attachment = await prisma.songAttachment.findUnique({
            where: { id: attachmentId },
            include: { song: true }
        });

        if (!attachment || attachment.song.organizationId !== organizationId) {
            return { success: false, error: "Attachment not found." };
        }

        const utapi = new UTApi();
        await utapi.deleteFiles(attachment.key);

        await prisma.songAttachment.delete({ where: { id: attachmentId } });

        touch(`org-${organizationId}-songs`);
        revalidatePath(`/dashboard/organizations/${organizationId}/songs`);

        return { success: true };

    } catch (err) {
        console.log(err);
        return { success: false, error: "Something went wrong. Try Again" };
    }
}

export const deleteSongFromLibrary = async (
    organizationId: string,
    songId: string,
    touch: TagInvalidator = updateTag,
): Promise<ActionResponse> => {

    try {

        const user = await currentUser();

        if (!user) return { success: false, error: "Unauthorized" };

        if (!organizationId || !songId) return { success: false, error: "Insufficient data" };

        const membership = await prisma.membership.findUnique({
            where: {
                userId_organizationId: {
                    userId: user.id,
                    organizationId
                }
            },
            select: { role: true }
        });

        if (!membership) return { success: false, error: "Unable to locate membership" };

        if (membership.role === OrgRole.MEMBER) return { success: false, error: "Unauthorized" };

        const song = await prisma.song.findUnique({
            where: { id: songId, organizationId, deletedAt: null },
            select: {
                id: true,
                attachments: { select: { key: true } }
            }
        });

        if (!song) return { success: false, error: "Song not found." };

       
        const upcoming = await prisma.setlistSong.findMany({
            where: {
                songId,
                event: { dates: { some: { endTime: { gte: new Date() } } } }
            },
            select: { event: { select: { name: true } } }
        });

        if (upcoming.length > 0) {
            const names = upcoming.map((s) => s.event.name);
            const shown = names.slice(0, 3).join(", ");
            const rest = names.length > 3 ? ` and ${names.length - 3} more` : "";

            return {
                success: false,
                error: `This song is scheduled for ${shown}${rest}. Remove it from those setlists first.`
            };
        }

        
        const setlistUses = await prisma.setlistSong.count({ where: { songId } });

        const purgeAttachments = setlistUses === 0 && song.attachments.length > 0;

        await prisma.$transaction(async (tx) => {
            if (purgeAttachments) {
                await tx.songAttachment.deleteMany({ where: { songId } });
            }

            await tx.song.update({
                where: { id: songId, organizationId },
                data: { deletedAt: new Date() }
            });
        });

        if (purgeAttachments) {
            try {
                const utapi = new UTApi();
                await utapi.deleteFiles(song.attachments.map((a) => a.key));
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