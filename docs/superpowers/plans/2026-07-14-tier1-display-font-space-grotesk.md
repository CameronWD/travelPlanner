# Tier 1 — Display Font Swap (Fraunces → Space Grotesk) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Swap the app's display/heading typeface from Fraunces (serif) to Space Grotesk (grotesk sans) as the sole Tier-1 foundation change of the "Bold Modular" redesign.

**Architecture:** The display font is applied through a single CSS custom property. `app/layout.tsx` loads a `next/font/google` face and exposes it as the `--font-display-google` CSS variable; `app/globals.css` maps `--font-display: var(--font-display-google), <fallback>` via `@theme inline`, and every heading (`h1`–`h4`, the `.font-display` utility, `.text-display`) inherits that variable. Because the variable *name* stays the same, changing only which font feeds it cascades to ~140 components with no rename ripple. The one coupling to keep in sync is the `next/font/google` mock in `app/layout.test.tsx`, which must export the same face name the layout imports.

**Tech Stack:** Next.js (App Router), `next/font/google`, Tailwind v4 (`@theme inline`), CSS custom properties, Vitest.

## Global Constraints

- **Reference is authoritative:** `design_handoff/README.md` (Bold Modular handoff). Tier 1 is a font swap *only* — leave all colour/spacing/radius/shadow token **values** in `globals.css` unchanged.
- **Body font unchanged:** UI/body stays **Plus Jakarta Sans** (`--font-sans` / `--font-sans-google`).
- **Heading scale unchanged:** do **not** alter heading sizes, line-heights, or the negative letter-spacing/tracking. (Decision confirmed: leave tracking as-is; eyeball only.)
- **Keep the CSS var name:** the display face must continue to be exposed as `--font-display-google` so `@theme inline` and all consumers need no changes.
- **Load Space Grotesk variable / full range:** omit an explicit `weight` (the type scale uses 600, and a few spots use 700/`font-bold`), so the full weight range must be available.
- **Discreet mode must keep working:** the `.discreet` remap of `--font-display` in `globals.css` neutralises the display font to the sans var — leave it untouched; it stays correct after the swap.
- **Branch:** `feat/bold-modular-redesign` (already checked out, off `main`). Do **not** commit to `main`. Do **not** deploy. Never `git add` anything under `.superpowers/`.
- **Environment (sandbox):** the repo needs Node ≥20.19 (`.nvmrc` pins 22) but the default `node` is v20.11 and **vitest fails on it** — every command shell must first run `export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use` (→ v22). No Postgres/Docker/browser here, so **`next build` and `next dev` fail — do NOT run them.**
- **Verify commands (sandbox):** `npx tsc --noEmit` (type check), `npx eslint app/layout.tsx app/layout.test.tsx` (catches the removed import), `npx vitest run app/layout.test.tsx` then `npx vitest run` (full suite). The webfont config itself is only validated at build/dev time (can't run here) — that check happens in the human's local `npm run dev` visual pass.

---

## File Structure

- `app/layout.tsx` — **modify.** Root layout. Replace the Fraunces import + config with Space Grotesk, keeping the `--font-display-google` variable and the `<html>` className wiring.
- `app/globals.css` — **modify.** Flip the `--font-display` fallback stack from serif → sans (line ~152) and update the descriptive comment (line ~254). No token *values* change.
- `app/layout.test.tsx` — **modify.** Rename the `next/font/google` mock export `Fraunces` → `Space_Grotesk` to match the layout's import.

All three change together and form one atomic, independently reviewable deliverable, so this is a single task.

---

### Task 1: Swap display font Fraunces → Space Grotesk

**Files:**
- Modify: `app/layout.tsx:2,9-16,51` (import, font config, `<html>` className)
- Modify: `app/globals.css:152` (display fallback stack) and `app/globals.css:254` (comment)
- Test: `app/layout.test.tsx:5-8` (font mock)

**Interfaces:**
- Consumes: `next/font/google`'s `Space_Grotesk` loader (variable font; `variable`, `subsets`, `display` options); the existing `--font-display-google` → `--font-display` mapping in `globals.css`.
- Produces: nothing new for later tasks — this is a self-contained foundation change. The CSS variable contract (`--font-display-google`) is unchanged.

- [ ] **Step 1: Write the failing test** — update the font mock in `app/layout.test.tsx` to export `Space_Grotesk` instead of `Fraunces`. Replace lines 5–8:

```ts
vi.mock("next/font/google", () => ({
  Space_Grotesk: () => ({ variable: "--font-display-google", className: "" }),
  Plus_Jakarta_Sans: () => ({ variable: "--font-sans-google", className: "" }),
}));
```

- [ ] **Step 2: Run the test to verify it fails**

Run (nvm loaded): `npx vitest run app/layout.test.tsx`
Expected: FAIL. `app/layout.tsx` still imports `Fraunces`, which the mock no longer provides, so `Fraunces` is `undefined` and `Fraunces({...})` throws `TypeError: Fraunces is not a function` while `await import("./layout")` executes — erroring out both tests in the file.

- [ ] **Step 3: Implement — swap the font in `app/layout.tsx`.** Change the import on line 2:

```ts
import { Space_Grotesk, Plus_Jakarta_Sans } from "next/font/google";
```

Replace the Fraunces config block (lines 9–16) with:

```ts
// Space Grotesk is a variable font (weight axis 300–700): omitting `weight`
// keeps the full range, covering the 600 used across the heading scale and
// the 700/font-bold used on error/print headings.
const spaceGrotesk = Space_Grotesk({
  variable: "--font-display-google",
  subsets: ["latin"],
  display: "swap",
});
```

Update the `<html>` className on line 51 to reference the new binding:

```tsx
className={`${plusJakarta.variable} ${spaceGrotesk.variable} h-full antialiased`}
```

- [ ] **Step 4: Implement — flip the fallback + comment in `app/globals.css`.** Change line 152 from a serif fallback to a sans fallback (Space Grotesk is a grotesk sans; a serif fallback would flash the wrong shape before the webfont loads):

```css
  --font-display: var(--font-display-google), ui-sans-serif, system-ui, sans-serif;
```

Update the descriptive comment (line ~254) from:

```
   Headings use Fraunces (display), body uses Plus Jakarta Sans.
```

to:

```
   Headings use Space Grotesk (display), body uses Plus Jakarta Sans.
```

Leave every token **value** and the `.discreet` `--font-display` remap untouched.

- [ ] **Step 5: Run the test to verify it passes**

Run (nvm loaded): `npx vitest run app/layout.test.tsx`
Expected: PASS. The layout now imports `Space_Grotesk`, which the mock provides, so `await import("./layout")` succeeds and both `viewport`/`metadata` assertions pass.

- [ ] **Step 6: Run type-check, lint, and the full suite** (nvm loaded)

Run: `npx tsc --noEmit`
Expected: clean (the `Space_Grotesk` import resolves; no type errors).

Run: `npx eslint app/layout.tsx app/layout.test.tsx`
Expected: clean (no unused-import for the removed `Fraunces`).

Run: `npx vitest run`
Expected: PASS (no other test references `Fraunces`).

(`next build` would be the real webfont-config check but cannot run in this sandbox — deferred to the human's local `npm run dev` visual pass.)

- [ ] **Step 7: Guard against stray references**

Run: `grep -rn "Fraunces" --include=*.ts --include=*.tsx --include=*.css app/`
Expected: **no matches.** (Every Fraunces reference must be gone.)

- [ ] **Step 8: Commit**

```bash
git add app/layout.tsx app/globals.css app/layout.test.tsx
git commit -m "feat(type): swap display font Fraunces → Space Grotesk (Tier 1)"
```

---

## Verification (Definition of Done)

- `npx tsc --noEmit` clean; `npx eslint app/layout.tsx app/layout.test.tsx` clean; `npx vitest run` green.
- `grep -rn "Fraunces" app/` returns nothing.
- Visual check (orchestrator/human, via `npm run dev`): headings render in Space Grotesk in **light and dark**; discreet mode still neutralises the display font to the sans face.
- `design_handoff/README.md` progress tracker: tick the Tier 1 checkbox and add a session-log line.

## Self-Review Notes

- **Spec coverage:** Tier 1's sole requirement (font swap, all else unchanged) is covered by Task 1. Fallback-stack correction and the coupled test-mock update are folded in.
- **No placeholders:** all steps contain exact code and commands.
- **Type consistency:** the binding `spaceGrotesk` is defined and used consistently; the mock export name `Space_Grotesk` matches the layout import.
