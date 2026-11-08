# Ideas box fills its space Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On an open Stop in the desktop Plan editor, the Ideas box shows as many ideas as fit in the height the Stay panel sets, under a header line. "+N" appears only when they run out of room.

**Architecture:**
- **Fitting:** a new pure `fitRows` in `components/trip/fit-titles.ts` does multi-row greedy fitting. `fitTitles` is unchanged; other components use it.
- **Layout:** `IdeasBox` becomes a column: a header line, then a wrapping chip area.
- **No feedback loop:** the box gets CSS size containment (`[contain:size]`) plus a fixed min-height floor. Its height then comes from the grid row (the Stay panel) or the floor, never from its chips. That makes measuring the chip area's height safe, and the row count comes from that height.

**Tech Stack:** React (client component), Tailwind v4, Vitest + Testing Library (jsdom), `motion/react`.

**Spec:** `docs/specs/2026-11-09-ideas-box-fill.md`.

## Global Constraints

- Chip height is `26px` (`h-[26px]`, as `CHIP_CLASS` already has). The gap between chips, both rows and columns, is `6px` (`gap-1.5`).
- **Fit options, kept from today:** `charPx: 7`, `gapPx: 6`, `overflowPx: 40`, `itemPx: 44`. Add `maxTextPx: 160`, which matches the chip title's `max-w-[10rem]` truncation.
- **Rows** = `max(1, floor((chipAreaHeight + 6) / (26 + 6)))`. A measured width of `0` (server or jsdom) means show every idea, as today. A measured height of `0` means 1 row.
- **Box floor:** `min-h-[74px]` when there are ideas (2px border ×2, 6px padding ×2, a 26px header, a 6px gap and one 26px chip row). `min-h-[42px]` when there are none.
- **Copy unchanged:** "N IDEAS" / "1 IDEA", "+ Add an idea", `+N` with aria-label `+N more ideas`.
- Unchanged:
  - the "+N" pop-over, Surprise chips, the hidden-from-shares icon and the chip exit animation
  - `useElementWidth`'s jsdom/server fallback
  - `components/plan/mobile/`
- Verification tiers per `CLAUDE.md`:
  - **Inner loop:** `npx vitest run <files>`.
  - **Task done:** `npx vitest related --run <changed source files>`, `npx tsc --noEmit` and `npx eslint <changed files>`.
  - **Branch:** `npm test`, `npm run build` and `npm run test:integration`.
- Zero comments unless the WHY is non-obvious. The containment line needs one: it's why measuring height is safe. Rewrite the existing `useElementWidth` comment to match. No new JSDoc.
- The commit trailer is exactly `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Never stage `AGENTS.md`.

## Review Focus

1. **Feedback loop.** Nothing a chip does may change the box's height. Pinned in Task 2: containment and floor classes on the root, and the shown count driven only by the mocked measurements. The real browser check follows Task 2.
2. **A very long title** (wider than a row) must not stop the fitting or push everything behind "+N". Pinned in Task 1 (`maxTextPx` cap, and a chip wider than the row placed alone).
3. **The stacked card** (< 640px) shows exactly one row. The floor gives a chip area of 26px, which is 1 row. Pinned in Task 2.
4. **No ideas.** The box shows only "+ Add an idea" and stays short. Pinned in Task 2.
5. **`useSyncExternalStore` snapshot stability.** A measurement snapshot that's a fresh object each call loops forever. The snapshot must be a primitive, or two stores. Pinned in Task 2 by rendering with both measurements mocked; a loop throws "Maximum update depth exceeded".

---

### Task 0 (controller)
- [ ] `git switch -c fix/ideas-box-fill` from `main`.
- [ ] Commit the spec, this plan and the refreshed `docs/feedback/inbox.md`.

### Task 1: `fitRows`, multi-row fitting

**Files:**
- Modify: `components/trip/fit-titles.ts` (add the function; leave `fitTitles` alone)
- Modify: `components/trip/fit-titles.test.ts`

**Interfaces:**
- Produces: `export function fitRows(titles: string[], widthPx: number, rows: number, opts?: { charPx?: number; gapPx?: number; overflowPx?: number; itemPx?: number; maxTextPx?: number }): { shown: number }`
  - Defaults as `fitTitles`. `maxTextPx` defaults to no cap.
  - Each chip's width is `min(title.length * charPx, maxTextPx) + itemPx`.
  - A chip joins the current row if the row's used width, plus `gapPx` when the row isn't empty, plus the chip fits within `widthPx`. Otherwise it starts the next row. A chip wider than `widthPx` sits alone on its row.
  - If every chip fits within `rows` rows, return `n`.
  - Otherwise, fill greedily in order. On the last allowed row, a chip is placed only if, after it, `gapPx + overflowPx` still fits on that row. Stop at the first chip that can't be placed.
  - `rows < 1` is treated as 1. At least 1 is shown whenever `n > 0`. Return 0 for no titles.

- [ ] **Step 1: Write the failing tests** in `fit-titles.test.ts`, `describe("fitRows")`. All use `{ charPx: 10, gapPx: 10, overflowPx: 20, itemPx: 0 }` unless stated:
  - `fitRows(["aaaa","bbbb","cccc"], 100, 2, o)` → `{ shown: 3 }`. Row one is 40+10+40, row two is 40.
  - `fitRows(["aaaa","bbbb","cccc"], 100, 1, o)` → `{ shown: 1 }`. A second chip would need 90+10+20 = 120.
  - `fitRows(["aaaa","bbbb","cccc","dddd","eeee"], 100, 2, o)` → `{ shown: 3 }`.
  - `fitRows(["x".repeat(100), "x".repeat(100)], 110, 1, { ...o, maxTextPx: 50 })` → `{ shown: 2 }`.
  - `fitRows(["x".repeat(30), "aa", "bb"], 100, 3, o)` → `{ shown: 3 }`. The 300px chip sits alone on row one; "aa" and "bb" share row two.
  - `fitRows(["a","b"], 0, 0)` → `{ shown: 1 }`. `fitRows([], 100, 3)` → `{ shown: 0 }`.
- [ ] **Step 2:** `npx vitest run components/trip/fit-titles.test.ts`. Expect FAIL (`fitRows` is not exported).
- [ ] **Step 3:** Implement `fitRows`.
- [ ] **Step 4:** Run again and expect PASS. Then run the task-done verification.
- [ ] **Step 5: Commit**: `feat(plan): fit idea chips across several rows`.

### Task 2: The Ideas box fills the Stay panel's height

**Files:**
- Modify: `components/plan/ideas-box.tsx`
- Modify: `components/plan/ideas-box.test.tsx`
- Modify: `components/plan/stop-open-body.tsx`. Drop the `className="items-start"` passed to `IdeasBox`; the old single-row layout needed it.

**Interfaces:**
- Consumes: `fitRows` from Task 1.

**Layout:**
- **Root:** a column with the same border, radius and padding, plus `overflow-hidden`, `[contain:size]`, and the floor from Global Constraints.
- **Header line** (`data-testid="ideas-header"`, `h-[26px] shrink-0`, items centred, `justify-between`): the count on the left when there are ideas, and "+ Add an idea" (same classes as now) on the right. With no ideas, only the button shows, at the start.
- **Chip area** (`ref`, `data-testid="ideas-chips"`): rendered only when there are ideas. It is `flex min-h-0 flex-1 flex-wrap content-start items-start gap-1.5 overflow-hidden`, holding the visible chips and then the "+N" pop-over trigger, as today.
- **Measurement:** the chip area's width and height, live via `ResizeObserver`. The `useSyncExternalStore` snapshot must be a primitive (for example `"260x90"`) or two separate stores.
  - `shown = width ? fitRows(titles, width, rows, { charPx: 7, gapPx: 6, overflowPx: 40, itemPx: 44, maxTextPx: 160 }).shown : ideas.length`
  - `rows` uses the formula from Global Constraints.

- [ ] **Step 1: Write the failing tests** in `ideas-box.test.tsx`. Use the file's existing `ResizeObserver` stub. Mock `getBoundingClientRect` to return `{ width, height }`. Use ideas whose titles are 12 characters long (for example "Museum visit"), so each chip is 128px and one fits per 260px row beside a "+N".
  - "puts the count and Add an idea on a header line above the chips": inside `ideas-header` are "3 IDEAS" and the "+ Add an idea" button. `ideas-chips` comes after it and holds the chips.
  - "fills the height it is given and shows no +N when everything fits": width 260, height 90 (3 rows), 3 ideas. All three chips show, and there's no `+N more ideas` button.
  - "shows +N only once the rows run out": width 260, height 90, 5 ideas. Three chips show, plus a `+2 more ideas` button.
  - "a one-row box (the stacked card's floor) shows one row": width 260, height 26, 3 ideas. One chip shows, plus `+2 more ideas`.
  - "takes itself out of the row's height so chips cannot grow it": the root's class contains `[contain:size]` and `min-h-[74px]`. With no ideas, it contains `min-h-[42px]`, and there's no `ideas-chips`.
  - Keep every existing test passing. Update an existing test's expectations only where the header move legitimately changes them, and say which ones in the report.
- [ ] **Step 2:** `npx vitest run components/plan/ideas-box.test.tsx`. Expect the new tests to FAIL.
- [ ] **Step 3:** Implement the layout and measurement above. Rewrite the `useElementWidth` comment (and rename the hook to suit, since it now measures height too) so it says why height is now safe: containment.
- [ ] **Step 4:** Run again and expect PASS. Then run the task-done verification on `ideas-box.tsx` and `stop-open-body.tsx`.
- [ ] **Step 5: Commit**: `fix(plan): the desktop Ideas box fills its space before showing +N`, with the trailers:
  ```
  Resolves-Feedback: cmw5q6thi000207law8ytvp0e
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  ```

### Controller: real-browser check (after Task 2)
- [ ] With the dev server up, open a Plan with an open Stop that has 6 or more ideas, at 1480×818. Check two things: the ideas fill the box's height with "+N" only at the end, and the Stop's row is no taller than its Stay panel. Then check at a card width under 640px: one row. Watch the console for no "Maximum update depth" error.

## Amendments during execution (2026-11-09)

- **Fix round 1 (browser measurement):** the estimate was calibrated to `charPx: 6.5`, `itemPx: 40`. Real chips measured about 5.6–5.9px per character plus 39px, and the old 7/44 left a whole row empty. The test fixtures became 14-character titles ("Museum gallery") so that one chip still fits per 260px row.
- **Final review:** with a fixed height, any under-estimate (the EyeOff icon, a Surprise badge, all-caps or CJK titles, a two-digit "+N") clips chips and the "+N" trigger out of view. Chips are now fitted by their **measured** widths, read from a hidden, inert copy of each chip face plus a "+N" sample. `fitRows` gained `opts.widthsPx`. The estimate (`overflowPx: 48`) is only the fallback before the first measurement.
- **Accepted residuals:**
  - A one-row box narrower than its first chip plus "+N" (under about 250px, which desktop doesn't reach) can clip "+N", because the first chip always shows.
  - A brief overflow can appear during the 180ms chip exit animation.
