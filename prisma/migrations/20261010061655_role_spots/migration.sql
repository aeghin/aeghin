-- How many people each role needs, for the roles needing more than one.
ALTER TABLE "Event" ADD COLUMN "roleSpots" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "EventTemplate" ADD COLUMN "roleSpots" JSONB NOT NULL DEFAULT '{}';

-- Every invite was somebody wanted there, so an existing event's role needs
-- everyone who accepted or is still deciding, plus every decline or lapse
-- nobody was invited after: a later invite on the role is what filled it.
-- Removals stay closed, since nobody chose to keep those spots open.
WITH steps AS (
  SELECT "eventId", "role", "invitedAt" AS at, 1 AS ord, "id", -1 AS delta
  FROM "EventAssignment"
  UNION ALL
  SELECT "eventId", "role",
    CASE
      WHEN "status" = 'DECLINED' THEN "updatedAt"
      WHEN "status" = 'EXPIRED' THEN COALESCE("lapsedAt", "expiresAt")
      ELSE "expiresAt"
    END,
    0, "id", 1
  FROM "EventAssignment"
  WHERE "status" IN ('DECLINED', 'EXPIRED')
     OR ("status" = 'PENDING' AND "expiresAt" <= NOW())
),
running AS (
  SELECT "eventId", "role", delta,
    SUM(delta) OVER (
      PARTITION BY "eventId", "role"
      ORDER BY at, ord, "id"
      ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) AS reached
  FROM steps
),
unmatched AS (
  SELECT "eventId", "role", SUM(delta) - LEAST(0, MIN(reached)) AS open
  FROM running
  GROUP BY "eventId", "role"
),
filling AS (
  SELECT "eventId", "role", COUNT(*) AS filling
  FROM "EventAssignment"
  WHERE "status" = 'ACCEPTED'
     OR ("status" = 'PENDING' AND "expiresAt" > NOW())
  GROUP BY "eventId", "role"
),
needed AS (
  SELECT u."eventId", u."role", COALESCE(f.filling, 0) + u.open AS spots
  FROM unmatched u
  LEFT JOIN filling f ON f."eventId" = u."eventId" AND f."role" = u."role"
)
UPDATE "Event" AS e
SET "roleSpots" = n.spots
FROM (
  SELECT "eventId", jsonb_object_agg("role"::text, spots) AS spots
  FROM needed
  WHERE spots > 1
  GROUP BY "eventId"
) AS n
WHERE e."id" = n."eventId";
