-- Per-trip driving-estimate settings. NOT NULL + defaults backfill existing rows.
ALTER TABLE "Trip" ADD COLUMN "drivingWindingFactor" DOUBLE PRECISION NOT NULL DEFAULT 1.5;
ALTER TABLE "Trip" ADD COLUMN "drivingAvgSpeedKph" INTEGER NOT NULL DEFAULT 80;
