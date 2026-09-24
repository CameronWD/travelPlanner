# Playground phase 3 — deferred review findings

Findings from the phase-3 task reviews and the final whole-branch review that were
**deliberately left for later**. These are not kit gaps (things the kit shows that we
don't build) — those live in `2026-09-24-playground-phase-3-gaps.md`. Everything here is
something we *have* that could be better, or a pre-existing bug the reskin surfaced.

Items the final fix wave already closed (share not-found copy, RouteMap pins/popups,
global-error font shorthand, month-tile country label, OFL licence, etc.) are not listed.

## Needs your decision

- **Wishlist List view is blank for a trip with ideas but no stops.**
  `components/trip/wishlist-board.tsx:368` guards the whole list on `stops.length > 0`,
  so in Sketching (ideas, no itinerary yet) the List view shows only the Add button —
  even the "Anywhere" group, which needs no stops, is hidden. Map view is unaffected.
  Fix sketch: drop `&& stops.length > 0` from that guard (the stop sections already
  map over `stopsToShow`, and "Anywhere" has its own `anywhereItems.length > 0` check).
  **Cam to decide whether it ships in this merge.**

## Production

- Set `APP_URL` in Vercel if the site is served from a custom domain (docs/DEPLOY.md §4).
  Without it, og:image URLs resolve against `VERCEL_PROJECT_PRODUCTION_URL` (the
  `*.vercel.app` host). Static pages need a rebuild to pick up an `APP_URL` change.

## Accessibility pass

- `components/legal/legal-page.tsx:34` — Terms/Privacy cross-link is under 44px tall (verbatim from the kit drop-in).
- `components/trip/day-feasibility.tsx` — `AlertTriangle` has an `aria-label` but no `role="img"`.
- `app/(app)/account` notifications — digest page heading skips h1→h3, and `EmptyState`'s h3 sits at the same level; duplicate "Remove A device" accessible names; Switch focus ring not verified in a browser.
- Help pages — headings inside `<summary>` may flatten in some screen-reader combos; the trip-route help h2 renders larger than the layout h1.
- Journal (`components/trip/journal-entry-view.tsx`) — the actor's name is announced twice when the avatar has an image; avatars ignore `author.image`.
- Checklist compact rows — icons lack `aria-hidden`; the checkbox name includes the due hint (untested).
- `FeedbackLauncher` overlaps the Switch column on Account at 390px (global floating button).
- Month view (`components/trip/month-grid.tsx`) — phone tiles have no count/packed signal (matches kit); at 320px tiles are ~38px wide.

## Shared-primitive follow-ups

- `components/ui/badge.tsx` — `success`/`warning` variants map to hue fills (`bg-teal`/`bg-sun`) not status tokens; call sites work around it with `className="bg-success text-success-foreground"`, and a test enshrines the hue mapping. Fix at the primitive and drop the workarounds.
- `components/ui/list-row.tsx` — the `trailing` slot is wrapped in `aria-hidden`, a trap for interactive trailing content (logged as a handoff defect too).
- `components/ui/select.tsx` — `SelectTrigger` doesn't consume `useFieldControl`, so Select fields get no `aria-describedby`/`aria-invalid`; same label bug in `components/trip/settings/trip-details-form.tsx`.
- `components/trip/attachment-popover.tsx` — paperclip trigger is 28px (shared with wishlist) — needs a primitive-level 44px hit area.
- Leaflet popup close × is ~24px (`.tp-map-popup` in `app/globals.css`).
- `CHIP_TOUCH` class string is copied ×3 — make it a `Chip` `touch` prop.
- `initials()` is duplicated across bell, journal and account — extract `lib/initials.ts`.
- Status chips hand-copy Badge classes instead of using `<Badge>`.
- `item-card.tsx` island glyph hack `[&_.text-destructive]:text-foreground` — `island` could re-scope `--destructive` instead.
- Bell unread badge is hand-inlined rather than `CountBadge` (mirrors the kit).
- `app/global-error.tsx` — the button border uses `--foreground`, which disappears in dark mode; the kit uses a separate line token (add a 7th local var copied from `--border`/`--border-soft`).
- `EmptyState` markup is duplicated ×3 in `components/trip/timeline.tsx` (the day branch is unreachable behind `dayHasEntries`).

## Code hygiene

- `lib/itinerary.ts` `dayHasEntries` duplicates Timeline's own emptiness check; redundant `EMPTY_DAY` fixture arrays in its tests.
- `components/trip/timeline.tsx` — double import of `@/lib/categories`, a `const` between imports, `BY_VALUE` re-created per render, hand-written `text-label`, a weak stringified-tree shape test; row title weight 600 vs kit 800.
- `app/(app)/trips/page.tsx` — repeated `trips.length` check.
- Admin row Cards use `shadow={1}`, not in the handoff recipe.
- Day-nav has a redundant `min-h-11`.
- Dialog `errorAlert` compact style changed for 8 callers; `RowActions` disables Edit while deleting; the hover action overlay hides the assignee avatar; AI suggestion panels have no tests.
- Itinerary/Plan B — `hardEndLabel` "none" dead branch; broad print `header, nav {display:none}` (pre-existing).
- `components/globe/marker-form.tsx` — unexplained `h-12` on the Search field.
- Globe map (`components/globe/globe-map.tsx`) — vestigial `off()` inside `.then()`; recolour effect is missing a `selectedId` dependency (pre-existing).
- Account notifications — digest rows aren't `ListRow`, though a comment says they are.
- Share page — `Logo` rendered twice for responsive sizing; a few arbitrary one-off values; the test helper `selectOf` crashes (TypeError) instead of asserting when a query uses `include`.
- Journal — Day page entry padding (`p-3.5`) vs `JournalEditor` `p-4`; a weak `toContain("A")` test; photo count includes orphaned photos.
- Older-release "What's new" white card is unit-tested only; Today ring untested at page level (needs fake timers).
- No test pins the `layout.tsx` wiring of `metadataBase`.
- Copy kept as ours vs kit: header CTA "New trip" (kit "+ Start a new trip"); `TransportCountdown` "Next departure" (kit "Up next", with a heading); "Promote" (kit "Make Plan B real").

## Pre-existing bugs

- **Dev "Map container is already initialized" (the Next dev overlay's "1 Issue" on map pages).**
  Confirmed in Playwright on Summary, the share page (`components/trip/route-map.tsx:199`)
  and the Globe (`components/globe/globe-map.tsx:101`). Cause: React strict mode mounts,
  unmounts and re-mounts each effect in dev. The map is built inside
  `import("leaflet").then(...)`, so on the first cleanup `leafletMapRef.current` is still
  null (nothing to remove) and the second mount starts a second import; both `.then`s
  call `L.map()` on the same container and the second throws. Dev-only (no double mount
  in production); maps render correctly. Fix sketch: a `cancelled` flag set in cleanup
  and checked in `.then`, or check `container._leaflet_id` before `L.map()`.
- Departure countdown hydration mismatch (server vs client clock), not introduced by the reskin.
