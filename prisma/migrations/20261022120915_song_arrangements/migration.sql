-- AlterTable
ALTER TABLE "SetlistSong" ADD COLUMN     "arrangementId" TEXT;

-- AlterTable
ALTER TABLE "SongAttachment" ADD COLUMN     "arrangementId" TEXT;

-- CreateTable
CREATE TABLE "SongArrangement" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "spotifyUrl" TEXT,
    "youtubeUrl" TEXT,
    "songId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SongArrangement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SongArrangement_songId_name_key" ON "SongArrangement"("songId", "name");

-- CreateIndex
CREATE INDEX "SetlistSong_arrangementId_idx" ON "SetlistSong"("arrangementId");

-- CreateIndex
CREATE INDEX "SongAttachment_arrangementId_idx" ON "SongAttachment"("arrangementId");

-- AddForeignKey
ALTER TABLE "SetlistSong" ADD CONSTRAINT "SetlistSong_arrangementId_fkey" FOREIGN KEY ("arrangementId") REFERENCES "SongArrangement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SongAttachment" ADD CONSTRAINT "SongAttachment_arrangementId_fkey" FOREIGN KEY ("arrangementId") REFERENCES "SongArrangement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SongArrangement" ADD CONSTRAINT "SongArrangement_songId_fkey" FOREIGN KEY ("songId") REFERENCES "Song"("id") ON DELETE CASCADE ON UPDATE CASCADE;

