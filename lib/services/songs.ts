import "server-only"

import prisma from "@/lib/prisma";
import { cacheLife, cacheTag } from "next/cache";

export const getOrganizationSongs = async (organizationId: string) => {

    "use cache"

    cacheLife("hours");

    cacheTag(`org-${organizationId}-songs`);

    const songs = await prisma.song.findMany({
      where: {
        organizationId,
        deletedAt: null,
      },
      include: {
        // Every file on the song, each with its arrangementId: the Original's
        // are the ones without. Kept in one list so storage adds them all up.
        attachments: {
          orderBy: { createdAt: "asc" }
        },
        arrangements: {
          orderBy: { createdAt: "asc" }
        }
      },
      orderBy: { title: "asc" }
    });

    return songs;
};