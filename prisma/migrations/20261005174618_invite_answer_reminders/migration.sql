-- When each event invitation's window opened, so the cron can time a halfway
-- reminder from its length, and the claim for that reminder.

-- AlterTable
ALTER TABLE "EventAssignment" ADD COLUMN     "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "midwayNudgedAt" TIMESTAMP(3);

-- Existing rows opened their window when they were created, as far as anything
-- recorded can say. One re-invited since reads as a longer window than it has,
-- so at worst it gets a halfway reminder its three days wouldn't have earned.
UPDATE "EventAssignment" SET "invitedAt" = "createdAt";
