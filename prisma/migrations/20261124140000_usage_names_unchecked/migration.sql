-- The app checks every name against lib/usage/lists.ts (lib/usage/validate.ts).
-- The database no longer lists them, so adding a name is a code change, not a migration.
ALTER TABLE "UsageRecord" DROP CONSTRAINT "UsageRecord_screen_check";
ALTER TABLE "UsageRecord" DROP CONSTRAINT "UsageRecord_action_check";
ALTER TABLE "UsageRecord" DROP CONSTRAINT "UsageRecord_detail_check";
