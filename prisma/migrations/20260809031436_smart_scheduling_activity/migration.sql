-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ActivityType" ADD VALUE 'SMART_FILL_SKIPPED';
ALTER TYPE "ActivityType" ADD VALUE 'SMART_FILL_NO_CANDIDATES';
ALTER TYPE "ActivityType" ADD VALUE 'SMART_FILL_ALL_UNAVAILABLE';
ALTER TYPE "ActivityType" ADD VALUE 'SMART_FILL_FAILED';
ALTER TYPE "ActivityType" ADD VALUE 'SMART_SCHEDULING_ENABLED';
ALTER TYPE "ActivityType" ADD VALUE 'SMART_SCHEDULING_DISABLED';

-- AlterTable
ALTER TABLE "ActivityLog" ADD COLUMN     "eventId" TEXT;

-- CreateIndex
CREATE INDEX "ActivityLog_eventId_createdAt_idx" ON "ActivityLog"("eventId", "createdAt");

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;
