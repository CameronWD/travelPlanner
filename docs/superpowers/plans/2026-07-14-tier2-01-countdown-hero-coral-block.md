# Tier 2 ① — CountdownHero "Solid Coral Block" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Home `CountdownHero` from a bordered `bg-card` card into the Bold-Modular **solid coral block** — big Space Grotesk day number, phase eyebrow + date range, and nights/stops/currency pills — for the planning and final-prep phases.

**Architecture:** `CountdownHero` is a presentational component rendered by the `PhasePlanning` server component. It currently receives only `description` + dates + `urgent`. The new design needs (a) a big numeric day count split into value + unit, and (b) nights/stops/currency for the pills. We add the value/unit as **additive** fields on `PhaseDescription` (computed in the pure `describePhase` engine, leaving the existing `.countdown` string untouched so other consumers are unaffected), add a small `currencySymbol` helper to `lib/money`, and pass nights/stops/currency from `PhasePlanning`.

**Tech Stack:** Next.js (RSC), React, Tailwind v4 (token-driven utilities), `class-variance-authority`/`cn`, Vitest + Testing Library.

## Global Constraints

- **Reference authoritative:** `design_handoff/README.md` Tier 2 ①. Mock frames: mobile `TEEPEE - Bold Modular App.dc.html` lines 100–105; desktop `…Desktop.dc.html` lines 97–98; dark `…Desktop.dc.html` line 477.
- **Block:** `bg-primary text-primary-foreground` (white text), `rounded-3xl`, `p-5`, `overflow-hidden`, coral-tinted drop shadow (`shadow-[0_12px_30px_hsl(12_84%_50%/0.32)]`, dark `dark:shadow-[0_12px_30px_hsl(0_0%_0%/0.4)]`), plus a decorative `bg-white/10` circle bleeding off the top-right corner (`aria-hidden`).
- **Eyebrow row:** phase-label pill on the left (uppercase, `tracking-[0.14em]`, translucent-white `bg-white/20`), date range on the right (`opacity-95`). When `urgent` (final-prep), the eyebrow pill turns **amber**: `bg-warning text-warning-foreground` (Decision B — keep the coral block, escalate the eyebrow only).
- **Hero row:** big `countdownValue` in `font-display` (`text-6xl font-bold leading-[0.9] tracking-[-0.03em]`) beside a small stacked `countdownUnit` (uppercase, `tracking-[0.1em]`, two lines).
- **Pills row:** three `bg-white/15 rounded-full` pills — **nights · stops · currency**. Copy: `"{n} nights"` (singular `night`), `"{n} stops"` (singular `stop`), currency = `"{CODE} {symbol}"` (e.g. `JPY ¥`), or just the code when the symbol equals the code.
- **Data (Decision C):** nights = `daysBetween(startDate, endDate)`; stopCount = **total stops on the plan** (dated + rough = `allStopsRaw.length`); currency = `trip.homeCurrency`.
- **describePhase change is ADDITIVE (Decision A):** add `countdownValue: string` and `countdownUnit: string | null` to `PhaseDescription`; **do not change the existing `.countdown` string** (the trips-list badge and other consumers depend on it).
- **Token-driven only** (discreet mode must keep working): no hard-coded hex; use `bg-primary`/`text-primary-foreground`/`bg-warning` utilities. The one exception is the coral-tinted shadow arbitrary value (no shadow token exists for it) — this is allowed.
- **Scope guard:** this is ① only. Do **not** reorder the Home cards (that's ②). Do **not** touch token values, the heading scale, or `globals.css`.
- **A11y:** keep `<section aria-label="Trip countdown">`; give the number/unit group `aria-label` = the full phrase (e.g. `"26 days to go"`) so screen readers don't read a broken "26 DAYS TO GO" split. Light **and** dark both correct.
- **Environment (sandbox):** Node ≥20.19 needed for vitest (`.nvmrc` pins 22); default `node` may be v20.11 — if vitest fails on node version, run `export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"; nvm use` first. **`next build`/`next dev` FAIL (no DB) — do NOT run them.** Gates: `npx tsc --noEmit`, `npx eslint <files>`, `npx vitest run <focused>` then `npx vitest run` (full).
- **Branch:** `feat/bold-modular-countdown-hero` (already checked out, off `main`). Never commit to `main`; never push/merge/deploy. Never `git add` under `.superpowers/`. Commit trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

## File Structure

- `lib/trip-phase.ts` — **modify.** Add `countdownValue`/`countdownUnit` to `PhaseDescription`; populate per phase in `describePhase`.
- `lib/trip-phase.test.ts` — **modify.** Assert the new fields per phase; fix any full-object `toEqual` assertions.
- `lib/money.ts` — **modify.** Add `currencySymbol(currency, locale?)`.
- `lib/money.test.ts` — **modify.** Test `currencySymbol`.
- `components/trip/home/countdown-hero.tsx` — **rewrite.** The coral block.
- `components/trip/home/countdown-hero.test.tsx` — **rewrite.** New structure + urgent variant.
- `components/trip/home/phase-planning.tsx` — **modify.** Pass `nights`/`stopCount`/`homeCurrency` to `CountdownHero`.

---

### Task 1: Additive countdown fields on `describePhase`

**Files:**
- Modify: `lib/trip-phase.ts` (`PhaseDescription` interface + `describePhase` switch + return)
- Test: `lib/trip-phase.test.ts`

**Interfaces:**
- Produces: `PhaseDescription.countdownValue: string` and `PhaseDescription.countdownUnit: string | null`. Values per phase: planning/final-prep → value = day count as string, unit = `"DAYS TO GO"` (or `"DAY TO GO"` when count is 1); travelling → value = day number, unit = `"OF {total}"`; past → value = days-ago, unit = `"DAYS AGO"`/`"DAY AGO"`; sketching → value = `"Not dated"`, unit = `null`. The existing `.countdown` string is unchanged.

- [ ] **Step 1: Write the failing test** — append to `lib/trip-phase.test.ts` (inside the existing `describePhase` describe block, or a new one):

```ts
describe("describePhase countdown value/unit (Bold-Modular hero)", () => {
  it("splits an upcoming planning countdown into value + unit", () => {
    const d = describePhase({ startDate: "2026-08-09", endDate: "2026-08-20", today: "2026-07-14" });
    expect(d.phase).toBe("planning");
    expect(d.countdown).toBe("In 26 days"); // unchanged
    expect(d.countdownValue).toBe("26");
    expect(d.countdownUnit).toBe("DAYS TO GO");
  });
  it("uses the singular unit one day out (final-prep)", () => {
    const d = describePhase({ startDate: "2026-07-15", endDate: "2026-07-20", today: "2026-07-14" });
    expect(d.phase).toBe("final-prep");
    expect(d.countdown).toBe("Tomorrow"); // unchanged
    expect(d.countdownValue).toBe("1");
    expect(d.countdownUnit).toBe("DAY TO GO");
  });
  it("exposes value/unit for travelling and past", () => {
    const t = describePhase({ startDate: "2026-07-10", endDate: "2026-07-20", today: "2026-07-14" });
    expect(t.countdownValue).toBe("5");
    expect(t.countdownUnit).toBe("OF 11");
    const p = describePhase({ startDate: "2026-07-01", endDate: "2026-07-10", today: "2026-07-14" });
    expect(p.countdownValue).toBe("4");
    expect(p.countdownUnit).toBe("DAYS AGO");
  });
  it("leaves a date-less trip without a unit", () => {
    const s = describePhase({ startDate: null, endDate: null, today: "2026-07-14" });
    expect(s.countdownValue).toBe("Not dated");
    expect(s.countdownUnit).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/trip-phase.test.ts`
Expected: FAIL — `countdownValue`/`countdownUnit` are `undefined` (fields don't exist yet).

- [ ] **Step 3: Implement.** In `lib/trip-phase.ts`, extend the interface:

```ts
export interface PhaseDescription {
  phase: TripPhase;
  label: string;
  /** Short status line: "In 26 days", "Day 5 of 11", "Ended 14 days ago". */
  countdown: string;
  /** Big display value for the Home countdown hero, e.g. "26", "5", "Not dated". */
  countdownValue: string;
  /** Small stacked unit beside the value, e.g. "DAYS TO GO"; null when it stands alone. */
  countdownUnit: string | null;
}
```

Rewrite the `describePhase` switch to also set `countdownValue`/`countdownUnit`, and add them to the return. Full function:

```ts
export function describePhase(input: TripPhaseInput): PhaseDescription {
  const phase = computeTripPhase(input);
  const { startDate, endDate, today } = input;
  let countdown = "";
  let countdownValue = "";
  let countdownUnit: string | null = null;

  switch (phase) {
    case "sketching":
      countdown = "Not dated yet";
      countdownValue = "Not dated";
      countdownUnit = null;
      break;
    case "planning":
    case "final-prep": {
      const days = daysBetween(today, startDate!); // > 0 (today < start)
      countdown = days === 1 ? "Tomorrow" : `In ${pluralDays(days)}`;
      countdownValue = String(days);
      countdownUnit = days === 1 ? "DAY TO GO" : "DAYS TO GO";
      break;
    }
    case "travelling": {
      const end = endDate ?? startDate!;
      const dayNum = dayNumberInTrip(today, startDate!);
      const total = daysBetween(startDate!, end) + 1;
      countdown = `Day ${dayNum} of ${total}`;
      countdownValue = String(dayNum);
      countdownUnit = `OF ${total}`;
      break;
    }
    case "past": {
      const end = endDate ?? startDate!;
      const ago = daysBetween(end, today); // >= 1
      countdown = `Ended ${pluralDays(ago)} ago`;
      countdownValue = String(ago);
      countdownUnit = ago === 1 ? "DAY AGO" : "DAYS AGO";
      break;
    }
  }

  return { phase, label: PHASE_LABELS[phase], countdown, countdownValue, countdownUnit };
}
```

- [ ] **Step 4: Fix any full-object assertions.** Search `lib/trip-phase.test.ts` for `toEqual({` / `toStrictEqual({` on a `describePhase(...)` result. If any assert the whole object, either add `countdownValue`/`countdownUnit` to the expected object or switch that assertion to `toMatchObject`. (Property-scoped assertions like `.countdown`/`.label` need no change.)

Run: `grep -n "toEqual\|toStrictEqual" lib/trip-phase.test.ts`

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run lib/trip-phase.test.ts`
Expected: PASS (new + existing).

- [ ] **Step 6: Commit**

```bash
git add lib/trip-phase.ts lib/trip-phase.test.ts
git commit -m "feat(trip-phase): add additive countdownValue/countdownUnit for hero"
```

---

### Task 2: `currencySymbol` helper

**Files:**
- Modify: `lib/money.ts`
- Test: `lib/money.test.ts`

**Interfaces:**
- Produces: `currencySymbol(currency: string, locale?: string): string` — returns the currency's symbol via `Intl` (`"JPY"` → `"¥"`), falling back to the uppercased code for unknown currencies.

- [ ] **Step 1: Write the failing test** — append to `lib/money.test.ts`:

```ts
describe("currencySymbol", () => {
  it("returns the symbol for a known currency", () => {
    expect(currencySymbol("JPY")).toBe("¥");
  });
  it("upper-cases and falls back to the code for unknown currencies", () => {
    expect(currencySymbol("zzz")).toBe("ZZZ");
  });
});
```

Ensure the import at the top of the test includes `currencySymbol` (add it to the existing `@/lib/money` import).

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/money.test.ts`
Expected: FAIL — `currencySymbol` is not exported.

- [ ] **Step 3: Implement** — add to `lib/money.ts` (near `formatMoney`, mirroring its `Intl` + try/catch fallback style):

```ts
/**
 * Return a currency's symbol via Intl (e.g. "JPY" -> "¥", "GBP" -> "£").
 * Uses `narrowSymbol` so foreign currencies render the bare glyph ("¥") rather
 * than a locale-prefixed form ("JP¥" under en-AU). Falls back to the uppercased
 * code for currencies the runtime doesn't know.
 */
export function currencySymbol(currency: string, locale: string = "en-AU"): string {
  const code = currency.toUpperCase();
  try {
    const parts = new Intl.NumberFormat(locale, {
      style: "currency",
      currency: code,
      currencyDisplay: "narrowSymbol",
    }).formatToParts(0);
    return parts.find((p) => p.type === "currency")?.value ?? code;
  } catch {
    return code;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/money.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/money.ts lib/money.test.ts
git commit -m "feat(money): add currencySymbol helper"
```

---

### Task 3: Rebuild `CountdownHero` + wire `PhasePlanning`

**Files:**
- Rewrite: `components/trip/home/countdown-hero.tsx`
- Rewrite: `components/trip/home/countdown-hero.test.tsx`
- Modify: `components/trip/home/phase-planning.tsx` (the hero's only caller)

**Interfaces:**
- Consumes: `PhaseDescription.countdownValue`/`countdownUnit` (Task 1); `currencySymbol` (Task 2); `daysBetween` (`@/lib/dates`).
- Produces: new required `CountdownHero` props `nights: number`, `stopCount: number`, `homeCurrency: string` (alongside existing `description`, `startDate`, `endDate`, `urgent?`).

- [ ] **Step 1: Write the failing test** — replace the entire contents of `components/trip/home/countdown-hero.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CountdownHero } from "./countdown-hero";
import type { PhaseDescription } from "@/lib/trip-phase";

const planning: PhaseDescription = {
  phase: "planning",
  label: "Planning",
  countdown: "In 26 days",
  countdownValue: "26",
  countdownUnit: "DAYS TO GO",
};

describe("CountdownHero", () => {
  it("renders the big value, date range and nights/stops/currency pills", () => {
    render(
      <CountdownHero
        description={planning}
        startDate="2026-07-20"
        endDate="2026-07-30"
        nights={11}
        stopCount={3}
        homeCurrency="JPY"
      />,
    );
    expect(screen.getByText("Planning")).toBeInTheDocument();
    expect(screen.getByText("26")).toBeInTheDocument();
    expect(screen.getByText("20–30 Jul 2026")).toBeInTheDocument();
    expect(screen.getByText("11 nights")).toBeInTheDocument();
    expect(screen.getByText("3 stops")).toBeInTheDocument();
    expect(screen.getByText("JPY ¥")).toBeInTheDocument();
    // number + unit exposed as one accessible phrase
    expect(screen.getByLabelText("26 days to go")).toBeInTheDocument();
  });

  it("escalates the eyebrow to the warning colour when urgent (final-prep)", () => {
    render(
      <CountdownHero
        description={{ ...planning, phase: "final-prep", label: "Final prep" }}
        startDate="2026-07-20"
        endDate="2026-07-30"
        nights={11}
        stopCount={3}
        homeCurrency="JPY"
        urgent
      />,
    );
    expect(screen.getByText("Final prep").className).toContain("bg-warning");
  });

  it("uses singular pill copy for a one-night, one-stop trip", () => {
    render(
      <CountdownHero
        description={planning}
        startDate="2026-07-20"
        endDate="2026-07-21"
        nights={1}
        stopCount={1}
        homeCurrency="JPY"
      />,
    );
    expect(screen.getByText("1 night")).toBeInTheDocument();
    expect(screen.getByText("1 stop")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run components/trip/home/countdown-hero.test.tsx`
Expected: FAIL — component doesn't accept `nights`/`stopCount`/`homeCurrency` and doesn't render the pills/value/aria yet.

- [ ] **Step 3: Implement — rewrite `components/trip/home/countdown-hero.tsx`:**

```tsx
import { cn } from "@/lib/cn";
import { formatDateRange } from "@/lib/dates";
import { currencySymbol } from "@/lib/money";
import type { PhaseDescription } from "@/lib/trip-phase";

interface CountdownHeroProps {
  description: PhaseDescription;
  startDate: string | null;
  endDate: string | null;
  /** Trip length in nights: daysBetween(startDate, endDate). */
  nights: number;
  /** Total stops on the plan (dated + rough). */
  stopCount: number;
  /** Trip home currency code, e.g. "JPY". */
  homeCurrency: string;
  /** Visually escalate (final-prep). */
  urgent?: boolean;
}

/** Bold-Modular solid coral countdown block at the top of Home (planning / final-prep). */
export function CountdownHero({
  description,
  startDate,
  endDate,
  nights,
  stopCount,
  homeCurrency,
  urgent,
}: CountdownHeroProps) {
  const range = startDate && endDate ? formatDateRange(startDate, endDate) : null;
  const symbol = currencySymbol(homeCurrency);
  const currencyPill = symbol && symbol !== homeCurrency ? `${homeCurrency} ${symbol}` : homeCurrency;
  const ariaCountdown = description.countdownUnit
    ? `${description.countdownValue} ${description.countdownUnit.toLowerCase()}`
    : description.countdownValue;

  return (
    <section
      aria-label="Trip countdown"
      className="relative overflow-hidden rounded-3xl bg-primary p-5 text-primary-foreground shadow-[0_12px_30px_hsl(12_84%_50%/0.32)] dark:shadow-[0_12px_30px_hsl(0_0%_0%/0.4)]"
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-8 -top-8 size-36 rounded-full bg-white/10"
      />

      <div className="relative flex items-center justify-between gap-2">
        <span
          className={cn(
            "rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em]",
            urgent ? "bg-warning text-warning-foreground" : "bg-white/20",
          )}
        >
          {description.label}
        </span>
        {range && <span className="text-sm font-semibold opacity-95">{range}</span>}
      </div>

      <div className="relative mt-3.5 flex items-baseline gap-3" aria-label={ariaCountdown}>
        <span className="font-display text-6xl font-bold leading-[0.9] tracking-[-0.03em]">
          {description.countdownValue}
        </span>
        {description.countdownUnit && (
          <span className="whitespace-pre-line font-display text-sm font-bold uppercase leading-tight tracking-[0.1em]">
            {description.countdownUnit.replace(" ", "\n")}
          </span>
        )}
      </div>

      <div className="relative mt-4 flex flex-wrap gap-2">
        <span className="rounded-full bg-white/15 px-3 py-1.5 text-xs font-semibold">
          {nights} {nights === 1 ? "night" : "nights"}
        </span>
        <span className="rounded-full bg-white/15 px-3 py-1.5 text-xs font-semibold">
          {stopCount} {stopCount === 1 ? "stop" : "stops"}
        </span>
        <span className="rounded-full bg-white/15 px-3 py-1.5 text-xs font-semibold">{currencyPill}</span>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Wire the caller — `components/trip/home/phase-planning.tsx`.** Add the `daysBetween` import if absent:

```ts
import { daysBetween } from "@/lib/dates";
```

Replace the `hero` element (currently passing only `description`/`startDate`/`endDate`/`urgent`) with:

```tsx
  const hero = (
    <CountdownHero
      key="hero"
      description={description}
      startDate={trip.startDate}
      endDate={trip.endDate}
      nights={daysBetween(startDate, endDate)}
      stopCount={allStopsRaw.length}
      homeCurrency={homeCurrency}
      urgent={phase === "final-prep"}
    />
  );
```

(`startDate`, `endDate`, `homeCurrency`, and `allStopsRaw` are already defined earlier in the function. Do not change the `order` arrays — reordering is Tier 2 ②.)

- [ ] **Step 5: Run focused tests to verify they pass**

Run: `npx vitest run components/trip/home/countdown-hero.test.tsx`
Expected: PASS (all three tests).

- [ ] **Step 6: Type-check, lint, full suite**

Run: `npx tsc --noEmit`
Expected: clean (confirms `PhasePlanning` passes all newly-required props).

Run: `npx eslint components/trip/home/countdown-hero.tsx components/trip/home/countdown-hero.test.tsx components/trip/home/phase-planning.tsx lib/trip-phase.ts lib/money.ts`
Expected: clean.

Run: `npx vitest run`
Expected: PASS (full suite).

- [ ] **Step 7: Commit**

```bash
git add components/trip/home/countdown-hero.tsx components/trip/home/countdown-hero.test.tsx components/trip/home/phase-planning.tsx
git commit -m "feat(home): rebuild CountdownHero as Bold-Modular coral block (Tier 2 ①)"
```

---

## Verification (Definition of Done)

- `npx tsc --noEmit` clean; `npx eslint <touched files>` clean; `npx vitest run` green.
- CountdownHero renders: coral block, phase eyebrow + date range, big Space-Grotesk value + stacked unit, nights/stops/currency pills; urgent → amber eyebrow.
- `describePhase.countdown` string unchanged (other consumers unaffected); new fields additive.
- No reorder of Home cards; no token/globals changes.
- Visual pass (human, local `npm run dev`): coral block in light **and** dark (decorative circle, coral shadow), Space Grotesk number, discreet mode still neutral. Deferred — `next dev` can't run in sandbox.
- Tick Tier 2 ① in `design_handoff/README.md` tracker + session-log line.

## Self-Review Notes

- **Spec coverage:** big number (Task 1 fields + Task 3 render), pills incl. currency (Task 2 + Task 3), eyebrow/date/urgent, decorative circle, coral shadow, a11y label — all covered. Reorder explicitly excluded (② ).
- **Type consistency:** `countdownValue: string`/`countdownUnit: string | null` defined in Task 1 and consumed in Task 3; `currencySymbol(currency, locale?)` defined in Task 2 and consumed in Task 3; `nights`/`stopCount`/`homeCurrency` prop names match between the component and the `PhasePlanning` call site.
- **No placeholders:** every step carries complete code/commands.
