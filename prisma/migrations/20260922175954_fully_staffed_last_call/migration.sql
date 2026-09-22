-- AlterEnum
ALTER TYPE "NotificationCategory" ADD VALUE 'FULLY_STAFFED';

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "fullyStaffedAt" TIMESTAMP(3),
ADD COLUMN     "lastCallStage" INTEGER NOT NULL DEFAULT 0;

-- Backfill: an event that is already fully staffed is marked as such, so the
-- first reconcile after deploy doesn't mail "fully staffed" about every one of
-- them. Same test as syncEventNotifications: every needed role has someone who
-- accepted, and no invitation on the event is still live.
UPDATE "Event" AS e
SET "fullyStaffedAt" = CURRENT_TIMESTAMP
WHERE cardinality(e."rolesNeeded") > 0
  AND NOT EXISTS (
    SELECT 1
    FROM unnest(e."rolesNeeded") AS needed(role)
    WHERE NOT EXISTS (
      SELECT 1
      FROM "EventAssignment" AS a
      WHERE a."eventId" = e."id"
        AND a."role" = needed.role
        AND a."status" = 'ACCEPTED'
    )
  )
  AND NOT EXISTS (
    SELECT 1
    FROM "EventAssignment" AS a
    WHERE a."eventId" = e."id"
      AND a."status" = 'PENDING'
      AND a."expiresAt" > CURRENT_TIMESTAMP
  );
