# Layout Fixes (Audit Stage 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the ADR 0062 wide-screen shell and fix all 54 findings of the 2026-09-24 layout audit.

**Architecture:** Three layers. (1) Shared primitives in `app/globals.css` — page-width tokens (`max-w-page-wide`, `max-w-reading`, `max-w-dialog`) and a `tap-target` utility — plus conventions in `COMPONENTS.md`. (2) The shell in `app/(app)/layout.tsx` + `app/(app)/trips/[tripId]/layout.tsx`: the app `<main>` caps non-trip pages at the wide width, and goes full-bleed (via `:has([data-trip-shell])`) for trip pages so the rail sits at the viewport's left edge and trip content centres in the space right of it. (3) Per-screen fixes, grouped by screen, each applying the spec's truncation rule, companion-column rule and tap-target rule.

**Tech Stack:** Next.js 16 (App Router, Server Components) — read the relevant guide in `node_modules/next/dist/docs/` before writing Next code; Tailwind v4 (`@theme`, `@utility`); Radix primitives; Vitest 4 + jsdom + Testing Library (`npm test`); Leaflet for maps.

**Spec:** `docs/specs/2026-09-25-layout-fixes.md`. Finding details (what / where / suggested fix): `docs/audits/2026-09-24-layout-findings.json`. Summary: `docs/audits/2026-09-24-layout-audit.md`. Shell decision: `docs/adr/0062-wide-screen-shell.md`.

## Global Constraints

- Branch `fix/layout-audit-findings` (cut from `beta` at `56ea347`). Never commit to / merge into / rebase onto / push `main` or `beta`. Never push. Never deploy.
- **Never run `npm run feedback:pull` or `npm run feedback:resolve`** (they hit the production database).
- Never run `next start` (it loads `.env.production.local` = production). Local server is `npm run dev` only.
- `next dev` re-adds a block to `CLAUDE.md`. **Never stage or commit `CLAUDE.md`** — always `git add` explicit paths, never `git add -A` / `git add .`.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- Server Components stay Server Components (add `"use client"` only to a new leaf that needs it). Tailwind v4 token classes only; no new hex outside the files ADR 0060 names; keep `@source not "../design_handoff";`.
- 3px focus ring, ≥44px touch targets, `aria-current`, labelled icon buttons. Motion via `tp-*` / `motion` with `ease: [0.2, 0.8, 0.2, 1]` and `useReducedMotion()`.
- **Truncation rule (spec §2)** — applies in every task: (1) wrap by default (`break-words` is *not* the tool for whole words — use normal wrapping plus `min-w-0`; reserve `[overflow-wrap:anywhere]` for URLs/IDs); (2) `line-clamp-2` only in dense grids/asides, and only where the item links to a view showing the full text; (3) short fixed labels (badges, currency codes, fork names, tabs) never clip; (4) single-line `truncate` only where the full text is visible nearby, and then with `title`.
- Gates after every task: `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run build` — all must pass before the commit.
- Existing tests assert raw class strings (e.g. `components/ui/dialog.test.tsx`). When you change a class a test pins, update the assertion to the new intent in the same commit; never delete a test to get green.
- Out of scope: new features (kit selected-stop panel, Print's Include toggles, actionable Flags), data-model changes, colour/contrast work, a dedicated tablet layout.

## Review Focus

1. **Trip pages at 768–1023px** (rail visible, content narrow): the shell change must not squeeze content — the rail is 96px; content keeps `px-4 sm:px-6`. Pinned in Task 2 (layout test asserts the trip content column is `min-w-0 flex-1`).
2. **Long unbroken strings** (a 40-char cost name with no spaces, a raw cost ID like `cmueo57u50012q1lof…`) once text wraps — must wrap inside its card, not widen the page. Pinned in Task 6 (cost row test) and Task 8 (promote-fork list test) via `[overflow-wrap:anywhere]` on ID/URL-like text.
3. **Dialog with very little content vs very tall content** after the header/footer fix — the header must never shrink over content and the footer must never cover the last field. Pinned in Task 3.
4. **Print media** after the shell and print-page change — the A4 output must be unchanged (`print:` classes keep `max-w-none`, the "Print preview" label is `print:hidden`). Pinned in Task 12.
5. **A trip with zero stops** on Plan/Home after the aside changes — no empty sticky column, no crash. Pinned in Task 11.

---

## File structure

| File | Responsibility |
|---|---|
| `app/globals.css` | `--container-page-wide`, `--container-reading`, `--container-dialog` tokens; `@utility tap-target` |
| `app/globals-tokens.test.ts` (new) | Pins the tokens and utility exist |
| `COMPONENTS.md` | New conventions: Page widths, Truncation, Tap targets |
| `docs/adr/0060-playground-visual-system.md` | One-line pointer to the COMPONENTS.md conventions |
| `app/(app)/layout.tsx` | Full-width top bar; `<main>` capped at page-wide, full-bleed for trip shell |
| `app/(app)/trips/[tripId]/layout.tsx` | `data-trip-shell`; rail flush left; content column centred at page-wide; avatar stack → one link |
| `components/ui/dialog.tsx`, `form-dialog.tsx`, `confirm-dialog.tsx` | Header never shrinks; footer reserves its height; dialog width token; footer buttons wrap |
| Plan: `stop-card.tsx`, `stop-day-list.tsx`, `accommodation-row.tsx`, `fork-switcher.tsx`, `quick-add-stops.tsx`, `itinerary-manager.tsx`, `plan/page.tsx` | LA-007/008/009/035/036/037/038/039 |
| Money: `cost-checklist.tsx`, `other-cost-editor.tsx`, `budget/page.tsx`, `budget-hero-row.tsx`, `money-input.tsx` | LA-006/030/031/032/033/049 |
| Days: `calendar-views.tsx`, `timeline.tsx`, `month-grid.tsx` | LA-004/021/022/053 |
| Compare: `compare-table.tsx`, `promote-fork-dialog.tsx` | LA-001/003/018/019/020 |
| Share: `app/share/[token]/page.tsx`, `route-map.tsx` | LA-012/041/042/043 |
| Misc: `notification-bell.tsx`, `share-links-panel.tsx`, `trip-card.tsx`, `feedback-launcher.tsx`, `sheet.tsx`, `marker-list.tsx`, `trip-digests-panel.tsx`, `trip-cover.tsx` | LA-010/015/016/023/025/028/044/048 |
| Home: `app/(app)/trips/[tripId]/page.tsx`, `components/trip/home/phase-*.tsx` | LA-029/045 |
| Prose: `components/legal/legal-page.tsx`, `app/signin/page.tsx`, `app/terms/page.tsx`, `components/trip/help-guide.tsx`, help pages, `whats-new/page.tsx`, `print/page.tsx` | LA-026/027/040/047/051/054/055 |
| Forms: `settings/page.tsx`, `trips/new/page.tsx` + `new-trip-form.tsx`, `checklists/page.tsx` + new `checklists-layout.tsx` | LA-017/034/046/052 |
| Tap targets: header, trip header, `feedback-launcher.tsx`, plan controls | LA-037/049/050/054 |

---

### Task 1: Shared primitives — page widths, `tap-target`, conventions, findings file

**Files:**
- Modify: `app/globals.css` (the `@theme inline` block at ~line 249; utilities after `@utility pressable` ~line 356)
- Create: `app/globals-tokens.test.ts`
- Modify: `COMPONENTS.md` (under `## Finalized UI conventions`, ~line 263)
- Modify: `docs/adr/0060-playground-visual-system.md` (append one line)
- Add (already generated, untracked): `docs/audits/2026-09-24-layout-findings.json`

**Interfaces:**
- Produces: Tailwind utilities `max-w-page-wide` (100rem ≈ 1600px), `max-w-reading` (68ch), `max-w-dialog` (30rem = 480px); `tap-target` utility (relative + `::before` expanding the hit area to ≥44×44 on coarse pointers, centred on the element). Every later task uses these names.

- [ ] **Step 1: Write the failing test** — `app/globals-tokens.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(__dirname, "globals.css"), "utf8");

describe("layout primitives in globals.css", () => {
  it("defines the three shared page widths as container tokens", () => {
    expect(css).toMatch(/--container-page-wide:\s*100rem;/);
    expect(css).toMatch(/--container-reading:\s*68ch;/);
    expect(css).toMatch(/--container-dialog:\s*30rem;/);
  });

  it("defines a tap-target utility that expands the hit area to 44px", () => {
    const block = css.slice(css.indexOf("@utility tap-target"));
    expect(block).toMatch(/position:\s*relative/);
    expect(block).toMatch(/min-width:\s*2\.75rem/);
    expect(block).toMatch(/min-height:\s*2\.75rem/);
  });
});
```

- [ ] **Step 2: Run it — expect FAIL.** `npx vitest run app/globals-tokens.test.ts`

- [ ] **Step 3: Implement.** Inside `@theme inline { … }` add:

```css
  /* Shared page widths (ADR 0062, COMPONENTS.md "Page widths"). */
  --container-page-wide: 100rem;
  --container-reading: 68ch;
  --container-dialog: 30rem;
```

After `@utility pressable { … }` add:

```css
/* Invisible ≥44×44 hit area around a small control; the control looks the same.
   Coarse pointers only, so desktop hover targets don't overlap neighbours.
   See COMPONENTS.md "Tap targets". */
@utility tap-target {
  position: relative;
  &::before {
    content: "";
    position: absolute;
    top: 50%;
    left: 50%;
    width: 100%;
    height: 100%;
    min-width: 2.75rem;
    min-height: 2.75rem;
    transform: translate(-50%, -50%);
  }
  @media not (pointer: coarse) {
    &::before { content: none; }
  }
}
```

If Tailwind's build rejects `@media not (pointer: coarse)` inside `@utility`, use `@media (pointer: fine)` instead and keep the test green.

- [ ] **Step 4: Run it — expect PASS.**

- [ ] **Step 5: Conventions.** In `COMPONENTS.md` under `## Finalized UI conventions`, add three subsections:

```markdown
### Page widths
Pages use one of three shared widths, never an ad-hoc `max-w-*` on a page container:
`max-w-page-wide` (~1600px — the app shell caps content here; grids step 1 → 2 → 3 columns),
`max-w-reading` (68ch — prose), `max-w-dialog` (480px — the centred dialog). A prose or form page
that would be a narrow island on a wide screen gets a **companion column** at `lg` (a sticky table of
contents, a release list, a second card column) rather than stretched text. Component-internal caps
(menus, popovers, chips) are not page widths. (ADR 0062)

### Truncation
1. Wrap by default — names, titles, addresses, cost names, labels.
2. `line-clamp-2` only in dense grids/asides where rows must stay even, and only when the item links
   to a view with the full text. A hover `title` alone doesn't count (nothing on a phone).
3. Short fixed labels (status badges, currency codes, fork names, segmented tabs) never clip — give them room.
4. Single-line `truncate` only where the same text is fully visible nearby, and then with `title`.
IDs and URLs use `[overflow-wrap:anywhere]` so they wrap inside their card.

### Tap targets
Small controls keep their look and get `tap-target` — an invisible ≥44×44 `::before` on coarse
pointers. Where two targets sit closer than 44px apart, add spacing too. Prefer making a whole row the
target when the row has one action.
```

Append to `docs/adr/0060-playground-visual-system.md`: `\n\nLayout conventions (page widths, truncation, tap targets) live in COMPONENTS.md under "Finalized UI conventions" (2026-09-25).`

- [ ] **Step 6: Gates, then commit.**

```bash
git add app/globals.css app/globals-tokens.test.ts COMPONENTS.md docs/adr/0060-playground-visual-system.md docs/audits/2026-09-24-layout-findings.json
git commit -m "feat(layout): shared page widths, tap-target utility, conventions

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: The wide-screen shell (ADR 0062)

**Files:**
- Modify: `app/(app)/layout.tsx:92-93` (header inner div), `:176` (`<main>`)
- Modify: `app/(app)/trips/[tripId]/layout.tsx` (root div, content column)
- Modify: `components/trip/trip-nav.tsx` (only if the rail's sticky offset needs changing — it already sticks under the header)
- Test: `app/(app)/layout.test.tsx`, `app/(app)/trips/[tripId]/layout.test.tsx` (extend)

**Interfaces:**
- Consumes: `max-w-page-wide` (Task 1).
- Produces: `data-trip-shell` attribute on the trip layout root; trip content column `data-trip-content` with inner wrapper `mx-auto w-full max-w-page-wide`. Later tasks rely on trip pages being able to use the full column width (no page-level `max-w-*` needed).

- [ ] **Step 1: Read** `app/(app)/layout.test.tsx` and `app/(app)/trips/[tripId]/layout.test.tsx` to see how they render layouts (mocked auth/db) and assert classes.

- [ ] **Step 2: Write failing tests.** In the app layout test add:

```tsx
it("caps non-trip content at the shared wide width and goes full-bleed for the trip shell", async () => {
  // render AppLayout as the existing tests do
  const main = screen.getByTestId("app-main");
  expect(main.className).toContain("max-w-page-wide");
  expect(main.className).toContain("has-[[data-trip-shell]]:max-w-none");
  expect(main.className).toContain("has-[[data-trip-shell]]:p-0");
  expect(main.className).not.toMatch(/max-w-(5xl|6xl|7xl)/);
});

it("lets the top bar span the full width", async () => {
  const header = document.querySelector("header")!;
  expect(header.innerHTML).not.toMatch(/max-w-(5xl|6xl|7xl)/);
});
```

In the trip layout test add:

```tsx
it("marks the trip shell and centres content at the wide width right of the rail", async () => {
  const shell = container.querySelector("[data-trip-shell]")!;
  expect(shell).not.toBeNull();
  const content = container.querySelector("[data-trip-content]")!;
  expect(content.className).toContain("min-w-0");
  expect(content.className).toContain("flex-1");
  expect(content.firstElementChild!.className).toContain("max-w-page-wide");
});
```

- [ ] **Step 3: Run — expect FAIL.** `npx vitest run "app/(app)/layout.test.tsx" "app/(app)/trips/[tripId]/layout.test.tsx"`

- [ ] **Step 4: Implement.**

App layout header inner div (`:93`) becomes:

```tsx
<div className="flex h-14 items-center justify-between px-4 sm:px-6">
```

`<main>` (`:176`) becomes (update the comment above it to cite ADR 0062):

```tsx
{/* ADR 0062: non-trip pages cap at the shared wide width; a trip page (which renders
    [data-trip-shell]) goes full-bleed so its rail sits on the viewport's left edge. */}
<main
  data-testid="app-main"
  className="mx-auto w-full max-w-page-wide flex-1 px-4 py-8 sm:px-6 has-[[data-trip-shell]]:max-w-none has-[[data-trip-shell]]:p-0"
>
```

Trip layout root and content column:

```tsx
<div data-trip-shell className="flex flex-col gap-0 md:flex-row">
  <TripNav tripId={tripId} />
  <div data-trip-content className="flex min-w-0 flex-1 flex-col px-4 pt-6 sm:px-6 md:px-8">
    <div className="mx-auto flex w-full max-w-page-wide flex-col">
      {/* existing trip header + page content, unchanged */}
    </div>
  </div>
  <MobileTabBar tripId={tripId} />
</div>
```

Remove the old `md:pl-6` on the content column (the new `md:px-8` replaces it). Keep the page-content wrapper's bottom padding for the mobile tab bar exactly as it is.

- [ ] **Step 5: Run — expect PASS.** Then `npm run dev` and look at `/trips`, a trip Home and Plan at 390, 1024, 1440 and 2560 (Playwright via `NODE_PATH=/usr/local/lib/node_modules` or the browser): rail flush left and full height at ≥768; content centred right of the rail; nothing wider than the viewport at 390. Stop the dev server afterwards.

- [ ] **Step 6: Gates, then commit** (`feat(shell): rail pinned left, content to ~1600px (ADR 0062)`), `git add` the two layouts and their tests explicitly. In `docs/adr/0062-wide-screen-shell.md` change "Built in Stage 2 of …" to "Built on `fix/layout-audit-findings` (2026-09-25)." and add it to the commit.

---

### Task 3: Dialog primitives — header, footer, width, confirm sheets (LA-002, 005, 011, 014, 024)

**Files:**
- Modify: `components/ui/dialog.tsx` (`DialogContent` ~34-49, `DialogHeader` ~63-76, `DialogFooter` ~79-94)
- Modify: `components/ui/confirm-dialog.tsx` (footer buttons) if it sets its own footer classes
- Test: `components/ui/dialog.test.tsx` (update pinned classes + add cases), `components/ui/confirm-dialog.test.tsx`

**Cause (from mapping):** `DialogHeader` has `min-h-[72px]` inside the flex column scroll body; an explicit min-height removes the flex item's `min-height:auto`, so when content overflows the header shrinks to 72px and its text spills over the next block (LA-002/005/024). `DialogFooter` is `sticky bottom-0` but the body reserves no space for it, so the last field ends under it (LA-011). Footer buttons are `whitespace-nowrap` + `[&>*]:flex-1`, overflowing at 360 (LA-014).

**Interfaces:**
- Consumes: `max-w-dialog` (Task 1).
- Produces: header/footer behaviour every form dialog inherits; no API change.

- [ ] **Step 1: Write failing tests** in `components/ui/dialog.test.tsx` (open the dialog the way the existing tests do):

```tsx
it("header never shrinks under overflowing content", async () => {
  const header = screen.getByText("Title").closest("[class*='sticky']") as HTMLElement;
  expect(header.className).toContain("shrink-0");
});

it("scroll body reserves room so the sticky footer never covers the last field", async () => {
  const footer = screen.getByRole("button", { name: "Save" }).parentElement as HTMLElement;
  expect(footer.className).toContain("sticky");
  const body = footer.parentElement as HTMLElement;
  expect(body.className).toContain("scroll-pb-24");
});

it("footer buttons wrap instead of overflowing a 360px sheet", async () => {
  const footer = screen.getByRole("button", { name: "Save" }).parentElement as HTMLElement;
  expect(footer.className).toContain("flex-wrap");
});

it("centred dialog uses the shared dialog width", async () => {
  const content = screen.getByRole("dialog");
  expect(content.className).toContain("sm:max-w-dialog");
});
```

Adapt the render fixture names ("Title", "Save") to whatever the file's existing fixture uses.

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement.**
  - `DialogHeader`: add `shrink-0` to its class list.
  - `DialogContent` scroll body div: add `scroll-pb-24` (so focusing/scrolling to the last field clears the footer) and keep existing padding.
  - `DialogFooter`: add `flex-wrap` and on its children allow wrapping: replace any `[&>*]:flex-1` with `[&>*]:flex-1 [&>*]:min-w-[8rem] [&>*]:whitespace-normal`. Keep `sticky bottom-0`.
  - In `DialogContent` replace `sm:max-w-[480px]` with `sm:max-w-dialog`.
  - If `dialog.test.tsx` pins `mb-1` on the header, keep `mb-1` (still valid) — only add.
  - Check `confirm-dialog.tsx`: if it renders its own footer row, give it the same `flex-wrap` + `[&>*]:min-w-[8rem] [&>*]:whitespace-normal`.

- [ ] **Step 4: Run — expect PASS.** Then in `npm run dev` open, at 360 and 1440: Checklists → Edit item (LA-005), Compare → Promote fork (LA-002), Globe → Share (LA-024), Plan → Add accommodation / Edit transport scrolled to the end (LA-011), Settings → Delete trip / Duplicate trip at 360 (LA-014; LA-015 is fixed in Task 10 — if the sheet still overflows, note it for Task 10, not here).

- [ ] **Step 5: Gates, commit** (`fix(dialog): header never shrinks, footer never covers the last field (LA-002 005 011 014 024)`).

---

### Task 4: Plan screen text and controls (LA-007, 008, 009, 035, 036, 039)

**Files:**
- Modify: `components/trip/itinerary-manager.tsx:2094-2151` (bottom action row + Chapters menu)
- Modify: `components/trip/fork-switcher.tsx:304-370`
- Modify: `components/trip/quick-add-stops.tsx:71-79`
- Modify: `components/trip/stop-day-list.tsx:128-139, :295`, `components/trip/accommodation-row.tsx:61`, `components/trip/stop-card.tsx:330-358, :550`
- Test: the existing `*.test.tsx` beside each file (create one only if none exists)

- [ ] **Step 1: Failing tests** (one per finding; adapt render helpers from each file's existing test):

```tsx
// itinerary-manager.test.tsx — LA-008
it("bottom action row wraps so Add Stop is never pushed off-screen", () => {
  const addStop = screen.getByRole("button", { name: /add stop/i });
  expect(addStop.parentElement!.className).toContain("flex-wrap");
});

// fork-switcher.test.tsx — LA-009
it("fork names wrap instead of truncating", async () => {
  const row = await screen.findByText("+ Switzerland");
  expect(row.className).not.toContain("truncate");
  expect(row.className).toContain("min-w-0");
});

// quick-add-stops.test.tsx — LA-035
it("the nights box has a visible 'nights' unit", () => {
  expect(screen.getByText("nights")).toBeVisible();
});

// stop-day-list.test.tsx — LA-036
it("day activity labels wrap rather than truncate", () => {
  const label = screen.getByText("Reindeer farm visit & sleigh ride");
  expect(label.className).not.toContain("truncate");
});

// stop-card.test.tsx — LA-039
it("stop title may wrap; it never truncates at a single breakpoint", () => {
  const h3 = screen.getByRole("heading", { level: 3, name: /Rovaniemi/ });
  expect(h3.className).not.toContain("truncate");
  expect(h3.className).toContain("min-w-0");
});
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement.**
  - LA-008: the inner `<div className="flex items-center gap-2">` holding Firm up / Chapters / Add Stop → `flex flex-wrap items-center gap-2`. At `max-sm`, give "Firm up the whole trip" a shorter visible label via `<span className="sm:hidden">Firm up</span><span className="hidden sm:inline">Firm up the whole trip</span>` and keep `aria-label="Firm up the whole trip"`.
  - LA-007: the mapping found no dashed box — the Chapters `DropdownMenuContent` gets clamped at the left edge because its trigger was pushed off-screen by LA-008. After the LA-008 fix, verify at 360/390 in `npm run dev`; if the menu still touches the edge, add `collisionPadding={16}` to that `DropdownMenuContent`.
  - LA-009: `DropdownMenuContent className="w-56"` → `w-64 max-w-[calc(100vw-2rem)]`; the two label spans `flex-1 truncate` / `pl-6 flex-1 truncate` → `min-w-0 flex-1 break-words` / `min-w-0 flex-1 break-words pl-6`. The trigger `max-w-32 truncate` is rule 4 (the full name shows in the open menu): keep it and add `title={activeName}`.
  - LA-035: wrap the nights `<Input>` with a visible unit: `<div className="flex items-center gap-1.5"><Input … /><span className="text-xs font-semibold text-muted-foreground">nights</span></div>`; keep `aria-label="Nights"`.
  - LA-036: in `stop-day-list.tsx` replace `truncate` on the row container/labels with `min-w-0 break-words` (row container keeps `flex flex-1 items-start gap-2`); in `accommodation-row.tsx:61` and `stop-card.tsx:550` (things-to-do) replace `truncate` with `min-w-0 break-words`.
  - LA-039: stop title h3 — remove `truncate`, add `min-w-0 flex-1 break-words`; the action cluster keeps `shrink-0` but becomes `flex flex-wrap justify-end items-center gap-1`.

- [ ] **Step 4: Run — expect PASS.** Visually check Plan at 360, 768, 1024 in `npm run dev` for EU Christmas 2026 and a Sketching trip.

- [ ] **Step 5: Gates, commit** (`fix(plan): wrap stop/day/fork text, nights unit, action row wraps (LA-007 008 009 035 036 039)`).

---

### Task 5: Plan and Home asides (LA-029, 038, 045)

**Files:**
- Modify: `app/(app)/trips/[tripId]/plan/page.tsx:366-368`
- Modify: `app/(app)/trips/[tripId]/page.tsx:117-119` (Reminders section)
- Modify: `components/trip/home/phase-planning.tsx` (grid ~74-75, aside ~398-408), and the same pattern in `phase-sketching.tsx`, `phase-past.tsx`, `phase-travelling.tsx` (Final prep uses whichever component renders it — find it via `computeTripPhase` usage)
- Test: `components/trip/home/phase-planning.test.tsx` (it exports `PLANNING_DESKTOP_GRID_CLASS`), `app/(app)/trips/[tripId]/page.test.tsx`, a new or existing plan page test

**Interfaces:**
- Produces: each phase component accepts `reminders?: React.ReactNode` and renders it at the end of its right column (below Paid so far / quick actions) at `lg`, and at the end of the single column below `lg`.

- [ ] **Step 1: Failing tests.**

```tsx
// phase-planning.test.tsx
it("renders reminders inside the right column, not as a full-width row", () => {
  render(<PhasePlanning {...baseProps} reminders={<div data-testid="reminders" />} />);
  const aside = screen.getByTestId("reminders").closest("[data-home-aside]");
  expect(aside).not.toBeNull();
});

// plan page test (or a small unit around the exported class)
it("the plan overview column sticks under the header on desktop", () => {
  expect(PLAN_ASIDE_CLASS).toContain("lg:sticky");
  expect(PLAN_ASIDE_CLASS).toMatch(/lg:top-\[/);
});
```

Add the same "reminders in aside" test to each phase component's test file that has a two-column grid.

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement.**
  - Plan: export `PLAN_ASIDE_CLASS = "flex flex-col gap-6 lg:order-2 lg:sticky lg:top-[calc(3.5rem+env(safe-area-inset-top)+1.5rem)] lg:max-h-[calc(100dvh-3.5rem-env(safe-area-inset-top)-3rem)] lg:overflow-y-auto"` and use it on the aside div. When `stops.length === 0` the aside is not rendered (current behaviour) — make the grid single-column in that case: `stops.length > 0 ? "…lg:grid-cols-[minmax(0,1fr)_20rem]…" : "grid grid-cols-1 gap-6"`.
  - Home: in `page.tsx` stop rendering `<section className="mt-6 …"><RemindersCard/></section>` after the phase component; pass `reminders={<RemindersCard … />}` into the phase component instead. In each phase component, mark the right column `data-home-aside` and render `{reminders}` as its last child; on phases without a two-column grid, render `{reminders}` at the end of the main column.

- [ ] **Step 4: Run — expect PASS.** Visually check trip Home and `/today` at 1024/1440/2560 for Planning, Sketching, Past and the empty trip, and Plan with 20 stops and with 0 stops.

- [ ] **Step 5: Gates, commit** (`fix(home,plan): reminders join the right column; plan overview sticks (LA-029 038 045)`).

---

### Task 6: Money screen (LA-006, 030, 031, 032, 033)

**Files:**
- Modify: `components/trip/cost-checklist.tsx:116`, `components/trip/other-cost-editor.tsx:452`
- Modify: `app/(app)/trips/[tripId]/budget/page.tsx:433, :486, :524-556`
- Modify: `components/trip/budget-hero-row.tsx:52-119`
- Modify: `components/ui/money-input.tsx:112`
- Test: existing tests beside each (`budget-hero-row` may need a new `budget-hero-row.test.tsx`)

- [ ] **Step 1: Failing tests.**

```tsx
// cost-checklist.test.tsx — LA-006
it("cost names wrap, and ID-like names wrap anywhere", () => {
  const name = screen.getByText("Colosseum, Roman Forum & Palatine guided tour");
  expect(name.className).not.toContain("truncate");
  expect(name.className).toContain("[overflow-wrap:anywhere]");
});

// budget-hero-row.test.tsx — LA-031 / LA-032
it("lays four stats out without a lone orphan card", () => {
  const grid = screen.getByText("Cost / day").closest("[data-stat-grid]") as HTMLElement;
  expect(grid.className).toContain("grid-cols-2");
  expect(grid.className).toContain("lg:grid-cols-4");
  expect(grid.className).not.toContain("sm:grid-cols-4");
});
it("money values never split mid-number", () => {
  const value = screen.getByText("$18,795.63");
  expect(value.className).toContain("whitespace-nowrap");
  expect(value.className).not.toContain("break-words");
});

// money-input.test.tsx — LA-033
it("currency trigger fits a 3-letter code", () => {
  const trigger = screen.getByRole("combobox");
  expect(trigger.className).toContain("w-[5.5rem]");
});
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement.**
  - LA-006: `flex-1 truncate text-sm` → `min-w-0 flex-1 text-sm [overflow-wrap:anywhere]`; `other-cost-editor.tsx:452` `truncate min-w-0` → `min-w-0 [overflow-wrap:anywhere]`.
  - LA-030: on phones stack the two money columns under the label. Each By category / By destination row: label `truncate` → `min-w-0 break-words`; the row becomes `grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto]`, with the two dollar cells `col-span-2 flex justify-between sm:col-span-1 sm:block` below `sm`. Keep the percentage cell next to the label.
  - LA-031/032: the grid gets `data-stat-grid` and becomes `grid grid-cols-2 gap-3 lg:grid-cols-4`; Cost total keeps `col-span-2 lg:col-span-1`; so phones/768 show 2+2 (Cost total full row, Paid + Still to pay, Cost/day spanning `col-span-2 lg:col-span-1`) and desktop shows 4-up. Values: replace `break-words` with `whitespace-nowrap` and add `text-xl sm:text-2xl` so they fit.
  - LA-033: `SelectTrigger className="w-20 sm:w-24 shrink-0"` → `w-[5.5rem] shrink-0 gap-1 px-2.5 sm:w-24`.

- [ ] **Step 4: Run — expect PASS.** Check Money at 360, 768, 1440 and Add other cost at 360.

- [ ] **Step 5: Gates, commit** (`fix(money): wrap cost names, 2+2/4-up stats, no split numbers, AUD fits (LA-006 030 031 032 033)`).

---

### Task 7: Days screen and shared timeline (LA-004, 021, 022, 053)

**Files:**
- Modify: `components/trip/calendar-views.tsx:219, :246`
- Modify: `components/trip/timeline.tsx:450, :470` (also used by the public share page — Task 9 relies on this)
- Modify: `components/trip/month-grid.tsx:83, :158, :174-182`
- Test: `calendar-views.test.tsx`, `timeline.test.tsx`, `month-grid.test.tsx`

**Interfaces:**
- Produces: timeline item titles and addresses wrap (`min-w-0 flex-1 break-words`) — Task 9 does not re-touch `timeline.tsx`.

- [ ] **Step 1: Failing tests.**

```tsx
// calendar-views.test.tsx — LA-004
it("wishlist aside titles clamp to two lines and link to the item", () => {
  const title = screen.getByText(/Overnight at the Snow/);
  expect(title.className).toContain("line-clamp-2");
  expect(title.closest("a, button")).not.toBeNull();
});

// timeline.test.tsx — LA-021 / LA-012
it("item titles and addresses wrap instead of truncating", () => {
  expect(screen.getByText("Vatican Museums & Sistine Chapel").className).not.toContain("truncate");
  expect(screen.getByText(/Sparkassenstraße 10/).className).not.toContain("truncate");
});

// month-grid.test.tsx — LA-022 / LA-053
it("tablet day cells drop the country line and keep the badge inside the cell", () => {
  const country = screen.getByText("Germany");
  expect(country.className).toContain("lg:block");
  expect(country.className).not.toContain("sm:block");
  const badge = screen.getByText(/2 things/);
  expect(badge.className).toContain("max-w-full");
});
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement.**
  - LA-004: aside `lg:w-64` → `lg:w-72 xl:w-80`; item title `min-w-0 flex-1 truncate` → `min-w-0 flex-1 line-clamp-2` (the row is already a link/button to the item — verify; if not, wrap it in the existing open-item action).
  - LA-021/012 (timeline): title `min-w-0 flex-1 truncate …` → `min-w-0 flex-1 break-words …` (drop `title`, now redundant); address `min-w-0 truncate` → `min-w-0 break-words`.
  - LA-022: country line `hidden truncate … sm:block` → `hidden truncate … lg:block` (768 shows city + nights only, like the kit); city name keeps `sm:line-clamp-2` (cell links to the day). Count badge: add `max-w-full truncate` and shorten to the number with an icon below `xl` if it still spills (`<span className="xl:hidden">{n}</span><span className="hidden xl:inline">{n} things</span>`, with `aria-label={`${n} things`}`).
  - LA-053: travel-icon row `hidden items-center gap-0.5 sm:flex` → `hidden min-w-0 items-center gap-0.5 overflow-hidden sm:flex`; cell padding `sm:p-2.5` → `sm:p-2 xl:p-2.5`.

- [ ] **Step 4: Run — expect PASS.** Check Days month grid at 768, 1024, 1280; Agenda at 360; wishlist aside at 1440.

- [ ] **Step 5: Gates, commit** (`fix(days): wrap agenda titles, clamp wishlist aside, fit month cells (LA-004 021 022 053)`).

---

### Task 8: Compare and Promote fork (LA-001, 003, 018, 019, 020)

**Files:**
- Modify: `components/trip/compare-table.tsx:192, :224-229, :306, :412, :426-429, :445`
- Modify: `components/trip/promote-fork-dialog.tsx:225`
- Test: `compare-table.test.tsx`, `promote-fork-dialog.test.tsx`

- [ ] **Step 1: Failing tests.**

```tsx
// compare-table.test.tsx
it("country summary wraps (LA-001)", () => {
  expect(screen.getByText(/Finland · Germany/).className).not.toContain("truncate");
});
it("grid steps to 3 columns on wide screens (LA-018)", () => {
  const grid = screen.getAllByTestId("plan-card")[0].parentElement as HTMLElement;
  expect(grid.className).toContain("xl:grid-cols-3");
});
it("stat row never overlaps: 2 columns until the card is wide (LA-003)", () => {
  const stats = screen.getAllByText("Trip cost")[0].closest("[data-plan-stats]") as HTMLElement;
  expect(stats.className).toContain("grid-cols-2");
  expect(stats.className).not.toContain("sm:grid-cols-3");
});
it("fork title never breaks mid-word (LA-019)", () => {
  const h3 = screen.getByRole("heading", { name: "+ Switzerland" });
  expect(h3.className).not.toContain("break-words");
});

// promote-fork-dialog.test.tsx — LA-020
it("committed-things labels wrap; IDs wrap anywhere", () => {
  const label = screen.getByText(/The Bloomsbury/);
  expect(label.className).not.toContain("truncate");
  expect(label.className).toContain("[overflow-wrap:anywhere]");
});
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement.**
  - LA-001: `mt-1.5 truncate px-2.5 text-xs …` → `mt-1.5 px-2.5 text-xs …` (wraps); leg-change line (:224) and route row (:192) same (`min-w-0 truncate` → `min-w-0 break-words`).
  - LA-018: grid `md:grid-cols-2` → `md:grid-cols-2 xl:grid-cols-3`.
  - LA-003: stats grid gets `data-plan-stats` and `grid grid-cols-2 gap-x-2 gap-y-3 2xl:grid-cols-3` (3-up only when cards are wide); `VALUE_CLASS` adds `whitespace-nowrap tabular-nums`.
  - LA-019: h3 `min-w-0 break-words …` → `min-w-0 …` (normal word wrapping); the header row becomes `flex flex-wrap items-start gap-2` so the chevrons + FORK badge drop to their own line when needed.
  - LA-020: `min-w-0 truncate text-foreground` → `min-w-0 text-foreground [overflow-wrap:anywhere]`.

- [ ] **Step 4: Run — expect PASS.** Check Compare at 390, 768, 1440, 1920 and Promote fork at 360.

- [ ] **Step 5: Gates, commit** (`fix(compare): wrap summaries, 3-up grid, no stat overlap (LA-001 003 018 019 020)`).

---

### Task 9: Public share page (LA-012, 041, 042, 043)

**Files:**
- Modify: `app/share/[token]/page.tsx:293, :310, :385-393, :436-458`
- Modify: `components/trip/route-map.tsx:261-301`
- Test: `app/share/[token]/page.test.tsx` (or the existing share test), `components/trip/route-map.test.tsx`

**Interfaces:**
- Consumes: timeline wrapping from Task 7.
- Produces: `routeFitPoints(stops, home)` exported from `route-map.tsx` — returns the lat/lngs to fit (stops only when there are ≥2 located stops; stops + home otherwise).

- [ ] **Step 1: Failing tests.**

```ts
// route-map.test.tsx — LA-042
import { routeFitPoints } from "./route-map";
it("fits the map to the stops, not the far-away home marker", () => {
  const stops = [{ lat: 48.1, lng: 11.5 }, { lat: 51.5, lng: -0.1 }];
  const home = { lat: -27.5, lng: 153.0 };
  expect(routeFitPoints(stops, home)).toEqual(stops);
});
it("includes home when there are fewer than two located stops", () => {
  const home = { lat: -27.5, lng: 153.0 };
  expect(routeFitPoints([{ lat: 48.1, lng: 11.5 }], home)).toHaveLength(2);
});
```

```tsx
// share page test
it("addresses wrap (LA-012) and the hero title balances (LA-043)", () => {
  expect(screen.getByText(/Sparkassenstraße/).className).not.toContain("truncate");
  expect(screen.getByRole("heading", { level: 1 }).className).toContain("text-balance");
});
it("day-by-day cards form a grid on wide screens (LA-041)", () => {
  const day = screen.getAllByTestId("share-day")[0];
  expect(day.parentElement!.className).toContain("lg:grid-cols-2");
});
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement.**
  - LA-012: `truncate font-bold` → `break-words font-bold`; `<p className="truncate">{accom.address}` → `<p className="break-words">`.
  - LA-043: h1 add `text-balance`.
  - LA-041: shell `max-w-[1080px]` → `max-w-page-wide`; the day-card list `flex flex-col gap-3` → `grid grid-cols-1 items-start gap-3 lg:grid-cols-2 2xl:grid-cols-3`; each day Card gets `data-testid="share-day"`.
  - LA-042: extract `routeFitPoints` (pure) and use it where `allLatLngs.push(homeLatLng)` + `fitBounds` currently run. Home is still drawn as a marker; it just isn't part of the fit when ≥2 stops are located.

- [ ] **Step 4: Run — expect PASS.** Open the share link from Settings in `npm run dev` at 390 and 1440.

- [ ] **Step 5: Gates, commit** (`fix(share): wrap addresses, day grid, map fits the route (LA-012 041 042 043)`).

---

### Task 10: Small shared components (LA-010, 015, 016, 023, 025, 028, 044, 048)

**Files:**
- Modify: `components/trip/notification-bell.tsx:91, :113, :159`
- Modify: `components/trip/settings/share-links-panel.tsx:166-174`
- Modify: `components/trip/trip-card.tsx:108-111`
- Modify: `components/ui/sheet.tsx:41-42` (`docked` variant), `components/feedback/feedback-launcher.tsx:540-610`
- Modify: `components/globe/marker-list.tsx:66-68`
- Modify: `components/account/trip-digests-panel.tsx:81`
- Modify: `components/trip/trip-cover.tsx:73-79, :141-147`
- Test: the test beside each file

- [ ] **Step 1: Failing tests** (one each):

```tsx
it("LA-010: last notification clears the footer", () => {
  const list = screen.getByRole("list");
  expect(list.className).toContain("pb-3");
  expect(list.className).toContain("scroll-pb-3");
});
it("LA-015: share link actions wrap on phones", () => {
  const revoke = screen.getByRole("button", { name: /revoke/i });
  expect(revoke.parentElement!.className).toContain("flex-wrap");
});
it("LA-016: status badge wraps instead of clipping", () => {
  const badge = screen.getByText(/PLANNING · IN/i);
  expect(badge.className).toContain("whitespace-normal");
  expect(badge.className).toContain("max-w-[calc(100%-1.5rem)]");
});
it("LA-023: docked feedback sheet sizes to content on desktop", () => {
  // assert the docked variant class string
  expect(sheetVariants({ side: "docked" })).toContain("md:h-auto");
  expect(sheetVariants({ side: "docked" })).toContain("md:max-h-[min(37.5rem,calc(100vh-9rem))]");
});
it("LA-025: marker rows wrap title and subtitle", () => {
  expect(screen.getByText(/Sahara overnight/).className).not.toContain("truncate");
});
it("LA-048: digest trip name wraps", () => {
  expect(screen.getByText(/Alpine Road Loop/).className).not.toContain("truncate");
});
it("LA-028: cover backdrop fills the card", () => {
  const backdrop = container.querySelector("img[aria-hidden='true']")!;
  expect(backdrop.className).toContain("size-[calc(100%+4rem)]");
});
it("LA-044: monogram cover uses the gradient treatment", () => {
  const cover = screen.getByText("L").parentElement!;
  expect(cover.className).toMatch(/bg-gradient-to-br from-(coral|sun|teal|lilac)/);
});
```

Adjust selectors to each component's real markup and the existing export names (e.g. if `sheet.tsx` doesn't export its variants, export `SHEET_SIDE_CLASSES` and assert on it).

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement.**
  - LA-010: list `max-h-80 overflow-y-auto` → add `pb-3 scroll-pb-3`.
  - LA-015: actions `flex shrink-0 gap-1` → `flex flex-wrap justify-end gap-1`; parent row `flex items-start justify-between gap-3` → `flex flex-wrap items-start justify-between gap-3`.
  - LA-016: badge add `max-w-[calc(100%-1.5rem)] whitespace-normal text-left leading-tight`.
  - LA-023: docked desktop `md:h-[min(37.5rem,max(16rem,calc(100vh-9rem)))]` → `md:h-auto md:max-h-[min(37.5rem,calc(100vh-9rem))]`; on mobile keep full-height but in `feedback-launcher.tsx` render the empty state as a centred block that fills the space (`flex flex-1 flex-col items-center justify-center gap-2 text-center`) with the existing copy.
  - LA-025: `block truncate text-sm font-extrabold` → `block break-words text-sm font-extrabold`; sub `block truncate` → `block break-words`.
  - LA-048: `min-w-0 flex-1 truncate` → `min-w-0 flex-1 break-words`.
  - LA-028: backdrop `<img className="absolute -inset-8 object-cover blur-xl brightness-75">` → `absolute -left-8 -top-8 size-[calc(100%+4rem)] max-w-none object-cover blur-xl brightness-75`.
  - LA-044: `MonogramCover` — use the same hue gradient the other photo-less trips use (find it in `trip-cover.tsx` / `trip-card.tsx`; it's derived from the trip id/name) instead of `from-secondary to-muted`, and the initial at `text-on-accent/80`.

- [ ] **Step 4: Run — expect PASS.** Spot-check each in `npm run dev` at 360 and 1440.

- [ ] **Step 5: Gates, commit** (`fix(ui): notifications, share links, trip badge, feedback panel, markers, digest, covers (LA-010 015 016 023 025 028 044 048)`).

---

### Task 11: Settings, New trip, Checklists — companion columns (LA-017, 034, 046, 052, 051 settings copy)

**Files:**
- Modify: `app/(app)/trips/[tripId]/settings/page.tsx:100-200`
- Modify: `app/(app)/trips/new/page.tsx:13`, `app/(app)/trips/new/new-trip-form.tsx:60-160`
- Modify: `app/(app)/trips/[tripId]/checklists/page.tsx`
- Create: `app/(app)/trips/[tripId]/checklists/checklists-layout.tsx` (`"use client"`)
- Test: `settings/page.test.tsx`, `trips/new/page.test.tsx` (or form test), `checklists/page.test.tsx`, new `checklists-layout.test.tsx`

**Interfaces:**
- Produces: `ChecklistsLayout({ panels }: { panels: { value: "pretrip" | "packing" | "booking"; label: React.ReactNode; content: React.ReactNode }[] })` — below 1024px renders the existing teal Tabs; at ≥1024px renders the panels as a card grid (`grid gap-4 lg:grid-cols-2 2xl:grid-cols-3`, each panel in a `Card` with its label as the heading). Uses `useSyncExternalStore` over `matchMedia("(min-width: 1024px)")` with server snapshot `false` (tabs), so each panel's content mounts exactly once.

- [ ] **Step 1: Failing tests.**

```tsx
// settings page — LA-046 / LA-051
it("settings cards sit in two columns from lg", () => {
  expect(SETTINGS_GRID_CLASS).toContain("lg:grid-cols-2");
  expect(SETTINGS_GRID_CLASS).not.toContain("max-w-2xl");
});

// new trip — LA-034
it("new trip form uses two columns from lg", () => {
  expect(NEW_TRIP_FORM_GRID_CLASS).toContain("lg:grid-cols-2");
});

// checklists-layout.test.tsx — LA-017
it("shows tabs on phones and a card grid on desktop", () => {
  mockMatchMedia(false);
  const { rerender } = render(<ChecklistsLayout panels={panels} />);
  expect(screen.getByRole("tablist")).toBeInTheDocument();
  mockMatchMedia(true);
  rerender(<ChecklistsLayout panels={panels} />);
  expect(screen.queryByRole("tablist")).toBeNull();
  expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(3);
});

// checklists page — LA-052
it("segmented tabs are 44px tall on touch and the third label fits at 360", () => {
  expect(CHECKLISTS_TAB_CLASS).toContain("pointer-coarse:h-11");
  expect(CHECKLISTS_TAB_CLASS).toContain("max-sm:px-2");
});
```

(`mockMatchMedia` — define in the test: `window.matchMedia = vi.fn().mockReturnValue({ matches, addEventListener: vi.fn(), removeEventListener: vi.fn() })`.)

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement.**
  - Settings: export `SETTINGS_GRID_CLASS = "grid grid-cols-1 items-start gap-3.5 lg:grid-cols-2"`. Replace `mx-auto max-w-2xl flex flex-col gap-3.5` with two column wrappers inside that grid, grouped like the kit: left = Trip details, Home base, Driving (whatever panels exist for those); right = Travellers/Invite, Share links, Digest, Calendar feed, Danger zone. Each column is `flex flex-col gap-3.5`. Card body copy (`p.text-xs`) gets `max-w-reading` (LA-051).
  - New trip: page wrapper `mx-auto max-w-xl space-y-8` → `mx-auto w-full max-w-5xl space-y-8`. In the form, export `NEW_TRIP_FORM_GRID_CLASS = "grid grid-cols-1 gap-6 lg:grid-cols-2 lg:gap-8"` wrapping two column divs: left = Trip name, Home currency, Home base; right = Dates, Cover photo. The actions row stays full-width below (`lg:col-span-2`).
  - Checklists: `page.tsx` builds the three panel nodes (Pre-trip, Packing, Booking parser — the existing `TabsContent` children, unchanged) and renders `<ChecklistsLayout panels={…} />` in place of the `Tabs` block; drop `CHECKLISTS_READING_WIDTH_CLASS` usage (keep the export only if a test imports it — update that test instead). Move the Tabs markup and the tab classes into `checklists-layout.tsx`. LA-052: `CHECKLISTS_TAB_CLASS` add `pointer-coarse:h-11 max-sm:px-2` (replacing `max-sm:px-2.5`), and the list `pointer-coarse:h-12` → `pointer-coarse:h-[3.25rem]` so the 44px triggers fit.

- [ ] **Step 4: Run — expect PASS.** Check Settings, New trip, Checklists at 360, 1024, 1440, 2560.

- [ ] **Step 5: Gates, commit** (`fix(layout): settings and new-trip two columns, checklists card grid (LA-017 034 046 051 052)`).

---

### Task 12: Prose pages — legal, help, what's new, print (LA-026, 027, 040, 047, 051, 055)

**Files:**
- Modify: `components/legal/legal-page.tsx`
- Modify: `components/trip/help-guide.tsx:195, :223, :246`; `app/(app)/help/page.tsx:16`; `app/(app)/trips/[tripId]/help/page.tsx:27`
- Modify: `app/(app)/whats-new/page.tsx`
- Modify: `app/(app)/trips/[tripId]/print/page.tsx:315`
- Test: `components/legal/legal-page.test.tsx` (create if missing), `help-guide.test.tsx`, `whats-new/page.test.tsx`, `print/page.test.tsx`

**Interfaces:**
- Produces: `legalToc(children: React.ReactNode): { id: string; title: string }[]` (pure, exported from `legal-page.tsx`) — collects `LegalSection` children's titles; `LegalSection` renders `id={slugify(title)}` on its `<section>`; `slugify(title)` lowercases and replaces non-alphanumerics with `-`.

- [ ] **Step 1: Failing tests.**

```tsx
// legal-page.test.tsx — LA-040
import { LegalPage, LegalSection, legalToc } from "./legal-page";
it("builds a table of contents from its sections", () => {
  const kids = [<LegalSection key="a" title="What we collect">x</LegalSection>, <LegalSection key="b" title="Your rights">y</LegalSection>];
  expect(legalToc(kids)).toEqual([{ id: "what-we-collect", title: "What we collect" }, { id: "your-rights", title: "Your rights" }]);
});
it("renders a sticky contents column beside the text on desktop", () => {
  render(<LegalPage title="Privacy"><LegalSection title="Your rights">y</LegalSection></LegalPage>);
  const nav = screen.getByRole("navigation", { name: "On this page" });
  expect(nav.className).toContain("lg:sticky");
  expect(screen.getByRole("link", { name: "Your rights" })).toHaveAttribute("href", "#your-rights");
});

// help-guide.test.tsx — LA-026 / LA-027 / LA-051
it("60-second steps reflow into two columns when the card is wide", () => {
  expect(screen.getByRole("list", { name: /60-second/i }).className).toContain("lg:columns-2");
});
it("the open 60-second card doesn't change the grid's column count", () => {
  expect(TOPIC_GRID).toContain("lg:grid-cols-3");
  expect(TOPIC_GRID).toContain("grid-flow-row-dense");
});

// whats-new page — LA-047
it("shows a sticky release list beside the notes on desktop", async () => {
  const nav = screen.getByRole("navigation", { name: "Releases" });
  expect(nav.className).toContain("lg:sticky");
});

// print page — LA-055
it("labels the on-screen A4 preview and keeps print output full width", () => {
  expect(screen.getByText("Print preview").className).toContain("print:hidden");
  const root = container.querySelector("[data-print-root]")!;
  expect(root.className).toContain("print:max-w-none");
});
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement.**
  - Legal (LA-040): header inner and `<main>` `max-w-3xl` → `max-w-page-wide`; main content becomes `lg:grid lg:grid-cols-[minmax(0,68ch)_16rem] lg:justify-center lg:gap-16`; left = the existing title/intro/sections (sections column `max-w-reading`); right = `<nav aria-label="On this page" className="hidden lg:block lg:sticky lg:top-8 lg:self-start">` listing `legalToc(children)` as links. `LegalSection` adds `id` + `scroll-mt-8`.
  - Help (LA-026/027/051): the 60-second disclosure body `flex max-w-prose flex-col …` → `flex flex-col …`, its intro/closing paragraphs `max-w-reading`, and the numbered `<ol>` gets `aria-label="The 60-second version"` and `lg:columns-2 lg:gap-8 [&>li]:break-inside-avoid`. `TOPIC_GRID` add `grid-flow-row-dense auto-rows-fr` (equal row heights; no orphan gap). The two page subtitles `max-w-prose` → `max-w-[60ch]` (LA-051). The spec's table also lists a table of contents for Help: Help's topic cards already fill the width (it isn't an island), so no TOC is added — report this in the task report.
  - What's new (LA-047): wrap in `lg:grid lg:grid-cols-[minmax(0,68ch)_14rem] lg:justify-start lg:gap-12`; drop both `lg:max-w-[720px]`; each release Card gets `id={`release-${group.date}`}` + `scroll-mt-20`; the right column is `<nav aria-label="Releases" className="hidden lg:block lg:sticky lg:top-20 lg:self-start">` with one link per group (formatted date).
  - Print (LA-055): keep `max-w-3xl` (A4-shaped on purpose — spec §3); add, as the first child of `data-print-root`, `<p className="text-label text-muted-foreground print:hidden">Print preview</p>`. Leave all `print:` classes intact.

- [ ] **Step 4: Run — expect PASS.** Check `/privacy`, `/terms`, `/help`, trip Help, `/whats-new`, Print at 390, 1440, 2560, and Print with `page.emulateMedia({ media: "print" })` at 794.

- [ ] **Step 5: Gates, commit** (`fix(prose): legal and what's-new companion columns, help reflow, print preview label (LA-026 027 040 047 051 055)`).

---

### Task 13: Tap targets everywhere (LA-037, 049, 050, 054)

**Files:**
- Modify: `app/(app)/layout.tsx` (header row: Globe link, avatar trigger, gap)
- Modify: `app/(app)/trips/[tripId]/layout.tsx:130-146` (avatar stack → one link)
- Modify: `components/feedback/feedback-launcher.tsx:516` (FAB — verify ≥44; it's `size-11`)
- Modify: `components/trip/itinerary-manager.tsx:256, :310, :370` (drag handles); `components/trip/stop-card.tsx:364-568` (icon buttons); `components/trip/stop-day-list.tsx:121` (chevrons); `components/trip/cost-checklist.tsx:68-100` (checkbox rows); `components/trip/fork-switcher.tsx:346-370`; `components/globe/marker-list.tsx:80-85`; trip settings icon buttons (Travellers list etc. — find via `size="icon"`/`size-8` in `components/trip/settings/`)
- Modify: `app/signin/page.tsx:98-106`, `components/legal/legal-page.tsx` header links, `app/terms/page.tsx:59`
- Test: the tests beside each file

- [ ] **Step 1: Failing tests** (representative; add one per file changed):

```tsx
// trip layout — LA-050
it("member avatars are one 44px link to the travellers settings", () => {
  const link = screen.getByRole("link", { name: /trip members/i });
  expect(link).toHaveAttribute("href", `/trips/${tripId}/settings#travellers`);
  expect(link.className).toContain("min-h-11");
});

// app layout — LA-050
it("header icon links get a 44px tap target", () => {
  expect(screen.getByRole("link", { name: "Globe" }).className).toContain("min-h-11");
  expect(screen.getByRole("button", { name: "Open traveller menu" }).className).toContain("tap-target");
});

// itinerary-manager / stop-card — LA-037
it("drag handles and card icon buttons have tap targets", () => {
  expect(screen.getAllByTestId("drag-handle-stop")[0].className).toContain("tap-target");
});

// cost-checklist — LA-049
it("the whole cost row toggles paid", () => {
  const label = screen.getByText("The Bloomsbury Hotel").closest("label")!;
  expect(label.className).toContain("min-h-11");
});

// signin — LA-054
it("footer links are padded, spaced tap targets", () => {
  const privacy = screen.getByRole("link", { name: "Privacy" });
  expect(privacy.className).toContain("tap-target");
  expect(privacy.parentElement!.className).toContain("gap-4");
});
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement.**
  - App header: right-hand row `gap-1` → `gap-2`; Globe link add `inline-flex min-h-11 items-center px-3`; avatar trigger add `tap-target`. `ThemeToggle` and `CommandPaletteTrigger` are `size="icon"` (44px) — confirm, don't change.
  - Trip header avatar stack: wrap the `-space-x-2` group in `<Link href={`/trips/${tripId}/settings#travellers`} aria-label={`Trip members (${trip.members.length})`} className="inline-flex min-h-11 items-center rounded-full px-1 focus-visible:outline-3 …">`. Give the Travellers/Invite card on the settings page `id="travellers"` + `scroll-mt-20` (settings page from Task 11). Remove the old `aria-label` from the inner div.
  - Plan controls: add `tap-target` to drag handles (keep `p-1`), the stop/transport card `size-8` icon buttons, cost-row edit/X buttons and day-row chevrons. Where two `size-8` buttons sit with `gap-1` (4px), change to `gap-2` so hit areas (44px) overlap less — accept residual overlap between adjacent icon buttons (the `::before` of the later sibling wins, which is fine as both are distinct targets centred on their own glyph).
  - Cost checklist: make each row a `<label className="flex min-h-11 items-center gap-3 …">` containing the checkbox (whole row toggles).
  - Fork switcher row icons, marker-row action icons, settings icon buttons: add `tap-target`.
  - Sign-in footer: render the two links in `<nav className="flex items-center justify-center gap-4 text-xs">` without the `·` separator; each link `tap-target underline underline-offset-2`. Legal header logo link and the "Terms"/"Privacy" link: add `inline-flex min-h-11 items-center`. Terms inline "Privacy" link: add `tap-target`.

- [ ] **Step 4: Run — expect PASS.** Check Plan, Money, Settings, header, `/signin` at 360 with touch emulation.

- [ ] **Step 5: Gates, commit** (`fix(a11y): 44px tap targets across header, plan, money, settings, sign-in (LA-037 049 050 054)`).

---

### Task 14: Remove leftover ad-hoc page widths

**Files:**
- Modify: any page container still using `max-w-5xl|6xl|7xl` or a bespoke page cap that the shell now provides (search below). Component-internal caps stay.
- Test: `app/page-widths.test.ts` (new)

- [ ] **Step 1: Failing test** — `app/page-widths.test.ts`:

```ts
import { execSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("page widths", () => {
  it("no page or layout uses the old shell widths", () => {
    const out = execSync(
      `grep -rlE "max-w-(5xl|6xl|7xl)" app components --include=*.tsx || true`,
      { encoding: "utf8" },
    ).trim();
    expect(out).toBe("");
  });
});
```

- [ ] **Step 2: Run — expect FAIL** if any remain (it may already pass after Task 2 — if so, keep the test as a regression guard and note it).

- [ ] **Step 3: Implement.** Replace each remaining hit with the shared width or remove it (the shell caps content). Leave `admin/page.tsx`'s `max-w-2xl` (no finding; it's a form column) and the day page's `DAY_READING_WIDTH_CLASS` (reading column) as they are.

- [ ] **Step 4: Run — expect PASS. Gates, commit** (`refactor(layout): drop leftover shell widths`).

---

### Task 15 (controller-run): Final gate — fresh audit, re-check all 54, contrast, before/after page

Run by the main session, not an implementer subagent (it needs the dev server, Playwright and reviewer subagents).

- [ ] **Step 1: Gate trips.** `npm run dev`. In the local app (never production), check each audit trip's Phase on Home; for any Phase with no trip (Final prep after 2026-09-26, Travelling after 2026-09-27), edit that trip's dates in its local Settings so it lands in the missing Phase (Final prep = starts within the final-prep window; Travelling = today inside the date range).
- [ ] **Step 2: Fresh full run.** `NODE_PATH=/usr/local/lib/node_modules LAYOUT_AUDIT_OUT=/tmp/layout-audit/stage2 npm run audit:layout`. Expect exit 0, 0 capture errors, no coverage gaps.
- [ ] **Step 3: Re-check.** Dispatch reviewer subagents in batches (one screen per batch) with the new screenshots, `findings.auto.json` for that screen, and each Stage 1 finding for that screen from `docs/audits/2026-09-24-layout-findings.json`. Each returns, per finding, `fixed | not-fixed (why)`, plus any **new** Broken finding. Gate: no new Broken; every not-fixed one goes to Cam with its reason.
- [ ] **Step 4:** `NODE_PATH=/usr/local/lib/node_modules npm run audit:contrast` → `RESULT: PASS`.
- [ ] **Step 5: Before/after page.** Crops with `npm run audit:layout:crops -- /tmp/layout-audit/stage2` (after writing a Stage 2 `findings.json` of the re-checked findings with new screenshot paths). Publish a private artifact: per finding, the Stage 1 description, the new crop and the verdict.
- [ ] **Step 6:** Write `docs/audits/2026-09-25-layout-recheck.md` (verdict per finding, new findings, coverage), commit it. Stop — merging to `beta` waits for Cam.

---

## Addendum (2026-09-25): residual fix wave after the Task 15 re-check

The fresh audit (`/tmp/layout-audit/stage2`) and re-check (`.superpowers/sdd/2026-09-25-layout-fixes/recheck/*.md`, git-ignored) found 36 fixed / 13 partly / 5 not fixed and no new Broken. These three tasks close the rest. Each re-check file names the screenshots; read the relevant one before starting. Global Constraints above still bind.

### Task 16: Overlays — footers, sheets, menus, header overflow

**Files:** `components/ui/dialog.tsx`, `components/trip/notification-bell.tsx`, `components/ui/sheet.tsx` + `components/feedback/feedback-launcher.tsx`, `components/trip/itinerary-manager.tsx` (Chapters menu), `app/(app)/layout.tsx` (avatar trigger); tests beside each.

- [ ] **LA-011 + promote-fork list + other-cost hint (re-check A, B):** at the end of a scrolled dialog body the sticky `DialogFooter` still covers the last field / last list row / helper text (Stage 2 shots `overlay/stop-edit/390-light.png`, `overlay/transport-edit/390-light.png`, `overlay/other-cost-add/360-light-kbd.png`, `overlay/promote-fork/360-light.png`). `scroll-pb-24` only affects scroll snapping, not layout. Reproduce in `npm run dev` at 390 (and 390×500 for the keyboard case), find why content ends under the footer (e.g. the footer's negative bottom margin or the body's padding arithmetic), and fix it in the shared primitive so the last field fully clears the footer when scrolled to the end. Test: pin the arrangement; add a jsdom-independent assertion where possible (e.g. the body's bottom padding ≥ footer height token).
- [ ] **LA-010 (re-check A):** the last notification's date is still under "See all activity" at 360 and 1440 (`overlay/notifications/*.png`). Task 10 added `pb-3 scroll-pb-3` but it didn't clear it — reproduce, find the real cause (footer overlapping the list's box vs. list max-height), fix, test.
- [ ] **LA-023 mobile (re-check D):** the feedback sheet is still full-height with a void on 360/390. On mobile make it a bottom sheet sized to content (`h-auto max-h-[90dvh]`, anchored bottom) — keep desktop as fixed in Task 10.
- [ ] **Chapters menu over the tab bar (re-check A, Ugly):** at 360/390 the Chapters `DropdownMenuContent` renders on top of the fixed mobile tab bar. Give it a bottom collision padding that includes the tab bar: `collisionPadding={{ top: 16, right: 16, left: 16, bottom: 16 + 76 }}` (76px = `--tp-tab-bar-h` 4.75rem) or read the CSS var; prefer `side="top"` if the trigger sits in the lower half. Test the prop.
- [ ] **4px sideways scroll at 360 (diagnosis G):** the avatar trigger's `tap-target` `::before` pokes past the viewport edge. Replace it with a real 44px box: trigger `grid size-11 place-items-center rounded-full` wrapping the `size-9` Avatar (drop `tap-target` there). Verify `document.documentElement.scrollWidth === 360` at 360 with a dialog open. Test the class.

Gates as usual; commit `fix(overlays): footers clear the last field, sheets size to content, menu clears the tab bar (LA-010 011 023)`.

### Task 17: Text, measure and grids

**Files:** `app/globals.css` + `app/globals-tokens.test.ts`, `components/legal/legal-page.tsx`, `app/(app)/whats-new/page.tsx`, `app/(app)/trips/[tripId]/settings/page.tsx`, `components/trip/help-guide.tsx`, `components/trip/timeline.tsx`, `components/trip/month-grid.tsx`, `app/share/[token]/page.tsx`, `components/trip/compare-table.tsx`, `app/(app)/trips/[tripId]/checklists/checklists-layout.tsx`, `app/(app)/trips/new/page.tsx`, `components/trip/home/phase-sketching.tsx`; tests beside each.

- [ ] **Reading measure (diagnosis G, LA-051):** `--container-reading: 68ch` renders ~92 characters (ch = width of "0"). Change to `--container-reading: 38rem;` and replace the literal `minmax(0,68ch)` in `legal-page.tsx` and `whats-new/page.tsx` with `minmax(0,38rem)` (or the var). Update the token test. Re-measure a Privacy paragraph at 1440: ≤ ~80 chars/line.
- [ ] **LA-051 (re-check F):** every prose `<p>` in Settings cards (Digest, Calendar feed, Driving estimates, Share links, and any other body copy) and the 60-second closing paragraph gets `max-w-reading`.
- [ ] **LA-047 (re-check F):** `whats-new/page.tsx:58` `lg:justify-start` → `lg:justify-center`.
- [ ] **LA-021 (re-check C):** `timeline.tsx:400` and `:424` check-in/check-out titles `block truncate …` → `block break-words …` (drop the now-redundant `title`); `:322/:324` transport from/to labels likewise if they clip.
- [ ] **LA-022 (re-check C):** month-grid city label (`month-grid.tsx:174`) still ellipsizes at 768 — the cell links to the day, so rule 2 allows a 2-line clamp: make it `line-clamp-2 whitespace-normal break-words` from `sm` (drop `truncate` at `sm+`; keep phone behaviour).
- [ ] **LA-043 (re-check C):** `text-balance` didn't stop "2026" orphaning at 360–390. In the share hero, join the last two words of the trip name with a non-breaking space (small pure helper `noOrphan(name)`, unit-tested: `"EU Christmas 2026"` → `"EU Christmas 2026"`, single word unchanged).
- [ ] **LA-018 at 768/1024 and LA-027 at 768 (re-check B, F):** in a 2-column state, a lone last card spans the row: compare grid add `md:[&>*:last-child:nth-child(odd)]:col-span-2 xl:[&>*:last-child:nth-child(odd)]:col-span-1`; help `TOPIC_GRID` add `sm:[&>*:last-child:nth-child(odd)]:col-span-2 lg:[&>*:last-child:nth-child(odd)]:col-span-1`. Test the class strings.
- [ ] **LA-052 at 360 (re-check E):** the tab strip's rounded right edge still clips the last "r" of "Booking parser" — reduce the list's inline padding or trigger padding one step at `max-[375px]` so the label clears the border by ≥4px. Verify at 360 in the browser.
- [ ] **New trip width (re-check E Polish):** page wrapper `max-w-page-wide` → `max-w-[64rem]` (a 2-column form doesn't need 1600px). Keep `app/page-widths.test.ts` green.
- [ ] **Sketching blank cell (re-check D, Ugly):** at ≥1024 on a Sketching trip, a blank rectangle sits left of Reminders. Place QuickActions in the left column of the same row as Reminders at `lg` (`lg:col-start-1 lg:col-span-1`, Reminders `lg:col-start-2` same row) so neither column dead-ends; DOM order stays hero → route → quick actions → reminders (mobile). Update the sketching tests.

Gates; commit `fix(layout): readable measure, wrap check-ins, clamp month cells, no orphans (LA-018 021 022 027 043 047 051 052)`.

### Task 18: Tap-target stragglers + harness recipe

**Files:** `components/trip/cost-editor.tsx:362-384`, `components/trip/stop-day-list.tsx:301-311`, `components/trip/item-form-dialog.tsx` (`CategoryGroup`), `components/legal/legal-page.tsx` header nav link, `scripts/layout-audit/overlays.ts` (+ its test); tests beside each.

- [ ] **LA-037:** cost-row edit/delete icon buttons and the `DayItemRow` edit pencil get `tap-target` (spacing `gap-2` between adjacent icon buttons).
- [ ] **LA-049:** Category chips in the item form get `tap-target` (or `pointer-coarse:min-h-11`), with `gap-2` between chips.
- [ ] **LA-054:** the legal header's nav link gets `tap-target` so its hit area is ≥44×44 (it is 42×44 today).
- [ ] **Harness:** the `save-template` overlay recipe assumes a "Packing" tab, which only exists below 1024px now. Make the recipe width-aware: below 1024 click the tab; at ≥1024 click the "Save as template" button inside the Packing card (scope the locator to the card whose heading is "Packing"). Update `overlays.test.ts` accordingly. Do not change other recipes.

Gates; commit `fix(a11y): last tap-target stragglers; save-template recipe follows the checklist grid (LA-037 049 054)`.

### Task 19 (controller-run): re-run the gate for the residual wave

Subset re-run into a fresh dir (`LAYOUT_AUDIT_OUT=/tmp/layout-audit/stage3`, full run), re-check only the ids touched by Tasks 16–18 plus the new-problem items, contrast audit, then the before/after page and `docs/audits/2026-09-25-layout-recheck.md`.
