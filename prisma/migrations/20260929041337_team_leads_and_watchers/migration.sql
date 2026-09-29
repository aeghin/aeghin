-- CreateEnum
CREATE TYPE "RoleCategory" AS ENUM ('BAND', 'VOCALS', 'PRODUCTION', 'HOSPITALITY');

-- CreateTable
CREATE TABLE "TeamLead" (
    "id" TEXT NOT NULL,
    "category" "RoleCategory" NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeamLead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamWatcher" (
    "id" TEXT NOT NULL,
    "category" "RoleCategory" NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamWatcher_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventWatcher" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventWatcher_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TeamLead_userId_organizationId_idx" ON "TeamLead"("userId", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "TeamLead_organizationId_category_key" ON "TeamLead"("organizationId", "category");

-- CreateIndex
CREATE INDEX "TeamWatcher_userId_organizationId_idx" ON "TeamWatcher"("userId", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "TeamWatcher_organizationId_category_userId_key" ON "TeamWatcher"("organizationId", "category", "userId");

-- CreateIndex
CREATE INDEX "EventWatcher_userId_organizationId_idx" ON "EventWatcher"("userId", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "EventWatcher_eventId_userId_key" ON "EventWatcher"("eventId", "userId");

-- AddForeignKey
ALTER TABLE "TeamLead" ADD CONSTRAINT "TeamLead_userId_organizationId_fkey" FOREIGN KEY ("userId", "organizationId") REFERENCES "Membership"("userId", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamWatcher" ADD CONSTRAINT "TeamWatcher_userId_organizationId_fkey" FOREIGN KEY ("userId", "organizationId") REFERENCES "Membership"("userId", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventWatcher" ADD CONSTRAINT "EventWatcher_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventWatcher" ADD CONSTRAINT "EventWatcher_userId_organizationId_fkey" FOREIGN KEY ("userId", "organizationId") REFERENCES "Membership"("userId", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;
