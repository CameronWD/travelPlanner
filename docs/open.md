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
- **Where you are** A Transport used as a day trip on a changeover or arrival day blanks "Where you are" between its legs; mis-dated legs with no arrival time; the second leg of a two-leg day landing after the arrive date; a leg departing the evening before the depart date (`lib/now-next.ts`).
- **Where you are card** The phone Home keeps a leftover "Where you are" card beside Now / next (redundant, not contradictory).
- **Check-in** "Check-in" shows on every night of a stay, not only the first.
- **Trip header** On the phone Home the Trip header (name, dates, avatars, Share, bell) takes about 250px before the day line.
- **Row tap at 640px** Rows open the edit form at 640px and up (phone landscape).
- **What's around in transit** "What's around" while in transit creates a dated Item with no Stop.
- **Open today zone** "Open today" uses the saved copy's zone, so a copy rendered in Bali and read in Europe shows Bali's today.
- **Day view focus** Focus drops to the page on every Day view day change (header arrows, chips and strip arrows), because the page remounts.
- **Day map back and offline** The phone back gesture leaves the Day view instead of closing the Day map; offline, Home's Day map link opens the Day view without the map.
- **Walk directions** At a Walk Stop "Directions from here" always opens walking directions.
- **Day view header width** From the xl breakpoint the Day view header keeps its buttons in the date row; with five avatars and the widest heading the date sits left of centre rather than overlapping.
- **Departure day** If a Trip's start date is the first Stop's arrive date and the outbound flight leaves the day before, departure day is not a Trip day (`lib/trip-phase.ts` ~31).
- **Calendar feed zone** The calendar feed reads a timed Item with no Stop as UTC (`lib/ics.ts` ~180).

## Correctness

- **CF-10** `add_reminder` / `update_reminder` check `notes` with `max(2000)` before trimming (`lib/mcp/tools/lists-write.ts` 136, 164). A: `open-follow-ups.md`
- **FT-02** Compare passes no `hiddenStopIds` / `hiddenItemIds` to `detectFlags` (`lib/compare.ts` ~400); a Surprise's real Flags could leak into a Fork's count. A: `open-follow-ups.md`
- **FT-04** `get_wishlist` ideas carry no Try list or Opening hours (`lib/mcp/reads/lists.ts` `WISHLIST_IDEA_SELECT`). A: `open-follow-ups.md`
- **RV-01** Claude cannot Apply or Dismiss a Finding; `lib/mcp/tools/reviews.ts` has only `get_review`, `list_reviews`, `review_trip`. A: `open-follow-ups.md`
- **RV-02** More than 50 Reviews cannot be paged (`HISTORY_LIMIT = 50`, `lib/review-reads.ts`). A: `open-follow-ups.md`
- **BI-01** The Booking import's 10 MB limit is about 4 MB on Vercel; fix is a presigned R2 upload. A: `follow-ups/2026-10-14-booking-import.md`
- **BI-02** The Booking import rate limit is per server instance (`server/actions/booking-import.ts` ~30); count `AiUsage` rows instead. A: `follow-ups/2026-10-14-booking-import.md`
- **Booking import, city names** (2026-11-25) A shorter English name widens the 4-letter containment match: "Frankfurt am Main" reported as "Frankfurt" lands on a Stop called "Frankfurt (Oder)" in the same country (`lib/booking-import/match.ts`, `sameCity`). A booking in a nearby town (a hotel in Kehl for the Strasbourg Stop, Malpensa for Como) still proposes or picks by name, not by distance. A place whose printed country is not recognised folds into a lone same-named proposed Stop as if no country were printed (`lib/booking-import/build.ts`).
- **Trips list masking** "Now in ..." on the Trips list uses raw Stop names with no Surprise masking (`lib/trips/trips-page-loader.ts`); pre-existing.
- **MCP link string** MCP Item create and update accept an unvalidated link string (`lib/mcp/tools/plan-write.ts` 118, 136); the render-time guard `safeWebHref` covers display.
- **Surprise Reminders** `unscheduleItem`'s placed-copy delete and fork promote do not clean up a Surprise's Reminders (`deleteStop` does).
- **Forks today** `server/actions/forks.ts` callers compute "today" without the Home timezone.
- **Marked fine revival** A mark comes back if a thing is inserted between a Marked-fine pair and then removed.
- **Hop modes on duplicate** Duplicating a Trip does not copy Hop modes.
- **Remove What-if plans** (hidden since 2026-11-18, `WHAT_IF_PLANS_HIDDEN` in `lib/what-if.ts`, re-exported from `lib/plan-scope.ts`; remove after the Christmas trip). Bringing the feature back is a revert of the `chore/hide-what-if` branch, not only flipping the constant: the guide, What's new, landing and MCP wording were removed outright. Removal must cover: the `forkId` columns, the fork actions, Compare, the demo seed's "Italy First" Fork, and Fork-owned attachments on Files and in the storage quota. CF-08 (`add_note` / `delete_note` on a Fork) is closed by the hide. The Marked fine copy gap in Compare goes with it.
- **Stale edit overwrite** Edit forms (`item-form-dialog`, `stop-form-dialog`, the other `useEntityForm` forms) send every field and `updateItem` / `updateStop` / `updateCost` have no version check, so a stale form overwrites another Traveller's change; fix is to send only fields that differ from the form's initial values.
- **Create retries** Creates (`createCost`, `createItem`, `addReminder`, `addChecklistItem`, `addNote`) have no idempotency key, so a retry after a lost reply duplicates.
- **createItem transactions** `createItem` writes the Item and its inline Cost in separate transactions (`server/actions/items.ts` ~200, ~243).
- **Cost rate snapshot** Every Cost edit re-snapshots `rateToHome` even when the currency is unchanged (`server/actions/costs.ts` ~228).
- **Uncaught rejections** `delete-stop-dialog`, `day-ideas-rows`, `schedule-item-dialog` and `make-it-fit` do not catch a rejected action; `applyTrim` runs `setStopNights` per Stop with no transaction.
- **Digest toggle** `DigestPanel` says "Check it saved" after a rejected toggle but rolls its switch back and does not refresh (`components/trip/settings/digest-panel.tsx`).

## Auth and access

- **TC-13** Drop the Auth.js tables (`Account`, `Session`, `VerificationToken`) and `User.emailVerified` once main has run on Better Auth for a release; gate `/oauth2/create-client` and `update-client` behind the redirect allowlist; clean up unused registered clients. Tables still in `prisma/schema.prisma`. A: `open-follow-ups.md`
- **ARCH-TEN-12** The service-worker attachment cache is purged only by the Sign out button; an expired session or a second Traveller on the same profile leaves it in place. The trip-proofing branch changes when sign-out clears it (B5) but adds no other purge. A: `architecture-sitrep-2026-09-22.md`
- **Keepalive hardening** Re-issue the session cookie only when its value starts with the validated token; treat a future stamp as stale.
- **Sign-in door** A Sign-in link opens in Safari, not the installed app, and there is no code entry; a lookup failure at the door reads as "sent" or "no spot" (`lib/auth/sign-in-door.ts` ~79).

## Ops

- **RG-01** The daily database dumps were downloadable while the repository was public. Delete the old `neon-backup-*` artifacts, rotate Share, Calendar feed, Invite and Globe invite tokens, decide where backups live. Steps are in `docs/DEPLOY.md` section 5b; whether Cam finished them is not recorded (unverified). A: `open-follow-ups.md`
- **TD-01** Major-version upgrades only (security patches are done): `motion` 14, ESLint 10, `vitest` 5, `typescript` 7, Prisma 8, jest-dom 7, happy-dom 21, jsdom 30, `dotenv` 18, `@anthropic-ai/sdk`; one major per branch. Re-run `npm outdated` first. A: `open-follow-ups.md`
- **Daily Travel-time cron.** Refresh Trips crossing into the 90-day public-transport window and retry expired ERROR rows. Cam chose refresh-on-edit on 2026-11-06, so build only if wanted (`docs/specs/2026-10-30-google-maps.md` ~305, `docs/specs/2026-11-06-google-extras.md` ~227).
- **Error re-notify.** An unresolved `ErrorReport` is not re-notified after N days (from the 2026-11-17 audit; unverified).
- **Digest retries.** A zero-delivery send releases its claim and the backup run retries it; beyond that a failed Digest send is not retried (unverified).
- **Early departures.** No Digest morning run before about 07:17 local in central Europe, so a pre-07:00 departure relies on the evening-before Digest.
- **Booking import billing** Billing errors (non-401/403 4xx) show the generic message with no Admin push; each confirmed Proposal re-uploads the original file; closing the sheet mid-read drops the Proposals.
- **Backups** The restore runbook has no whole-database procedure; R2 files have no backup; cron partial failures return 200.
- **Error recording** `instrumentation.ts` filters Next's control-flow errors with `unstable_rethrow` from `next/navigation`; re-check on a Next upgrade, since a failed import there is swallowed and server errors would stop being recorded.

## Offline

- **Lazy chunks** Chunks loaded only at runtime (dynamic imports) are not saved for offline: maps fall back, and other lazy pieces in a never-opened section may not work offline.
- **Redirect marker** The saved-copy redirect marker is consumed by any navigation.
- **Saved-copy record** The saved-copy record expires after 60 s.
- **Cache growth** The files cache never evicts; the static cache cap (300) has little headroom over its 156 files.
- **Static store cleanup** The service worker deletes static stores older than the previous build without copying cross-store hits forward (`public/sw.js` ~276, ~379), so a deploy can remove chunks saved pages still need.
- **Large file save** Large files are streamed through the function for the offline save with no `maxDuration` (`lib/attachment-serve.ts` ~93).
- **Re-save timer** The 30-second re-save timer restarts a re-save that is still running (slow phone), so some pages are fetched twice (`components/offline-warmer.tsx`); skip when a run begun after the latest stale mark is still saving.

## Performance

- **NAV-01** Adopt Cache Components and partial prefetching, one section at a time, Day view first; `next.config` has no `cacheComponents`. A: `open-follow-ups.md`
- **NAV-03** The Day page still reads its header's bell count, recent activity and members itself (`app/(app)/trips/[tripId]/day/[date]/page.tsx` ~43); move them into trip layout data so a day change runs only `getDays`. A: `open-follow-ups.md`
- **NAV-04** Widen `npm run audit:nav` with hold checks for the trip switcher, browser back, Calendar, Wishlist, More, Help and What's new (unverified). A: `open-follow-ups.md`
- **NAV-05 (remainder)** Watch item: if rapid swiping on the phone feels stuck after the `getDays` change, revisit. A: `open-follow-ups.md` (the struck NAV-05 entry)

## Ideas, not commitments

From the Google maps and extras specs: a compliance refresh cron, Places phone / rating / photos, reordering a day by Route Matrix, severe-weather alerts, Place Photos covers (`docs/specs/2026-10-30-google-maps.md`, `docs/specs/2026-11-06-google-extras.md`, "Not in this work").

- **Usage tracking** (Cam, 2026-11-18) To see what gets used before simplifying: first-party counts of sections opened and actions used per Traveller per day, a trend table on /admin, no third-party tracker. Check what is already recorded first.
- **Mystery destination** (Cam, 2026-11-18) A Surprise that also hides the Stop's name and the Transport's destination; the map, weather, Calendar band, timezone, Digest and tickets would all need handling.
- **Flight delay alerts** (Cam, 2026-11-25) A push when a flight's time, gate or terminal changes or it is cancelled. Needs a real Flight number on a Transport, a flight-status provider (several have free tiers; limits unverified) and a scheduled check in the hours before departure. Not before January.
- **Hops across a split journey** (2026-11-26) On the day of a journey between two Stops made of two Transports, things in the two Stops can still be paired as a hop and flagged as a tight connection; the "a Transport joins these Stops" rule in planHops and flagTightConnections reads one Transport only.
- **Road line for a split drive** (2026-11-26) The route maps draw a straight line between two Stops unless one drive joins them, when they draw its road (routeLegPaths in lib/travel-times/hops.ts). A drive between two Stops made of two Transports that change at a place in between gets the straight line, not the road: neither Transport has both Stops. Drawing it means joining the two drives' road lines into one. A flight or train journey is unaffected: those are straight either way.
- **Short Connection Flag** (Cam, 2026-11-26) Warn when the wait between two Transports of a Connection is too short for the mode. Left out of the Connections work to keep Flags untouched before the freeze.
- **Connection follow-ups** (2026-11-26) The countdown line and the Day view's stop line name only the first Transport of a journey out or home; the trip's soft end stops at a layover when the final Transport is not flagged as arriving Home; the booking import's preview can show a different zone label and duration from the saved card for a place whose country spans several timezones.
- **Adopt a zone on older place ends** (2026-11-26) A Transport end that is a place and was saved before Connections has no zone of its own and still borrows the other end's; it gains one only when its place is changed.
- **Hop back at night** (Cam, 2026-11-26) A Travel time from the day's last thing back to tonight's Accommodation. Left out because the last thing is often not where the day ends; "Directions back" on the Travelling Home covers the real case.
- **Hop mode on the start hop** (2026-11-26) The hop from the Accommodation cannot be set to walk, drive or public transport by hand; a Hop mode is tied to two things to do.
