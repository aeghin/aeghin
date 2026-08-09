-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "smartSchedulingEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "EventTemplate" ADD COLUMN     "smartSchedulingEnabled" BOOLEAN NOT NULL DEFAULT false;

-- Carry the org-level setting onto the events and templates that relied on it,
-- so orgs that had smart scheduling on don't silently lose it.
UPDATE "Event" e
SET "smartSchedulingEnabled" = true
FROM "Organization" o
WHERE e."organizationId" = o.id AND o."smartSchedulingEnabled" = true;

UPDATE "EventTemplate" t
SET "smartSchedulingEnabled" = true
FROM "Organization" o
WHERE t."organizationId" = o.id AND o."smartSchedulingEnabled" = true;

-- AlterTable
ALTER TABLE "Organization" DROP COLUMN "smartSchedulingEnabled";
