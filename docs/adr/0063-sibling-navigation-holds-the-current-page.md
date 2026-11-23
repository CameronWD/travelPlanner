# Sibling navigation holds the current page; skeletons only at place boundaries

## Status

Accepted 2026-09-27 on `feat/soft-navigation-2026-09-27`. Amends ADR 0006: the trip
`template.tsx` route-transition wrapper it names is removed and replaced by React's
`<ViewTransition>`.

## Decision

Moving between siblings — one day to the next, one trip section to another, one rail
destination to another — keeps the current page fully on screen until the next page is ready,
then swaps with a short native crossfade (directional slide for day-to-day). The tapped
control takes its active style at once, and a thin progress bar appears over the content only
if the wait passes about 300ms. Recently visited dynamic pages are kept in the client router
cache for 30 seconds (`experimental.staleTimes.dynamic`), so stepping back is instant.

Consequently **`loading.tsx` is allowed in exactly one place under the signed-in app:
`app/(app)/trips/loading.tsx`**, the boundary you cross when entering or switching a *trip*,
which is a genuine change of place and also lets the shell stream on a cold load of a deep
URL. No other route segment under `app/(app)/` may carry a `loading.tsx`, and no segment may
carry a `template.tsx`. Anything slow *inside* a page streams behind its own `<Suspense>`
(the weather card is the model), never behind a page-wide skeleton.

## Why

Cam reported that "a lot of pages fully reload when selecting between things". Nothing was
hard-reloading: every control already used `<Link>` or `router.push`. The feel came from
three deliberate, individually reasonable choices stacked together — a full-page skeleton on
almost every route (rolled out twice, in the 2026-06-30 and 2026-09-23 plans), a remount-and-
fade template on every section switch (2026-06-23 motion plan, ADR 0006), and a zero client
cache for dynamic pages (Next's default since v15). Each date on the Day view is its own
segment, so an arrow press replaced the header, strip and cards with placeholder bars and then
put them back.

How Next keys these boundaries decides the rule. A `loading.tsx` applies only to the slot
directly beneath its own folder, and the router creates a *fresh* Suspense boundary every
time that slot's segment changes (`layout-router.js`, `LoadingBoundary` keyed by `stateKey`).
So a skeleton anywhere above a changing segment fires on every sibling switch, and there is no
"only on cold load" setting. Holding the old page therefore means having no boundary between
the shared shell and the thing that changes — which is why the rule is a whitelist of one
file, not guidance about keeping skeletons small.

## Considered options

- **Shrink each skeleton to the part of the page that changes** — rejected: still a
  placeholder flash on every arrow press, and it keeps twenty files that agents have twice
  been told to write.
- **Keep the template fade, drop only the skeletons** — rejected: a fade-in from blank on
  arrival is exactly what reads as a page load once the old page holds.
- **Adopt Cache Components and partial prefetching** (true instant navigation) — deferred, not
  rejected: a real migration because every route reads auth and Prisma. Tracked as `NAV-01`
  in `docs/archive/open-follow-ups.md`.

## Consequences

- A cold load of a deep trip URL paints the app shell and the trips-level skeleton, then the
  page in one go, rather than a per-page skeleton first. Accepted.
- The cold-load and place-change cases that follow from the whitelist, accepted in the final
  review: a deep link to *any* trip page shows the trips-list skeleton
  (`app/(app)/trips/loading.tsx`), not something shaped like that page; `/globe` and
  `/account`, which sit under no `loading.tsx`, show nothing below the shell until ready; and
  the rail's "Trips" from Globe or You shows the trips-list skeleton, because it enters the
  `trips` segment — a gap against "rail destination → rail destination holds", accepted
  rather than adding a second boundary.
- Another Traveller's edit made within the last 30 seconds may not show when stepping back to
  a page already visited. Your own edits do show: every mutation revalidates or refreshes.
- Prefetching and the client cache only behave fully in a production build, so the dev server
  (and the Playwright navigation check that runs against it) can prove "no flash, old page
  holds" but not "instant". Beta is where "instant" is judged.
- A convention test pins the whitelist. A future plan that says "add a `loading.tsx` to every
  route" is wrong by this ADR, however good the skeleton looks.
- Chrome that is fixed or sticky and sits *outside* every `<ViewTransition>` — the phone tab
  bar and the phone top bar — must carry its own `view-transition-name` (`.tp-vt-tab-bar`,
  `.tp-vt-top-bar` in `app/globals.css`). Without one the browser captures it in the root
  snapshot and paints it beneath the animating section, so for the length of a section
  crossfade page content shows on top of the bar (Feedback `cmukmw2ks000104le2i7lbxtj`,
  2026-09-28). A new bar of that kind needs a new name; the same name may not be on two
  elements at once. A name alone did not hold: the bars also need a `z-index` on their
  `::view-transition-group`, because the browser orders groups by the old state's names and
  appends names that exist only in the new state — which every entering section's is — after
  them, so the entering section painted over the bars. And section switches fade out, then in
  (100ms, then 160ms), so the two sections are never on screen together; `npm run audit:nav`
  checks both on a phone Plan → Money switch, frame by frame (2026-09-29).

## Amendment 2026-11-19: one file, two shapes

`app/(app)/trips/loading.tsx` is still the only `loading.tsx` under the signed-in app, but it
now renders one of two things, chosen with `usePathname()`. On `/trips` it is the Trips-list
skeleton (`TripsSkeleton`). On any `/trips/<anything>` it is the Teepee mark, spinning
(`LogoLoader`). Reason: the file sits above every trip page, so a deep link opened cold, or the
first step from the Trips list into a trip, used to show a Trips-list skeleton in front of a
page that is not the Trips list (Feedback `cmwmyhjrb000308ifdcft01i7`). Checked in dev: during a
client navigation into a trip the hook reports the destination path, and moving between pages
inside a trip never reaches this file (the progress bar handles that). Do not add a second
`loading.tsx` to give a trip page its own shape; extend the branch here instead.

## Amendment 2026-11-23: quick runs through days on a wide screen

From `lg` the Day view shows the next day at once from the page's own payload,
so a day change does not wait for the server. When days are changed quickly
(arrows, keys, chips):

- One navigation is in flight at a time. Presses meanwhile only change the day
  on screen; when the navigation ends, the latest day follows. The first
  navigation of a run is a push and the rest replace it, so a run leaves one
  step in history.
- A press within 200ms of the one before cuts instead of crossfading, so slides
  never queue. Reduced motion always cuts.
- A navigation that lands after the Traveller has moved on does not take the
  content away from the day on screen: it keeps what an earlier payload sent.
  That kept content is only ever shown to stop the day on screen going blank
  during a quick run, and is replaced as soon as the navigation lands.
- A chip for a day the page sent no content for, pressed on its own (not in a
  quick run), holds the current day with the chip lit (and the progress bar
  after about 300ms) until that day is ready. A day seen earlier in the session
  but sent as a placeholder by the current payload holds the same way.
- While React prepares a view transition it stops dispatching events for the
  whole document until the transition's update runs, and dropped events are not
  replayed: a click on a day link in that window would fall through to the
  browser and load the page. A listener on `window` (bubble phase, so it runs
  only if nothing handled the click) does what the control would have done and
  always prevents the default, so a click on a day link never becomes a page
  load.
- At the very fastest pace (presses about 90ms apart) a press that lands while a
  slide is on screen can be dropped by the browser, so a run may end one day
  short.

Not solved: a quick run past the loaded window still shows placeholders until
the server answers. `npm run audit:nav` is stale for the Day
view (its checks predate the carousel, ADR 0065) and proves nothing there until
it is updated.
