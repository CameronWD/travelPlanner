-- CreateTable
CREATE TABLE "UsageRecord" (
    "id" TEXT NOT NULL,
    "screen" TEXT,
    "action" TEXT,
    "detail" TEXT,
    "userId" TEXT NOT NULL,
    "tripId" TEXT,
    "phase" TEXT,
    "mode" TEXT NOT NULL,
    "site" TEXT NOT NULL,
    "appearMs" INTEGER,
    "savedCopy" BOOLEAN NOT NULL DEFAULT false,
    "dayOffset" INTEGER,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UsageRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UsageSwitch" (
    "id" TEXT NOT NULL DEFAULT 'usage',
    "recording" BOOLEAN NOT NULL DEFAULT true,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UsageSwitch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UsageRecord_tripId_occurredAt_idx" ON "UsageRecord"("tripId", "occurredAt");

-- CreateIndex
CREATE INDEX "UsageRecord_occurredAt_idx" ON "UsageRecord"("occurredAt");

-- CreateIndex
CREATE INDEX "UsageRecord_receivedAt_idx" ON "UsageRecord"("receivedAt");


-- Hand-written (Prisma's schema language has no CHECK): the lists are lib/usage/lists.ts.
-- They make free text impossible in the table itself, whatever the app sends;
-- lib/usage/lists.test.ts fails if these lists and the constants drift.
ALTER TABLE "UsageRecord" ADD CONSTRAINT "UsageRecord_kind_check"
  CHECK (num_nonnulls("screen", "action") = 1);

ALTER TABLE "UsageRecord" ADD CONSTRAINT "UsageRecord_screen_check"
  CHECK ("screen" IS NULL OR "screen" IN ('trips', 'globe', 'account', 'help', 'admin', 'new-trip', 'whats-new', 'trip-home', 'plan', 'day', 'money', 'calendar', 'checklists', 'files', 'activity', 'summary', 'print', 'reviews', 'wishlist', 'journal', 'settings', 'trip-help', 'more'));

ALTER TABLE "UsageRecord" ADD CONSTRAINT "UsageRecord_action_check"
  CHECK ("action" IS NULL OR "action" IN ('day-changed', 'day-map-opened', 'directions-tapped', 'attachment-opened', 'weather-detail-opened', 'reminder-got-it', 'search-opened', 'more-opened', 'more-row-chosen', 'add-to-day-opened', 'booking-import-started', 'review-started', 'share-link-opened'));

ALTER TABLE "UsageRecord" ADD CONSTRAINT "UsageRecord_detail_check"
  CHECK ("detail" IS NULL OR "detail" IN ('swipe', 'arrow', 'chip', 'keyboard', 'calendar', 'summary', 'reviews', 'wishlist', 'journal', 'checklists', 'files', 'activity', 'settings', 'help', 'share', 'standard', 'deep'));

ALTER TABLE "UsageRecord" ADD CONSTRAINT "UsageRecord_phase_check"
  CHECK ("phase" IS NULL OR "phase" IN ('sketching', 'planning', 'final-prep', 'travelling', 'past'));

ALTER TABLE "UsageRecord" ADD CONSTRAINT "UsageRecord_mode_check"
  CHECK ("mode" IN ('phone-app', 'phone-browser', 'desktop'));

-- Set by the server from lib/feedback/site.ts, folded onto this list: a
-- preview's raw branch name is free text, so every other branch is 'preview'.
ALTER TABLE "UsageRecord" ADD CONSTRAINT "UsageRecord_site_check"
  CHECK ("site" IN ('main', 'beta', 'preview', 'local'));

-- Length only: a pattern could refuse a real Trip or user id and turn every insert into a 503.
ALTER TABLE "UsageRecord" ADD CONSTRAINT "UsageRecord_ids_check"
  CHECK (char_length("userId") BETWEEN 1 AND 64 AND ("tripId" IS NULL OR char_length("tripId") BETWEEN 1 AND 64));

ALTER TABLE "UsageRecord" ADD CONSTRAINT "UsageRecord_numbers_check"
  CHECK (("appearMs" IS NULL OR "appearMs" BETWEEN 0 AND 120000) AND ("dayOffset" IS NULL OR "dayOffset" BETWEEN -1000 AND 1000));

-- The Surprise rule strips day offsets per Trip, so an offset with no Trip
-- could never be checked against one.
ALTER TABLE "UsageRecord" ADD CONSTRAINT "UsageRecord_offset_trip_check"
  CHECK ("dayOffset" IS NULL OR "tripId" IS NOT NULL);
