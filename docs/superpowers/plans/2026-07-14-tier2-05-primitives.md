# Tier 2 ⑤ — Primitives (global cascade) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Apply the Bold-Modular primitive tweaks that cascade app-wide — a chunkier `Card` radius and a reusable pill `shape` on `Button`, used by the Home `QuickActions`.

**Architecture:** Two additive/low-risk primitive edits. `Card` gains a larger base radius (cascades to every `<Card>`). `Button` gains a `shape` cva variant (`default`=`rounded-md` preserves all existing buttons; `pill`=`rounded-full`), and `QuickActions` opts into `shape="pill"` with the first action promoted to `primary`.

**Tech Stack:** React, `class-variance-authority`, `cn`, Tailwind v4, Vitest.

## Global Constraints
- **Reference:** `design_handoff/README.md` ⑤; chunky modular tiles + pill quick-actions (mock `App` l.125: first action coral pill, rest outline pills).
- **Cam decision: apply globally.** Card radius change is a true app-wide cascade; the `Button` `shape` is added at the primitive level (opt-in per use).
- **Additive / backward-compatible:** `Button` default behaviour unchanged — `shape` defaults to `default` (`rounded-md`, the current look). Do not change `variant`/`size`, the outline border width, or `Badge`/palette.
- **Card:** `rounded-2xl` → `rounded-3xl` (24px, matches the mock's ~22–26px tiles). Only the radius.
- Token-driven; no `globals.css`/token changes.
- **Environment (sandbox):** Node ≥22 for vitest (nvm use if it errors). `next build`/`next dev` FAIL — do NOT run. Gates: `npx tsc --noEmit`, `npx eslint <files>`, `npx vitest run <focused>` then full.
- **Branch:** `feat/bold-modular-rest`. Never main/push/merge/deploy; never `git add` under `.superpowers/`. Trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- **Blind build:** the radius cascade + pills are unverifiable visually in-sandbox → Cam's `npm run dev` pass. jsdom tests assert class strings by design.

---

## File Structure
- `components/ui/card.tsx` — **modify** (base radius).
- `components/ui/button.tsx` — **modify** (add `shape` cva variant, thread it through).
- `components/ui/button.test.tsx` — **modify** (add pill/default shape cases; keep all existing).
- `components/trip/home/quick-actions.tsx` — **modify** (pill shape; first action primary).

---

### Task 1: Card chunkier radius (cascades app-wide)

**Files:** Modify `components/ui/card.tsx`. (No `card.test.tsx` exists.)

- [ ] **Step 1: Change the base radius.** In `card.tsx`, the `Card` root `cn(...)` starts with `"rounded-2xl border border-border bg-card text-card-foreground shadow-soft"`. Change `rounded-2xl` → `rounded-3xl`. Nothing else.

- [ ] **Step 2: Gates.** (A radius change is not behaviour, but a component test elsewhere might assert `rounded-2xl` on a `Card`.)

Run: `npx tsc --noEmit` → clean.
Run: `npx eslint components/ui/card.tsx` → clean.
Run: `npx vitest run` → full suite green. **If a test fails asserting a Card has `rounded-2xl`,** update that assertion to `rounded-3xl` (the intended new value) and note it in the report; do not revert the primitive.

- [ ] **Step 3: Commit**

```bash
git add components/ui/card.tsx
git commit -m "feat(ui): chunkier Card radius rounded-2xl -> rounded-3xl (Tier 2 ⑤)"
```

---

### Task 2: Button pill `shape` + pill QuickActions

**Files:** Modify `components/ui/button.tsx`, `components/ui/button.test.tsx`, `components/trip/home/quick-actions.tsx`.

**Interfaces:** Produces a new `Button` prop `shape?: "default" | "pill"` (via cva `VariantProps`, already wired through `ButtonProps`). Default `"default"` = current look.

- [ ] **Step 1: Add failing tests** to `components/ui/button.test.tsx` (keep every existing test; add these):

```tsx
  it("applies the pill shape as rounded-full", () => {
    render(<Button shape="pill">Go</Button>);
    expect(screen.getByRole("button", { name: "Go" }).className).toContain("rounded-full");
  });

  it("defaults to the rounded-md shape", () => {
    render(<Button>Plain</Button>);
    expect(screen.getByRole("button", { name: "Plain" }).className).toContain("rounded-md");
  });
```

(If `render`/`screen`/`Button` aren't already imported at the top of the file, they are — this file already renders Buttons; reuse the existing imports.)

- [ ] **Step 2: Run → FAIL** (`npx vitest run components/ui/button.test.tsx`): `rounded-md` currently lives in the cva *base* string (so the pill test fails — it's always rounded-md) and `shape` isn't a prop.

- [ ] **Step 3: Implement in `components/ui/button.tsx`.**
  (a) Remove `rounded-md` from the cva **base** string (the first argument to `cva(...)` — delete just the `rounded-md ` token, keep the rest).
  (b) Add a `shape` variant group inside `variants`:

```ts
      shape: {
        default: "rounded-md",
        pill: "rounded-full",
      },
```

  (c) Add `shape: "default"` to `defaultVariants` (alongside `variant`/`size`).
  (d) Thread `shape` through the component: add `shape` to the destructured props and to the `buttonVariants({ variant, size })` call → `buttonVariants({ variant, size, shape })`.

- [ ] **Step 4: Run → GREEN** (`npx vitest run components/ui/button.test.tsx`) — new + existing pass.

- [ ] **Step 5: Pill the QuickActions** in `components/trip/home/quick-actions.tsx`. Replace the `actions.map(...)` render with (first action promoted to `primary`, all pills):

```tsx
      {actions.map((a, i) => (
        <Button key={a.label} asChild variant={i === 0 ? "primary" : "outline"} shape="pill" size="sm">
          <Link href={a.href}>
            <a.icon className="size-4" aria-hidden="true" />
            {a.label}
          </Link>
        </Button>
      ))}
```

- [ ] **Step 6: Gates.**

Run: `npx tsc --noEmit` → clean.
Run: `npx eslint components/ui/button.tsx components/ui/button.test.tsx components/trip/home/quick-actions.tsx` → clean.
Run: `npx vitest run` → full suite green. **If a `quick-actions` test asserts the old all-outline styling,** update it to reflect the new first-primary + pill treatment (note it in the report).

- [ ] **Step 7: Commit**

```bash
git add components/ui/button.tsx components/ui/button.test.tsx components/trip/home/quick-actions.tsx
git commit -m "feat(ui): Button pill shape + pill QuickActions (Tier 2 ⑤)"
```

---

## Verification (Definition of Done)
- `npx tsc --noEmit` clean; `npx eslint` clean; `npx vitest run` green.
- `Card` renders `rounded-3xl`; `Button` supports `shape="pill"` (`rounded-full`) with default unchanged (`rounded-md`); `QuickActions` renders pill buttons, first = primary.
- No `globals.css`/token/variant/size changes; outline border width unchanged.
- Visual pass (Cam, local dev) — the radius cascade is the one to eyeball. Tick ⑤ in the tracker.

## Self-Review Notes
- `Button` change is additive: existing call sites (no `shape`) keep `rounded-md` via `defaultVariants.shape`.
- Only `QuickActions` opts into pills in this plan; broader pill adoption happens organically in later screen rebuilds.
- Deferred minor: the mock's outline pills use a 2px border; kept at 1px to avoid an unverifiable app-wide outline change.
