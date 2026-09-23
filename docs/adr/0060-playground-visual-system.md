# Playground Visual System — Phase 1 (tokens, fonts, PWA identity, primitives)

> **Phase 2 closed the colour gap this ADR defers below** (category, chapter
> and stop colour, ~200 call sites) and merged navigation into a single rail.
> See ADR 0061.

## Status

Accepted — phase 1 of an intentionally multi-phase migration. Lives on
`feat/playground-visual-system` (cut from `beta`). Not merged to `beta`, not
touched on `main`, nothing deployed.

## Context

The app was on a warm coral-and-beige visual system: soft shadows, `1rem`
radii, coral as the primary colour. Playground is a paper-and-ink system —
`#FFFBF3` paper, `#1D1D1B` ink, 2px outlines, hard offset shadows with no
blur, `1.25rem` radii, coral demoted from primary to accent, Bricolage
Grotesque for display type.

The handoff arrived as: design tokens, a layout reference, a manifest, an
icon set, 21 files under `components/ui`, and four email templates. It did
**not** arrive with the per-screen design kits its own README names
(`ui_kits/teepee-mobile|tablet|desktop`, `ui_kits/shared/*.jsx`), a
notification copy spec, category/chapter colour ramps, or an `ErrorPanel`
component the README's states table references. Phase 1 is bounded by what
was actually delivered, not by what the plan originally hoped to cover.

## Decision

Adopt the handoff bottom-up: land the handoff material, tokens and fonts
first, then PWA identity and brand name, then primitives, then hand-restyle
the remaining shared surfaces. No per-screen work in this phase — there is
nothing yet to restyle *to*.

Landing the handoff also meant **dropping the Bold Modular design
direction** — an earlier, abandoned exploration that shipped alongside
Playground in the same handoff drop. A first pass at removing it left one
file behind: `design_handoff/README.md` was a live 250-line progress ledger
written for Bold Modular ("a fresh session should read THIS block first"),
which is more actively misleading than the mockup files it was deleted
alongside, since it reads as current instructions rather than an obvious
leftover. Removed in a follow-up, deletion-only commit.

**Token names were kept.** The new `globals.css` was verified to be a strict
superset of the previous `@theme inline` key set (all 31 old keys present in
the new 51; 59 custom properties grew to 106). Because the names didn't
change, the whole app re-skins through shared components — swap the
primitives, the tokens flow everywhere they're referenced — rather than
requiring a per-file sweep of every call site.

**`--tp-tab-bar-h` stays at `4rem`, not the handoff's `4.75rem`.** That value
belongs with a `TabBar` component this phase does not ship (see Deferred,
below), and three existing components position themselves from it. Changing
it now would move real UI before the component that owns the height exists.

**Product naming.** User-facing copy and the wordmark now read `Teepee` /
`teepee.`. Code comments and `CONTEXT.md` were deliberately left saying
`TEEPEE` — they're internal prose (a domain glossary), and renaming them buys
nothing. One accepted carve-out: `lib/digest.ts` keeps `"Test · Teepee"` in a
push notification title where the template doesn't apply.

**Focus ring.** Moved from per-component `focus-visible:ring-*` classes to a
single global `:focus-visible` rule in `globals.css`. One rule instead of N
call sites that could drift.

**`components/offline-banner.tsx` kept and restyled, not replaced.** The
handoff ships its own `ui/offline-banner.tsx`, which reimplements the online
listener from scratch instead of using the repo's `useOnlineStatus` hook, and
takes a `queued` prop for a sync queue that does not exist in this app —
offline is read-only here (ADR 0016), and the only thing that queues while
offline is feedback notes (ADR 0041). Adopting the handoff's version would
have added dead state and a parallel, worse online-detection path. Restyled
the existing component in place instead.

**The ⌘K command palette was not built.** The brief listed it as new work;
it already existed (`components/command-palette*.tsx`, wired to
`server/actions/search`). Nothing to do here beyond confirming it still
looks right against the new tokens.

**`tsconfig.json` now excludes `design_handoff`.** The handoff is reference
material, not application code, but its own files import components that
did not exist until Tasks 5 and 6 (`dock.tsx` imports
`@/components/ui/logo`; `stat-card.tsx` imports `progress-bar` and passes
`Card` a `tone` prop that isn't defined until then). Without the exclude,
`tsc --noEmit` fails on material we never intend to ship. This was load-
bearing for every gate from Task 1 onward.

**44px touch targets, and where the handoff contradicts itself.** The
handoff's own README promises "Touch targets are ≥ 44px" while shipping a
36px Stepper button and a 30px Switch (Chip at 28px is fine — the README
explicitly exempts clickable chips; Checkbox and ListRow already use
`min-h-11`). This is a real contradiction in the source material, not
something introduced here — raised with Claude Design as a design-system
bug, not fixed by inventing a different size. The ruling adopted: keep the
drawn (visual) size the handoff specifies, and extend the *tappable* region
to 44px with an invisible pseudo-element overlay. The control looks exactly
as designed and meets WCAG 2.5.5 on touch. Named regression tests assert the
overlay geometry so it can't silently shrink back.

**The toast variant restoration, and why `island` left the base class
string.** The handoff prescribes a single toast appearance (a teal "island"
treatment) and never considered that this repo has three semantic variants
(default/success, destructive, and a resting card style). A first pass
emptied the variant map to make room for the new look, which flattened error
and success toasts into the same teal fill — an error message like
"Couldn't update that cost." rendered visually identical to a success
confirmation. The fix keeps `default`/`success` as the teal island and gives
`destructive` its own fill (`bg-destructive` with foreground/border rescoped
to `--destructive-foreground`), and moves the `island` treatment out of the
shared base class into the teal variants specifically — `island` rescopes
foreground/border to an on-accent palette, which is correct for the teal
fill but would mis-colour title/description/action/close on the destructive
fill if left in the base. A related fix went to the hover states: the action
and close buttons used `hover:bg-muted`, a general surface token untouched
by the variant's foreground rescoping, so hovering shifted the text colour
but not the background it sits on — in the worst measured case, white text
on a near-white hover fill (1.21:1 contrast). Fixed by deriving the hover
background from the same variable as the text
(`hover:bg-foreground/10`), so text and its hover background can never come
from two different colour systems again. Composite contrast was verified
across all three variants in both themes; the tightest is
destructive/light at 4.86:1.

## The recurring hazard, and what it cost

Five times in this phase, adopting handoff material verbatim silently broke
something the test suite did not cover. In every case the handoff author
could not have known, because they never saw this repo — the break is not
carelessness on their part, it's a structural risk of copying files wholesale
into a codebase with its own history:

1. **Service worker icon path.** Deleting `app/icon.tsx` killed the `/icon`
   route, but `public/sw.js` still pointed push notifications at `/icon` for
   both `icon` and `badge`, with a test asserting the same and a comment
   explicitly justifying the old choice on the grounds that `public/icons/`
   didn't exist yet. It now does. Repointed to `/icons/icon-192.png` and
   `/icons/push-badge-96.png` (the handoff ships `push-badge-96` for exactly
   this). Root cause was a gap in the plan itself: the brief's own grep for
   stale references never searched `public/`.
2. **Two `globals.css` rationale comments**, restored in this task (Step 0
   above): the explanation of why `.leaflet-container` needs
   `isolation: isolate` (Leaflet's internal z-index values, up to 1000,
   would otherwise leak above the app's z-50 modal layer), and why
   `tp-fade-in-sheet` is paced to match `tp-slide-up`'s duration (so a
   sheet's backdrop and panel arrive together). The rules survived a
   wholesale file replacement; the reasoning didn't. Nothing broke
   functionally — the pacing still held by coincidence, both keyed off the
   same duration token — but the next person to touch either rule would
   have had no way to know they were load-bearing.
3. **Both of the dialog's iOS elastic-overscroll covers.** The header and
   footer each had a sticky element with a negative margin that creates a
   gap during iOS's rubber-band overscroll, and an opaque pseudo-element
   fill that covers it. The handoff's replacement kept the sticky
   positioning and the negative margins — the parts that *create* the gap —
   and dropped the opaque fills that covered it, in both places. No test
   asserted either cover, so the suite stayed green; the bug is invisible
   everywhere except real iOS elastic scroll. Restored with the new
   spacing/token values and named regression tests, so it cannot vanish
   silently a second time.
4. **The toast variant map**, covered above — flattened to one appearance
   across roughly 59 call sites, erasing the error/success distinction.
5. **Toast hover states**, also covered above — text and hover background
   drawn from two different colour systems after the destructive variant's
   foreground was rescoped and its hover background wasn't.

The general rule this produced, to carry into phase 2: **diff every adopted
file against its predecessor and ask what each removed line was *for*.** A
class or a comment that looks decorative may be load-bearing, and the
comment explaining *why* a rule exists is usually the first thing lost when
a file is replaced wholesale — which is exactly the kind of loss no test
catches, because tests assert behaviour, not reasoning.

## Exemptions to the "no new hex, no inline styles" rule

- `components/ui/logo.tsx` — three literal hex values for the tent mark. A
  brand mark must not theme-shift with dark mode or a future palette change.
- `components/ui/logo.tsx` — inline `style={{ fontSize: size }}` for a
  computed size prop; Tailwind has no utility for an arbitrary numeric input.
- `components/ui/progress-bar.tsx` — inline `style={{ width }}`, a computed
  percentage Tailwind cannot express as a class.
- `app/global-error.tsx` — stays fully inline-styled and was **not
  restyled** in this phase. It replaces the entire document when the root
  layout itself fails, so `globals.css` never loads for it; every style has
  to travel with the markup.

## Deferred, and why

Each of these is blocked on design material that was not delivered.
Inventing it now would mean throwing the invention away once the real
material arrives, and in the colour-ramp case would mean guessing at
meaning the design system is supposed to carry.

- **The screen kits.** `ui_kits/teepee-mobile|tablet|desktop`,
  `ui_kits/shared/*.jsx`, `specs/index.html`, `specs/motion.html`, and
  `guidelines/*.card.html` are referenced by the handoff's own README but
  are not present in the handoff. All per-screen restyling waits on them.
- **Notification copy.** `specs/notifications.html` is absent, so the four
  handoff email templates cannot be ported to whatever copy rules the brief
  intended — there's nothing to port *to*.
- **`components/ui/tab-bar.tsx` and `dock.tsx`.** The handoff's versions are
  purely presentational. The repo's `MobileTabBar` and `TripNav` carry
  domain behaviour the handoff has no concept of: a "More" sheet holding
  eight routes, `?plan=` fork threading (ADR 0020), and `isNavActive`'s
  exact-match-on-Home rule. Adopting `Dock` also implies restructuring the
  trip layout into a left-rail shell, which is exactly the kind of decision
  the missing desktop kit would have settled.
- **Category and chapter colour.** `lib/categories.ts` / `lib/map-pins.ts`
  (7 category hues) and `lib/chapter-colours.ts` (8 chapter hues) remain on
  raw Tailwind palette classes (`bg-sky-500`, `text-emerald-700`, and
  similar) and literal hex. Playground defines four accent hues; these two
  systems need seven and eight, mutually distinguishable, and — critically —
  the hue *carries meaning* (which category, which chapter) rather than
  being decorative. Reducing them to Playground's four accents would erase
  information the UI depends on. **This is why the app currently looks like
  a Playground shell wrapped around old-palette content** — roughly 200 call
  sites still render category and chapter colour this way, and that number
  is the actual measure of how much of the reskin is left to do, not a
  side detail.
- **Leaflet map colour.** `divIcon` markers are inline-styled HTML and
  polylines take a literal hex string — Leaflet's API leaves no other way to
  colour them. The "no new hex" rule cannot apply here until there's a
  blessed map palette to draw those literals from.
- **`ErrorPanel`.** Named in the handoff README's states row, not shipped.
  Per-route `error.tsx` waits on it; per-route `loading.tsx` waits on
  skeleton compositions that don't exist yet either.
- **The Open Graph image** for `app/share/[token]`, and **the outlined
  wordmark SVG** — both are gaps the handoff's own README lists as known and
  unresolved on its side, not something dropped in this phase.
- **Screens with no Playground design at all:** `/admin` and its three
  panels, `/privacy`, `/terms`, both `not-found` files, `app/global-error.tsx`,
  `trips/[tripId]/help`, the feedback FAB, and the notification bell.

## Owed, not yet done

- **Human light/dark visual pass on `/trips` and a trip page.** Not
  performed — but not because a sandbox can't render anything. A headless
  Chromium is available and pages render, screenshot, and inspect fine:
  `/signin`, `/privacy`, and `/terms` were checked in both themes and pass,
  including a contrast audit against rendered elements (164 text nodes
  across three routes, both themes, zero failures) and a focus ring measured
  live at `3px` width, `3px` offset, matching spec. The actual blocker is
  narrower: `/trips`, every trip route, and `/account` need a database this
  container doesn't have — dev sign-in fails with `ECONNREFUSED` against
  Postgres — so the screens this phase's restyle actually lands on remain
  genuinely unseen. This is a precondition for treating phase 1 as done, not
  an optional nice-to-have.
- **Human PWA-install check.** A different, still-real blocker: install
  flows need a real device or a real browser chrome, neither available
  here.
- **`CONTEXT.md` still says `TEEPEE` throughout.** Deliberate, per the
  naming decision above — it's a domain glossary, and renaming it buys
  nothing.
- **`docs/feedback/inbox.md`** lags its generator (`npm run feedback:pull`)
  until the next time it's run, per the project's own feedback workflow.
- **Minor deferrals recorded task-by-task in the working ledger**
  (`.superpowers/sdd/2026-09-23-playground-visual-system-phase-1/progress.md`):
  a footer/header hairline border not restored on the dialog
  (the opaque fill already covers what the hairline used to delineate — a
  deliberate style change, not an erasure); a WCAG-AA contrast comment lost
  from `badge.tsx`; `list-row.tsx`'s `as` prop being a second polymorphism
  convention alongside the repo's usual `asChild`/`Slot`; `stepper.tsx`
  lacking the `forwardRef`/`displayName` its Client siblings have (accepted
  — it wraps two buttons under one `role="group"`, there's no single
  focusable node to forward a ref to); `logo.tsx`'s `variant="mark"`
  returning an unnamed `aria-hidden` SVG (fine while nothing consumes it
  alone); untyped `React.*` references in two files (harmless — the global
  type namespace covers it); and `ListRow`'s `trailing` slot living inside
  an `aria-hidden` wrapper, which would silently swallow any future
  trailing content that has real meaning.
- **`money-input.tsx`'s height mismatch — found by the final whole-branch
  review, and fixed, not deferred.** Task 5's primitive restyle
  (`4d1ca9fc`) raised `Input`'s default size to `h-12` and left
  `SelectTrigger` at `h-11`; `MoneyInput`'s `flex items-stretch` row can't
  equalise two controls that both carry explicit heights, so the amount
  field rendered 4px taller than the currency picker on
  `inline-cost-fields.tsx`, `cost-checklist.tsx`, and
  `other-cost-editor.tsx`. This is a regression this branch introduced, not
  an inherited quirk — an earlier pass on this ledger mis-attributed it as
  pre-existing. Fixed by raising `SelectTrigger` to `h-12` (no call site
  depends on 44px) and the equivalent hand-rolled currency badge in
  `cost-checklist.tsx`.
- **For the design ask (Claude Design):** the handoff's README contradicts
  itself twice, independent of anything this migration did — it promises
  "Touch targets are ≥ 44px" while shipping a 36px Stepper button and a
  30px Switch, and it prescribes one toast appearance for a repo that has
  three semantic variants. Both were worked around here; both should be
  fixed at the source before phase 2 hits them again on a screen kit.

## Consequences

The app is mid-migration and looks it. The beta preview will show a
Playground shell, once deployed — tokens, fonts, primitives, PWA identity —
wrapped around content that is still substantially old-palette, most
visibly in the ~200 call sites still rendering category and chapter colour
as raw Tailwind hues. That is expected, not a defect: those hues need a
phase-2 colour ramp this phase was never going to produce without material
that wasn't delivered.

Aliasing the legacy `--shadow-soft`/`--shadow-soft-lg` names onto the new
hard offset shadows (see Decision, above) changed the rendered shadow on
roughly 27 files outside `components/ui/` that nothing in this phase
restyled — deliberate, and exactly the point of keeping token names
unchanged, but it means those screens changed appearance without any
commit touching them, which matters given no human has looked at this work
yet.

The deferral list above is the definition of done for phase 2. Nothing in
it should be picked up ad hoc without the corresponding design material
landing first — that's exactly the mistake this phase avoided by stopping
at the primitives instead of guessing at screens it had no kit for.

This work lives on `feat/playground-visual-system`, cut from `beta`. It must
not reach `main`, and must not be merged into `beta` without an explicit
go-ahead — this ADR records a decision, it is not itself that go-ahead.
