-- CreateTable
CREATE TABLE "SongKeyEntry" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "artist" TEXT NOT NULL,
    "pitch" "Pitch" NOT NULL,
    "keyQuality" "KeyQuality" NOT NULL,
    "notes" TEXT,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "songId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SongKeyEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SongKeyEntry_userId_organizationId_idx" ON "SongKeyEntry"("userId", "organizationId");

-- CreateIndex
CREATE INDEX "SongKeyEntry_songId_idx" ON "SongKeyEntry"("songId");

-- CreateIndex
CREATE UNIQUE INDEX "SongKeyEntry_userId_songId_key" ON "SongKeyEntry"("userId", "songId");

-- AddForeignKey
ALTER TABLE "SongKeyEntry" ADD CONSTRAINT "SongKeyEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SongKeyEntry" ADD CONSTRAINT "SongKeyEntry_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SongKeyEntry" ADD CONSTRAINT "SongKeyEntry_songId_fkey" FOREIGN KEY ("songId") REFERENCES "Song"("id") ON DELETE SET NULL ON UPDATE CASCADE;
