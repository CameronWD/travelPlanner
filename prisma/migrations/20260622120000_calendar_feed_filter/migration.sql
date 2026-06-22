-- Add per-feed type filters to CalendarFeed (default true = publish everything).
ALTER TABLE "CalendarFeed" ADD COLUMN "includeTransport" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "CalendarFeed" ADD COLUMN "includeAccommodation" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "CalendarFeed" ADD COLUMN "includeActivities" BOOLEAN NOT NULL DEFAULT true;
