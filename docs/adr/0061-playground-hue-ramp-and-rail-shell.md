# Playground Hue Ramp and Rail Shell — Phase 2

## Status

Accepted — phase 2 of an intentionally multi-phase migration. Lives on
`feat/playground-phase-2` (cut from `beta` at `37281af`, which holds phase 1).
Not merged to `beta`, not touched on `main`, nothing deployed.

## Context

Phase 1 (ADR 0060) landed Playground's tokens, fonts, PWA identity and
primitives, but stopped short of the ~200 call sites where colour carries
*meaning* rather than decoration: seven item categories, eight chapter bands,
and per-stop colour cycling. Playground's first handoff shipped four accent
hues — coral, sun, teal, lilac. The repo needed nine, mutually
distinguishable, in places a Traveller relies on to tell one category or one
chapter from another. Phase 1 explicitly deferred this rather than invent a
ramp the design system was supposed to define, and the app shipped visibly
half-migrated as a result — a Playground shell wrapped around old-palette
content.

A second, much larger handoff (`design_handoff/playground-2/`, 262 files)
answered this and most of the rest of the phase 1 design ask: `lib/hues.ts`
(a nine-hue ramp), a Leaflet map palette, `ErrorPanel`, skeleton archetypes,
outlined wordmark SVGs, and a desktop kit proposing a single left navigation
rail. This phase adopts all of it, plus the sweep and the navigation
restructure it enables.

## Decision

**One ramp, two jobs.** `lib/hues.ts` defines nine hues — sky, sun, leaf,
lilac, pink, teal, coral, indigo, stone — each with a full class set (chip,
dot, text, soft, fill) in both themes. Item categories get a fixed
hue-per-category mapping; chapter bands get a user-picked subset of the same
nine. Two ramps were on the table (the second handoff's own README raised the
question); one ramp was chosen because the alternative would have meant
maintaining two colour languages with no reason a Traveller would ever notice
the difference, and because `lib/stop-colours.ts` (below) needed a ramp to
derive from regardless.

**No database migration, despite every rendered colour changing.**
`chapter.colour` is persisted as a plain string (`prisma/schema.prisma`).
The new ramp renames the user-facing labels (Sun, Leaf, Lilac, Pink, Coral)
and remaps every class, but the *stored* values are untouched —
`sky amber emerald violet rose teal orange indigo`, the same eight strings
the database already holds. `LEGACY_TO_HUE` is the seam: it takes a stored
legacy name and resolves it to one of the nine hues, so every existing
chapter row keeps rendering correctly without a rewrite.

This is the single property most worth protecting in this phase, precisely
because it is invisible from the UI — a chapter still just looks like it has
"the blue band" — and because breaking it fails silently rather than loudly:
an unmapped stored value doesn't crash, it falls back to a default colour, so
a broken mapping could ship, pass a glance at the running app, and only
surface later as travellers noticing their chapter colours had quietly
scrambled. `lib/hues.test.ts` pins it structurally: it asserts the exact
stored value lists (both chapter and category) rather than "some values",
asserts every stored value resolves through `LEGACY_TO_HUE`, and asserts an
*unknown* stored value falls back without throwing. Category values needed
no such mapping — they were never user-facing strings to begin with — but
the test pins their stored enum too, for the same reason: an invisible,
catastrophic-if-wrong property deserves a test that would fail loudly in
review rather than a runtime fallback that would fail quietly in production.

**`lib/stop-colours.ts` had no handoff equivalent.** Per-stop colour bands,
keyed by `sortOrder` and shown on the month grid and the plan editor, are not
a concept either handoff defined. Derived from the same nine-hue ramp
(a six-hue cycle through `LEGACY_TO_HUE`) rather than invented as a tenth,
unreviewed colour scheme — recorded in the design ask
(`docs/follow-ups/2026-09-23-playground-design-ask.md`, B2a) as needing the
designer's confirmation, not yet given.

**Status colours stayed off the hue ramp.** `--destructive`, `--success` and
`--warning` continue to carry state (this failed, this succeeded, this needs
attention) rather than identity (this is the SIGHTSEEING category, this is
the Lilac chapter). A colour carrying state is semantic and belongs to a
fixed vocabulary of outcomes; a colour carrying identity is one of nine
interchangeable hues a Traveller or the fixed mapping picks from. Folding the
former into the ramp would have made "which hue is the error one" a fact
someone has to remember instead of a name that says so.

**Navigation merged into one left rail — the one place this phase rebuilds
rather than restyles.** Every other surface in phases 1 and 2 keeps its
existing component and swaps the tokens or classes underneath it. Navigation
could not: the kit's `Dock`/`TabBar` are presentational and controlled by
`value`/`onChange`, with no concept of the repo's actual routing behaviour —
`?plan=` fork threading through Plan and Budget (ADR 0020), `isNavActive`'s
exact-match-on-Home rule, the mobile More sheet gating eight otherwise
inaccessible routes, and `aria-current`. All of that domain behaviour stays
in `mobile-tab-bar.tsx` and `trip-nav.tsx`, which now render the kit's visual
components (`TabBar`, `Dock`) instead of the previous hand-rolled markup.
`--tp-tab-bar-h` moves from `4rem` to `4.75rem` in the same task as the
TabBar it is sized for — phase 1 deliberately left it at `4rem` for exactly
this reason, to avoid moving real UI ahead of the component that owns the
number.

**The rail is trip-scoped; the app header was kept. This is a deliberate
interim, not an oversight.** The kit's own `Shell` has no header at all —
which is why its `Dock` item list carries muted `Trips`/`Globe`/`You` entries
alongside the trip-scoped ones: it assumes the rail *is* the only chrome, at
every route, not just inside a trip. This repo's rail only renders inside
trip routes, because building it app-wide in one pass would have meant
retiring the header everywhere at once — including `/trips`, `/globe`,
`/account` and `/admin`, none of which the kit's screens cover in this
handoff — and stranding them with no chrome at all. The result is a half-port
that reads oddly if not named as such: *inside* a trip, the rail's muted
`Trips`/`Globe`/`You` sit within roughly 100px of the header's own controls
covering the same destinations, and two Teepee marks appear about 14px apart;
*outside* a trip, there is no rail at all, only the header. Both are true at
once because the rail was ported for the surface that had a design (a trip)
without yet retiring the chrome for the surfaces that didn't. Resolving it
means one of two things: extend the rail app-wide and retire the header
everywhere, once `/trips`, `/globe`, `/account` and `/admin` have their own
kit designs to render inside it — or accept the duplication as permanent
and prune the rail's muted items back out. Phase 2 does neither; it records
the tradeoff rather than let it read as a bug nobody noticed. The
duplication is not only visual: it is reachable under different accessible
names for the same destination — `/account` under "Account" in the header
and "You" in the rail, `/trips` under three different names across header
and rail — so a screen-reader Traveller who bookmarks a name in memory
("You") may not recognise the header's "Account" as the same destination,
and vice versa.

## Two verification methods that do not work in this repo

Worth recording on their own, because both look like reasonable checks and
both were tried and failed here — the failure mode is general, not specific
to this sweep.

**"The class is in the compiled CSS" proves nothing about whether app code
uses it.** Tailwind v4's candidate scanner is text-based: it has no concept
of a comment, a markdown fence, or reference material versus application
code. It treats every file it scans as a source of literal class-name
strings. `design_handoff/` is committed (not gitignored) and contains 300+
reference files using every hue; excluding it via `@source not
"../design_handoff"` removed most of that noise, but several hues —
`sky`, `pink`, `leaf-text` among them — stayed alive in the compiled output
purely because `app/globals.css`'s own explanatory comment spells out
`bg-hue-sky`/`text-hue-sky-text`/`border-hue-sky`, and this very plan
document quotes `bg-hue-sky` and `bg-hue-pink` as examples. Neither is app
usage. The working rule going forward: verify a sweep by reading source for
real call sites and by checking Tailwind's `@theme` wiring against source,
never by grepping compiled CSS for a class name's presence — presence proves
the scanner saw the string somewhere, not that a component renders it.

**Light-mode contrast failures are invisible to everything this repo has —
and the sweep that fixed the first instance of this did not close the
pattern.** No test asserts colour contrast, dark mode reads correctly by
construction in both cases below, and a sighted glance at a dark-themed
screen (the default in most of this project's own screenshots) would never
surface a light-mode defect. `--warning` measured as text on paper
(`#FFFBF3`) at **1.40:1** — essentially invisible — and `--success` at
**2.09:1**, both badly failing WCAG's 4.5:1 floor for body text. Dark mode
measured **9.90:1** and **7.20:1** for the same tokens respectively,
comfortably passing, because the dark values are light-on-dark and the light
values are a pale fill never meant to carry text. The root cause predates
this phase: phase 1 moved `--warning` from amber (dark enough to read as
text) to sun (a pale fill meant for backgrounds), which made every
pre-existing bare `text-warning` illegible in light mode at that point,
silently. This phase's sweep then propagated the same pattern to 46 more call
sites before a controller measured actual contrast ratios rather than
trusting that "the token exists" meant "the token is safe to use as text."
The fix was not a new token — `--sun-text` and `--teal-text` already existed
for exactly this purpose (**5.70:1 on paper / 5.85:1 on card**, and
**5.83:1 / 5.99:1** respectively — corrected here; this ADR previously
recorded both as paper-only figures of 5.65:1 and 5.66:1, which do not
reproduce against either surface in the theme) — it was routing every bare
`text-warning`/`text-success` site through the `-text` variant instead.

That sweep fixed the two tokens it was hunting. It did not close the pattern
it was an instance of, and a later whole-branch review found the same root
cause — a colour used as text without checking what it composites against —
in four more places the sweep's grep for `text-warning`/`text-success` could
not see, because none of them use those literal class names:

- **The hue ramp's own `soft` + `text` composition** (`lib/hues.ts`,
  `lib/stop-colours.ts`'s `stopPillClass`, and hand-written pairings in
  `timeline.tsx`): every dark-mode `--hue-X-text` is defined identically to
  `--hue-X` itself (correct for text on the dark *page*), so pairing it with
  `soft` (a tint of that same hue) put a colour on top of itself — 3 of 6
  hues failed in light mode, 5 of 6 in dark.
- **`*-foreground` tokens used unpaired**, with no matching fill on the same
  element (`day-feasibility.tsx`) — 1.21:1 in dark mode, invisible. A
  `-foreground` token is only correct on its matching fill; grepping for the
  token name found the three sites that *are* paired with a fill and could
  not distinguish the one that wasn't.
- **`text-accent` used as body text**, 2.2–2.8:1 in light mode
  (`vote-control.tsx`, `globe-suggestions-strip.tsx`) — `--accent` is a fill
  token, not a text token, and nothing named `warning` or `success` flagged it.
- **Hue text at reduced opacity, compounding the first defect** — and, in
  `accommodation-card.tsx`/`accommodation-row.tsx`/`phase-travelling.tsx`, a
  regression this branch introduced: dark mode dropped from a passing
  5.88:1 to a failing 4.30:1 full-opacity, and further at `/80`/`/70`/`/60`.

The lesson holds, and generalises further than this ADR first stated: a
passing type check, a passing lint, a full green test suite and a dark-mode
glance can all be true while a real accessibility failure ships, if the
check that would catch it was never run — and a grep for known-bad token
names only catches the instances that use those names. **Contrast has to be
measured, not inferred from a token's name — including the ramp's own
tokens, unpaired `-foreground` tokens, fill tokens used as text, and any
hue at reduced opacity on a tint of itself.**

**A second review pass, on the fix above, found the pattern had a second
axis.** Fixing "a hue's own `-text` on its own `soft` tint" (the bullets
above) does not fix "neutral muted text on a `soft` tint this branch
introduced" — a different failure with the same shape: `text-muted-foreground`
(and its opacity-reduced variants) predates this phase and was never tuned
against a hue tint, because no hue tint used to sit behind it. Commit
`c904260` wrapped `bg-hue-leaf/25`/`bg-hue-pink/25` containers around
pre-existing muted text in `timeline.tsx` (`TimeGutter`, the accommodation
confirmation number), `phase-travelling.tsx` (the `MapLink` beside tonight's
address), and the public share page's mirror of the same rows — all four
measured failing in dark mode (as low as 2.19:1) once the tint moved in
behind them, fixed by routing them through the same neutral-foreground
approach as the ramp's `onSoft`. **The general rule: introducing a tinted
container is two checks, not one — does the hue's own text read on it, and
does every *other* colour already inside that container (muted text
included) still read on it too.** Both need checking whenever a `soft`/tint
class is added to an element that already has children.

## The trap worth recording: a newer handoff is not newer file-by-file

Three files in the second handoff — `components/ui/dialog.tsx`,
`stepper.tsx`, `switch.tsx` — are byte-identical to the *first* handoff, and
are therefore *older* than the versions already in the repo, which phase 1
had fixed. Re-copying any of them would have silently reverted real bug
fixes: `dialog.tsx`'s two `before:`/`after:` pseudo-element covers over the
iOS elastic-overscroll gap, and `stepper.tsx`/`switch.tsx`'s invisible 44px
hit-area overlays that keep the *drawn* control at its designed size while
still meeting the touch-target rule. Two of the three carry no test outside
the specific regression tests phase 1 added for this exact defect, so
nothing else in the suite would have caught the revert. Only `logo.tsx` was
genuinely revised between handoffs — it now draws the wordmark from outlined
paths (`logo-paths.ts`) instead of live Bricolage text, removing a
font-load-order dependency.

The general rule this phase carries forward: **a newer handoff drop is not
uniformly newer — diff every file before copying, and treat any file the
repo has since fixed as ours, not theirs.** "The handoff is bigger and more
recent" is not evidence any given file in it is more current than what is
already fixed in the repo.

## What the Days/Money rename cost, despite being done right

Renaming Calendar→Days and Budget→Money in navigation was done correctly at
the data source (`primaryNav`/`moreNav` in `components/trip/trip-nav.tsx`),
with a purpose-built drift guard (`lib/help-guide.test.ts`) that fires if
prose describing the nav ever disagrees with the nav's own labels — and the
guard worked exactly as designed, independently proven by reverting a label
and watching it fail. It still took three fix rounds to stop the product
telling Travellers the wrong thing, because the guard's reach stopped at the
data it was built to check. It could not reach: the help-guide's own prose
describing the tabs, a legend in `help-legend.tsx` explaining the mobile tab
bar by the old names, the Feedback panel's `TRIP_SUBPAGE_LABELS` page names,
and a screen-reader-only `<h2>Budget</h2>` on the budget page itself — a
defect invisible to sighted review by construction, caught only because it
was named on a later pass. Every one of these was invisible to `tsc`, lint,
and 4,350+ passing tests.

The implementer was offered the option to widen the guard into a
whole-file keyword scan for "Calendar"/"Budget" and declined it, backed by
two concrete false positives found in the same round: the compare table's
own "Budget" metric label (a real, unrelated feature name) and the ICS
"calendar feed" (a real, unrelated integration). The lesson is not "add more
guards" — a brittle scan would have created work chasing its own false
positives — it is that **a rename's blast radius includes prose, and prose
has no type system.** A structural check can pin what it can see; anything
that describes the same concept in words has to be swept by hand and cannot
be assumed complete once the code-level rename is verified.

## Owed by a human — say plainly, do not soften

Nobody has looked at any of this with human eyes. Phase 1 already owed a
light/dark visual pass on `/trips` and a trip page, and a PWA-install check —
neither possible from a sandbox with no display, and neither done since.
Phase 2 adds a colour system touching roughly 36 files and a navigation
restructure touching every authenticated route, on top of that unpaid debt.
Every green gate in this ADR is necessary and none of it is sufficient:
`tsc`, lint, tests and a production build can all be clean while the rendered
result is wrong in a way only a human looking at a real screen would catch —
exactly the class of defect the light-mode contrast finding above turned out
to be. Treating "all four gates pass" as equivalent to "this looks right"
would be a mistake; it is not evaluated here at all.

## Still outstanding from the designer

Tracked in `docs/follow-ups/2026-09-23-playground-design-ask.md`, unresolved
by this phase:

- **D1 — 44px touch targets, unfixed at source.** `stepper.tsx` still ships
  36px buttons and `switch.tsx` a 30px track; both are worked around in-repo
  with invisible hit-area overlays, which is durable but should not be
  permanent.
- **D2 — the toast tone question, narrowed but not closed.** The second
  handoff confirmed tonal toasts are intended (`Toast.d.ts`'s `tone` prop)
  but lists no explicit error tone, and `--coral` and `--destructive` are
  distinct tokens in light mode. Open question: should an error toast be
  `tone="coral"`, or does it need its own tone.
- **B9 — five restyle-by-hand components still prose, not files.**
  `textarea`, `money-input`, `tabs`, `popover`, `dropdown-menu` have nothing
  beyond a README bullet; all five are already restyled by hand in-repo
  regardless.
- **B2a — `stop-colours.ts`'s derivation needs the designer's confirmation**,
  not yet given, that deriving from the nine-hue ramp is the right call
  rather than an unreviewed invention.

## Also outstanding, not the designer's to close

- **`public/brand/*.svg` (four files) were removed as unreferenced.** Task 6
  — the task most likely to consume them — found no natural slot for them in
  `ErrorPanel` or the skeleton archetypes, and nothing else in this phase's
  scope (colour, foundations, per-route states, navigation) had a legitimate
  place to put a brand mark beyond what `logo.tsx` already renders. A later
  whole-branch review removed `lockup.svg`, `lockup-on-dark.svg`,
  `wordmark.svg` and `wordmark-on-dark.svg` rather than carry them
  indefinitely as dead weight; they remain in git history and a single
  `git checkout` restores them if phase 3 finds a use.
- **Stale "three error boundaries" claims** in `docs/adr/0059-*.md` and
  `docs/architecture-sitrep-2026-09-22.md` predated this phase's navigation
  and per-route error-boundary work; Task 6 corrected the same sentence in
  `app/api/client-error/route.ts` but left the ADR and sitrep copies stale,
  out of scope for the task that found them. A later whole-branch review
  corrected both to match `route.ts`'s "one per route, plus the root
  boundary" phrasing rather than naming a count that drifts every time a
  route is added.
- **Muted text on a tint, pre-dating this branch, out of scope for the
  review that found it.** The same axis as the `c904260` regression above
  (neutral muted text that was never checked against a hue/status tint) also
  exists on tints this branch did *not* introduce, so fixing it wasn't a
  regression fix and was left for the next phase rather than folded in here:
  - The `ai-booking-parser.tsx`/`ai-activity-suggestions.tsx`/
    `ai-packing-suggestions.tsx` panels' body copy on `bg-hue-lilac/25` —
    3.67:1 light / 3.24:1 dark.
  - `app/(app)/trips/[tripId]/budget/page.tsx:446` on `bg-warning/20` —
    3.73:1 light / 3.27:1 dark.
  - `phase-past.tsx:286` and `wishlist-board.tsx:364` on `bg-success/15` —
    3.98:1 on card, dark.

  All measured below 4.5:1 in at least one theme. Named here with ratios so
  the next phase inherits a list, not a rediscovery.

## Consequences

The app now has one hue vocabulary instead of raw Tailwind palette classes at
category, chapter and stop-colour call sites, and a single navigation rail
replacing the split trip-nav/app-header pattern — but both changes are
unverified by a human eye, on top of the same debt phase 1 already carried.
The rail's header duplication inside a trip and header-only gap outside one
are the visible cost of doing navigation in one bounded phase rather than
waiting for kit designs for every app-level screen; it is recorded above as
an interim to resolve, not a defect to silently outgrow.

This work lives on `feat/playground-phase-2`, cut from `beta`. It must not
reach `main`, and must not be merged into `beta` without an explicit
go-ahead — this ADR records a decision, it is not itself that go-ahead.
