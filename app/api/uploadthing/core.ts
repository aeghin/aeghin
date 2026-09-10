import { createUploadthing, type FileRouter } from "uploadthing/next";
import { UploadThingError } from "uploadthing/server";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod/v4";

import prisma from "@/lib/prisma";
import { OrgRole } from "@/generated/prisma/enums";

const f = createUploadthing();

export const fileRouter = {
    songAttachment: f(
        {
            pdf: { maxFileSize: "16MB", maxFileCount: 5 },
            audio: { maxFileSize: "64MB", maxFileCount: 5 },
        },
        // Nothing reads `serverData`: both clients write their own rows once the
        // upload lands. Waiting on `onUploadComplete` would only add latency, and
        // it would make the phone's upload depend on UploadThing being able to
        // reach this deployment — which it cannot during local development.
        { awaitServerData: false },
    )
        .input(z.object({ songId: z.uuid() }))
        .middleware(async ({ input }) => {
            const { userId: clerkId } = await auth();

            if (!clerkId) throw new UploadThingError("Unauthorized");

            const user = await prisma.user.findUnique({ where: { clerkId } });

            if (!user) throw new UploadThingError("Unauthorized");

            const song = await prisma.song.findUnique({
                where: { id: input.songId, deletedAt: null },
            });

            if (!song) throw new UploadThingError("Song not found");

            const membership = await prisma.membership.findUnique({
                where: {
                    userId_organizationId: {
                        userId: user.id,
                        organizationId: song.organizationId,
                    },
                },
            });

            if (!membership || membership.role === OrgRole.MEMBER) {
                throw new UploadThingError("Unauthorized");
            }

            return { songId: song.id };
        })
        .onUploadComplete(async ({ metadata, file }) => {
            console.log(`Upload complete for song ${metadata.songId}: ${file.key}`);
        }),
    orgLogo: f(
        {
            image: { maxFileSize: "4MB", maxFileCount: 1 },
        },
        { awaitServerData: false },
    )
        .input(z.object({ organizationId: z.uuid() }))
        .middleware(async ({ input }) => {
            const { userId: clerkId } = await auth();

            if (!clerkId) throw new UploadThingError("Unauthorized");

            const user = await prisma.user.findUnique({ where: { clerkId } });

            if (!user) throw new UploadThingError("Unauthorized");

            const membership = await prisma.membership.findUnique({
                where: {
                    userId_organizationId: {
                        userId: user.id,
                        organizationId: input.organizationId,
                    },
                },
            });

            if (!membership || membership.role !== OrgRole.OWNER) {
                throw new UploadThingError("Unauthorized");
            }

            return { organizationId: input.organizationId };
        })
        .onUploadComplete(async ({ metadata, file }) => {
            console.log(`Logo upload complete for org ${metadata.organizationId}: ${file.key}`);
        }),
} satisfies FileRouter;

export type AppFileRouter = typeof fileRouter;
