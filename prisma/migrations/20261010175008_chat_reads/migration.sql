-- CreateTable
CREATE TABLE "ChatRead" (
    "userId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatRead_pkey" PRIMARY KEY ("userId","eventId")
);

-- CreateIndex
CREATE INDEX "ChatRead_eventId_idx" ON "ChatRead"("eventId");

-- AddForeignKey
ALTER TABLE "ChatRead" ADD CONSTRAINT "ChatRead_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatRead" ADD CONSTRAINT "ChatRead_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Read tracking starts now, rather than turning every old conversation into a
-- badge: everyone who can open a chat today has read it up to its newest
-- message. Who can open one is the chat's own gate, an accepted assignee or an
-- admin or owner of the event's organization.
INSERT INTO "ChatRead" ("userId", "eventId", "readAt")
SELECT reader."userId", latest."eventId", latest."readAt"
FROM (
  SELECT "eventId", MAX("createdAt") AS "readAt"
  FROM "Message"
  GROUP BY "eventId"
) latest
JOIN (
  SELECT "userId", "eventId"
  FROM "EventAssignment"
  WHERE "status" = 'ACCEPTED'
  UNION
  SELECT m."userId", e."id"
  FROM "Membership" m
  JOIN "Event" e ON e."organizationId" = m."organizationId"
  WHERE m."role" IN ('OWNER', 'ADMIN')
) reader ON reader."eventId" = latest."eventId";
