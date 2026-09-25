-- AlterTable
ALTER TABLE "EventAssignment" ADD COLUMN     "lapsedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "PushClaim" (
    "key" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushClaim_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "PushClaim_createdAt_idx" ON "PushClaim"("createdAt");
