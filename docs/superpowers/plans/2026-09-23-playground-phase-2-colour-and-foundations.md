# Playground Phase 2 — Colour and Foundations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adopt the Playground hue ramp across every call site still rendering raw Tailwind palette colours, land the shared pieces the second handoff delivered (ErrorPanel, skeletons, outlined logo, per-route loading/error), and restructure navigation into the kit's rail shell — so the app stops looking half-migrated and phase 3 can restyle screens against a stable foundation.

**Architecture:** Bottom-up again. `app/globals.css` gains a nine-hue token ramp. `lib/hues.ts` becomes the single source of hue→class mapping, and `categories.ts`, `chapter-colours.ts`, `map-palette.ts`, `map-pins.ts` and a derived `stop-colours.ts` all route through it. Crucially the *stored* values (`sky`, `amber`, `emerald`…) are unchanged, so there is no database migration — only labels and class mappings move. Call sites then stop hard-coding palette classes and ask the helpers instead. Finally, navigation merges trip-scoped and app-scoped nav into the kit's single left rail, keeping every piece of routing behaviour the kit has no concept of.

**Tech Stack:** Next.js 16, React 19, Tailwind v4 (CSS-first `@theme inline`), Radix UI, class-variance-authority, lucide-react, motion, Leaflet, Vitest + Testing Library.

## Global Constraints

Every task's requirements implicitly include this section.

- **Branch:** all work on `feat/playground-phase-2`, cut from `beta` at `37281af`. **Never** commit, merge, rebase onto or push to `main`/`master`. **Never** merge into `beta` — stop and ask. **Never** deploy.
- **Source material** is `design_handoff/playground-2/`. The older `design_handoff/playground/` is phase 1's handoff — read it for history, never copy from it.
- **Tailwind v4 classes only.** No new hex values outside `app/globals.css`, `lib/map-palette.ts` and `lib/map-pins.ts` (Leaflet needs literal colour strings — `divIcon` markers are inline-styled HTML and polylines take a hex).
- **No inline style objects for visual values.** Computed values only (a width percentage, a size prop), as recorded in ADR 0060.
- **Accent colour as text on neutral surfaces** uses the `*-text` tokens — `text-hue-sky-text`, `text-coral-text` and friends — never a fill token as text.
- **Server Components stay Server Components.** Only leaves needing state or handlers are client. Never push `"use client"` up the tree.
- **Accessibility:** 44px touch targets, `aria-current` on nav, labels on icon-only buttons, the global 3px `:focus-visible` ring, body text ≥ 4.5:1 in both themes.
- **Money is a shared pot.** No per-person splitting exists and none may be added.
- **Gates after every task:** `npx tsc --noEmit`, `npm run lint`, `npm test`, then `npm run build`. All four must pass before the next task starts.
- When a test asserts a class name, update the **assertion**, never the behaviour.

## DO NOT OVERWRITE — read this before copying any file

Three files in `design_handoff/playground-2/components/ui/` are **byte-identical to the first handoff** and therefore *older* than what is in the repo. They differ from our versions only because phase 1 fixed real bugs in them. Copying any of them silently reverts that work, and no test will catch two of the three:

| File | What phase 1 added | What re-copying would break |
|---|---|---|
| `dialog.tsx` | `before:`/`after:` pseudo-element covers on the sticky header and footer | The gap opened by their negative margins becomes visible during iOS elastic overscroll. Invisible outside a real iPhone. |
| `stepper.tsx` | A centred `before:size-11` invisible hit area | Touch target drops to 36px, below the 44px rule. |
| `switch.tsx` | A full-width `before:h-11` invisible hit area | Touch target drops to 30px. |

`components/ui/dialog.test.tsx`, `stepper.test.tsx` and `switch.test.tsx` carry regression tests for all three. If a task makes one of those fail, the fix is to restore the mechanism — never to weaken the test.

Only **`logo.tsx`** was genuinely revised by the designer between handoffs. Everything else in `components/ui` is unrevised.

## Out of Scope (phase 3 — do not build)

- Restyling individual screens against `design_handoff/playground-2/reference/ui_kits/*`.
- Porting `emails/*.html` and the `docs/notifications.md` copy rules.
- The Open Graph images (`app/opengraph-image.tsx`, `app/share/[token]/opengraph-image.tsx`, `lib/og-card.tsx`).
- The new screens the handoff supplies: `app/(app)/admin/page.tsx`, `components/legal/legal-page.tsx`, `components/trip/notification-bell.tsx`, the three `not-found.tsx` files, `app/global-error.tsx`.
- The ⌘K palette (already exists), discreet mode (intentionally not redesigned).

## File Structure

**Created:**
- `lib/hues.ts` — `HUES`, `Hue`, `HueClasses`, `HUE_CLASSES`, `LEGACY_TO_HUE`, and the legacy-tolerant lookup. The single source of hue→class mapping.
- `lib/map-palette.ts` — `hueHex`, `MAP_INK`, `MapTheme`, `mapInk`, `routeStyles`. Leaflet's literal colours.
- `components/ui/error-panel.tsx` — `ErrorPanel`, `InlineError`. Server.
- `components/ui/skeletons.tsx` — List/Detail/Calendar/Map/Form skeleton archetypes. Server.
- `components/ui/tab-bar.tsx` — presentational mobile bar. Client.
- `components/ui/dock.tsx` — presentational md+ rail. Client.
- `components/ui/logo-paths.ts` — outlined wordmark paths.
- ~35 `loading.tsx` and `error.tsx` files across `app/(app)/`.

**Modified:**
- `app/globals.css` — adds the nine-hue ramp; keeps phase 1's restored comments; `--tp-tab-bar-h` 4rem → 4.75rem in Task 7 only.
- `lib/categories.ts`, `lib/chapter-colours.ts`, `lib/map-pins.ts` — re-routed through `hues.ts`. Export supersets; stored values unchanged.
- `lib/stop-colours.ts` — derived from `hues.ts`. The handoff does not supply this one.
- `components/ui/logo.tsx` — outlined paths, no font dependency.
- ~36 files carrying raw Tailwind palette classes.
- `app/(app)/layout.tsx`, `app/(app)/trips/[tripId]/layout.tsx`, `components/trip/trip-nav.tsx`, `components/trip/mobile-tab-bar.tsx` — the rail shell.
- `docs/follow-ups/2026-09-23-playground-design-ask.md` — mark what arrived.

---

### Task 1: Land the second handoff

Commit the delivered material so every later task reads from a tracked path, and update the ask document so it reflects what is now outstanding rather than what was outstanding yesterday.

**Files:**
- Add to git: `design_handoff/playground-2/` (262 files, currently untracked)
- Modify: `docs/follow-ups/2026-09-23-playground-design-ask.md`
- Verify: `tsconfig.json` already excludes `design_handoff` — do not change it

**Interfaces:**
- Consumes: nothing.
- Produces: the tracked path `design_handoff/playground-2/`, from which every later task copies.

- [ ] **Step 1: Confirm branch and starting state**

```bash
cd /work
git branch --show-current          # must print: feat/playground-phase-2
git status --short | head          # expect: ?? design_handoff/playground-2/
ls design_handoff/                 # expect: playground  playground-2
```

If the branch is wrong, STOP and report BLOCKED.

- [ ] **Step 2: Confirm the exclude still holds**

The handoff contains `.tsx` files importing components that do not exist yet. `tsconfig.json` must keep excluding it or `tsc` fails on material we never ship.

```bash
cd /work
grep '"exclude"' tsconfig.json     # expect: ["node_modules", "design_handoff"]
```

- [ ] **Step 3: Update the ask document**

Open `docs/follow-ups/2026-09-23-playground-design-ask.md`. It currently reads as if nothing has been delivered. Add a dated section at the top of section A and B recording what the second handoff supplied:

Delivered — `reference/ui_kits/teepee-{mobile,tablet,desktop}` plus `reference/ui_kits/shared/*.jsx`; `reference/specs/{index,motion,notifications}.html`; `docs/notifications.md`; `lib/hues.ts` (one nine-hue ramp serving both categories and chapters); `lib/map-palette.ts` and `lib/map-pins.ts`; `components/ui/error-panel.tsx`; `components/ui/skeletons.tsx`; the OG images and `lib/og-card.tsx`; `public/brand/*.svg` and `logo-paths.ts`; `app/global-error.tsx`; and the missing screens (admin, three not-founds, `(app)/error.tsx`, legal, notification bell).

Still outstanding — mark these clearly, they are the live asks:
- **D1 touch targets: NOT fixed.** `stepper.tsx` still ships 36px buttons and `switch.tsx` a 30px track, with no hit-area mechanism, while the README still promises ≥44px. We work around it in-repo; it should be fixed at source.
- **D2 toast variants: not addressed.** `toast.tsx` is not in the second handoff, so nothing was overwritten, but the single-appearance problem remains unanswered.
- **B9:** the "restyle by hand" components (`avatar`, `toast`, `sheet`, `select`, `textarea`, `money-input`, `tabs`, `popover`, `dropdown-menu`) are still prose bullets rather than files. We have already done them by hand.
- **New:** `lib/stop-colours.ts` (per-stop colour bands keyed by `sortOrder`, used by the month grid and plan editor) has no handoff equivalent. We derive it from `hues.ts`; worth confirming the designer is happy with that derivation.

- [ ] **Step 4: Run the gates**

```bash
cd /work
npx tsc --noEmit && npm run lint && npm test && npm run build
```

Expected: all four pass. This task adds only untracked reference material and edits one markdown file, so a failure means the branch was already broken.

- [ ] **Step 5: Commit**

```bash
cd /work
git add design_handoff/playground-2 docs/follow-ups/2026-09-23-playground-design-ask.md
git commit -m "chore(design): land the second Playground handoff

262 files answering most of the phase 1 ask: the screen kits and specs, the
notification copy rules, a nine-hue categorical ramp serving both item
categories and chapter bands, a Leaflet map palette, ErrorPanel, the skeleton
archetypes, the OG images, outlined wordmark SVGs, global-error, and the
screens that had no design at all.

Records what is still outstanding rather than letting the old ask rot: the
44px touch-target defect is unfixed at source, the toast variant question is
unanswered, the restyle-by-hand components are still prose, and stop-colours
has no handoff equivalent so we derive it.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Hue tokens in `app/globals.css`

Add the nine-hue ramp. The rest of the file is already Playground — this is additive, not another wholesale swap.

**Files:**
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: `design_handoff/playground-2/app/globals.css` (Task 1).
- Produces, for Tasks 3–7: the CSS variables `--hue-{sky,sun,leaf,lilac,pink,teal,coral,indigo,stone}` and `--hue-*-text`, plus their `@theme inline` `--color-hue-*` mappings, so `bg-hue-sky`, `text-hue-leaf-text`, `bg-hue-pink/25` all resolve.

- [ ] **Step 1: See exactly what the handoff adds**

Do not copy the file wholesale. Diff it first so the change stays reviewable.

```bash
cd /work
diff app/globals.css design_handoff/playground-2/app/globals.css
```

Expect roughly 65 differing lines, almost all the hue block and its `@theme inline` mappings.

- [ ] **Step 2: Record the current token surface**

```bash
cd /work
grep -oE "^\s*--[a-z-]+" app/globals.css | tr -d ' ' | sort -u > /tmp/tokens-before.txt
wc -l /tmp/tokens-before.txt
```

- [ ] **Step 3: Add the hue variables**

Copy the `--hue-*` and `--hue-*-text` declarations from the handoff's `:root` block into our `:root`, and the dark-theme values from its `.dark` block into our `.dark`. Both sets, all nine hues — light and dark differ.

Place them adjacent to the existing `--coral`/`--sun`/`--teal`/`--lilac` declarations so related tokens sit together.

- [ ] **Step 4: Add the `@theme inline` mappings**

For each hue, add the corresponding `--color-hue-*: hsl(var(--hue-*));` and `--color-hue-*-text: hsl(var(--hue-*-text));` entries to the `@theme inline` block. Without these Tailwind emits nothing and every `bg-hue-*` class silently does nothing — no error, just uncoloured elements.

- [ ] **Step 5: Verify nothing was lost and everything was gained**

```bash
cd /work
grep -oE "^\s*--[a-z-]+" app/globals.css | tr -d ' ' | sort -u > /tmp/tokens-after.txt
echo "--- lost (must be empty) ---"
comm -23 /tmp/tokens-before.txt /tmp/tokens-after.txt
echo "--- hue tokens present (expect 18 + 18 theme mappings) ---"
grep -c "^\s*--hue-" app/globals.css
grep -c "^\s*--color-hue-" app/globals.css
```

The "lost" list must be empty. If a token disappeared, every utility using it is now silently dead — add it back before continuing.

- [ ] **Step 6: Confirm phase 1's restored comments survived**

Phase 1 restored two explanatory comments that an earlier wholesale copy had destroyed. They must still be here.

```bash
cd /work
grep -B8 "^\.leaflet-container" app/globals.css | grep -c "isolate\|z-index\|stacking"
grep -B6 "tp-fade-in-sheet" app/globals.css | grep -c "slide-up\|backdrop\|together"
```

Both must be non-zero. If either is gone, you copied the file wholesale instead of merging the hue block — revert and redo Step 3.

- [ ] **Step 7: Confirm `--tp-tab-bar-h` is still 4rem**

It moves to 4.75rem in Task 7, with the TabBar, not before.

```bash
cd /work
grep -A1 "tp-tab-bar-h" app/globals.css | grep "4rem"
```

- [ ] **Step 8: Prove a hue class actually compiles**

A token that exists but is not wired into `@theme` produces no utility and no error. Prove otherwise.

```bash
cd /work
npm run build
grep -rl "hue-sky" .next/static/css/ 2>/dev/null | head -1 || echo "NOT EMITTED — check the @theme inline mappings"
```

If nothing matches, Tailwind has not seen a `bg-hue-sky` usage yet, which is expected at this point — in that case add a temporary `<div className="bg-hue-sky" />` to any page, rebuild, confirm it appears in the CSS, then remove it. Record what you did.

- [ ] **Step 9: Run the gates**

```bash
cd /work
npx tsc --noEmit && npm run lint && npm test && npm run build
```

- [ ] **Step 10: Commit**

```bash
cd /work
git add app/globals.css
git commit -m "feat(design): add the nine-hue Playground ramp to the tokens

sky, sun, leaf, lilac, pink, teal, coral, indigo and stone, each with a
matching -text token for use on neutral surfaces, in both themes. Added as a
merge rather than another wholesale file swap, so phase 1's restored
rationale comments survive and the token surface is verifiably a superset.

--tp-tab-bar-h stays at 4rem; it moves with the TabBar, not before.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: The colour modules

Route every colour helper through one ramp. The stored values do not change, so there is no migration — this is the single most important property of this task and it must be verified, not assumed.

**Files:**
- Create: `lib/hues.ts`, `lib/map-palette.ts`
- Modify: `lib/categories.ts`, `lib/chapter-colours.ts`, `lib/map-pins.ts`, `lib/stop-colours.ts`
- Create: `lib/hues.test.ts`

**Interfaces:**
- Consumes: hue tokens from Task 2.
- Produces: `HUES`, `Hue`, `HUE_CLASSES` (keys `chip`/`dot`/`text`/`soft`/`fill`), `LEGACY_TO_HUE`; `hueHex(hue, dark)`, `MAP_INK`, `mapInk`, `routeStyles`; `categoryClasses`; `chapterColourSwatch(value, dark?)`; `pinSize`, `pinHtml`. Task 4 consumes all of these.

- [ ] **Step 1: Copy the two new modules**

```bash
cd /work
cp design_handoff/playground-2/lib/hues.ts lib/hues.ts
cp design_handoff/playground-2/lib/map-palette.ts lib/map-palette.ts
```

- [ ] **Step 2: Record the stored values before touching anything**

`chapter.colour` is persisted (`prisma/schema.prisma:269`, a `String`). If its permitted values change, existing rows become invalid and chapters silently fall back to the first colour.

```bash
cd /work
grep -oE 'value: "[a-z]+"' lib/chapter-colours.ts | sed 's/value: //' | tr '\n' ' '
```

Write the output into your report. Expect: `"sky" "amber" "emerald" "violet" "rose" "teal" "orange" "indigo"`.

- [ ] **Step 3: Replace the three handoff-supplied modules**

```bash
cd /work
cp design_handoff/playground-2/lib/categories.ts lib/categories.ts
cp design_handoff/playground-2/lib/chapter-colours.ts lib/chapter-colours.ts
cp design_handoff/playground-2/lib/map-pins.ts lib/map-pins.ts
```

- [ ] **Step 4: Prove the stored values are unchanged**

```bash
cd /work
grep -oE 'make\("[a-z]+"' lib/chapter-colours.ts | sed 's/make(//' | tr '\n' ' '
grep -oE '^const VALUES = \[[^]]*\]' lib/chapter-colours.ts
grep -oE 'value: "[A-Z_]+"' lib/categories.ts | sed 's/value: //' | tr '\n' ' '
```

The chapter values must still be `sky amber emerald violet rose teal orange indigo` — the *labels* change to Sun/Leaf/Lilac/Pink/Coral, the values do not. The category values must still be the seven `SIGHTSEEING`…`OTHER`.

**If any stored value changed, STOP and report BLOCKED** — that would need a data migration, which is outside this plan's scope.

- [ ] **Step 5: Write a test that pins the no-migration property**

This is the guarantee most worth protecting: it is invisible in the UI and catastrophic if broken. Create `lib/hues.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { CHAPTER_COLOUR_VALUES, chapterColourMeta } from "@/lib/chapter-colours";
import { CATEGORY_VALUES, categoryMeta } from "@/lib/categories";
import { HUES, HUE_CLASSES, LEGACY_TO_HUE } from "@/lib/hues";

describe("stored colour values never change", () => {
  // chapter.colour is persisted as a String (prisma/schema.prisma). Renaming a
  // value would orphan every existing row, and the fallback is silent.
  it("keeps the eight chapter colour values the database already holds", () => {
    expect([...CHAPTER_COLOUR_VALUES]).toEqual([
      "sky", "amber", "emerald", "violet", "rose", "teal", "orange", "indigo",
    ]);
  });

  it("resolves every stored chapter value to a real hue", () => {
    for (const v of CHAPTER_COLOUR_VALUES) {
      expect(LEGACY_TO_HUE[v], `no hue mapping for stored value "${v}"`).toBeDefined();
      expect(chapterColourMeta(v).chipClass).toBeTruthy();
    }
  });

  it("keeps the seven category values the database already holds", () => {
    expect([...CATEGORY_VALUES]).toEqual([
      "SIGHTSEEING", "FOOD", "ACTIVITY", "NIGHTLIFE", "SHOPPING", "GETTING_AROUND", "OTHER",
    ]);
  });

  it("gives every category a hue with a full class set", () => {
    for (const v of CATEGORY_VALUES) {
      expect(categoryMeta(v).label).toBeTruthy();
    }
  });

  it("gives every hue all five class variants", () => {
    for (const h of HUES) {
      const c = HUE_CLASSES[h];
      expect(c.chip).toBeTruthy();
      expect(c.dot).toBeTruthy();
      expect(c.text).toBeTruthy();
      expect(c.soft).toBeTruthy();
      expect(c.fill).toBeTruthy();
    }
  });

  it("falls back rather than throwing on an unknown stored value", () => {
    expect(() => chapterColourMeta("chartreuse")).not.toThrow();
    expect(chapterColourMeta("chartreuse").chipClass).toBeTruthy();
  });
});
```

- [ ] **Step 6: Run it**

```bash
cd /work
npm test -- lib/hues.test.ts
```

Expected: PASS. If the chapter or category assertion fails, the handoff changed a stored value — STOP and report BLOCKED rather than editing the test.

- [ ] **Step 7: Derive `lib/stop-colours.ts` from the ramp**

The handoff supplies no replacement for this one. It gives each stop a colour band keyed by `stop.sortOrder`, cycling through six hues, and is consumed by `components/trip/month-grid.tsx` and `components/trip/stop-card.tsx`.

Rewrite it so the strings come from `HUE_CLASSES` instead of raw Tailwind, keeping its three exported functions and their signatures exactly: `stopBandBorderClass(index)`, `stopDotClass(index)`, `stopPillClass(index)`.

Keep the existing six-hue cycle and its order, mapped through `LEGACY_TO_HUE`: `sky → sky`, `amber → sun`, `emerald → leaf`, `violet → lilac`, `rose → pink`, `teal → teal`. Keep the modulo index helper so a negative or out-of-range index still lands in the palette.

`stopBandBorderClass` returns a left-border class, for which the ramp has no direct equivalent — derive it from the hue's fill token (`border-l-hue-sky` style) and add the matching `--color-hue-*` usage if Tailwind needs it. Say in your report what you chose.

- [ ] **Step 8: Run the gates**

```bash
cd /work
npx tsc --noEmit && npm run lint && npm test && npm run build
```

Expect test failures in files asserting old class strings — `components/trip/category-pill.test.tsx` and similar. Update those **assertions**, and list each with old and new values in your report.

- [ ] **Step 9: Commit**

```bash
cd /work
git add lib
git commit -m "feat(colour): route every colour helper through one hue ramp

categories, chapter colours, map pins and stop bands now all resolve through
lib/hues.ts instead of hard-coding Tailwind palette classes. The ramp is nine
hues serving two jobs: a fixed mapping for item categories, and a user-picked
one for chapter bands.

No migration. The stored values are deliberately unchanged -- chapter.colour
still holds sky/amber/emerald/violet/rose/teal/orange/indigo and only the
labels and class mappings move, via LEGACY_TO_HUE. lib/hues.test.ts pins that
property, because it is invisible in the UI and would silently orphan every
existing chapter row if it ever broke.

stop-colours.ts has no handoff equivalent and is derived from the same ramp.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Sweep the raw palette call sites

36 files still hard-code Tailwind palette classes. This is what makes the app read as half-migrated.

**Files:**
- Modify: the ~36 files matching the sweep grep, notably `components/trip/category-pill.tsx`, `category-dot.ts`, `accommodation-card.tsx`, `accommodation-row.tsx`, `compare-table.tsx`, `flag-list.tsx`, `timeline.tsx`, `transport-countdown.tsx`, `components/trip/home/phase-travelling.tsx`, `app/(app)/trips/[tripId]/budget/page.tsx`
- Modify: the 4 test files asserting on those classes

**Interfaces:**
- Consumes: everything Task 3 produced.
- Produces: no new API. Behaviour unchanged throughout.

- [ ] **Step 1: Get the full list**

```bash
cd /work
grep -rlE "\b(bg|text|border|fill|stroke)-(sky|amber|emerald|violet|rose|indigo|stone|teal|orange)-[0-9]{2,3}\b" \
  --include=*.tsx --include=*.ts app components lib | sort
```

Work through it file by file. Keep the list in your report with a tick against each.

- [ ] **Step 2: Replace each raw class with a helper call**

For each site, decide which of the five class variants the usage wants, and take it from the appropriate helper rather than writing the class by hand:

- a coloured pill or chip → `chip`
- a small leading dot → `dot`
- coloured text or an icon on paper/card → `text`
- a large tinted area, band or header → `soft`
- a solid bar or rail → `fill`

Use `categoryClasses(...)` for item categories, `chapterColourMeta(...)` for chapter bands, the `stop-colours.ts` helpers for stop bands, and `HUE_CLASSES` directly only where the colour is genuinely not one of those three concepts.

Do **not** introduce `bg-hue-${x}` template strings anywhere. Tailwind's scanner cannot see them and the class will not be emitted. The helpers exist precisely because the strings must be written out in full — `lib/hues.ts` says so in its own header comment.

- [ ] **Step 3: Handle the non-hue survivors honestly**

Some matches will be status colours rather than category hues — a red error, a green tick. Those belong on `--destructive`, `--success`, `--warning` or `--over`, which already exist. Do not force them into the hue ramp. List every such case in your report with the token you chose.

- [ ] **Step 4: Verify the sweep is complete**

```bash
cd /work
grep -rnE "\b(bg|text|border|fill|stroke)-(sky|amber|emerald|violet|rose|indigo|stone|teal|orange)-[0-9]{2,3}\b" \
  --include=*.tsx --include=*.ts app components lib | grep -v "\.test\."
```

Read every remaining line. Each must be either a deliberate status colour you justified in Step 3, or gone. If a category, chapter or stop colour is still raw, fix it.

- [ ] **Step 5: Verify by reading source, NOT by inspecting the compiled CSS**

A `bg-hue-*` class Tailwind never saw produces no CSS and no error, so this needs checking — but **the obvious check does not work, and Task 2 proved it.**

Tailwind v4's candidate scanner is text-based and has no concept of comments, prose or markup. It treats *any* file it scans as a source of class-name strings. Three things therefore keep hue utilities alive in the compiled CSS regardless of whether a single component uses them:

- `design_handoff/` is committed and not gitignored, so all 300+ reference files are scanned;
- `app/globals.css`'s own explanatory comment spells out `bg-hue-sky`, `text-hue-sky-text`, `border-hue-sky`;
- this very plan document quotes `bg-hue-sky` and `bg-hue-pink`.

So "the class is in the CSS" proves nothing about your sweep. Task 2's emission check passed for exactly these reasons while proving nothing.

**First, stop the largest source of noise.** Add to `app/globals.css`, immediately after `@import "tailwindcss";`:

```css
/*
 * design_handoff/ is committed reference material, not application code, but
 * Tailwind v4 auto-discovers content and only skips gitignored paths — so
 * without this it scans 300+ reference files and ships their utilities.
 * Note this does not fully isolate us: the scanner reads prose too, so a class
 * name written in any committed comment or doc stays in the bundle regardless.
 */
@source not "../design_handoff";
```

Confirmed valid for the installed Tailwind (v4.3.3). Rebuild and record the size change — Task 2 measured ~5.4KB of the ~130KB main chunk attributable to the handoff.

**Then verify your actual work by reading the source:**

```bash
cd /work
grep -rnoE "\bhue-[a-z]+" --include=*.tsx --include=*.ts app components lib | grep -v "\.test\." | sed 's/.*://' | sort -u
```

Every hue name that appears must be one of the nine (`sky`, `sun`, `leaf`, `lilac`, `pink`, `teal`, `coral`, `indigo`, `stone`). A typo produces a class that exists nowhere and fails silently.

Then confirm no class is being assembled dynamically, which the scanner cannot see at all:

```bash
cd /work
grep -rnE "(bg|text|border|fill|stroke)-hue-\\\$\{|\`[^\`]*hue-\\\$\{" --include=*.tsx --include=*.ts app components lib
```

This must return nothing. If it matches, that call site is building a class name at runtime and will render uncoloured — replace it with a lookup through the helpers, which is precisely why `lib/hues.ts` writes every class string out in full.

- [ ] **Step 6: Run the gates**

```bash
cd /work
npx tsc --noEmit && npm run lint && npm test && npm run build
```

Update class assertions in the 4 affected test files; list each with old and new values.

- [ ] **Step 7: Commit**

```bash
cd /work
git add -A
git commit -m "feat(colour): move every call site onto the hue ramp

Replaces hard-coded Tailwind palette classes across ~36 files with calls to
the category, chapter and stop-colour helpers. This is the change that stops
the app reading as a Playground shell wrapped around old-palette content.

Status colours -- errors, ticks, warnings -- deliberately stay on
--destructive/--success/--warning rather than being forced into the hue ramp,
since those carry a different kind of meaning.

No template-literal class names: Tailwind's scanner cannot see them, and a
class it never sees is emitted as nothing at all, with no error.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Logo, ErrorPanel and skeletons

Three additive pieces, all low-risk, all prerequisites for Task 6.

**Files:**
- Create: `components/ui/error-panel.tsx`, `components/ui/skeletons.tsx`, `components/ui/logo-paths.ts`
- Modify: `components/ui/logo.tsx`
- Copy: `design_handoff/playground-2/public/brand/*.svg` → `public/brand/`

**Interfaces:**
- Consumes: hue tokens (Task 2).
- Produces, for Task 6:
  - `ErrorPanel({ kind?, title?, description?, actions?, digest?, layout?: "page" | "card" })` and `InlineError({ children, action?, className? })` — both Server Components, both handler-free. The caller passes `actions`; `error.tsx` owns `reset`.
  - `ListSkeleton({ rows?, label? })`, `DetailSkeleton({ label? })`, `CalendarSkeleton({ label? })`, `MapSkeleton({ height?, label? })`, `FormSkeleton({ fields?, label? })` — all named exports from `components/ui/skeletons.tsx`.

- [ ] **Step 1: Copy the new files**

```bash
cd /work
cp design_handoff/playground-2/components/ui/error-panel.tsx components/ui/
cp design_handoff/playground-2/components/ui/skeletons.tsx components/ui/
cp design_handoff/playground-2/components/ui/logo-paths.ts components/ui/
mkdir -p public/brand && cp design_handoff/playground-2/public/brand/*.svg public/brand/
ls public/brand/   # expect: lockup-on-dark.svg lockup.svg wordmark-on-dark.svg wordmark.svg
```

- [ ] **Step 2: Update the logo**

`logo.tsx` is the one file the designer genuinely revised between handoffs. The new version draws the wordmark as outlined paths from `logo-paths.ts` instead of live Bricolage text, which removes the font dependency — the old one rendered wrong if the font had not loaded.

```bash
cd /work
diff components/ui/logo.tsx design_handoff/playground-2/components/ui/logo.tsx
cp design_handoff/playground-2/components/ui/logo.tsx components/ui/logo.tsx
```

Read the diff before copying and record in your report what changed. Confirm afterwards that the brand hex values are still present and still carry their explanatory comment — a brand mark must not theme-shift, and that exemption is recorded in ADR 0060.

- [ ] **Step 3: Confirm the client/server split**

```bash
cd /work
head -1 components/ui/error-panel.tsx components/ui/skeletons.tsx components/ui/logo.tsx
```

None of the three may start with `"use client"`. All are Server Components; a stray directive drags their importers into the client bundle. If `error-panel.tsx` needs a retry handler, that handler belongs in the `error.tsx` boundary that uses it — which is already a Client Component by Next's convention — not in the panel.

- [ ] **Step 4: Verify the three protected files are untouched**

```bash
cd /work
git status --short components/ui/
```

`dialog.tsx`, `stepper.tsx` and `switch.tsx` must NOT appear. If any does, you copied more than this task asked for — revert them.

- [ ] **Step 5: Write a smoke test for ErrorPanel**

It is the component every `error.tsx` will lean on, so its accessible shape matters. Create `components/ui/error-panel.test.tsx`:

Note its actual API, which is deliberately handler-free: `ErrorPanel({ kind?, title?, description?, actions?, digest?, layout? })`. It is a **Server Component**, so it takes no `onRetry` — the caller passes `actions` as a ReactNode, and `error.tsx` (a Client Component by Next's convention) owns `reset`. The test must reflect that.

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ErrorPanel } from "@/components/ui/error-panel";

describe("ErrorPanel", () => {
  it("shows the title and description it is given", () => {
    render(<ErrorPanel title="Couldn't load your trip" description="Check your connection." />);
    expect(screen.getByText("Couldn't load your trip")).toBeInTheDocument();
    expect(screen.getByText("Check your connection.")).toBeInTheDocument();
  });

  it("renders caller-supplied actions, keeping the handler in the caller", async () => {
    const reset = vi.fn();
    render(
      <ErrorPanel
        title="Couldn't load your trip"
        actions={<button onClick={reset}>Try again</button>}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(reset).toHaveBeenCalledOnce();
  });

  it("renders no action area when the caller supplies none", () => {
    render(<ErrorPanel title="Couldn't load your trip" />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows the digest so it can be quoted, never the raw message", () => {
    render(<ErrorPanel title="Something went wrong" digest="abc123" />);
    expect(screen.getByText(/abc123/)).toBeInTheDocument();
  });
});
```

If any assertion does not match what the component renders, match the **component** — adjust the test, never the component.

- [ ] **Step 6: Run it**

```bash
cd /work
npm test -- components/ui/error-panel.test.tsx
```

- [ ] **Step 7: Run the gates**

```bash
cd /work
npx tsc --noEmit && npm run lint && npm test && npm run build
```

- [ ] **Step 8: Commit**

```bash
cd /work
git add components/ui public/brand
git commit -m "feat(ui): add ErrorPanel and the skeleton archetypes, outline the wordmark

ErrorPanel and InlineError give every error.tsx boundary a shared shape, and
skeletons.tsx supplies the five loading archetypes -- list, detail, calendar,
map and form -- that the per-route loading files compose from.

Logo now draws its wordmark from outlined paths rather than live Bricolage
text, so it renders correctly before the font loads. This is the only file
the designer actually revised between the two handoffs.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Per-route loading and error states

Every route gets a skeleton and a boundary. Five `loading.tsx` and two `error.tsx` already exist — restyle those rather than duplicating them.

**Files:**
- Create: `loading.tsx` and `error.tsx` across `app/(app)/` routes lacking them
- Modify: the five existing `loading.tsx` and two existing `error.tsx`

**Interfaces:**
- Consumes: `ErrorPanel` and the skeleton archetypes (Task 5).
- Produces: nothing other tasks depend on.

- [ ] **Step 1: Inventory what exists**

```bash
cd /work
find app -name "loading.tsx" -o -name "error.tsx" | sort
find app/\(app\) -name "page.tsx" | sed 's|/page.tsx||' | sort
```

The second list is every route. Build a table in your report: route, has-loading, has-error, and which skeleton archetype fits.

- [ ] **Step 2: Restyle the existing seven first**

`app/(app)/error.tsx`, `app/(app)/trips/[tripId]/error.tsx`, and the five `loading.tsx` files under `budget`, `calendar`, `plan`, `summary` and `trips/[tripId]`. Move them onto `ErrorPanel` and the shared archetypes so they match everything you are about to add. Do not change their behaviour — an `error.tsx` receives `error` and `reset`, and must keep calling `reset`.

- [ ] **Step 3: Add the missing ones**

For each route without them, add a `loading.tsx` composing the archetype that matches the route's shape, and an `error.tsx` rendering `ErrorPanel` wired to `reset`.

Match the archetype to the route: list pages (trips, wishlist, checklists, files, journal, activity) take the list skeleton; detail pages (trip home, day, summary, compare) the detail one; `calendar` the calendar grid; `globe` and any map-bearing route the map one; `settings`, `account` and `trips/new` the form one.

`error.tsx` must be a Client Component — Next requires it. That is the one place `"use client"` is correct and expected.

- [ ] **Step 4: Follow the existing error-reporting convention**

The repo reports errors to its own database (ADR 0059). Read `app/(app)/error.tsx` as it exists now and confirm whether new boundaries should report too. If they should, follow the same pattern exactly, including its `.catch(() => {})` — an error reporter that throws inside an error boundary takes the whole page down. Record the decision in your report.

- [ ] **Step 5: Run the gates**

```bash
cd /work
npx tsc --noEmit && npm run lint && npm test && npm run build
```

`npm run build` matters most here — Next validates these file conventions at build time, and a malformed `error.tsx` (missing `"use client"`, wrong props) fails there rather than in `tsc`.

- [ ] **Step 6: Commit**

```bash
cd /work
git add app
git commit -m "feat(states): give every route a skeleton and an error boundary

Composes the shared archetypes rather than hand-rolling each one, and moves
the seven pre-existing loading/error files onto the same shapes so they stop
being the odd ones out.

Error boundaries keep reporting to our own sink (ADR 0059), including the
defensive catch -- a reporter that throws inside an error boundary takes the
page down with it.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: The navigation rail shell

The largest and highest-risk change in the phase, and the one place this project genuinely rebuilds rather than restyles. Give it its own review.

The kit (`design_handoff/playground-2/reference/ui_kits/teepee-desktop/Shell.jsx`) puts a single left rail carrying trip-scoped nav (Today, Home, Plan, Days, Money, Wishlist, More) plus app-scoped items as muted entries (Trips, Globe, You). It replaces both `TripNav` and the app header's nav.

**The kit is a prototype and knows nothing about routing.** Its `Dock` is controlled — `value` and `onChange` — and its items are keys, not hrefs. Every piece of the repo's actual navigation behaviour must survive the port:

- **`?plan=` fork threading.** `primaryNav` and `moreNav` in `components/trip/trip-nav.tsx` carry the active variant through Plan and Budget so a fork stays selected across navigation (ADR 0020). Lose this and forks silently drop back to the real plan.
- **`isNavActive`'s exact-match-on-Home rule.** Home is the trip base path; every other trip route is a prefix of it. A naive `startsWith` makes Home permanently active.
- **The mobile More sheet.** Eight routes live behind it — Wishlist, Journal, Checklists, Files, Activity, Settings, Help, and Summary. They have no other mobile entry point.
- **`aria-current="page"`** on the active item.

**Files:**
- Create: `components/ui/tab-bar.tsx`, `components/ui/dock.tsx`
- Modify: `components/trip/mobile-tab-bar.tsx`, `components/trip/trip-nav.tsx`, `app/(app)/layout.tsx`, `app/(app)/trips/[tripId]/layout.tsx`, `app/globals.css`
- Modify: `components/trip/mobile-tab-bar.test.tsx`, `components/trip/trip-nav.test.tsx`, `app/(app)/layout.test.tsx`, `app/(app)/trips/[tripId]/layout.test.tsx`

**Interfaces:**
- Consumes: hue tokens (Task 2), `Logo` (Task 5).
- Produces: the shell every authenticated route renders inside.

- [ ] **Step 1: Read the three sources before writing anything**

```bash
cd /work
cat design_handoff/playground-2/reference/ui_kits/teepee-desktop/Shell.jsx
cat design_handoff/playground-2/components/ui/dock.tsx
cat design_handoff/playground-2/components/ui/tab-bar.tsx
cat components/trip/trip-nav.tsx
cat components/trip/mobile-tab-bar.tsx
```

Write down, before coding, every behaviour in the repo's two nav components that the handoff's two do not have. Your report must list them and say where each ended up.

- [ ] **Step 2: Copy the presentational components**

```bash
cd /work
cp design_handoff/playground-2/components/ui/tab-bar.tsx components/ui/
cp design_handoff/playground-2/components/ui/dock.tsx components/ui/
```

These stay presentational. Do not add domain knowledge to them — the domain lives in the wrappers.

- [ ] **Step 3: Move `--tp-tab-bar-h` to 4.75rem**

Now, and only now, because the TabBar it was sized for finally ships.

Edit `app/globals.css`, change the value to `4.75rem`, and update the comment: the height is the TabBar's 10 + 44 + 22 px. Keep the rest of the comment explaining which four things read it.

```bash
cd /work
grep -rn "tp-tab-bar-h" components app | grep -v test
```

Four consumers read it — the toast viewport, the feedback FAB, the trip layout's bottom padding, and the bar itself. They all compute from the variable, so they follow automatically. Confirm each still looks right.

- [ ] **Step 4: Rebuild `mobile-tab-bar.tsx` as a wrapper**

Keep it as the component the trip layout renders. It continues to own the nav data, the `?plan=` threading, `isNavActive`, and the More sheet — but it now renders `TabBar`'s visual language, with More as the fifth item.

Its existing tests describe the behaviour that must survive. Run them as you go:

```bash
cd /work
npm test -- components/trip/mobile-tab-bar.test.tsx
```

- [ ] **Step 5: Rebuild `trip-nav.tsx` as the Dock wrapper**

Same pattern: `primaryNav` and `moreNav` stay exactly as they are — they are the source of truth for nav data and the plan-param threading, and other code imports them. The component renders `Dock` instead of a horizontal bar.

Use the kit's item list and ordering: Today, Home, Plan, Days, Money, Wishlist, More, then muted Trips, Globe, You. Map those to the repo's real routes — "Days" is `calendar`, "Money" is `budget`, "You" is `/account`.

- [ ] **Step 6: Restructure the two layouts**

`app/(app)/trips/[tripId]/layout.tsx` renders the rail at `md` and up and the TabBar below it. `app/(app)/layout.tsx` gives up its horizontal nav to the rail, keeping the OfflineBanner, the ⌘K mount and trigger, and the feedback launcher.

Keep both Server Components. The rail and bar are client leaves; the layouts are not, and must not become so. If you find yourself adding `"use client"` to a layout, stop and report it as a concern instead.

- [ ] **Step 7: Verify every preserved behaviour**

```bash
cd /work
npm test -- components/trip/mobile-tab-bar.test.tsx components/trip/trip-nav.test.tsx \
  app/\(app\)/layout.test.tsx app/\(app\)/trips/\[tripId\]/layout.test.tsx
```

Then confirm by reading, and record each in your report:
- A trip route with `?plan=X` keeps `X` in the Plan and Budget hrefs.
- On the trip base path, Home has `aria-current="page"` and no other item does.
- On `/trips/{id}/plan`, Plan has it and Home does not.
- All eight More routes are reachable on mobile.

- [ ] **Step 8: Add a regression test for the plan-param threading**

It is the behaviour most likely to be silently lost, and losing it breaks forks in a way nobody would notice quickly. Add a test asserting that with `?plan=abc` in the URL, the Plan and Budget hrefs carry `plan=abc` while Calendar does not. Name it for the reason — that a fork must survive navigation.

- [ ] **Step 9: Run the gates**

```bash
cd /work
npx tsc --noEmit && npm run lint && npm test && npm run build
```

- [ ] **Step 10: Commit**

```bash
cd /work
git add -A
git commit -m "feat(nav): restructure navigation into the Playground rail shell

Merges trip-scoped and app-scoped navigation into a single left rail at md+,
with the TabBar below it on mobile, matching the desktop kit's Shell. This is
the one place the Playground work rebuilds rather than restyles, so it touches
every authenticated route.

TabBar and Dock stay presentational. All the routing behaviour the kit has no
concept of stays in the wrappers: ?plan= fork threading through Plan and Budget
(ADR 0020), isNavActive's exact-match-on-Home rule, the mobile More sheet that
is the only way to reach eight routes, and aria-current. The plan-param
threading gets its own regression test -- losing it would silently drop forks
back to the real plan, which is exactly the kind of break nobody notices.

--tp-tab-bar-h moves 4rem -> 4.75rem now that the bar it was sized for exists.
The toast viewport, feedback FAB and trip layout padding all compute from it
and follow automatically.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Record the phase

**Files:**
- Create: `docs/adr/0061-playground-hue-ramp-and-rail-shell.md`
- Modify: `docs/adr/0060-playground-visual-system.md` (one cross-reference)
- Add to git: this plan document

- [ ] **Step 1: Confirm the ADR number**

```bash
cd /work
ls docs/adr | tail -3
```

Expect `0060` to be the highest, so `0061` is next.

- [ ] **Step 2: Write the ADR**

Match the house style — read `docs/adr/0060-playground-visual-system.md`. Cover:

**Context** — phase 1 left the app half-migrated because Playground shipped four accent hues and the repo needed nine, in places where hue carries meaning. The second handoff supplied the ramp.

**Decision** —
- One nine-hue ramp serves both item categories (fixed mapping) and chapter bands (user-picked), rather than two ramps.
- **No migration.** Stored values are unchanged; only labels and class mappings moved, via `LEGACY_TO_HUE`. `lib/hues.test.ts` pins this, because it is invisible in the UI and would orphan every chapter row if broken.
- `lib/stop-colours.ts` had no handoff equivalent and was derived from the same ramp.
- Status colours stayed on `--destructive`/`--success`/`--warning` rather than joining the hue ramp.
- Navigation merged into one rail shell — the single place this project rebuilds rather than restyles — with all routing behaviour kept in wrappers.
- `--tp-tab-bar-h` moved to 4.75rem with the TabBar.

**The trap worth recording** — three files in the second handoff (`dialog.tsx`, `stepper.tsx`, `switch.tsx`) are byte-identical to the first and therefore *older* than the repo's versions, which phase 1 had fixed. Re-copying any would have silently reverted the iOS overscroll covers and the 44px hit areas. Only `logo.tsx` was genuinely revised. State the general rule: **a newer handoff is not newer file-by-file — diff before copying, and treat any file the repo has since fixed as ours, not theirs.**

**Still outstanding from the designer** — the 44px defect unfixed at source, the toast variant question unanswered, the restyle-by-hand components still prose, and `stop-colours` needing confirmation. Point at `docs/follow-ups/2026-09-23-playground-design-ask.md`.

**Owed by a human** — the light/dark visual pass and PWA-install check from phase 1 are still owed, and this phase adds a navigation restructure that nobody has seen rendered either.

- [ ] **Step 3: Cross-reference from ADR 0060**

Add a line at the top of 0060 pointing forward to 0061 as the phase that closed the colour gap it describes.

- [ ] **Step 4: Run the gates**

```bash
cd /work
npx tsc --noEmit && npm run lint && npm test && npm run build
```

- [ ] **Step 5: Commit**

```bash
cd /work
git add docs
git commit -m "docs(adr): record the hue ramp and the navigation rail shell

ADR 0061. Why one ramp serves both categories and chapters, why there is no
migration despite every colour changing, and why navigation is the one place
this work rebuilds rather than restyles.

The part worth keeping: a newer handoff is not newer file-by-file. Three of
its components were byte-identical to the previous drop and therefore older
than our fixed versions -- copying them would have silently reverted phase 1's
iOS overscroll covers and 44px hit areas. Diff before copying.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Done means

- Eight commits on `feat/playground-phase-2`, branched from `beta` at `37281af`.
- All four gates pass on the final commit.
- No raw Tailwind palette class remains for a category, chapter or stop colour.
- `main` untouched. `beta` not merged into. Nothing deployed.
- Report what shipped, what was deferred, and what could not be matched — then **stop and ask** before merging to `beta`.
