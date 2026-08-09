-- AlterTable
ALTER TABLE "ActivityLog" ADD COLUMN     "eventName" TEXT;

-- Backfill from the events that are still around, so existing rows keep their
-- context once the feed stops reading the name through the FK. Rows whose event
-- was already deleted stay null — that name is unrecoverable.
UPDATE "ActivityLog" a
   SET "eventName" = e."name"
  FROM "Event" e
 WHERE a."eventId" = e."id";
