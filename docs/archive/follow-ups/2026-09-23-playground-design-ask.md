# Ask for Claude Design — Playground handoff, missing pieces

> **Status, 2026-09-23.** Phase 1 shipped against this handoff — tokens, fonts,
> PWA identity, the brand rename and the whole `components/ui/*` primitive set.
> See `docs/adr/0060-playground-visual-system.md`. Everything below is still
> outstanding and still blocks phase 2 (the per-screen work). Section D is new:
> defects found by actually building against the handoff, which the designer
> cannot see from their side.

> **Update, 2026-09-23 (second handoff landed).** A second, much larger
> delivery arrived and is now tracked at `design_handoff/playground-2/`
> (262 files). It answers most of sections A and B below: the screen kits and
> specs, the notification copy rules, a nine-hue categorical ramp serving both
> item categories and chapter bands, a Leaflet map palette, `ErrorPanel`, the
> skeleton archetypes, the OG images, outlined wordmark SVGs, `global-error`,
> and the screens that had no design at all. What each delivered file answers
> is annotated inline below, next to the original ask, rather than deleted —
> the asks are kept as the record of what was requested and when it was
> resolved.
>
> **Delivered:** `reference/ui_kits/teepee-{mobile,tablet,desktop}` plus
> `reference/ui_kits/shared/*.jsx`; `reference/specs/{index,motion,notifications}.html`;
> `docs/notifications.md`; `lib/hues.ts` (one nine-hue ramp serving both
> categories and chapters); `lib/map-palette.ts` and `lib/map-pins.ts`;
> `components/ui/error-panel.tsx`; `components/ui/skeletons.tsx`; the OG images
> and `lib/og-card.tsx`; `public/brand/*.svg` and `logo-paths.ts`;
> `app/global-error.tsx`; and the missing screens (admin, three not-founds,
> `(app)/error.tsx`, legal, notification bell).
>
> **Still outstanding — these are the live asks now, not the list above:**
>
> - **D1 touch targets: NOT fixed.** The second handoff's own
>   `components/ui/stepper.tsx` still ships 36px (`size-9`) buttons and
>   `components/ui/switch.tsx` still ships a 30px-tall track, neither with a
>   drawn hit-area — its own `README.md` (line 182) still promises
>   "Touch targets are ≥ 44px." We continue to work around this in-repo with
>   invisible 44px pseudo-element overlays (see D1 below). This needs fixing at
>   source, not worked around indefinitely.
> - **D2 toast variants: partially answered, narrower ask now.** `toast.tsx`
>   itself is still not part of the second handoff, but its new
>   `reference/components/feedback/Toast.d.ts` defines a `tone` prop (teal =
>   done, coral = heads-up, default teal) — confirming tonal toasts are
>   intended. What's still open: no explicit *error* tone is listed, and
>   `--destructive` and `--coral` are different tokens in light mode. The ask
>   is now: is an error toast `tone="coral"`, or does it need its own tone?
> - **B9 restyle-by-hand components: still prose, not files.** None of
>   `avatar`, `toast`, `sheet`, `select`, `textarea`, `money-input`, `tabs`,
>   `popover`, `dropdown-menu` appear in the second handoff's `components/ui/`
>   either. We have already restyled all nine by hand.
> - **New ask: `lib/stop-colours.ts` has no handoff equivalent.** Per-stop
>   colour bands keyed by `sortOrder`, used by the month grid and plan editor.
>   Neither handoff defines this; we derive it from `lib/hues.ts`. Worth
>   confirming the designer is happy with that derivation rather than us
>   inventing a tenth-ish colour scheme unreviewed.

Context: the handoff (now at `design_handoff/playground/`) landed with
`README.md`, `app/globals.css`,
`app/layout.tsx`, `app/manifest.ts`, `components/ui/*` (21 files), `public/`,
`emails/*.html` and `tokens.json`. That's enough to do tokens, fonts, PWA,
primitives and navigation. It is **not** enough to restyle the screens, because
everything the README points screen work at is missing, and because the repo has
colour systems Playground doesn't define.

**Note:** the sections below (A, B, C) describe the state after the *first*
handoff only. Most of section A and much of section B has since been answered
by the second handoff — see the update block above for what shipped. Sections
are left as originally written, not pruned, so the asks remain the record of
what was requested; where an item below is now delivered, the update block
above is the current status.

---

## A. Referenced by the README but not delivered

The README's "Live references in the design system project" and "Also designed"
sections name these. None are in the folder.

**Screen kits**
- `ui_kits/teepee-mobile/index.html`
- `ui_kits/teepee-tablet/index.html`
- `ui_kits/teepee-desktop/index.html`
- `ui_kits/shared/onthego.jsx` — Today, Summary, Files, Journal
- `ui_kits/shared/together.jsx` — Activity, People/Invite, Compare
- `ui_kits/shared/admin.jsx` — Trip settings, Account, Help, What's new, Sign in,
  Feedback panel
- `ui_kits/shared/planedit.jsx` — home base bookends, chapter bands, dated vs
  rough stops + drag, missing connections, set-dates-for-all, projected-end
  warning + "Make it fit", transport form (time zones, +1 day, drive estimates),
  cost fields (cost → paid, FX snapshot)

**Specs**
- `specs/index.html` — every component and state
- `specs/motion.html`
- `specs/notifications.html` — **blocks step 7.** The prompt says "the copy rules
  are in `specs/notifications`". Without it the four emails can be ported as
  markup but the subject/preheader/push-copy/batching rules can't be applied.
- `guidelines/*.card.html` — foundations

---

## B. Gaps found in the code that Playground doesn't cover

These are the ones that will force invention. Playground ships four hues —
coral, sun, teal, lilac. The repo needs more than four, in places where the hue
carries meaning rather than decoration.

### B1. Category colours — 7 needed, 4 available
`lib/categories.ts` defines seven item categories, each with a hue that appears
on pills, month-grid dots, budget grouping and map pins:

| Category | current hue |
|---|---|
| SIGHTSEEING | sky |
| FOOD | amber |
| ACTIVITY | emerald |
| NIGHTLIFE | violet |
| SHOPPING | rose |
| GETTING_AROUND | indigo |
| OTHER | stone |

Today these render as raw Tailwind palette classes (`bg-sky-500`,
`text-emerald-700`, …) — ~200 usages across the app. Against the Playground
paper/ink palette they will look like a different product.

**Ask:** a 7-step categorical ramp in the Playground language, each with
(a) a fill token, (b) a `-text` token that clears 4.5:1 on `--background` and
`--card`, (c) light and dark values, (d) a literal hex for Leaflet.

### B2. Chapter band colours — 8 needed, user-selectable
`lib/chapter-colours.ts` gives travellers a palette to colour chapter bands:
sky, amber, emerald, violet, rose, teal, orange, indigo. Each carries a
`chipClass` (border+bg+text, light and dark) and a `swatch` hex for map
polylines. They must stay mutually distinguishable — that's the whole point.

**Ask:** 8 distinguishable band hues, same four outputs as B1. If Playground
would rather chapters reuse the category ramp, say so and I'll collapse the two.

### B2a. Stop colours — new, no handoff equivalent (added 2026-09-23)
`lib/stop-colours.ts` gives each stop a colour band keyed by `sortOrder`, used
by the month grid and the plan editor. Neither the first nor the second
handoff defines an equivalent, so we derive it from `lib/hues.ts` rather than
inventing an unreviewed tenth-ish colour scheme.

**Ask:** confirm the designer is happy with deriving stop-band colour from the
nine-hue ramp in `hues.ts`, or provide the intended values directly.

### B3. Map palette (Leaflet can't use Tailwind)
`lib/map-pins.ts`, `components/trip/day-map.tsx`, `route-map.tsx`,
`components/globe/globe-map.tsx`, `wishlist-map.tsx` all need literal colour
strings — Leaflet `divIcon` markers are inline-styled HTML and polylines take a
hex. "No new hex values" cannot hold here.

**Ask:** an explicit map palette — marker fill/stroke, route polyline, selected
state, cluster — as named tokens with hex, for light and dark tiles. (Repo uses
Carto tiles, ADR 0033.)

### B4. `ErrorPanel` — named, not shipped
The README's states row reads "Skeleton, ErrorPanel, OfflineBanner", but
`components/ui/` has no `error-panel.tsx`. Step 6 needs it for every
`error.tsx`.

**Ask:** the ErrorPanel component, with its retry affordance and its tone.

### B5. Per-route skeleton compositions
`ui/skeleton.tsx` ships as a primitive, but not what each route's loading state
is built from. Repo has 5 `loading.tsx` today; step 6 wants one per route (~40).

**Ask:** skeleton layouts for at least the main shapes — list page, detail page,
calendar grid, map page, form page. I can compose the rest from those.

### B6. Open Graph image for `/share/[token]`
Step 6 asks for one; no design exists.

**Ask:** a 1200×630 OG design — what's on it, and whether it's static or
renders trip name/dates.

### B7. Wordmark as paths
The README lists this as a known gap: the wordmark is live text in Bricolage.
Needed for `ui/logo.tsx`, the OG image and `safari-pinned-tab.svg`.

**Ask:** the outlined SVG lockups.

### B8. `app/global-error.tsx` must use inline styles
It replaces the whole document when the root layout fails, so `globals.css`
never loads. "No inline style objects" is impossible there.

**Ask:** either a blessed inline-styled design for it, or explicit permission to
hand-inline Playground values in that one file.

### B9. "Restyle by hand" components
The README covers avatar, toast, sheet, select, textarea, money-input, tabs,
popover and dropdown-menu with one prose bullet each. Workable, but they're the
components most likely to drift from the designer's intent.

**Ask (nice to have):** ship them as real `.tsx` files like the other 21.

> **2026-09-23:** still prose in the second handoff's `components/ui/` — none
> of `avatar`, `toast`, `sheet`, `select`, `textarea`, `money-input`, `tabs`,
> `popover`, `dropdown-menu` appear there as `.tsx` drop-ins. We have already
> restyled all nine by hand.
>
> But the second handoff also added `reference/components/{core,feedback,
> forms,navigation}/` — an entirely new directory; the first handoff had no
> `reference/` at all. Four of the nine now have real specs there, each as a
> `.jsx` + a typed `.d.ts` + a `.prompt.md` (usage and copy rules):
> - **Avatar** — `reference/components/core/Avatar.{jsx,d.ts,prompt.md}`
> - **Toast** — `reference/components/feedback/Toast.{jsx,d.ts,prompt.md}`
> - **Sheet** — `reference/components/feedback/Sheet.{jsx,d.ts,prompt.md}`
> - **Select** — `reference/components/forms/Select.{jsx,d.ts,prompt.md}`
>
> The remaining five — textarea, money-input, tabs, popover, dropdown-menu —
> still have nothing beyond the original README prose bullet. Still an open
> ask, narrowed to those five; the four above should be diffed against what we
> restyled by hand rather than re-derived from scratch.

### B10. Screens with no design at all
Not in the README's route table or its "also designed" list:
- `/admin` — plus three panels: access requests, allowed emails, error reports
- `/privacy`, `/terms`
- `not-found` ×2 (`app/(app)/not-found.tsx`, `trips/[tripId]/not-found.tsx`)
- `app/global-error.tsx` (see B8)
- `trips/[tripId]/help` (distinct from `/help`)
- the feedback launcher FAB — it's pinned off `--tp-tab-bar-h`, which moves
  4rem → 4.75rem with the new TabBar
- the notification bell / unread count

**Ask:** confirm these inherit tokens with no bespoke design, or send designs.

---

## C. Two things to confirm rather than draw

1. **Discreet mode.** The README says it's intentionally not redesigned and the
   prompt says restyle it with tokens only. Confirming that's still true.
2. **OfflineBanner.** The handoff's `ui/offline-banner.tsx` reimplements the
   online listener inline and takes a `queued` prop for a sync queue the app
   doesn't have — offline is read-only (ADR 0016) and only feedback notes queue
   (ADR 0041). The repo's existing banner is correct and already mounted, so
   phase 1 restyled it and did not adopt the handoff file. Flagging in case the
   designer intended a real queued state — if so, the sync queue would have to
   be built first, and that is a feature, not a restyle.

---

## Priority, if the list is too long

1. **B1 + B2 + B3** (colour systems) — without these I invent hues, and the
   invention shows up on ~200 call sites.
2. **`ui_kits/*`** — the screens themselves.
3. **`specs/notifications.html`** — step 7 is blocked without it.
4. **B4 ErrorPanel**, **B5 skeletons** — step 6.
5. Everything else can be derived.

---

## D. Defects in the handoff itself, found by building against it

These are not missing material — they are places where the delivered handoff is
internally inconsistent, or where it specifies a component in isolation that the
repo uses in more states than the designer saw. Each one was worked around
in-repo during phase 1; each will recur on every phase-2 screen unless fixed at
source.

### D1. The README promises 44px touch targets; two components ship smaller
`README.md` states "Touch targets are ≥ 44px; clickable chips are ≥ 28px with
8px spacing." But `components/ui/stepper.tsx` ships 36px (`size-9`) buttons and
`components/ui/switch.tsx` ships a 30px-tall track. `Chip` at 28px is fine — the
rule exempts it — and `Checkbox`/`ListRow` correctly use 44px.

**Worked around** by adding invisible 44px pseudo-element hit areas while keeping
the drawn controls at their designed size. **Ask:** either raise the drawn sizes,
or state explicitly in the README that these two controls carry an oversized
tappable region, so the next implementer does not "fix" the overlay away.

> **2026-09-23:** unfixed in the second handoff. `design_handoff/playground-2/components/ui/stepper.tsx`
> and `switch.tsx` ship the same 36px/30px sizes, and
> `design_handoff/playground-2/README.md:182` still reads "Touch targets are
> ≥ 44px." Still an open ask.

### D2. One toast appearance specified for a component with three variants
The README prescribes a single toast look: `rounded-md border-2 border-border
shadow-hard-2 bg-teal island`. The repo's toast has `default`, `success` and
`destructive` variants, and ~59 call sites pass one — many `destructive`
("Couldn't update that cost.", "Couldn't mark that paid."). Applying the single
look literally made every error toast render as a success.

**Worked around** by keeping teal for `default`/`success` and giving
`destructive` the `--destructive` fill. **Ask:** a specified destructive toast,
and confirmation that collapsing `default` and `success` into one appearance is
intended.

Related: `island` re-scopes `--foreground`/`--muted-foreground`/`--border` to
on-accent ink, which is correct on teal and wrong on any other fill. Any future
accent-filled component needs the same care. **Ask:** either an on-destructive
variant of `island`, or a note in the README that `island` is teal/coral/sun/
lilac only.

> **2026-09-23: partially answered.** `toast.tsx` is still not part of the
> second handoff's `components/ui/`, but `reference/components/feedback/
> Toast.d.ts` now defines a `tone` prop — `'teal' | 'coral' | 'sun' | 'lilac' |
> 'ink'`, default teal — with teal meaning "done" and coral meaning "heads-up".
> So the designer does intend tonal toasts, consistent with what we already
> ship for `default`/`success`.
>
> **What's still open, narrower than before:** there is no explicit *error*
> tone — "heads-up" is not the same as "this failed". We render `destructive`
> on `--destructive` (`#B8391D` light), a different token from `--coral`
> (`#FF6B4A` light) — though the two converge in dark mode (`#E8866C` both).
> The live ask is now specific: **is an error toast meant to be `tone="coral"`,
> or does the system want a distinct destructive tone the `.d.ts` doesn't list
> yet?**

### D3. `ErrorPanel` is named but not shipped
The README's states row reads "Skeleton, ErrorPanel, OfflineBanner", but
`components/ui/` contains no `error-panel.tsx`. This blocks the per-route
`error.tsx` work. Already listed in section B4 — repeated here because it is a
delivery gap rather than a scope decision.

> **2026-09-23: delivered.** `design_handoff/playground-2/components/ui/error-panel.tsx`
> is in the second handoff. Closed.

### D4. Two shipped assets are referenced by nothing
`public/favicon-16.png` and `public/safari-pinned-tab.svg` are in the handoff,
but the handoff's own `app/layout.tsx` never references either. Wired up in
phase 1. **Ask:** confirm the intended `mask-icon` colour — we used the
Playground coral `#FF6B4A`, and a `mask-icon` requires a literal colour by spec,
so it cannot follow a token.

### D5. `--muted-foreground` does not meet its own README's contrast claim
`design_handoff/playground-2/README.md` describes `--muted-foreground` as
"5.5:1+". Measured from rendered RGB (not the rounded hex comments in
`globals.css`, which disagree with the true conversion), the shipped dark value
`38 11% 60%` (`#A59D8F`) measures **5.257:1** on `--card` — short of the
README's own claim — and **4.499:1** on `--muted`, which fails WCAG AA (4.5:1)
outright. This showed up as 8 of the 34 findings in the first full-app contrast
audit: every `text-muted-foreground` on `bg-muted` badge pill, dark theme,
on the plan and calendar routes, failing by a thousandth. (The audit's other
26 findings are unrelated white bullets on globe map pins — a separate defect,
owned by a different task; see the commit history for the corrected
decomposition. An earlier draft of this entry said "~29 of 34" for the badge
share, reasoning from an /globe measurement taken before its Leaflet markers
had finished mounting, which undercounted the pin failures and so overcounted
the badge share. Re-measured with the app rendered and Leaflet markers
confirmed present before reading colours, the true split is 8 badge + 26
globe pin = 34.)

**Worked around** by raising the token locally to `38 11% 62%` (`#A9A193`),
which measures 4.780:1 on muted and 5.584:1 on card — clearing AA and making
the README's "5.5:1+" claim true. Light mode was not touched; it already
measures 4.707:1 and clears. **Ask:** fix the token at source so the shipped
value matches the handoff's own documented contrast, rather than relying on
this local override.

### D-phase-3 (added 2026-09-24)

Handoff defects found while building phase 3 are appended here, one bullet each:
`- **<file>** — <what's wrong> — <what we did instead>.`

- **`reference/components/navigation/ListRow.jsx` + `shared/admin.jsx` `TripSettings`** — ListRow
  wraps `trailing` in `aria-hidden="true"` (right for the default chevron), yet TripSettings passes
  an interactive `Toggle` there ("Read-only link"), which hides the switch from assistive tech —
  on Account we render the `Switch` / Remove button as a sibling of the row, not in `trailing`.
- **`app/global-error.tsx`** — the badge, `<h1>` and `.tp-btn` use `font: "800 30px/1 inherit"`
  (and `800 15px/1 inherit`); `inherit` is CSS-wide and can't sit inside the `font` shorthand, so
  browsers drop the whole declaration and the heading/badge fall back to UA sizes — we spell the
  family out (`800 30px/1 ui-sans-serif, system-ui, …`, the `<body>` stack), keeping the intended
  sizes and weights; a test forbids `inherit` inside a `font` shorthand.

---

## E. What phase 1 learned, for whoever briefs phase 2

Six things broke quietly while adopting this handoff. None was caught by the
test suite; each was found by diffing the old file against the new and asking
what a removed line was *for*.

The general shape: **a design system describes a surface in isolation; a
codebase has that surface in states, variants and accumulated bug fixes the
designer never saw.** The fixes are usually invisible — a pseudo-element
covering a gap during iOS elastic overscroll, a hover background that has to
derive from the same variable as its text, an icon path pointing at a generated
route. They look decorative and they are load-bearing.

Full list and detail in `docs/adr/0060-playground-visual-system.md`.
