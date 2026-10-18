-- CONTEXT.md "Booking state" (Branch 2 final fix wave, I4): a drive (a CAR
-- Transport leg) needs no booking unless it carries a reference or the
-- Traveller chose a state (lib/booking-state.ts transportBookingSubject). The
-- Branch 1 backfill derived every unchosen leg without a reference as To book;
-- this re-derives the unchosen drives. A book-by date only rides with To book,
-- so it goes too. Data only, and idempotent: safe to re-run after deploy for
-- rows the old build wrote during the deploy window.
-- drive-booking-default:begin
UPDATE "Transport" SET "bookingState" = 'NONE', "bookBy" = NULL
WHERE "bookingStateSet" = false AND "mode" = 'CAR' AND NULLIF(btrim("reference"), '') IS NULL;
-- drive-booking-default:end
