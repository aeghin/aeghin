-- AlterTable
ALTER TABLE "SongArrangement" ADD COLUMN     "useSongLinks" BOOLEAN NOT NULL DEFAULT true;

-- Arrangements saved before the switch that have links of their own keep showing them.
UPDATE "SongArrangement" SET "useSongLinks" = false WHERE "spotifyUrl" IS NOT NULL OR "youtubeUrl" IS NOT NULL;
