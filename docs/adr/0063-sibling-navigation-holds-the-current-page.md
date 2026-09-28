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
  in `docs/open-follow-ups.md`.

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
  elements at once.
