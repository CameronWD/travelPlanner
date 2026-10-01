# Spec — Landing card fan, Trip home stats, Help restructure, sign-in deep links, offline (2026-10-01)

**Source of truth for the Landing:** the handoff at
`design_handoff/landing-shuffle-handoff/` (`LANDING.md`, `README.md`,
`app/landing/sample-trips.ts`, the three images, the reference mock). Build
what `LANDING.md` says. **This spec records only where we depart from or fill
gaps in it**, plus the four other pieces of work agreed in the 2026-10-01
interview. Where this file and the handoff disagree, this file wins.

Branch: `feat/landing-shuffle-2026-10-01`. One branch, five parts, each
ending green (`npm test`, typecheck, lint, build). Nothing merges or deploys
without Cam's go-ahead; target is `main`.

| Part | Contents |
|---|---|
| 1 | Landing card fan + shuffle + ribbon (§A), Google button G + press feedback (§B), tester wording + first-sign-in welcome (§G) |
| 2 | Trip home: stats column between number and photo (§C) — `Resolves-Feedback: cmunprdsr000004l6da68grrp` |
| 3 | How to use Teepee restructure with a sticky "On this page" rail (§D) |
| 4 | Sign-in deep links survive the Landing (§E) + stale `/signin` docs |
| 5 | Offline: graceful failure, wider warm, "Saved for offline" (§F) + audit doc + ADR 0016 amendment |

**Out of scope:** offline editing / a mutation queue (ADR 0016 stands), a
"Download trip" button, warming more than the last-opened trip, cache
clearing on session expiry (ARCH-TEN-12 stays a follow-up), a sign-in page.

---

## A. Landing card fan (handoff `LANDING.md`, verbatim, with these notes)

- `app/landing/sample-trips.ts` is copied verbatim from the handoff.
- `sample-cards.tsx` becomes `"use client"`; `useTripShuffle(pieceOrder)` as
  §5.2, Web Animations API, `flushSync` for the commit (never rAF). The two
  trees (phone/desktop) each own a hook instance and rotate independently.
- Narrow phones (`LANDING.md` §2.2, under 380px): use a `max-[379px]:`
  variant on the side-card and front-card widths.
- Icons: lucide `Sun`/`Cloud`/`ArrowRight`/`RefreshCw`/`Check`/`Heart` for
  the mock's glyphs. No unicode arrows or hearts remain in the landing.
- The existing `Initials` helper and `entrance()` stay; `entrance` keeps
  the uneven delays.
- `globals.css`: add `tp-marquee` (§5.4) next to `tp-card-in` and rewrite
  the "nothing loops" comment — the ribbon is now the one looping element.
- Accessibility exactly as §6: no `aria-hidden` on the two containers; every
  decorative piece `aria-hidden`; the front card is the only focusable
  element, a `<button aria-label="Show another sample trip">` using
  `pressable`; no live region.
- Tests as §7. **`scripts/landing-cards-audit.ts` is retired** (and its
  `audit:landing-cards` script, `scripts/landing-cards-audit/` and the
  `.verify` mention in docs): the fan is fixed-pixel and symmetrical, the
  jsdom tests cover piece count, classes and the one-button rule, and the
  Playwright audit checked a coverage property that no longer exists.
- `LandingActions` gains `align?: "start" | "center"`; the legal row is
  `whitespace-nowrap` in both modes and `justify-center` on phone.
- Glossary: CONTEXT.md "Landing" now describes the **card fan** (done in the
  interview).

## B. Google sign-in button (`app/landing/signin-buttons.tsx`)

- **The G:** Google's official four-colour "G" as an inline SVG component
  (`components/ui/google-mark.tsx`, 18px, `aria-hidden`), left of the label
  on the outline button. Not recoloured.
- **Press feedback:** on click the button sets the kit Button's `loading`
  prop (spinner replaces the G, button disabled, `aria-busy`) and the label
  becomes "Opening Google…". It resets on `pageshow` (bfcache return) and if
  `signIn` rejects. The dev "Continue as …" buttons get the same treatment
  with "Signing in…".
- One component, so all three panel modes (Sign in, Ask to join, denied)
  show the G and the loading state.
- Tests: the G renders inside the button; clicking sets `aria-busy` and the
  "Opening Google…" label and calls `signIn("google", { callbackUrl })`.

## C. Trip home countdown tile (`components/trip/home/desktop/countdown-tile.tsx`)

Feedback note `cmunprdsr000004l6da68grrp` (Trip home, 1800×1008): the stats
row above the number pushes the countdown down and clips the first-leg line.

- **With a photo:** the at-a-glance stats become a **vertical column between
  the number block and the polaroid**, not a row above the number. The left
  column holds chip, then (bottom-aligned) number + first leg. The stats
  column is `hidden` below a width where it would crowd the number — use a
  container query on the tile (`@container`), stats column shown from a
  tile width that fits number + column + polaroid with the 132px number
  (expected ≈ `@[52rem]`; the implementer measures and records the value in
  the component comment). **When it doesn't fit, the stats don't show at
  all** (Cam's call), they do not wrap back into a row.
- **Without a photo:** unchanged (row under the chip).
- The first-leg line must never be clipped at 1800×1008 with a photo and
  four stats; add a test that with a photo the stats list is a sibling
  between the number block and the polaroid, and that `aria-label="Trip at a
  glance"` is still present.
- Commit trailer: `Resolves-Feedback: cmunprdsr000004l6da68grrp`. Do **not**
  run `feedback:resolve`.

## D. How to use Teepee (`app/(app)/help/page.tsx`, `components/trip/help-guide.tsx`, `lib/help-guide.ts`)

Top to bottom, on both `/help` and `/trips/[tripId]/help`:

1. **What Teepee is** — one paragraph, two or three sentences, plain words:
   a place to plan a trip with the people going on it, from rough idea to
   the days you're away, and to look back on it after.
2. **The walkthrough** — "The life of one trip", six steps, each one or two
   lines with a link that jumps into the app (trip-scoped links when a
   `tripId` is present, otherwise the generic page):
   1. Make a trip (New trip: name, rough month or dates, home base).
   2. Sketch the stops (Plan: rough stops and nights, in order).
   3. Firm up the dates (Plan: firm up from the start, pin what's booked).
   4. Fill the days (Plan/day: things to do, beds and the trains between).
   5. Put money on it (Money: costs, who paid, what's owed).
   6. Bring your people (Share: invite, share a link, forks and comparing).
   This replaces the current "The 60-second version" section.
3. **What the buttons mean** (the legend), unchanged content, demoted here.
4. **Day to day**, **Going deeper**, **Word list** — the existing sections,
   all collapsed by default, content unchanged except the HG-03 fix: the
   "While you're away" paragraph says changes need a connection **except a
   Feedback note, which waits and sends itself when you're back**, and
   mentions "Saved for offline" in Settings (§F).
5. **"Expand all"** moves from the top to sit at the head of "Day to day".

**Sticky rail:** from `lg`, the guide runs beside a sticky `nav
aria-label="On this page"` in the same style as `components/legal/legal-page.tsx`
(label, 13px links, `lg:sticky lg:top-6 lg:self-start`, max-height with its
own scroll like What's new). Entries: the walkthrough, the legend, then every
section heading grouped under its group label. Clicking an entry for a
collapsed section opens it (reuse the `help-hash-open` mechanism) and scrolls
to it. The rail replaces the "What's in here" chip box from `lg`; below `lg`
the chip box stays at the top and the rail is absent. Extract the rail into
`components/ui/on-this-page.tsx` and have the legal page use it too, so there
is one implementation.

`HELP_SECTIONS` in `lib/help-guide.ts` gains the two new sections (what it
is, walkthrough) and drops "The 60-second version"; `GUIDE_UI_STRINGS` keeps
pinning quoted control names. Update `help-guide.test.tsx`, `help/page.test.tsx`
and the trip help page test for the new order and the rail.

## E. Sign-in deep links (`app/(app)/layout.tsx`, `app/(focus)/layout.tsx`, `lib/guards.ts`)

- Each signed-out `redirect("/")` becomes `redirect("/?callbackUrl=" +
  encodeURIComponent(currentPath))`, where `currentPath` is the requested
  pathname + search. The Landing already passes `callbackUrl` through
  `safeCallbackPath` (same-origin only) to the sign-in buttons, so after
  sign-in the visitor lands where they were going. Share links are
  unchanged.
- Getting the current path in a server layout: read it from the
  `x-pathname`/URL header set by `proxy.ts` (add it there if absent), with a
  test in `proxy.test.ts`. Never trust `referer`.
- Docs: ADR 0057 lines that say `pages.signIn`/`pages.error` point at
  `/signin` and "`/signin`'s refusal card" get an amendment note dated
  2026-10-01 saying both point at `/` and the refusal opens the Landing's
  panel. `lib/guards.ts` comment says "to the Landing". The landing-kit and
  landing-collage specs get a one-line "superseded: no `/signin` page" note
  at the top. No new route.

## F. Offline (`lib/offline.ts`, `public/sw.js`, `components/offline-warmer.tsx`, `components/ui/use-server-action.ts`, `components/trip/itinerary-manager.tsx`)

Decisions (interview, 2026-10-01): read-only stays; fail gracefully and say
why; the trip you last opened is **Saved for offline** automatically; no
download button; a "Save again" retry.

1. **Graceful failure.**
   - `handleAssign` (assign stop to chapter) gets the same try/catch, revert
     and toast as its siblings.
   - `handleSuggestChapters` catches inside the transition and toasts; it
     must not reach `plan/error.tsx`.
   - One shared helper `offlineMessage()` (in `components/ui/use-server-action.ts`
     or a sibling): when `navigator.onLine === false` at the time of the
     failure, the message is **"You're offline. Plan changes need a
     connection."** instead of "Something went wrong…". `useServerAction`
     and the itinerary-manager toast helper both use it. No per-action copy.
   - ADR 0016 gets an amendment (2026-10-01): "the banner alone" is replaced
     by "the banner plus one shared offline message at the point of
     failure"; per-action toasts are still not pursued.
2. **Wider warm.** `tripOfflinePaths` adds `/today`, `/budget`, `/calendar`.
   The warmer also fetches the trip's cover image URL (when a photo is set),
   subject to the same 10 MiB cap as attachments; `sw.js` serves it like an
   attachment (network-first). ADR 0043's "cover deliberately left out" line
   gets a dated amendment.
3. **"Saved for offline".** `OfflineWarmer` reports progress (idle →
   saving → saved, with a timestamp kept in `localStorage` per trip) through
   a small store; the trip **Settings** page shows a row: "Saved for offline
   · <relative time>" with a "Save again" button that re-runs the warm, or
   "Saving…" while it runs, or "Not saved yet" if it never ran (no SW, dev).
   Glossary term added to CONTEXT.md (done).
4. **Audit doc** `docs/audits/2026-10-01-offline-audit.md`: what works, the
   gaps found, what this branch changes, and the two deferred items
   (production-only SW means verify with `next build` + local `next start`
   on a non-production env file; ARCH-TEN-12 cache-on-sign-out).
5. Tests: `lib/offline.test.ts` for the new paths and cover; a test that
   `useServerAction` reports the offline message when `navigator.onLine` is
   false; itinerary-manager tests for the two fixed handlers; a Settings test
   for the three states.

---

## Verification

- `npm test`, `npm run typecheck`, `npm run lint`, `npm run build` green at
  the end of each part.
- Landing: `next dev` at 393×700 and 1440×900 against the handoff images;
  tap the front card; wait 8s; reduced-motion swap.
- Offline: production build served locally (never `next start` with
  `.env.production.local`), DevTools offline, open Today/Money/Calendar and
  try an edit in Plan.

---

## G. Tester wording and the first-sign-in welcome

Agreed 2026-10-01: "invite-only" was describing the gate, not the reason.
The reason is that Teepee is in testing. The gate (ADR 0057) does not change.

**Copy.** Replace "invite-only" wherever it is a product statement:

| Where | Now | Becomes |
|---|---|---|
| Landing secondary button (`LandingActions`) | Request access | **Become a tester** |
| Landing legal line | Teepee is invite-only | **Teepee is in testing** |
| Panel, sign-in mode line | Teepee is invite-only — sign in with the Google account you were invited with. | Teepee is in testing. Sign in with the Google account you were invited with. |
| Panel, request mode title / line | Ask to join / Teepee is invite-only. Sign in with Google and we'll pass your name to the admin — there's nothing else to fill in. | **Want to test it?** / Teepee is in testing and the door is by invitation. Sign in with Google and we'll pass your name to the admin. Nothing else to fill in. |
| Panel, denied mode title | Teepee is invite-only. | **Teepee is in testing.** (the line below stays verbatim — it was tuned to give nothing away) |
| Share CTA (`app/share/[token]/share-cta.tsx`) | It's invite-only for now — ask for a spot. / Request access | It's in testing for now. Ask to be a tester. / **Become a tester** |

Privacy and Terms keep "invite-only" (legal description of the arrangement).
The glossary "Landing" entry: "Request access" → "Become a tester", and
"Access is by invitation, and the page says so" → "Teepee is in testing and
access is by invitation; the page says so". Update the panel/landing/share
tests that quote these strings.

**Welcome (first signed-in page view).**

- `User.welcomeSeenAt DateTime?` (migration), same pattern as
  `whatsNewSeenAt`. A server action `markWelcomeSeen()` sets it.
- `components/welcome/welcome-dialog.tsx` (client) mounted from the Trips
  page (`app/(app)/trips/page.tsx`) only, rendered when `welcomeSeenAt` is
  null — a server wrapper decides, like `WhatsNewBanner`. Shared Dialog
  (bottom sheet on phone, centred from sm), one button, cannot be
  dismissed by accident into never-seen: closing by any means marks it seen.
- Copy, verbatim:
  - Title: **Welcome to Teepee.**
  - Body: It's early days and I need as much feedback as I can get. The
    speech-bubble button in the bottom corner opens a Feedback note from any
    page. Big or small, I want to hear it all.
  - Button: **Got it**
- On close, the floating Feedback launcher pulses once (`tp-pin-pop` or a
  new `tp-attention` keyframe, 2 cycles, `var(--ease-bounce)`), none under
  reduced motion. Trigger via a small store/event the launcher subscribes
  to, not a prop drill through the layout.
- Existing travellers see it once too (their `welcomeSeenAt` is null after
  the migration). That is wanted.
- Tests: wrapper renders nothing when seen; dialog copy and button; closing
  calls `markWelcomeSeen`; the launcher pulses on the event and not under
  reduced motion.

