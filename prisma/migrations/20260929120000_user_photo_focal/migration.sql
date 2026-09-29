-- Profile photo focus point (CONTEXT.md "Profile photo": the spot the
-- Traveller chose to sit at the centre of every avatar circle). Nullable and
-- additive: NULL means "centre", which is exactly how every existing photo —
-- already centre-cropped before upload — renders today.
ALTER TABLE "User" ADD COLUMN "photoFocalX" DOUBLE PRECISION;
ALTER TABLE "User" ADD COLUMN "photoFocalY" DOUBLE PRECISION;
