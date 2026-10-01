-- Projection moves from Production into the new Media team. Whoever handles
-- Production today keeps getting Projection's alerts: each Production lead,
-- "Also notify" and event cover is copied onto Media, for an owner to change
-- in Settings → Staffing Alerts.
--
-- A separate migration from the one that adds MEDIA, because Postgres won't
-- use an enum value in the same transaction that added it.

-- Each service type's Production lead leads Media too
INSERT INTO "TeamLead" ("id", "category", "serviceTypeId", "organizationId", "userId", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, 'MEDIA'::"RoleCategory", lead."serviceTypeId", lead."organizationId", lead."userId", lead."createdAt", lead."updatedAt"
FROM "TeamLead" lead
WHERE lead."category" = 'PRODUCTION'::"RoleCategory"
ON CONFLICT DO NOTHING;

-- Everybody on Production's "Also notify" is on Media's
INSERT INTO "TeamWatcher" ("id", "category", "serviceTypeId", "organizationId", "userId", "createdAt")
SELECT gen_random_uuid()::text, 'MEDIA'::"RoleCategory", watcher."serviceTypeId", watcher."organizationId", watcher."userId", watcher."createdAt"
FROM "TeamWatcher" watcher
WHERE watcher."category" = 'PRODUCTION'::"RoleCategory"
ON CONFLICT DO NOTHING;

-- An event's Production cover covers Media too, on events with Projection on
-- them. Anywhere else there's nothing for it to cover.
INSERT INTO "EventTeamLead" ("id", "category", "eventId", "organizationId", "userId", "createdAt")
SELECT gen_random_uuid()::text, 'MEDIA'::"RoleCategory", cover."eventId", cover."organizationId", cover."userId", cover."createdAt"
FROM "EventTeamLead" cover
JOIN "Event" event ON event."id" = cover."eventId"
WHERE cover."category" = 'PRODUCTION'::"RoleCategory"
  AND (
    'PROJECTION_TECH'::"VolunteerRole" = ANY(event."rolesNeeded")
    OR EXISTS (
      SELECT 1
      FROM "EventAssignment" assignment
      WHERE assignment."eventId" = event."id"
        AND assignment."role" = 'PROJECTION_TECH'::"VolunteerRole"
    )
  )
ON CONFLICT DO NOTHING;
