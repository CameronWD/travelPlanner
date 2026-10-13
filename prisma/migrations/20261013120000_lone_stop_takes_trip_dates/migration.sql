-- ADR 0073: a dated Trip's only Stop takes the Trip's dates.
-- One-off backfill for Trips already in the lone-rough-Stop state. Per plan:
-- the real plan (forkId IS NULL) and each Fork count their own Stops.
-- Timezone is left as-is (NULL reads as UTC); the app never revisits it; set
-- it by hand after deploy for the rows the rehearsal count lists (DEPLOY.md).
--
-- Rehearsal count (DEPLOY.md): run before deploying, record the number.
--   SELECT count(*) FROM "Stop" s JOIN "Trip" t ON t."id" = s."tripId"
--   WHERE t."startDate" IS NOT NULL AND t."endDate" IS NOT NULL AND s."arriveDate" IS NULL
--     AND (SELECT count(*) FROM "Stop" s2 WHERE s2."tripId" = s."tripId"
--          AND s2."forkId" IS NOT DISTINCT FROM s."forkId") = 1;
UPDATE "Stop" s
SET "arriveDate" = t."startDate",
    "departDate" = t."endDate",
    "nights"     = NULL
FROM "Trip" t
WHERE t."id" = s."tripId"
  AND t."startDate" IS NOT NULL
  AND t."endDate" IS NOT NULL
  AND s."arriveDate" IS NULL
  AND (SELECT count(*) FROM "Stop" s2
       WHERE s2."tripId" = s."tripId"
         AND s2."forkId" IS NOT DISTINCT FROM s."forkId") = 1;
