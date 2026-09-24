# Wishlist stop-less list + DEPLOY.md og:image line — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A trip with wishlist ideas but no stops shows those ideas in List view; `docs/DEPLOY.md` describes the real og:image URL fallback.

**Architecture:** One guard change in `components/trip/wishlist-board.tsx` so the List view no longer requires `stops.length > 0` (the "Anywhere" group already guards itself), pinned by a test; one sentence corrected in `docs/DEPLOY.md` to match `lib/site-url.ts`.

**Tech Stack:** Next.js, React, Vitest + Testing Library.

**Spec:** Cam's instruction (2026-09-24): "fix the wishlist bug and the deploy doc line", referring to `docs/follow-ups/2026-09-24-playground-phase-3-deferred.md` § "Needs your decision" (wishlist) and the final-review residual R1 (`docs/DEPLOY.md:49` contradicts `lib/site-url.ts`).

## Global Constraints

- Branch `fix/wishlist-stopless-and-deploy-doc` (cut from `beta`). Never commit to / merge into `main` or `beta`; never push; never deploy.
- Never run `npm run feedback:pull` or `feedback:resolve`. Never stage `CLAUDE.md`.
- No behaviour change beyond the two items; no restyle.
- Gates: `npx tsc --noEmit && npm run lint && npm test && npm run build`.
- Commit trailers: `Co-Authored-By:` naming the model that wrote it, plus `Claude-Session: https://claude.ai/code/session_01Ghha53SJkku4XjLsShDsXa`.

## Review Focus

- **Ideas with no stops and AI configured** — List view shows the "Anywhere" group; no empty wrapper or duplicate add button.
- **No ideas, no stops** — the existing empty state still renders exactly once (no extra empty container).
- **Ideas pinned to stops** — unchanged grouping and order.

---

### Task 1: Wishlist List view renders ideas when the trip has no stops

**Files:**
- Modify: `components/trip/wishlist-board.tsx:368`
- Test: `components/trip/wishlist-board.test.tsx`

**Interfaces:** none new.

- [ ] **Step 1: Write the failing test** — in `wishlist-board.test.tsx`, reusing the file's existing render helper and item fixture shape: render the board with one idea whose `stopId` is `null`, `stops=[]`, default view (list). Assert the idea's title is visible (`getByText(<title>)`) and an "Anywhere" group heading is present. Add a second case: `items=[]`, `stops=[]` → the existing empty-state title renders exactly once (`getAllByText(...)` length 1).
- [ ] **Step 2: Run it** — `npx vitest run components/trip/wishlist-board.test.tsx`; expect the first new case to FAIL (idea not rendered).
- [ ] **Step 3: Implement** — change line 368 from
  ```tsx
  {view === "list" && (!isEmpty || aiConfigured) && stops.length > 0 && (
  ```
  to
  ```tsx
  {view === "list" && (!isEmpty || aiConfigured) && (stops.length > 0 || anywhereItems.length > 0) && (
  ```
  (keeps the old behaviour of rendering nothing when there's nothing to group, e.g. no ideas + no stops + AI on).
- [ ] **Step 4: Run it** — same command; expect PASS. Then the four gates.
- [ ] **Step 5: Commit**
  ```bash
  git add components/trip/wishlist-board.tsx components/trip/wishlist-board.test.tsx
  git commit -m "fix(wishlist): show stop-less ideas in List view"
  ```

### Task 2: DEPLOY.md og:image fallback sentence

**Files:** Modify `docs/DEPLOY.md:48` (the `APP_URL` table row).

- [ ] **Step 1:** Replace the row's trailing sentence "without it those URLs fall back to `http://localhost:3000` at build time." with: "Without it they fall back to Vercel's `VERCEL_PROJECT_PRODUCTION_URL` (when Vercel exposes system env vars), then `http://localhost:3000`; set it when you use a custom domain." Keep the rest of the row.
- [ ] **Step 2:** Also update `docs/follow-ups/2026-09-24-playground-phase-3-deferred.md`: move the wishlist item out of "Needs your decision" into an "Already closed" note naming this branch (keep the file's existing style).
- [ ] **Step 3: Commit**
  ```bash
  git add docs/DEPLOY.md docs/follow-ups/2026-09-24-playground-phase-3-deferred.md
  git commit -m "docs(deploy): og:image falls back to the Vercel production URL first"
  ```
