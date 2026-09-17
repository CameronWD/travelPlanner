# Reminders rebuild — follow-ups

Everything deliberately deferred while building the Alarm + Digest rebuild
(ADR 0047, branch `feat/reminders-end-to-end`, merged 2026-09-17). Each item
was raised by a review, judged real, and consciously not fixed — either
because it needed infrastructure the task did not have, or because fixing it
well meant touching more than the task owned.

**Nothing in this feature has been proven end to end.** 3617 tests run against
a mocked database. As of this merge no push has reached a device, no calendar
app has parsed a published `VALARM`, the migration has never executed, and the
GitHub schedule has never fired. The first real proof is a test send from an
installed iPhone after deploy — not a green suite.

## Before the first deploy

Both of these are also recorded in `docs/DEPLOY.md` §5, which is where a
deploying human should be reading.

1. **Run `SELECT count(*) FROM "Reminder";` against production and stop if it
   is non-zero.** The migration backfills `date` from `fireAt` and deletes the
   retired `COST_DUE` marker rows. It is non-destructive to traveller notes,
   but a non-zero count means something wrote rows by a path nobody has
   modelled, and that fact matters more than the migration.
2. **Confirm all four `VAPID_*` variables are set in Vercel *before* the
   build.** `NEXT_PUBLIC_VAPID_PUBLIC_KEY` is inlined at build time, so setting
   it in the dashboard afterwards does nothing until a redeploy — and
   `PushTimezoneSync` is a silent no-op without it.

---

## 1. A rotated push endpoint orphans its subscription row

**Where:** `public/sw.js`, `server/actions/push.ts`

A push service may rotate an endpoint at any time. The service worker has no
`pushsubscriptionchange` handler, so the stored row keeps pointing at the dead
endpoint until someone presses Enable again. `unsubscribeFromPush` exists and
has no caller anywhere in the app.

The fix needs a new `POST /api/push` route: a service worker cannot invoke a
server action, which is why this was out of scope for the rebuild. It is
partially self-announcing today — a traveller whose only device rotated gets
`sent: 0` with a subscription on file, which releases the claimed Digest slot
and logs the ledger key rather than silently burning the day.

## 2. Home-base departures resolve a country, not a place

**Where:** `lib/digest-dispatch.ts` — `resolveTripZone`

A **Home base** is not a **Stop**, so an outbound leg has no departure Stop to
read a timezone from. It now resolves the trip's own clock via
`guessTimezoneForCountry(homeCountryCode)`, which is country-granular: `au`
maps to `Australia/Sydney`. For a Brisbane departure that prints a 06:00 AEST
flight as **07:00** — the *date* is right, which is what decides whether the
flight appears in the Digest at all, but the wall clock can disagree with the
`VALARM` by the daylight-saving offset inside a multi-zone country.

`Trip.homeLat`/`homeLng` exist; `lib/tz.ts` has no coordinate-to-zone lookup.
Adding one fixes this properly.

## 3. "Reminders" names two different things in the UI

**Where:** `components/trip/settings/reminders-panel.tsx`,
`components/trip/enable-notifications.tsx`, `app/api/cron/reminders/`,
`docs/HANDOFF.md`

`CONTEXT.md` defines a **Reminder** as a dated note and a **Digest** as the
daily push. The Settings card is titled "Reminders" but houses the Digest
opt-in, and the button inside it says "Enable trip reminders". Worse,
`EnableNotifications` still says "Notifications unavailable" / "Notifications
blocked" / "Allow notifications in your browser settings" — and `CONTEXT.md`
reserves **notification** for the Activity bell's unread count.

This wants **one coherent rename**, not a card title edit: the card, the
button, that component's copy, the `/api/cron/reminders` route name, and
`docs/HANDOFF.md`'s "press Enable in Settings → Reminders" deploy step, which
is load-bearing instructions. Do it after the feature has delivered a real
push, so the rename is not tangled up with debugging delivery.

## 4. The timezone refresh only runs on trip screens

**Where:** `app/(app)/trips/[tripId]/layout.tsx`

ADR 0047 says the device timezone is "refreshed on each visit".
`PushTimezoneSync` mounts in the trip layout, so in practice that means each
*trip* visit — not the trips list or the Globe. That covers the December
scenario (a traveller mid-trip is on trip screens constantly). A global mount
in `app/(app)/layout.tsx` would close the gap.

## 5. The first real notification will render without an icon

**Where:** `public/sw.js`

The push handler sets `icon: '/icons/icon-192.png'` and the same path as
`badge`. Nothing serves that path — `app/manifest.ts` serves icons from
`/icon` and `/apple-icon`. Pre-existing, but this branch is what puts the push
path into service for the first time.

## 6. Nothing notices if GitHub disables the schedule

**Where:** `.github/workflows/reminders-cron.yml`

GitHub disables scheduled workflows after 60 days of repository inactivity.
The trip runs from early December into January — exactly when a repo goes
quiet. Nothing in the app or the workflow notices, and the only symptom is
silence, which the Settings panel has deliberately taught the traveller to
read as normal ("A digest is only sent when there is something to say").

Either commit something on a calendar reminder before December, or surface a
"last successful cron run" timestamp somewhere a human looks.

## 7. Overdue checklist items compete for the six-line cap

**Where:** `lib/digest-dispatch.ts`, `lib/digest.ts`

A **Checklist** item persists until done and keeps reappearing while overdue —
correct per `CONTEXT.md`, and the query is deliberately unbounded below.
But `collectLines` puts checklist lines above transport under
`DIGEST_MAX_LINES = 6`, so five stale overdue items would push tomorrow's
flight into "+N more". Wants either a cap on overdue lines or a reordering.

## 8. Smaller items

- **`lib/digest-dispatch.ts`** — the MORNING slot runs the payment, checklist,
  reminder and cost-label queries and then discards all of them. Harmless at
  two users, but the ADR's whole cadence argument is denominated in Neon
  CU-hours, so paying for reads that are unconditionally thrown away is odd.
- **`lib/digest-dispatch.ts`** — the itinerary gate was widened a day at each
  end for the outbound flight; the *trailing* `+1` was not asked for and no
  test pins it. It only widens what may be shown.
- **`components/trip/reminders-card.tsx`** — the unreachable `"passed"` branch
  was removed, so a past-dated reminder would now render "in -31 days".
  Unreachable (the query starts at today); returning a null relative label
  would be the safer shape.
- **`app/api/cron/reminders/route.test.ts`** — a queued `mockResolvedValueOnce`
  survives `vi.clearAllMocks()` and bleeds into the next test, making one
  result order-dependent. An order-dependent test lies to someone eventually.
- **`components/trip/enable-notifications.tsx`** — the installed-PWA and
  iPad-masquerading-as-Mac branches of `isIosWithoutInstall` are verified by
  hand, not by test. That function decides whether an iPhone user ever sees a
  working button.
- **`app/(app)/trips/[tripId]/page.tsx`** — Home runs `requireTripAccess`
  twice per render (the page, then `listRemindersForTrip`). Defence in depth,
  but it is two extra round trips on the most-hit page.
- **Server-action tests repo-wide** — "checks trip access first" asserts the
  call, not its order, so it would not fail if auth moved below the write.
  Inherited pattern; worth fixing once, centrally.
- **`lib/digest-dispatch.ts`** — if the release-on-empty delete itself throws,
  the outer catch attempts a second delete on the same row. Cannot re-open the
  slot; a failed delete is not a successful one.
- **`app/api/calendar/[token]/route.ts`** — stops are selected with
  `arriveDate: { not: null }`, so an Accommodation on a rough Stop resolves to
  UTC and its check-out Alarm fires at 08:00Z. Skipping the Alarm when no zone
  is known beats firing it at a confidently wrong time.
- **Half-hour timezones** — `Asia/Kolkata` and `Asia/Kathmandu` are served by
  adding one cron hour and no code change (the window matcher reads the local
  *hour*). Documented in `docs/DEPLOY.md` §5.
- **Two zones 13h+ apart** — one person with devices in, say, Lisbon and
  Auckland can produce two distinct ledger keys and two real pushes.
  Vanishingly rare; no code today.
