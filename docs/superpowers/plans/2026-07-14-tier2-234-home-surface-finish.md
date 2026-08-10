# Tier 2 ②③④ — Home Surface Finish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Finish the Bold-Modular Home surface: promote the route map (②), turn `BudgetGlance` into the quiet "spent so far" strip (③), and give `NextStepsCard` filled rounded-xl severity-hue icon chips (④).

**Architecture:** Three independent presentational changes in `components/trip/home/`. ② is a one-line reorder in the `PhasePlanning` server component; ③ and ④ are self-contained component rewrites with matching props (no caller changes).

**Tech Stack:** Next.js RSC, React, Tailwind v4 (token-driven), `cn`, lucide-react, Vitest + Testing Library.

## Global Constraints

- **Reference:** `design_handoff/README.md` Tier 2 ②③④; mock frames in `TEEPEE - Bold Modular App.dc.html` — next-steps rows l.117–121, budget strip l.124.
- **② order:** BOTH phases use `[hero, route, nextSteps, money, actions]` (Cam decision). Collapse the current planning/final-prep ternary to one array. `phase` stays used elsewhere (hero `urgent`, `QuickActions`).
- **③ budget-glance:** a quiet horizontal strip (NOT a bordered card): label "Spent so far" + thin success bar (`actual/estimated`) + amounts. Keep the same props. **No budget-cap concept** — estimated-vs-spent only. Money `tabular-nums`. Success = `bg-success`. Full `formatMoney` amounts (compact "k" abbreviation intentionally deferred — cosmetic).
- **④ next-steps-card:** each row's bare glyph becomes a filled `rounded-xl` square in the **severity hue** (warning → `bg-amber-500`, info → `bg-sky-500`) with a white icon (keep `AlertTriangle`/`Info` — the model carries severity only, not per-flag icons). Add a count badge (`bg-primary text-primary-foreground`) by the heading. Keep the empty state + "See all in Summary" link. `NextStep.severity` is `"warning" | "info"`.
- **Token-driven** (discreet mode): use tokens/utilities. The amber/sky chip hues and category system use Tailwind's named palette by design (the current card already uses `text-amber-500`/`text-sky-500`) — consistent, allowed.
- **Scope:** do NOT touch tokens/`globals.css`, other components, or the `Card`/`Button` primitives (that's ⑤).
- **Environment (sandbox):** Node ≥22 for vitest (nvm use if it errors). `next build`/`next dev` FAIL — do NOT run. Gates: `npx tsc --noEmit`, `npx eslint <files>`, `npx vitest run <focused>` then `npx vitest run`.
- **Branch:** `feat/bold-modular-rest`. Never main/push/merge/deploy; never `git add` under `.superpowers/`. Trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

## File Structure

- `components/trip/home/phase-planning.tsx` — **modify** (② the `order` array).
- `components/trip/home/budget-glance.tsx` — **rewrite** (③).
- `components/trip/home/budget-glance.test.tsx` — **rewrite** (③).
- `components/trip/home/next-steps-card.tsx` — **rewrite** (④).
- `components/trip/home/next-steps-card.test.tsx` — **rewrite** (④).

---

### Task 1: ② Promote the route map (both phases)

**Files:** Modify `components/trip/home/phase-planning.tsx` (the `order` block near the end of `PhasePlanning`).

**Interfaces:** consumes the existing `hero`/`route`/`nextSteps`/`money`/`actions` elements already built in the function. No test (async RSC with DB queries — not unit-testable in jsdom; the repo has no `phase-planning.test.tsx`). Verified by tsc/eslint + review + the unchanged full suite.

- [ ] **Step 1: Replace the order ternary.** Find:

```tsx
  // final-prep leads with action cards; planning leads with plan-oriented cards
  const order =
    phase === "final-prep"
      ? [hero, nextSteps, actions, money, route]
      : [hero, nextSteps, money, route, actions];
```

Replace with:

```tsx
  // Bold Modular: route promoted directly under the hero, both phases.
  const order = [hero, route, nextSteps, money, actions];
```

- [ ] **Step 2: Confirm `phase` is still used** (so no unused-var error):

Run: `grep -n "phase" components/trip/home/phase-planning.tsx`
Expected: still referenced (e.g. `urgent={phase === "final-prep"}`, `<QuickActions ... phase={phase} />`).

- [ ] **Step 3: Gates**

Run: `npx tsc --noEmit` → clean.
Run: `npx eslint components/trip/home/phase-planning.tsx` → clean.
Run: `npx vitest run` → full suite still green (no test references this order).

- [ ] **Step 4: Commit**

```bash
git add components/trip/home/phase-planning.tsx
git commit -m "feat(home): promote route above next-steps, both phases (Tier 2 ②)"
```

---

### Task 2: ③ BudgetGlance → quiet "spent so far" strip

**Files:** Rewrite `components/trip/home/budget-glance.tsx` + `components/trip/home/budget-glance.test.tsx`.

**Interfaces:** props unchanged — `{ estimatedMinor: number; actualMinor: number; homeCurrency: string; href: string }`. No caller change.

- [ ] **Step 1: Rewrite the test** (`budget-glance.test.tsx`) — the label is now always "Spent so far", plus a bar + amounts:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BudgetGlance } from "./budget-glance";

describe("BudgetGlance", () => {
  it("shows spent-so-far, estimated, and links to the budget", () => {
    render(<BudgetGlance estimatedMinor={312000} actualMinor={184000} homeCurrency="JPY" href="/trips/t/budget" />);
    expect(screen.getByText(/spent so far/i)).toBeInTheDocument();
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/trips/t/budget");
    expect(link.textContent).toContain("184,000");
    expect(link.textContent).toMatch(/312,000\s*est/);
  });

  it("renders a zero-width bar when nothing is spent", () => {
    const { container } = render(<BudgetGlance estimatedMinor={312000} actualMinor={0} homeCurrency="JPY" href="/b" />);
    expect(container.querySelector('[style*="width: 0%"]')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the test → FAIL** (`npx vitest run components/trip/home/budget-glance.test.tsx`): the old component renders "Estimated budget" when actual is 0 and has no width-styled bar.

- [ ] **Step 3: Rewrite `budget-glance.tsx`:**

```tsx
import Link from "next/link";
import { formatMoney } from "@/lib/money";

interface BudgetGlanceProps {
  estimatedMinor: number;
  actualMinor: number;
  homeCurrency: string;
  href: string;
}

/** Quiet "spent so far" strip: label + thin success bar + spent/estimated. */
export function BudgetGlance({ estimatedMinor, actualMinor, homeCurrency, href }: BudgetGlanceProps) {
  const pct = estimatedMinor > 0 ? Math.min(100, Math.round((actualMinor / estimatedMinor) * 100)) : 0;
  return (
    <Link href={href} className="flex items-center gap-3 rounded-full px-1 py-2 transition-colors hover:bg-muted/40">
      <span className="shrink-0 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
        Spent so far
      </span>
      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
        <span className="block h-full rounded-full bg-success" style={{ width: `${pct}%` }} />
      </span>
      <span className="shrink-0 text-xs font-semibold tabular-nums text-foreground">
        {formatMoney(actualMinor, homeCurrency)}{" "}
        <span className="font-medium text-muted-foreground">/ {formatMoney(estimatedMinor, homeCurrency)} est</span>
      </span>
    </Link>
  );
}
```

- [ ] **Step 4: Run the test → PASS.** Then `npx tsc --noEmit`, `npx eslint components/trip/home/budget-glance.tsx components/trip/home/budget-glance.test.tsx`, `npx vitest run`.

- [ ] **Step 5: Commit**

```bash
git add components/trip/home/budget-glance.tsx components/trip/home/budget-glance.test.tsx
git commit -m "feat(home): BudgetGlance quiet spent-so-far strip (Tier 2 ③)"
```

---

### Task 3: ④ NextStepsCard → severity-hue icon chips

**Files:** Rewrite `components/trip/home/next-steps-card.tsx` + `components/trip/home/next-steps-card.test.tsx`.

**Interfaces:** props unchanged — `{ steps: NextStep[]; seeAllHref?: string }`. `NextStep = { id, title, href, severity: "warning" | "info", source }`.

- [ ] **Step 1: Rewrite the test** (`next-steps-card.test.tsx`):

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NextStepsCard } from "./next-steps-card";
import type { NextStep } from "@/lib/next-steps";

const warn: NextStep = { id: "a", title: "No accommodation for Paris.", href: "/trips/t/plan", severity: "warning", source: "flag" };
const info: NextStep = { id: "b", title: "Start your packing list.", href: "/trips/t/checklists", severity: "info", source: "nudge" };

describe("NextStepsCard", () => {
  it("celebrates the empty state", () => {
    render(<NextStepsCard steps={[]} />);
    expect(screen.getByText(/you're all set/i)).toBeInTheDocument();
  });

  it("renders steps as links to their hrefs", () => {
    render(<NextStepsCard steps={[warn]} />);
    expect(screen.getByRole("link", { name: /no accommodation for paris/i })).toHaveAttribute("href", "/trips/t/plan");
  });

  it("shows a count badge and severity-hued icon chips", () => {
    const { container } = render(<NextStepsCard steps={[warn, info]} />);
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(container.querySelector(".bg-amber-500")).toBeTruthy(); // warning chip
    expect(container.querySelector(".bg-sky-500")).toBeTruthy(); // info chip
  });
});
```

- [ ] **Step 2: Run the test → FAIL** (no count badge / no `.bg-amber-500` chip yet).

- [ ] **Step 3: Rewrite `next-steps-card.tsx`:**

```tsx
import Link from "next/link";
import { AlertTriangle, ArrowRight, Info, CheckCircle2, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";
import type { NextStep } from "@/lib/next-steps";

interface NextStepsCardProps {
  steps: NextStep[];
  /** Link to the full flag list (Summary). Shown when steps were capped. */
  seeAllHref?: string;
}

/** The ranked to-do list with severity-hued icon chips. Empty state celebrates. */
export function NextStepsCard({ steps, seeAllHref }: NextStepsCardProps) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-soft" aria-labelledby="next-steps-heading">
      <div className="mb-3 flex items-center justify-between">
        <h2 id="next-steps-heading" className="font-display text-lg font-semibold text-foreground">
          Next steps
        </h2>
        {steps.length > 0 && (
          <span className="flex size-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
            {steps.length}
          </span>
        )}
      </div>
      {steps.length === 0 ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <CheckCircle2 className="size-4 text-emerald-500" aria-hidden="true" />
          You&apos;re all set — nothing needs attention right now.
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {steps.map((step) => {
            const isWarning = step.severity === "warning";
            return (
              <li key={step.id}>
                <Link
                  href={step.href}
                  className="flex items-center gap-3 py-3 text-sm transition-colors hover:bg-muted/40 focus-visible:rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  <span
                    className={cn(
                      "flex size-10 shrink-0 items-center justify-center rounded-xl text-white",
                      isWarning ? "bg-amber-500" : "bg-sky-500",
                    )}
                  >
                    {isWarning ? (
                      <AlertTriangle className="size-5" aria-hidden="true" />
                    ) : (
                      <Info className="size-5" aria-hidden="true" />
                    )}
                  </span>
                  <span className="flex-1 font-semibold text-foreground">{step.title}</span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {seeAllHref && steps.length > 0 && (
        <Link href={seeAllHref} className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
          See all in Summary <ArrowRight className="size-3.5" aria-hidden="true" />
        </Link>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Run the test → PASS.** Then `npx tsc --noEmit`, `npx eslint components/trip/home/next-steps-card.tsx components/trip/home/next-steps-card.test.tsx`, `npx vitest run`.

- [ ] **Step 5: Commit**

```bash
git add components/trip/home/next-steps-card.tsx components/trip/home/next-steps-card.test.tsx
git commit -m "feat(home): NextStepsCard severity-hue icon chips + count (Tier 2 ④)"
```

---

## Verification (Definition of Done)
- `npx tsc --noEmit` clean; `npx eslint` clean on touched files; `npx vitest run` green.
- ② both order arrays collapsed to `[hero, route, nextSteps, money, actions]`.
- ③ quiet strip (no card chrome), thin success bar, spent/estimated, no budget-cap.
- ④ filled rounded-xl severity-hue chips + count badge; empty state + see-all preserved.
- No token/`globals.css`/primitive changes.
- Visual pass (Cam, local dev) owed. Tick ②③④ in the tracker.

## Self-Review Notes
- Props for BudgetGlance and NextStepsCard are unchanged → no caller edits.
- Severity→hue mapping (warning=amber, info=sky) matches the pre-existing glyph colours.
- ② leaves `phase` in use; collapsing the ternary is safe because both branches become identical.
