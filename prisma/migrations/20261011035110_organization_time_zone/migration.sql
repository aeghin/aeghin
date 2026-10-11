-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "timeZone" TEXT NOT NULL DEFAULT 'UTC';

-- Backfill: each organization takes the zone most of its members' phones
-- report, with owners' phones deciding a tie. A member with several phones
-- counts once, by whichever reported most recently. Every stored phone zone was
-- checked against the server's Intl when it was registered. An organization
-- nobody has the app in stays on UTC, which is what every comparison assumed
-- until now, and an owner can change it in Settings.
WITH member_zones AS (
  SELECT DISTINCT ON (m."organizationId", m."userId")
    m."organizationId",
    m."userId",
    m."role",
    p."timeZone"
  FROM "Membership" m
  JOIN "PushToken" p ON p."userId" = m."userId"
  WHERE p."timeZone" IS NOT NULL
  ORDER BY m."organizationId", m."userId", p."updatedAt" DESC
),
ranked AS (
  SELECT
    "organizationId",
    "timeZone",
    ROW_NUMBER() OVER (
      PARTITION BY "organizationId"
      ORDER BY
        COUNT(*) DESC,
        COUNT(*) FILTER (WHERE "role" = 'OWNER') DESC,
        "timeZone" ASC
    ) AS "rank"
  FROM member_zones
  GROUP BY "organizationId", "timeZone"
)
UPDATE "Organization" o
SET "timeZone" = r."timeZone"
FROM ranked r
WHERE r."organizationId" = o."id"
  AND r."rank" = 1;
