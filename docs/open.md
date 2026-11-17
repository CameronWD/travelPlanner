# Open

The only live list of what is still open. Add to it; strike nothing, delete a line when it is done. Every other backlog is in `docs/archive/` and is history: do not mine it for work without checking the code first. Last audited 2026-11-17 against the code (`(unverified)` means the described state was not re-checked then).

Paths marked A: are under `docs/archive/`.

## On the trip

- **CF-01** Rough Stops firmed up (`firmUpSegment`, `firmUpTrip`) take the first Stop's zone, not their own place's (`server/actions/stops.ts` ~948, ~1077). A: `open-follow-ups.md`
- **CF-02** The Booking import proposes the country's zone and confirming sends it as a chosen zone (`lib/booking-import/build.ts` ~322). A: `open-follow-ups.md`
- **CF-11** A Stop form saved before the point-zone lookup loads sends the country's zone (`components/trip/stop-form-dialog.tsx` ~297-315). A: `open-follow-ups.md`
- **BI-05** One zone per country for a proposed Stop in a multi-zone country (US, Australia, Canada, Brazil); same root as CF-02. A: `follow-ups/2026-10-14-booking-import.md`
- **HT-01** Budget views still put a Home flight's cost on its UTC day: Summary, Print, Compare, `lib/past-home-loader.ts` pass no `homeTimezone` to `buildBudget`; the desktop Home loader (unverified). A: `open-follow-ups.md`
- **PM-03** An overdue book-by looks like a future one: `BookingStateBadge` shows "Book by <date>" with no overdue styling. A: `open-follow-ups.md`
- **FT-07** An overnight Item starting just before closing is not flagged (`flagOutsideOpeningHours`, `lib/flags.ts` ~1141 skips the check once `end <= start`). A: `open-follow-ups.md`

## Correctness

- **CF-08** `add_note` and `delete_note` do not check the target is in the real plan, so Claude can write on a Fork (`lib/mcp/tools/plan-write.ts` ~428). A: `open-follow-ups.md`
- **CF-10** `add_reminder` / `update_reminder` check `notes` with `max(2000)` before trimming (`lib/mcp/tools/lists-write.ts` 136, 164). A: `open-follow-ups.md`
- **FT-02** Compare passes no `hiddenStopIds` / `hiddenItemIds` to `detectFlags` (`lib/compare.ts` ~400); a Surprise's real Flags could leak into a Fork's count. A: `open-follow-ups.md`
- **FT-04** `get_wishlist` ideas carry no Try list or Opening hours (`lib/mcp/reads/lists.ts` `WISHLIST_IDEA_SELECT`). A: `open-follow-ups.md`
- **RV-01** Claude cannot Apply or Dismiss a Finding; `lib/mcp/tools/reviews.ts` has only `get_review`, `list_reviews`, `review_trip`. A: `open-follow-ups.md`
- **RV-02** More than 50 Reviews cannot be paged (`HISTORY_LIMIT = 50`, `lib/review-reads.ts`). A: `open-follow-ups.md`
- **BI-01** The Booking import's 10 MB limit is about 4 MB on Vercel; fix is a presigned R2 upload. A: `follow-ups/2026-10-14-booking-import.md`
- **BI-02** The Booking import rate limit is per server instance (`server/actions/booking-import.ts` ~30); count `AiUsage` rows instead. A: `follow-ups/2026-10-14-booking-import.md`

## Auth and access

- **TC-13** Drop the Auth.js tables (`Account`, `Session`, `VerificationToken`) and `User.emailVerified` once main has run on Better Auth for a release; gate `/oauth2/create-client` and `update-client` behind the redirect allowlist; clean up unused registered clients. Tables still in `prisma/schema.prisma`. A: `open-follow-ups.md`
- **ARCH-TEN-12** The service-worker attachment cache is purged only by the Sign out button; an expired session or a second Traveller on the same profile leaves it in place. The trip-proofing branch changes when sign-out clears it (B5) but adds no other purge. A: `architecture-sitrep-2026-09-22.md`

## Ops

- **RG-01** The daily database dumps were downloadable while the repository was public. Delete the old `neon-backup-*` artifacts, rotate Share, Calendar feed, Invite and Globe invite tokens, decide where backups live. Steps are in `docs/DEPLOY.md` section 5b; whether Cam finished them is not recorded (unverified). A: `open-follow-ups.md`
- **TD-01** Major-version upgrades only (security patches are done): `motion` 14, ESLint 10, `vitest` 5, `typescript` 7, Prisma 8, jest-dom 7, happy-dom 21, jsdom 30, `dotenv` 18, `@anthropic-ai/sdk`; one major per branch. Re-run `npm outdated` first. A: `open-follow-ups.md`
- **Daily Travel-time cron.** Refresh Trips crossing into the 90-day public-transport window and retry expired ERROR rows. Cam chose refresh-on-edit on 2026-11-06, so build only if wanted (`docs/specs/2026-10-30-google-maps.md` ~305, `docs/specs/2026-11-06-google-extras.md` ~227).
- **Error re-notify.** An unresolved `ErrorReport` is not re-notified after N days (from the 2026-11-17 audit; unverified).
- **Digest retries.** A failed Digest send is not retried (from the 2026-11-17 audit; unverified).

## Performance

- **NAV-01** Adopt Cache Components and partial prefetching, one section at a time, Day view first; `next.config` has no `cacheComponents`. A: `open-follow-ups.md`
- **NAV-03** The Day page still reads its header's bell count, recent activity and members itself (`app/(app)/trips/[tripId]/day/[date]/page.tsx` ~43); move them into trip layout data so a day change runs only `getDays`. A: `open-follow-ups.md`
- **NAV-04** Widen `npm run audit:nav` with hold checks for the trip switcher, browser back, Calendar, Wishlist, More, Help and What's new (unverified). A: `open-follow-ups.md`
- **NAV-05 (remainder)** Watch item: if rapid swiping on the phone feels stuck after the `getDays` change, revisit. A: `open-follow-ups.md` (the struck NAV-05 entry)

## Ideas, not commitments

From the Google maps and extras specs: per-hop override of the way a hop is travelled, a compliance refresh cron, Places phone / rating / photos, reordering a day by Route Matrix, severe-weather alerts, Place Photos covers (`docs/specs/2026-10-30-google-maps.md`, `docs/specs/2026-11-06-google-extras.md`, "Not in this work").
