# Trip-proofing before the first real trip

Christmas in Europe 2026 leaves on 4 Dec and returns 8 Jan. Nothing can be
deployed while travelling, so everything that could strand or irritate a
Traveller on a phone with poor signal is fixed now. Source: the 2026-11-17
audit (five read-only passes: on-trip code, offline/PWA/sign-in, unattended
operation, hygiene/backlog, and a phone-size walkthrough).

Build order is the section order. Section A ships even if nothing else does.

Agreed with Cam on 2026-11-17. Items marked *(default)* were Claude's call,
played back and not struck.

## H0. Dependency patch bumps (first, so the whole branch tests them)

- `postal-mime` to 4.2.1 or later (parses untrusted email in Booking import).
- `next` to the latest 16.4.x patch. Read the release notes and
  `node_modules/next/dist/docs/` for anything touching the service worker
  registration, `cookies()`, or redirects.
- The `better-auth` family (`better-auth`, `@better-auth/*`) together to the
  latest 1.7.x. Read the changelog between 1.7.10 and the target for session,
  cookie and OAuth-provider changes.
- `npm audit fix` (no `--force`) for the MCP SDK's transitives.
- No major-version bumps.

## A. Can't-strand-you fixes

### A1. Opening the app offline lands on the Trip

Today `start_url` is `/` (`app/manifest.ts:8`), which redirects a signed-in
Traveller to `/trips` (`app/page.tsx:54`). The service worker caches only
`response.ok` (`public/sw.js:358`), so `/` has no cached entry and a cold
launch offline shows `/offline.html`, which has only "Try again".

- An offline navigation to `/` is answered with the most recently cached Trip
  **Home**, else the cached `/trips`, else `offline.html`.
- `offline.html` lists the saved Trip pages it can find in the cache as links
  (Home first), so it is never a dead end.
- `offline.html` drops "changes you make will sync when you're back online".
  It says saved pages can be read and changes need a connection.
- A cached signed-out Landing must never be what a signed-in Traveller gets
  for `/` offline when a Trip page is cached.

### A2. Tickets open offline (amends ADR 0043)

Today the serve route answers 302 to a presigned storage URL
(`lib/attachment-serve.ts:82`). The warmer's `fetch` either fails on CORS and
is swallowed, or caches a redirected response a navigation cannot use.

- The warm asks the serve route for the bytes: a warm request (a query flag,
  for example `?offline=1`) gets a same-origin 200 with the file streamed,
  never a redirect. Same for the Trip cover route.
- The service worker stores that response under the plain Attachment URL (flag
  stripped), so the link the app renders hits the cache.
- An ordinary online open keeps the redirect. But the worker never stores a
  redirected response: anything with `response.redirected` is rebuilt as a
  fresh `Response` (body, status, headers) before `cache.put`, and a cached
  entry is never returned to a navigation if it is a redirected response.
- Files up to the 10 MiB upload cap must work. Check the current Vercel
  function response limits and stream from storage rather than buffering.
  If a size cannot be served through a function, that file falls back to the
  redirect and is counted as not saved (see B1).
- Access checks on the byte path are the same as today's route.

### A3. Sign-in lasts 120 days and really slides *(default)*

`lib/auth/auth.ts:147` sets 30 days. On a full document load Better Auth
refreshes the session row but the cookie write is swallowed in a Server
Component (`better-auth/dist/integrations/next-js.mjs`), which also uses up
that day's refresh, so the cookie's own expiry rarely moves.

- `expiresIn` becomes 120 days.
- The cookie's expiry is renewed from a place that can write cookies (the
  proxy, a route handler, or a server action the app shell already calls on
  load, such as the Device sync), at most once a day per browser.
- A test proves the behaviour, not just the config: a session older than
  `updateAge` gets a re-issued cookie with a later expiry on an ordinary app
  load.

### A4. Day view does not break sideways

With a **Journal** entry on the day, `sr-only` inputs in the journal editor
escape the day carousel and widen the document (459 to 849px in a 390px
viewport). The carousel scroller (or each panel) becomes a positioned
container. A layout test or audit assertion: document width equals viewport
width on a Day view with a Journal entry, at 390 and 360px.

### A5. Slow network falls back to the saved copy (new ADR 0077)

`networkFirst` (`public/sw.js:352`) waits on the network with no timeout.

- For navigations, when a cached copy exists, race the network against about
  4 seconds; on timeout serve the cached copy and let the fetch finish in the
  background to refresh the cache.
- A 5xx response is treated like a failure when a cached copy exists.
- No cached copy: behaviour is unchanged.
- A page served this way is marked so the app can show it is a saved copy
  (see B3).

## B. Honest offline

### B1. Saved for offline tells the truth

`components/offline-warmer.tsx` ignores failures and always stamps a save.

- Count pages and files attempted and saved. Check `response.ok`.
- The Settings row reads "Saved for offline · 40 of 46 · 2h ago" when
  incomplete, with "Save again". A run with page failures does not start the
  6-hour skip.
- A freshly installed app warms on its first Trip open: retry when the worker
  takes control (`controllerchange`).

### B2. The saved set covers what is used on the road

- Add `/trips`, the Trip's Journal, and for each warmed page the script and
  stylesheet URLs it references, so a section never opened since the last
  deploy is still interactive offline.
- Remove `/today` (it is a redirect).

### B3. A saved copy from another day says so

Home and the Day view render "today" on the server. When the device's date in
the Stop's zone differs from the rendered "today", or the page was served as
a saved copy by A5 or offline, show one line at the top: "Saved Thu 10 Dec.
Open today" linking to the right Day view. Client-side only.

### B4. Offline writes keep what was typed *(default: no queue, ADR 0016 stands)*

- Journal save and autosave, journal photo upload, checklist add / edit /
  need-to-buy / reorder: catch the rejection, keep the input on screen, show
  the shared offline message (`components/ui/failure-message.ts`).
- Cost add and edit (`cost-editor.tsx`, `other-cost-editor.tsx`): same; the
  dialog stays open and says why.
- Sweep the remaining `startTransition(async` sites reachable from the
  travelling surfaces (Home, Day view, Money, Checklists, Journal, Files) for
  the same missing catch.

### B5. Sign out offline cannot wipe the saved Trip by accident

`components/ui/sign-out-button.tsx` clears every cache before trying to sign
out. Offline, ask first ("You're offline. Signing out removes the saved copy
of your trips from this phone."). Clear the cache only after sign-out
succeeds, or after that confirmation.

## C. The Today view on a phone (Travelling Home)

Order, top to bottom:

1. **Day line**: "Day 12 of 35 · Paris" and today's date.
2. **Now / next card**: the Transport in progress if there is one ("Arrives
   London 09:30"); otherwise the next timed thing today; otherwise the next
   departure. A departure always shows its date and route ("Sat 19 Dec 07:02 ·
   Paris to London"); the hours countdown shows only when it is within 24
   hours. Two buttons: **Directions** and **Day map**.
3. **Today's plan**: rows open the read-only details (D1).
4. **Tonight's stay**: name, address (maps link), confirmation number with
   copy, check-in time, notes, files.
5. **Quick actions**: Add a cost, Journal, Files, Checklists
   (`components/trip/home/quick-actions.tsx` already defines a travelling
   set that nothing renders).
6. **Still to book**: only when something is outstanding.
7. Upcoming payments and the rest as today.

- The cover photo and the What's new card are not shown on the Travelling
  Home on phones. The cover stays on the Trips list; What's new stays under
  More.
- **Directions** opens Google Maps (Apple Maps where there is no Google link)
  from the phone's current location to the place, using the Stop's **Local
  travel mode**, public transport when unset. Today's plan row arrows do the
  same for today and become 44px targets.
- **Where you are** uses one rule on Home and the Trips list. On a
  **Changeover day** it names the Stop being left until that day's Transport
  departs, then the arriving Stop.
- Transport rows on Home show Stop names, not the literal "Home", where a
  name exists.
- Desktop Travelling Home is unchanged apart from shared components.

## D. Read-only details

### D1. Tapping a thing shows it, not its form

On a phone, when the Trip's **Phase** is Travelling or Past, tapping a
Transport, Accommodation or Item (on Home, the Day view and the Timeline)
opens a read-only sheet:

- title and times (each end in its own zone, as today);
- files first, each a full-width tappable row;
- booking reference / confirmation number with a copy button;
- address with a maps link, Directions;
- notes, link, Try list, opening hours, cost and paid state where present;
- **Edit**, which opens today's form.

Planning phases and desktop are unchanged. A Surprise the viewer is being
surprised with shows nothing more than it does today.

### D2. Tap targets

- Files page: the whole card opens the file; delete stays a separate icon
  with its confirmation.
- Attachment links on rows get a 44px hit area.
- More sheet: Files, Checklists and Journal come first while Travelling.

### D3. The confirmation nag leaves day rows while Travelling *(default)*

"No booking confirmation yet · Nothing to attach" is not rendered on Home and
Day view rows when the Phase is Travelling or Past. Files keeps its "Booking
confirmations to add" section.

## E. Day view and Money

- **Day view header while Travelling on a phone**: the trip switcher, Share
  and Notifications row collapses, and the Weather card is a one-line strip
  that expands on tap, so the plan starts in the first screen.
- **Money**: a "Recent" list of the latest Costs (including one just added
  and paid) with a link to all Costs. Group by Day includes standalone Costs
  on the day they were paid, else due, with a "Not on a day" row for the
  rest so the days sum to the total.
- **Flags** about two things ("Tight on 9 Dec: only 0 min between…") name
  both things. Applies to the app and the MCP `get_flags` detail text.

## F. Digest and unattended running

- **Digest hours**: extend `DIGEST_CRON_UTC_HOURS` (`lib/digest-schedule.ts`)
  and `.github/workflows/digest-cron.yml` together so Asia/Makassar,
  Asia/Bangkok, Europe/London (and Dublin), Europe/Berlin (Paris, Rome) and
  Australia/Brisbane each get a morning and an evening slot plus one backup
  run, and move off minute :00. The 18-hour per-person cooldown already
  absorbs doubles; the test table grows to match.
- **Device timezone**: `components/account/device-sync.tsx` also runs when
  the app returns to the foreground (`visibilitychange`), throttled.
- **Cron fails loudly**: both cron workflows exit non-zero on any non-2xx.
- **Storage guard**: when running on Vercel production with the local-disk
  driver, uploads and the app's storage access throw a clear configuration
  error rather than writing to ephemeral disk. Must not break local dev,
  tests or preview builds.
- **Trip today at the ends**: before the first Stop and after the last, the
  Trip's "today" uses the Trip's Home timezone when set (`lib/tz.ts:488`).

## G. Small fixes

- Journal date hydration mismatch (`components/trip/journal-editor.tsx:359`):
  use the formatter in `lib/dates.ts`.
- `formatMoneyCompact` (`lib/money/money.ts:246`) sets
  `minimumFractionDigits: 0` so Node 22 and 24 agree (`$0`, `$1K`). CI goes
  green on Node 22.
- Editing a Home leg keeps its stored departure point
  (`server/actions/transport.ts:135,295`) *(default; closes HT-02)*.
- Deleting a Surprise Item or Stop deletes its Reminders (closes CF-06).
- Notifications bell copy: "You updated the cost cost" reads properly.
- Add a cost while Travelling: Description defaults from the Category when
  left blank.

## H. Cleanup (last)

- Delete the local branches already merged into main. After the merge to
  main, fast-forward `beta` to main and push it. Beta is kept, not tested on.
- Backlog: one short `docs/open.md` holding what is really open (the audit's
  "can wait" list minus dev-only minors, plus anything this branch defers).
  `docs/open-follow-ups.md`, `docs/things-to-fix.md`,
  `docs/architecture-sitrep-2026-09-22.md`,
  `docs/rollout-gate-manual-verify.md`, `docs/follow-ups/` and the stale
  `SPEC.md` and `ONBOARDING.md` move to `docs/archive/` untouched. The
  sweep `--execute` warning from the rollout gate moves into `DEPLOY.md`.
  References to the moved files are updated.
- Dead code: `components/plan/mobile/pick-day-sheet.tsx` and its test, the
  knip-reported unused exports and types.
- `.env.example` model default corrected.

## Not in this work

An offline write queue; offline maps; dark mode; in-app transit; the Cache
Components migration; major dependency upgrades; the roughly 250 backlog
items sorted as "can wait".

## Verification

- Per task: the tiers in CLAUDE.md.
- Offline work (A1, A2, A5, B1 to B3) is proven against `next build` +
  `next start` on localhost with the service worker registered, driven by
  Playwright with `context.setOffline(true)`: cold launch at `/` offline,
  open a PDF Attachment offline, slow-network fallback, the saved count.
  The local-disk driver already serves bytes, so the byte path is exercised
  by forcing the redirect branch in a test double and by the production
  check below.
- Once per branch: `npm test`, `npm run build`, `npm run test:integration`.

## Cam's steps (after the branch is merged and deployed)

1. Confirm the deploy is live (also closes Feedback `cmwdagfzt000108l323mrgv7v`).
2. Vercel: `STORAGE_DRIVER=r2` and the R2 variables; the four VAPID
   variables; Node version; `CRON_SECRET` matches GitHub.
3. GitHub: failed-workflow emails on; run "Digest cron" once by hand.
4. Neon November usage; Google quotas on 1 Dec; Anthropic spend limit;
   clear `/admin` errors; Recently deleted empty.
5. Both phones, after the final deploy: sign out and in once (new session
   length), open every section, "Save again" until it shows the full count,
   then airplane mode: cold launch from the home screen, open a PDF ticket,
   tap through each section.
6. `npm run travel-times:refresh -- --execute`.
