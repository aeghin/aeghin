-- Team leads and "Also notify" move from the organization to each service
-- type, an event can hand a team to somebody else for that event alone, and
-- watching an event goes away.
--
-- Anything already set for the whole organization is copied onto every live
-- service type, which is what it meant: the same lead for every service.

-- DropForeignKey
ALTER TABLE "EventWatcher" DROP CONSTRAINT "EventWatcher_eventId_fkey";

-- DropForeignKey
ALTER TABLE "EventWatcher" DROP CONSTRAINT "EventWatcher_userId_organizationId_fkey";

-- DropTable
DROP TABLE "EventWatcher";

-- DropIndex
DROP INDEX "TeamLead_organizationId_category_key";

-- DropIndex
DROP INDEX "TeamWatcher_organizationId_category_userId_key";

-- AlterTable: nullable first, so the organization-wide rows can be copied out
ALTER TABLE "TeamLead" ADD COLUMN     "serviceTypeId" TEXT;

-- AlterTable
ALTER TABLE "TeamWatcher" ADD COLUMN     "serviceTypeId" TEXT;

-- Copy each organization-wide lead onto every live service type
INSERT INTO "TeamLead" ("id", "category", "serviceTypeId", "organizationId", "userId", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, lead."category", serviceType."id", lead."organizationId", lead."userId", lead."createdAt", lead."updatedAt"
FROM "TeamLead" lead
JOIN "ServiceType" serviceType
  ON serviceType."organizationId" = lead."organizationId"
 AND serviceType."deletedAt" IS NULL
WHERE lead."serviceTypeId" IS NULL;

DELETE FROM "TeamLead" WHERE "serviceTypeId" IS NULL;

-- Copy each organization-wide "Also notify" onto every live service type
INSERT INTO "TeamWatcher" ("id", "category", "serviceTypeId", "organizationId", "userId", "createdAt")
SELECT gen_random_uuid()::text, watcher."category", serviceType."id", watcher."organizationId", watcher."userId", watcher."createdAt"
FROM "TeamWatcher" watcher
JOIN "ServiceType" serviceType
  ON serviceType."organizationId" = watcher."organizationId"
 AND serviceType."deletedAt" IS NULL
WHERE watcher."serviceTypeId" IS NULL;

DELETE FROM "TeamWatcher" WHERE "serviceTypeId" IS NULL;

-- AlterTable
ALTER TABLE "TeamLead" ALTER COLUMN "serviceTypeId" SET NOT NULL;

-- AlterTable
ALTER TABLE "TeamWatcher" ALTER COLUMN "serviceTypeId" SET NOT NULL;

-- CreateTable
CREATE TABLE "EventTeamLead" (
    "id" TEXT NOT NULL,
    "category" "RoleCategory" NOT NULL,
    "eventId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventTeamLead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EventTeamLead_userId_organizationId_idx" ON "EventTeamLead"("userId", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "EventTeamLead_eventId_category_key" ON "EventTeamLead"("eventId", "category");

-- CreateIndex
CREATE INDEX "TeamLead_organizationId_idx" ON "TeamLead"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "TeamLead_serviceTypeId_category_key" ON "TeamLead"("serviceTypeId", "category");

-- CreateIndex
CREATE INDEX "TeamWatcher_organizationId_idx" ON "TeamWatcher"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "TeamWatcher_serviceTypeId_category_userId_key" ON "TeamWatcher"("serviceTypeId", "category", "userId");

-- AddForeignKey
ALTER TABLE "TeamLead" ADD CONSTRAINT "TeamLead_serviceTypeId_fkey" FOREIGN KEY ("serviceTypeId") REFERENCES "ServiceType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamWatcher" ADD CONSTRAINT "TeamWatcher_serviceTypeId_fkey" FOREIGN KEY ("serviceTypeId") REFERENCES "ServiceType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventTeamLead" ADD CONSTRAINT "EventTeamLead_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventTeamLead" ADD CONSTRAINT "EventTeamLead_userId_organizationId_fkey" FOREIGN KEY ("userId", "organizationId") REFERENCES "Membership"("userId", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;
