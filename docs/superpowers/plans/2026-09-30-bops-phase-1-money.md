# Phase 1 — PageHeader, trip-header change and Money — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A shared `<PageHeader>` renders every migrated trip page's `<h1>` (trip name as eyebrow, the bell and fork switcher in its trailing slot) while the trip layout's own header hides on those routes; Files, Activity, Compare, Journal, More and Help swap to it; the Money page is rebuilt as a Cost tile, To pay, Where it goes and a Rates strip, with a Money count in the sidebar.

**Architecture:** `components/ui/page-header.tsx` is a Server Component. `components/shell/app-paths.ts` gains `PAGE_HEADER_ROUTES` + `isPageHeaderPath`, which `TripHeaderFrame` uses to hide the layout header at every width (the Day view's mechanism). `components/trip/trip-header-trailing.tsx` loads the bell/fork data through the request-cached reads in `lib/trip-shell-reads.ts`. Money stays a Server Component with the same data fetching; pure helpers live in `lib/money/*.ts` (format parts, summary lines, To pay merge, breakdown rows); presentation lives in `components/money/*`. Only the paid bar, To pay rows/panel, breakdown switch, stacked bar, rate cell and add-cost button are client components. The breakdown grouping is `?by=` in the URL. Motion is the last two implementation tasks.

**Tech Stack:** Next.js 16.3 App Router (**this version differs from your training data — read the guide named in a task before touching layouts or `searchParams`**: `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/layout.md`, `.../page.md`, `.../04-functions/use-router.md`, `.../04-functions/use-search-params.md`), React 19.2 (`useOptimistic`), Tailwind v4, Radix (Dialog, DropdownMenu, ToggleGroup via `components/ui/segmented.tsx`), `motion` 12 (`motion/react`), lucide-react, Vitest 4 + Testing Library (jsdom).

**Spec:** `docs/specs/2026-09-30-budget-onboard-plan-share.md` §A, §B and the Phase 1 row (wins over the handoff). Handoff: `design_handoff/budget-onboard-plan-share/budget-onboard-2026-09-30/MONEY.md`, `MOTION.md` rows M1–M10, `plan-share-audit-handoff/AUDIT.md` §1 and the Files/Activity/Compare/Journal/More rows. Images: `budget-onboard-2026-09-30/images/money-desktop.png`, `money-mobile.png`.

## Global Constraints

- Work only on branch `feat/budget-onboard-plan-share-2026-09-30` (already checked out in /work). Never commit to `main`, never push, never deploy, never run any `feedback:*` script.
- If `node`/`npm` isn't on PATH: `export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use`.
- Every commit message ends with these two lines:
  `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`
  `Claude-Session: https://claude.ai/code/session_01Gg6xb4nJAsiAx7oToWgpT8`
- No `Resolves-Feedback:` trailers (the inbox is empty).
- Tests: `npm test -- <path>` (sets TZ=UTC). Before each commit `npx tsc --noEmit` and `npm run lint` must be clean.
- Tokens only, no raw hex in components; 2px ink borders + hard shadows; `shadow-soft`, `shadow-soft-lg`, `border-border/70`, `bg-card/40` must not appear in any touched file (extend the existing ban assertions to new components). `formatMoney()` for money; `formatDay()/formatRange()/formatDateRange*` for dates, never ISO. Chips/pills `whitespace-nowrap shrink-0`. Touch targets ≥44px on mobile. `tabular-nums` on amounts/times. Respect reduced motion. lucide icons, not unicode glyphs.
- Do not add npm dependencies unless the task says so (check `package.json` — `motion`, dnd-kit, Radix, react-day-picker may already be present; verify).
- Comment only a non-obvious why.

Phase-specific:

- **This repo's names for the handoff's tokens.** Hard shadows are `shadow-hard-1`…`shadow-hard-5` (there is no `shadow-3`); `shadow-cta` exists. Radii are themed: `rounded-xl` is **24px** (tiles — the handoff's "rounded-3xl"), `rounded-2xl` is 28px and `rounded-3xl` is banned by existing tests — never use either. Inner boxes are `rounded-[16px]`, rows/cells `rounded-[12px]`. Title sizes are arbitrary (`text-[40px]`, `text-[32px]`): Tailwind's `text-4xl` is 36px.
- **No `island` on the teal Cost tile or the sun Rates strip.** `island` turns `bg-card` translucent and remaps `--muted-foreground`, which breaks the white settlement box and the teal-text paid lines in dark mode. Instead: tile `bg-teal text-on-accent` / `bg-sun text-on-accent`; inner surfaces `bg-card text-card-foreground`; the paid-bar fill `bg-on-accent` (ink in both themes); secondary text directly on teal/sun `text-on-accent-muted`; secondary text on a card `text-muted-foreground` (never `text-on-accent-muted` on a card — it vanishes on the dark card).
- **Paid means `paidAt != null` (ADR 0037, CONTEXT.md "Paid").** A row is "to pay" when `paidAt == null`. `paidMinor` with no `paidAt` is the legacy paid-without-date state. MONEY.md §4's `paidMinor < costMinor` rule is superseded by this.
- **Money formatting.** Only through `formatMoney` (lib/money.ts) and the two new helpers in `lib/money/format-parts.ts` (`formatMoneyParts`, `formatMoneyWhole`). Row amounts, sub-lines and the settlement box use whole units (the mocks); only the Cost tile's total shows cents.
- **Dates.** The repo has no `formatDay`; its equivalent is `formatDayLabel` ("Thu 15 Oct", lib/dates.ts). Task 2 adds `formatDayMonth` ("2 Sep"). Never render ISO.
- **Trip links** go through `tripPath()` (server) / `useTripHref()` (client) — `lib/trip-links.guard.test.ts` fails on hand-built `/trips/${…}` strings.
- **Category labels stay as `lib/budget.ts` emits them** ("Accommodation", "Food & Drink"): CONTEXT.md avoids "stay". Only the colour/icon map follows MONEY.md §1.
- **Dialog = sheet on phones.** `components/ui/dialog.tsx` already renders a bottom sheet below `sm` and a centred `tp-pop-in` dialog from `sm`. Every "Dialog (desktop) / sheet (mobile)" and the rate cell's "popover (desktop) / sheet (mobile)" in the handoff is that one `Dialog`.
- Do not create `loading.tsx` or `template.tsx` (ADR 0063).

## Review Focus

1. **A JPY or IDR home currency.** The Cost tile total has no cents span (IDR is stored with two decimals but shown without). Expectation: `formatMoneyParts(150000000, "IDR").fraction === null`. (Test in Task 1: "shows IDR without cents".)
2. **A legacy paid-without-date cost.** It sorts as unpaid, reads "Paid · date missing" with a dashed box, and ticking it confirms with the amount already recorded and today's date. Expectation: `markCostPaid(id, 5000, "2026-10-10")`. (Tests in Task 2 "legacy …" and Task 10 "ticking a legacy row confirms it with the recorded amount".)
3. **A Fork is active.** To pay, the paid bar, the paid sub-lines, Add a cost and the Money count are all gone; the Rates strip takes the right column (and shows on phones); every query stays fork-scoped. (Test in Task 14: "a fork hides To pay, Add a cost and the paid bar".)
4. **A bad `?by=`.** `?by=chapter` with chapters off, `?by=day` with no costed day, `?by=bogus`, or a repeated `?by=a&by=b` must render Category, never throw. (Tests in Task 3 `parseBy` and Task 14 "falls back to Category when the grouping isn't available".)
5. **Only migrated routes lose the layout header.** `/trips/<slug>/budget/` (slug, trailing slash) is hidden; `/trips/<id>/settings`, `/plan`, `/calendar`, Home and Day keep today's behaviour; a deeper path such as `/trips/t1/files/x` is not a PageHeader route. (Tests in Task 5 `isPageHeaderPath` and `TripHeaderFrame`, Task 6 layout test.)

---

### Task 1: Money format helpers and summary lines

**Files:**
- Create: `lib/money/format-parts.ts`
- Create: `lib/money/format-parts.test.ts`
- Create: `lib/money/summary-lines.ts`
- Create: `lib/money/summary-lines.test.ts`

(`lib/money.ts` stays; `@/lib/money` still resolves to that file, `@/lib/money/format-parts` to the new directory.)

**Interfaces:**
- Consumes: `decimalsFor`, `formatMoney` from `@/lib/money`; `relativeTime` from `@/lib/relative-time`.
- Produces:
  - `formatMoneyParts(amountMinor: number, currency: string, locale?: string): { whole: string; fraction: string | null }` — `fraction` includes the separator (".40").
  - `formatMoneyWhole(amountMinor: number, currency: string, locale?: string): string`
  - `moneyMetaLine(i: { homeCurrency: string; nights: number; costCount: number; currencyCount: number }): string`
  - `perNightMinor(totalMinor: number, nights: number): number | null`
  - `perPersonMinor(totalMinor: number, members: number): number | null`
  - `paidPct(paidMinor: number, totalMinor: number): number`
  - `missingRatesLine(costs: { currency: string }[], missing: string[]): string | null`
  - `ratesUpdatedNote(rates: { manual: boolean; fetchedAt: Date }[], now?: Date): string | null`

- [ ] **Step 1: Write the failing tests**

`lib/money/format-parts.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { formatMoneyParts, formatMoneyWhole } from "./format-parts";

describe("formatMoneyParts", () => {
  it("splits a two-decimal amount at the decimal separator", () => {
    expect(formatMoneyParts(1482040, "AUD")).toEqual({ whole: "$14,820", fraction: ".40" });
  });
  it("keeps a zero fraction for a two-decimal currency", () => {
    expect(formatMoneyParts(100000, "AUD")).toEqual({ whole: "$1,000", fraction: ".00" });
  });
  it("has no fraction for a zero-decimal currency (JPY)", () => {
    expect(formatMoneyParts(184000, "JPY")).toEqual({ whole: "¥184,000", fraction: null });
  });
  it("shows IDR without cents even though it is stored with two decimals", () => {
    const parts = formatMoneyParts(150000000, "IDR");
    expect(parts.fraction).toBeNull();
    expect(parts.whole).toMatch(/^Rp\s1,500,000$/);
  });
  it("uses the narrow symbol for a foreign currency", () => {
    expect(formatMoneyParts(76000, "EUR")).toEqual({ whole: "€760", fraction: ".00" });
  });
  it("falls back to formatMoney's plain text for a malformed code", () => {
    expect(formatMoneyParts(1250, "Z1Z")).toEqual({ whole: "12.50 Z1Z", fraction: null });
  });
});

describe("formatMoneyWhole", () => {
  it("rounds to whole units with the narrow symbol", () => {
    expect(formatMoneyWhole(42350, "AUD")).toBe("$424");
    expect(formatMoneyWhole(934000, "AUD")).toBe("$9,340");
    expect(formatMoneyWhole(76000, "EUR")).toBe("€760");
    expect(formatMoneyWhole(184000, "JPY")).toBe("¥184,000");
  });
  it("falls back to formatMoney for a malformed code", () => {
    expect(formatMoneyWhole(1250, "Z1Z")).toBe("12.50 Z1Z");
  });
});
```

`lib/money/summary-lines.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  moneyMetaLine,
  perNightMinor,
  perPersonMinor,
  paidPct,
  missingRatesLine,
  ratesUpdatedNote,
} from "./summary-lines";

describe("moneyMetaLine", () => {
  it("reads currency · nights · costs in currencies", () => {
    expect(moneyMetaLine({ homeCurrency: "AUD", nights: 35, costCount: 14, currencyCount: 3 })).toBe(
      "In AUD · 35 nights · 14 costs in 3 currencies",
    );
  });
  it("leaves out zero parts, and the currency clause when everything is in the home currency", () => {
    expect(moneyMetaLine({ homeCurrency: "AUD", nights: 0, costCount: 0, currencyCount: 1 })).toBe("In AUD");
    expect(moneyMetaLine({ homeCurrency: "AUD", nights: 1, costCount: 1, currencyCount: 1 })).toBe(
      "In AUD · 1 night · 1 cost",
    );
    expect(moneyMetaLine({ homeCurrency: "GBP", nights: 0, costCount: 2, currencyCount: 2 })).toBe(
      "In GBP · 2 costs in 2 currencies",
    );
  });
});

describe("per night / per person", () => {
  it("divides and rounds to a minor unit", () => {
    expect(perNightMinor(1482040, 35)).toBe(42344);
    expect(perPersonMinor(1482040, 2)).toBe(741020);
    expect(perPersonMinor(1000, 3)).toBe(333);
  });
  it("is null with no nights, or fewer than two people", () => {
    expect(perNightMinor(1000, 0)).toBeNull();
    expect(perPersonMinor(1000, 1)).toBeNull();
    expect(perPersonMinor(1000, 0)).toBeNull();
  });
});

describe("paidPct", () => {
  it("rounds to a whole percent", () => {
    expect(paidPct(934000, 1482040)).toBe(63);
  });
  it("is 0 on a zero total and caps at 100", () => {
    expect(paidPct(0, 0)).toBe(0);
    expect(paidPct(2000000, 1482040)).toBe(100);
    expect(paidPct(1482040, 1482040)).toBe(100);
  });
  it("never reads 100 while something is still to go", () => {
    expect(paidPct(1482039, 1482040)).toBe(99);
  });
});

describe("missingRatesLine", () => {
  const costs = [{ currency: "IDR" }, { currency: "idr" }, { currency: "EUR" }, { currency: "VND" }, { currency: "THB" }];
  it("counts the costs a missing rate leaves out", () => {
    expect(missingRatesLine(costs, ["IDR"])).toBe("2 IDR costs left out of totals until you set a rate.");
    expect(missingRatesLine([{ currency: "IDR" }], ["IDR"])).toBe("1 IDR cost left out of totals until you set a rate.");
  });
  it("joins several currencies", () => {
    expect(missingRatesLine(costs, ["IDR", "VND"])).toBe(
      "2 IDR and 1 VND costs left out of totals until you set a rate.",
    );
    expect(missingRatesLine(costs, ["IDR", "VND", "THB"])).toBe(
      "2 IDR, 1 VND and 1 THB costs left out of totals until you set a rate.",
    );
  });
  it("is null when nothing is missing", () => {
    expect(missingRatesLine(costs, [])).toBeNull();
  });
});

describe("ratesUpdatedNote", () => {
  const now = new Date("2026-10-10T12:00:00Z");
  it("says how long ago the newest fetched rate is", () => {
    expect(
      ratesUpdatedNote(
        [
          { manual: false, fetchedAt: new Date("2026-10-10T06:00:00Z") },
          { manual: false, fetchedAt: new Date("2026-10-10T10:00:00Z") },
        ],
        now,
      ),
    ).toBe("Updated 2h ago");
  });
  it("names manual rates instead", () => {
    expect(
      ratesUpdatedNote(
        [
          { manual: true, fetchedAt: new Date("2026-10-01T00:00:00Z") },
          { manual: false, fetchedAt: new Date("2026-10-10T11:59:30Z") },
        ],
        now,
      ),
    ).toBe("1 set by you");
  });
  it("is null with no stored rates", () => {
    expect(ratesUpdatedNote([], now)).toBeNull();
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm test -- lib/money`
Expected: FAIL — cannot resolve `./format-parts` / `./summary-lines`.

- [ ] **Step 3: Implement**

`lib/money/format-parts.ts`:

```ts
import { decimalsFor, formatMoney } from "@/lib/money";

/** Stored with two decimals (ISO 4217) but never shown with cents. */
const NO_CENTS_DISPLAY = new Set(["IDR"]);

/**
 * The Cost tile's total as two spans (MONEY.md §3): "$14,820" and ".40".
 * `fraction` carries its separator and is null when the currency shows no
 * minor units.
 */
export function formatMoneyParts(
  amountMinor: number,
  currency: string,
  locale: string = "en-AU",
): { whole: string; fraction: string | null } {
  const code = currency.toUpperCase();
  const decimals = decimalsFor(code);
  const shown = NO_CENTS_DISPLAY.has(code) ? 0 : decimals;
  try {
    const parts = new Intl.NumberFormat(locale, {
      style: "currency",
      currency: code,
      currencyDisplay: "narrowSymbol",
      minimumFractionDigits: shown,
      maximumFractionDigits: shown,
    }).formatToParts(amountMinor / 10 ** decimals);
    const i = parts.findIndex((p) => p.type === "decimal");
    const join = (ps: Intl.NumberFormatPart[]) => ps.map((p) => p.value).join("");
    if (i === -1) return { whole: join(parts), fraction: null };
    return { whole: join(parts.slice(0, i)), fraction: join(parts.slice(i)) };
  } catch {
    return { whole: formatMoney(amountMinor, currency, locale), fraction: null };
  }
}

/** Whole units with the narrow symbol ("$9,340", "€760") for rows and sub-lines. */
export function formatMoneyWhole(amountMinor: number, currency: string, locale: string = "en-AU"): string {
  const code = currency.toUpperCase();
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: code,
      currencyDisplay: "narrowSymbol",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amountMinor / 10 ** decimalsFor(code));
  } catch {
    return formatMoney(amountMinor, currency, locale);
  }
}
```

`lib/money/summary-lines.ts`:

```ts
import { relativeTime } from "@/lib/relative-time";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "In AUD · 35 nights · 14 costs in 3 currencies" (MONEY.md §2); zero parts drop out. */
export function moneyMetaLine({
  homeCurrency,
  nights,
  costCount,
  currencyCount,
}: {
  homeCurrency: string;
  nights: number;
  costCount: number;
  currencyCount: number;
}): string {
  const parts = [`In ${homeCurrency.toUpperCase()}`];
  if (nights > 0) parts.push(plural(nights, "night", "nights"));
  if (costCount > 0) {
    const costs = plural(costCount, "cost", "costs");
    parts.push(currencyCount > 1 ? `${costs} in ${currencyCount} currencies` : costs);
  }
  return parts.join(" · ");
}

export function perNightMinor(totalMinor: number, nights: number): number | null {
  return nights > 0 ? Math.round(totalMinor / nights) : null;
}

/** Split with N (spec §B1): every TripMember, owner included; null below two. */
export function perPersonMinor(totalMinor: number, members: number): number | null {
  return members >= 2 ? Math.round(totalMinor / members) : null;
}

export function paidPct(paidMinor: number, totalMinor: number): number {
  if (totalMinor <= 0) return 0;
  if (paidMinor >= totalMinor) return 100;
  return Math.min(99, Math.round((paidMinor / totalMinor) * 100));
}

/** "2 IDR costs left out of totals until you set a rate." (MONEY.md §6). */
export function missingRatesLine(costs: { currency: string }[], missing: string[]): string | null {
  if (missing.length === 0) return null;
  const counts = missing.map((code) => ({
    code: code.toUpperCase(),
    n: costs.filter((c) => c.currency.toUpperCase() === code.toUpperCase()).length,
  }));
  const total = counts.reduce((s, c) => s + c.n, 0);
  const labels = counts.map((c) => `${c.n} ${c.code}`);
  const joined =
    labels.length === 1 ? labels[0] : `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
  return `${joined} ${total === 1 ? "cost" : "costs"} left out of totals until you set a rate.`;
}

/** Rates strip header note: "1 set by you", else "Updated 2h ago" from the newest fetch. */
export function ratesUpdatedNote(rates: { manual: boolean; fetchedAt: Date }[], now: Date = new Date()): string | null {
  if (rates.length === 0) return null;
  const manual = rates.filter((r) => r.manual).length;
  if (manual > 0) return `${manual} set by you`;
  const newest = rates.reduce((a, b) => (b.fetchedAt > a.fetchedAt ? b : a));
  return `Updated ${relativeTime(newest.fetchedAt, now)}`;
}
```

- [ ] **Step 4: Run the tests**

Run: `npm test -- lib/money lib/money.test.ts`
Expected: PASS.

- [ ] **Step 5: Gates and commit**

```bash
npx tsc --noEmit && npm run lint
git add lib/money/format-parts.ts lib/money/format-parts.test.ts lib/money/summary-lines.ts lib/money/summary-lines.test.ts
git commit -m "feat(money): format parts, whole-unit money and summary line helpers

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Gg6xb4nJAsiAx7oToWgpT8"
```

---

### Task 2: The To pay merge

**Files:**
- Modify: `lib/dates.ts` (add `formatDayMonth` beside `formatDayLabel`)
- Modify: `lib/dates.test.ts` (one test)
- Create: `lib/money/to-pay.ts`
- Create: `lib/money/to-pay.test.ts`

**Interfaces:**
- Consumes: `convertMinor` (`@/lib/money`), `daysBetween`, `formatDayLabel`, `parseISODate` (`@/lib/dates`), `isOnTrip` (`@/lib/enums`).
- Produces:
  - `formatDayMonth(s: string): string` — "2 Sep".
  - `TO_PAY_SOON_DAYS = 14`
  - `type DueTone = "overdue" | "soon" | "later" | "none" | "paid" | "legacy"`
  - `interface ToPayInput { id: string; displayLabel: string; costMinor: number; paidMinor: number | null; currency: string; rateToHome: number | null; paidAt: Date | null; dueDate: string | null; ownerType: string; settlement?: string }`
  - `interface ToPayRow { id: string; label: string; ownerType: string; paid: boolean; legacy: boolean; costMinor: number; paidMinor: number | null; currency: string; foreign: boolean; originalMinor: number; homeMinor: number | null; dueLine: string; dueTone: DueTone; unpaidDueLine: string; unpaidDueTone: DueTone }`
  - `mergeToPay(costs: ToPayInput[], opts: { today: string; homeCurrency: string }): ToPayRow[]` — input order is the "createdAt order" (the page queries `orderBy: { createdAt: "asc" }`).

- [ ] **Step 1: Write the failing tests**

Append to `lib/dates.test.ts` (inside a new `describe`, importing `formatDayMonth` alongside the file's existing imports):

```ts
describe("formatDayMonth", () => {
  it("is day and short month, no weekday or year", () => {
    expect(formatDayMonth("2026-09-02")).toBe("2 Sep");
  });
});
```

`lib/money/to-pay.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { mergeToPay, type ToPayInput } from "./to-pay";

const TODAY = "2026-10-10"; // a Saturday
const OPTS = { today: TODAY, homeCurrency: "AUD" };

function cost(over: Partial<ToPayInput> & { id: string }): ToPayInput {
  return {
    displayLabel: over.id,
    costMinor: 10000,
    paidMinor: null,
    currency: "AUD",
    rateToHome: null,
    paidAt: null,
    dueDate: null,
    ownerType: "OTHER",
    settlement: "BEFORE",
    ...over,
  };
}

describe("mergeToPay order", () => {
  it("unpaid first — overdue, then by due date, then undated in created order — then paid, newest first", () => {
    const rows = mergeToPay(
      [
        cost({ id: "paidOld", paidMinor: 10000, paidAt: new Date("2026-09-01") }),
        cost({ id: "noDue1" }),
        cost({ id: "dueLater", dueDate: "2026-11-02" }),
        cost({ id: "overdue2", dueDate: "2026-10-05" }),
        cost({ id: "paidNew", paidMinor: 10000, paidAt: new Date("2026-09-20") }),
        cost({ id: "dueSoon", dueDate: "2026-10-15" }),
        cost({ id: "overdue1", dueDate: "2026-10-01" }),
        cost({ id: "noDue2" }),
      ],
      OPTS,
    );
    expect(rows.map((r) => r.id)).toEqual([
      "overdue1",
      "overdue2",
      "dueSoon",
      "dueLater",
      "noDue1",
      "noDue2",
      "paidNew",
      "paidOld",
    ]);
  });
});

describe("mergeToPay due lines", () => {
  const line = (c: ToPayInput) => {
    const [r] = mergeToPay([c], OPTS);
    return [r.dueLine, r.dueTone];
  };
  it("overdue, due soon (14 days inclusive), and later", () => {
    expect(line(cost({ id: "a", dueDate: "2026-10-01" }))).toEqual(["Overdue · Thu 1 Oct", "overdue"]);
    expect(line(cost({ id: "b", dueDate: TODAY }))).toEqual(["Due Sat 10 Oct", "soon"]);
    expect(line(cost({ id: "c", dueDate: "2026-10-24" }))).toEqual(["Due Sat 24 Oct", "soon"]);
    expect(line(cost({ id: "d", dueDate: "2026-10-25" }))).toEqual(["Due Sun 25 Oct", "later"]);
  });
  it("On the trip with no due date: check-in for accommodation, on the day otherwise", () => {
    expect(line(cost({ id: "a", settlement: "ON_TRIP", ownerType: "ACCOMMODATION" }))).toEqual(["Pay at check-in", "none"]);
    expect(line(cost({ id: "b", settlement: "ON_TRIP", ownerType: "ITEM" }))).toEqual(["Pay on the day", "none"]);
  });
  it("Before you go with no due date has no line", () => {
    expect(line(cost({ id: "a" }))).toEqual(["", "none"]);
  });
  it("paid reads the day it was paid", () => {
    expect(line(cost({ id: "a", paidMinor: 10000, paidAt: new Date("2026-09-02") }))).toEqual(["Paid 2 Sep", "paid"]);
  });
  it("legacy (an amount but no paid date) is unpaid, flagged, and says the date is missing", () => {
    const [r] = mergeToPay([cost({ id: "a", paidMinor: 5000 })], OPTS);
    expect(r.paid).toBe(false);
    expect(r.legacy).toBe(true);
    expect([r.dueLine, r.dueTone]).toEqual(["Paid · date missing", "legacy"]);
  });
  it("keeps what an unpaid row would read on a paid row, for an optimistic un-tick", () => {
    const [r] = mergeToPay([cost({ id: "a", dueDate: "2026-10-15", paidMinor: 10000, paidAt: new Date("2026-09-02") })], OPTS);
    expect([r.unpaidDueLine, r.unpaidDueTone]).toEqual(["Due Thu 15 Oct", "soon"]);
  });
});

describe("mergeToPay amounts", () => {
  it("converts a foreign cost to the home currency and keeps the original", () => {
    const [r] = mergeToPay([cost({ id: "a", currency: "EUR", costMinor: 76000, rateToHome: 2 })], OPTS);
    expect(r.foreign).toBe(true);
    expect(r.homeMinor).toBe(152000);
    expect(r.originalMinor).toBe(76000);
  });
  it("has no home amount when the rate is missing", () => {
    const [r] = mergeToPay([cost({ id: "a", currency: "IDR", costMinor: 100000, rateToHome: null })], OPTS);
    expect(r.homeMinor).toBeNull();
  });
  it("a paid row shows what was paid", () => {
    const [r] = mergeToPay([cost({ id: "a", costMinor: 10000, paidMinor: 8000, paidAt: new Date("2026-09-02") })], OPTS);
    expect(r.homeMinor).toBe(8000);
    expect(r.originalMinor).toBe(8000);
  });
  it("carries the label", () => {
    const [r] = mergeToPay([cost({ id: "a", displayLabel: "Rome apartment · balance" })], OPTS);
    expect(r.label).toBe("Rome apartment · balance");
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm test -- lib/money/to-pay.test.ts lib/dates.test.ts`
Expected: FAIL — `formatDayMonth` is not exported; `./to-pay` does not resolve.

- [ ] **Step 3: Implement**

In `lib/dates.ts`, directly under `formatDayLabel`:

```ts
/** "2 Sep" — a paid date inside the trip's own year context (Money's To pay). */
export function formatDayMonth(s: string): string {
  const d = parseISODate(s);
  return `${d.getUTCDate()} ${MONTH_SHORT[d.getUTCMonth()]}`;
}
```

`lib/money/to-pay.ts`:

```ts
import { convertMinor } from "@/lib/money";
import { daysBetween, formatDayLabel, formatDayMonth } from "@/lib/dates";
import { isOnTrip } from "@/lib/enums";

export const TO_PAY_SOON_DAYS = 14;

export type DueTone = "overdue" | "soon" | "later" | "none" | "paid" | "legacy";

export interface ToPayInput {
  id: string;
  displayLabel: string;
  costMinor: number;
  paidMinor: number | null;
  currency: string;
  rateToHome: number | null;
  paidAt: Date | null;
  dueDate: string | null;
  ownerType: string;
  settlement?: string;
}

export interface ToPayRow {
  id: string;
  label: string;
  ownerType: string;
  paid: boolean;
  legacy: boolean;
  costMinor: number;
  paidMinor: number | null;
  currency: string;
  foreign: boolean;
  originalMinor: number;
  homeMinor: number | null;
  dueLine: string;
  dueTone: DueTone;
  unpaidDueLine: string;
  unpaidDueTone: DueTone;
}

function unpaidDue(c: ToPayInput, today: string): { line: string; tone: DueTone } {
  if (c.dueDate) {
    const days = daysBetween(today, c.dueDate);
    if (days < 0) return { line: `Overdue · ${formatDayLabel(c.dueDate)}`, tone: "overdue" };
    return { line: `Due ${formatDayLabel(c.dueDate)}`, tone: days <= TO_PAY_SOON_DAYS ? "soon" : "later" };
  }
  if (isOnTrip(c.settlement)) {
    return { line: c.ownerType === "ACCOMMODATION" ? "Pay at check-in" : "Pay on the day", tone: "none" };
  }
  return { line: "", tone: "none" };
}

/**
 * One list for To pay (MONEY.md §4): unpaid (legacy included) first, soonest
 * due first and undated after in created order, then paid, newest first.
 * Paid is `paidAt` alone (ADR 0037).
 */
export function mergeToPay(costs: ToPayInput[], { today, homeCurrency }: { today: string; homeCurrency: string }): ToPayRow[] {
  const home = homeCurrency.toUpperCase();
  const rows = costs.map((c, index) => {
    const paid = c.paidAt != null;
    const legacy = !paid && c.paidMinor != null;
    const originalMinor = paid ? (c.paidMinor ?? c.costMinor) : c.costMinor;
    const foreign = c.currency.toUpperCase() !== home;
    const homeMinor = !foreign
      ? originalMinor
      : c.rateToHome != null
        ? convertMinor(originalMinor, c.currency, home, c.rateToHome)
        : null;
    const u = unpaidDue(c, today);
    const paidISO = paid ? c.paidAt!.toISOString().slice(0, 10) : null;
    const due = paid
      ? { line: `Paid ${formatDayMonth(paidISO!)}`, tone: "paid" as const }
      : legacy
        ? { line: "Paid · date missing", tone: "legacy" as const }
        : u;
    const row: ToPayRow = {
      id: c.id,
      label: c.displayLabel,
      ownerType: c.ownerType,
      paid,
      legacy,
      costMinor: c.costMinor,
      paidMinor: c.paidMinor,
      currency: c.currency,
      foreign,
      originalMinor,
      homeMinor,
      dueLine: due.line,
      dueTone: due.tone,
      unpaidDueLine: u.line,
      unpaidDueTone: u.tone,
    };
    return { row, index, due: c.dueDate, paidAt: c.paidAt?.getTime() ?? 0 };
  });

  rows.sort((a, b) => {
    if (a.row.paid !== b.row.paid) return a.row.paid ? 1 : -1;
    if (a.row.paid) return b.paidAt - a.paidAt;
    if (a.due && b.due) return a.due < b.due ? -1 : a.due > b.due ? 1 : a.index - b.index;
    if (a.due) return -1;
    if (b.due) return 1;
    return a.index - b.index;
  });
  return rows.map((r) => r.row);
}
```

(Overdue rows sort first because their due dates are the earliest; no separate bucket is needed.)

- [ ] **Step 4: Run the tests**

Run: `npm test -- lib/money/to-pay.test.ts lib/dates.test.ts`
Expected: PASS.

- [ ] **Step 5: Gates and commit**

```bash
npx tsc --noEmit && npm run lint
git add lib/dates.ts lib/dates.test.ts lib/money/to-pay.ts lib/money/to-pay.test.ts
git commit -m "feat(money): mergeToPay — one sorted To pay list with due tones

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Gg6xb4nJAsiAx7oToWgpT8"
```

---

### Task 3: Where it goes — breakdown rows, segments and `?by=`

**Files:**
- Create: `lib/money/breakdown.ts`
- Create: `lib/money/breakdown.test.ts`

**Interfaces:**
- Consumes: `BudgetResult` type (`@/lib/budget`), `Hue`, `LEGACY_TO_HUE` (`@/lib/hues`), `CATEGORIES` (`@/lib/categories`), `formatDayLabel` (`@/lib/dates`).
- Produces:
  - `type BreakdownBy = "category" | "place" | "chapter" | "day"`
  - `type MoneyCategoryIcon = "transport" | "accommodation" | "activity" | "food" | "other"`
  - `budgetCategoryStyle(label: string): { hue: Hue; icon: MoneyCategoryIcon }`
  - `breakdownOptions(a: { chapters: boolean; days: boolean }): { value: BreakdownBy; label: string }[]`
  - `parseBy(raw: string | string[] | undefined, available: readonly BreakdownBy[]): BreakdownBy`
  - `interface BreakdownRow { key: string; label: string; hue: Hue | null; icon: MoneyCategoryIcon | null; chapterColour?: string; pct: number | null; costMinor: number; paidMinor: number; muted: boolean; missingRate: boolean }`
  - `type BreakdownBudget = Pick<BudgetResult, "grandTotal" | "byCategory" | "byStop" | "byDay" | "byChapter" | "chapterReconciliation">`
  - `rowsFor(budget: BreakdownBudget, by: BreakdownBy, opts?: { stopChapterColour?: ReadonlyMap<string, string>; missingRateCategories?: ReadonlySet<string> }): BreakdownRow[]`
  - `interface BarSegment { key: string; hue: Hue; fraction: number }`
  - `segmentsFor(rows: BreakdownRow[], totalMinor: number): BarSegment[]`

- [ ] **Step 1: Write the failing test**

`lib/money/breakdown.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  budgetCategoryStyle,
  breakdownOptions,
  parseBy,
  rowsFor,
  segmentsFor,
  type BreakdownBudget,
} from "./breakdown";

const zero = { costTotalMinor: 0, paidTotalMinor: 0 };
const BUDGET: BreakdownBudget = {
  grandTotal: {
    costTotalMinor: 100000,
    paidTotalMinor: 20000,
    beforeTotalMinor: 100000,
    onTripTotalMinor: 0,
    beforePaidMinor: 20000,
    onTripPaidMinor: 0,
  },
  byCategory: [
    { category: "Transport", costTotalMinor: 42000, paidTotalMinor: 10000 },
    { category: "Accommodation", costTotalMinor: 35000, paidTotalMinor: 10000 },
    { category: "Sightseeing", costTotalMinor: 11000, paidTotalMinor: 0 },
    { category: "Food & Drink", costTotalMinor: 8000, paidTotalMinor: 0 },
    { category: "Insurance", costTotalMinor: 3500, paidTotalMinor: 0 },
    { category: "Visas & Docs", costTotalMinor: 500, paidTotalMinor: 0 },
  ],
  byStop: [
    { stopId: "s1", stopName: "Rome", costTotalMinor: 60000, paidTotalMinor: 20000 },
    { stopId: "s2", stopName: "Paris", costTotalMinor: 30000, paidTotalMinor: 0 },
    { stopId: null, stopName: "Trip-wide / Other", costTotalMinor: 10000, paidTotalMinor: 0 },
  ],
  byDay: [
    { dateISO: "2026-12-12", costTotalMinor: 5000, paidTotalMinor: 0 },
    { dateISO: "2026-12-13", costTotalMinor: 0, paidTotalMinor: 0 },
  ],
  byChapter: [{ chapterId: "c1", chapterName: "Italy", colour: "orange", costTotalMinor: 60000, paidTotalMinor: 20000 }],
  chapterReconciliation: {
    ungrouped: { costTotalMinor: 30000, paidTotalMinor: 0 },
    betweenLegs: zero,
    otherCosts: { costTotalMinor: 10000, paidTotalMinor: 0 },
  },
};

describe("budgetCategoryStyle", () => {
  it("maps the handoff's five groups onto the ramp", () => {
    expect(budgetCategoryStyle("Transport")).toEqual({ hue: "sun", icon: "transport" });
    expect(budgetCategoryStyle("Accommodation")).toEqual({ hue: "teal", icon: "accommodation" });
    expect(budgetCategoryStyle("Food & Drink")).toEqual({ hue: "leaf", icon: "food" });
    for (const label of ["Sightseeing", "Activity", "Activities", "Getting around", "Nightlife"]) {
      expect(budgetCategoryStyle(label)).toEqual({ hue: "coral", icon: "activity" });
    }
    for (const label of ["Other", "Insurance", "Visas & Docs", "anything typed"]) {
      expect(budgetCategoryStyle(label)).toEqual({ hue: "lilac", icon: "other" });
    }
  });
});

describe("breakdownOptions and parseBy", () => {
  it("offers Chapter and Day only when they have something to show", () => {
    expect(breakdownOptions({ chapters: false, days: true }).map((o) => o.label)).toEqual(["Category", "Place", "Day"]);
    expect(breakdownOptions({ chapters: true, days: false }).map((o) => o.value)).toEqual(["category", "place", "chapter"]);
  });
  it("falls back to category for anything unavailable or unknown", () => {
    const all = ["category", "place", "chapter", "day"] as const;
    expect(parseBy(undefined, all)).toBe("category");
    expect(parseBy("place", all)).toBe("place");
    expect(parseBy(["chapter", "day"], all)).toBe("chapter");
    expect(parseBy("chapter", ["category", "place"])).toBe("category");
    expect(parseBy("bogus", all)).toBe("category");
  });
});

describe("rowsFor", () => {
  it("category: hue, icon, percent and the missing-rate flag", () => {
    const rows = rowsFor(BUDGET, "category", { missingRateCategories: new Set(["Insurance"]) });
    expect(rows.map((r) => r.label)).toEqual(["Transport", "Accommodation", "Sightseeing", "Food & Drink", "Insurance", "Visas & Docs"]);
    expect(rows.map((r) => r.hue)).toEqual(["sun", "teal", "coral", "leaf", "lilac", "lilac"]);
    expect(rows[0]).toMatchObject({ icon: "transport", pct: 42, costMinor: 42000, paidMinor: 10000, muted: false, missingRate: false });
    expect(rows[4].missingRate).toBe(true);
  });
  it("place: a stop in a chapter takes the chapter's colour, others cycle the ramp, trip-wide is stone", () => {
    const rows = rowsFor(BUDGET, "place", { stopChapterColour: new Map([["s1", "orange"]]) });
    expect(rows.map((r) => [r.label, r.hue, r.icon])).toEqual([
      ["Rome", "coral", null],
      ["Paris", "teal", null],
      ["Trip-wide / Other", "stone", null],
    ]);
  });
  it("chapter: chapter rows, then only the non-zero reconciliation rows, muted and without a swatch", () => {
    const rows = rowsFor(BUDGET, "chapter");
    expect(rows.map((r) => [r.label, r.hue, r.muted, r.chapterColour])).toEqual([
      ["Italy", "coral", false, "orange"],
      ["Ungrouped", null, true, undefined],
      ["Other costs", null, true, undefined],
    ]);
  });
  it("day: only costed days, labelled like 'Sat 12 Dec', with no percent", () => {
    const rows = rowsFor(BUDGET, "day");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ label: "Sat 12 Dec", pct: null, costMinor: 5000 });
  });
});

describe("segmentsFor", () => {
  it("one segment per row, merging anything under 1% into a trailing stone segment", () => {
    const segs = segmentsFor(rowsFor(BUDGET, "category"), 100000);
    expect(segs.map((s) => s.hue)).toEqual(["sun", "teal", "coral", "leaf", "lilac", "stone"]);
    expect(segs[0].fraction).toBeCloseTo(0.42);
    expect(segs[5]).toEqual({ key: "__small", hue: "stone", fraction: 0.005 });
  });
  it("rows without a swatch go into the stone tail too, so the bar fills", () => {
    const segs = segmentsFor(rowsFor(BUDGET, "chapter"), 100000);
    expect(segs.map((s) => [s.hue, s.fraction])).toEqual([
      ["coral", 0.6],
      ["stone", 0.4],
    ]);
  });
  it("is empty with no total", () => {
    expect(segmentsFor(rowsFor(BUDGET, "category"), 0)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npm test -- lib/money/breakdown.test.ts`
Expected: FAIL — `./breakdown` does not resolve.

- [ ] **Step 3: Implement**

`lib/money/breakdown.ts`:

```ts
import type { BudgetResult } from "@/lib/budget";
import { type Hue, LEGACY_TO_HUE } from "@/lib/hues";
import { CATEGORIES } from "@/lib/categories";
import { formatDayLabel } from "@/lib/dates";

export type BreakdownBy = "category" | "place" | "chapter" | "day";
export type MoneyCategoryIcon = "transport" | "accommodation" | "activity" | "food" | "other";

const FIXED: Record<string, { hue: Hue; icon: MoneyCategoryIcon }> = {
  Transport: { hue: "sun", icon: "transport" },
  Accommodation: { hue: "teal", icon: "accommodation" },
  "Food & Drink": { hue: "leaf", icon: "food" },
};
// Every Item category that is something to do (lib/categories.ts labels), plus
// effectiveCategory's own "Activity" fallback and the Other-cost "Activities".
const ACTIVITY_LABELS = new Set<string>([
  ...CATEGORIES.filter((c) => c.value !== "FOOD" && c.value !== "OTHER").map((c) => c.label),
  "Activity",
  "Activities",
]);

/** MONEY.md §1: Transport = sun, Accommodation = teal, things to do = coral, Food = leaf, the rest = lilac. */
export function budgetCategoryStyle(label: string): { hue: Hue; icon: MoneyCategoryIcon } {
  return FIXED[label] ?? (ACTIVITY_LABELS.has(label) ? { hue: "coral", icon: "activity" } : { hue: "lilac", icon: "other" });
}

export function breakdownOptions({ chapters, days }: { chapters: boolean; days: boolean }): { value: BreakdownBy; label: string }[] {
  return [
    { value: "category", label: "Category" },
    { value: "place", label: "Place" },
    ...(chapters ? [{ value: "chapter" as const, label: "Chapter" }] : []),
    ...(days ? [{ value: "day" as const, label: "Day" }] : []),
  ];
}

export function parseBy(raw: string | string[] | undefined, available: readonly BreakdownBy[]): BreakdownBy {
  const first = Array.isArray(raw) ? raw[0] : raw;
  return available.find((v) => v === first) ?? "category";
}

export interface BreakdownRow {
  key: string;
  label: string;
  hue: Hue | null;
  icon: MoneyCategoryIcon | null;
  chapterColour?: string;
  pct: number | null;
  costMinor: number;
  paidMinor: number;
  muted: boolean;
  missingRate: boolean;
}

export type BreakdownBudget = Pick<BudgetResult, "grandTotal" | "byCategory" | "byStop" | "byDay" | "byChapter" | "chapterReconciliation">;

const PLACE_RAMP: readonly Hue[] = ["sun", "teal", "coral", "leaf", "lilac", "sky", "pink", "indigo"];

export function rowsFor(
  budget: BreakdownBudget,
  by: BreakdownBy,
  opts: { stopChapterColour?: ReadonlyMap<string, string>; missingRateCategories?: ReadonlySet<string> } = {},
): BreakdownRow[] {
  const total = budget.grandTotal.costTotalMinor;
  const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0);
  const base = { muted: false, missingRate: false, icon: null };

  switch (by) {
    case "category":
      return budget.byCategory.map((c) => {
        const style = budgetCategoryStyle(c.category);
        return {
          ...base,
          key: `cat:${c.category}`,
          label: c.category,
          hue: style.hue,
          icon: style.icon,
          pct: pct(c.costTotalMinor),
          costMinor: c.costTotalMinor,
          paidMinor: c.paidTotalMinor,
          missingRate: opts.missingRateCategories?.has(c.category) ?? false,
        };
      });
    case "place":
      return budget.byStop.map((s, i) => {
        const chapterColour = s.stopId ? opts.stopChapterColour?.get(s.stopId) : undefined;
        const hue: Hue = s.stopId == null ? "stone" : chapterColour ? (LEGACY_TO_HUE[chapterColour] ?? "stone") : PLACE_RAMP[i % PLACE_RAMP.length];
        return { ...base, key: `stop:${s.stopId ?? "tripwide"}`, label: s.stopName, hue, pct: pct(s.costTotalMinor), costMinor: s.costTotalMinor, paidMinor: s.paidTotalMinor };
      });
    case "chapter": {
      const rows: BreakdownRow[] = budget.byChapter.map((c) => ({
        ...base,
        key: `ch:${c.chapterId}`,
        label: c.chapterName,
        hue: LEGACY_TO_HUE[c.colour] ?? "stone",
        chapterColour: c.colour,
        pct: pct(c.costTotalMinor),
        costMinor: c.costTotalMinor,
        paidMinor: c.paidTotalMinor,
      }));
      const rec = budget.chapterReconciliation;
      for (const [key, label, v] of [
        ["ungrouped", "Ungrouped", rec.ungrouped],
        ["between", "Between legs", rec.betweenLegs],
        ["other", "Other costs", rec.otherCosts],
      ] as const) {
        if (v.costTotalMinor > 0 || v.paidTotalMinor > 0) {
          rows.push({ ...base, key: `rec:${key}`, label, hue: null, muted: true, pct: pct(v.costTotalMinor), costMinor: v.costTotalMinor, paidMinor: v.paidTotalMinor });
        }
      }
      return rows;
    }
    case "day":
      return budget.byDay
        .filter((d) => d.costTotalMinor > 0 || d.paidTotalMinor > 0)
        .map((d) => ({ ...base, key: `day:${d.dateISO}`, label: formatDayLabel(d.dateISO), hue: "stone" as const, pct: null, costMinor: d.costTotalMinor, paidMinor: d.paidTotalMinor }));
  }
}

export interface BarSegment {
  key: string;
  hue: Hue;
  fraction: number;
}

/** The stacked bar (MONEY.md §5): segments under 1% and swatch-less rows merge into one trailing stone segment. */
export function segmentsFor(rows: BreakdownRow[], totalMinor: number): BarSegment[] {
  if (totalMinor <= 0) return [];
  const segs: BarSegment[] = [];
  let tail = 0;
  for (const r of rows) {
    if (r.costMinor <= 0) continue;
    const fraction = r.costMinor / totalMinor;
    if (r.hue === null || fraction < 0.01) tail += fraction;
    else segs.push({ key: r.key, hue: r.hue, fraction });
  }
  if (tail > 0) segs.push({ key: "__small", hue: "stone", fraction: tail });
  return segs;
}
```

(If `toEqual` on `0.005`/`0.4` trips on float noise, round `fraction` to 6 dp inside `segmentsFor` with `Math.round(x * 1e6) / 1e6` rather than loosening the test.)

- [ ] **Step 4: Run the test**

Run: `npm test -- lib/money/breakdown.test.ts`
Expected: PASS.

- [ ] **Step 5: Gates and commit**

```bash
npx tsc --noEmit && npm run lint
git add lib/money/breakdown.ts lib/money/breakdown.test.ts
git commit -m "feat(money): breakdown rows, stacked-bar segments and ?by= parsing

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Gg6xb4nJAsiAx7oToWgpT8"
```

---

### Task 4: `<PageHeader>`

**Files:**
- Create: `components/ui/page-header.tsx`
- Create: `components/ui/page-header.test.tsx`

**Interfaces:**
- Produces (cross-phase contract — do not rename):
  ```ts
  export interface PageHeaderProps {
    eyebrow?: React.ReactNode;
    title: string;
    meta?: React.ReactNode;
    metaOnMobile?: boolean;
    actions?: React.ReactNode;
    mobileAction?: React.ReactNode;
    trailing?: React.ReactNode;
  }
  export function PageHeader(props: PageHeaderProps): React.JSX.Element
  ```
  Server Component (no `"use client"`). Implements AUDIT.md §1.

- [ ] **Step 1: Write the failing test**

`components/ui/page-header.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PageHeader } from "./page-header";

describe("PageHeader (AUDIT.md §1)", () => {
  it("renders the title as the only heading, an h1, with the eyebrow above it", () => {
    render(<PageHeader eyebrow="Christmas in Europe" title="Money" />);
    const h1 = screen.getByRole("heading", { level: 1, name: "Money" });
    expect(screen.getAllByRole("heading")).toHaveLength(1);
    for (const c of ["font-display", "font-extrabold", "text-[32px]", "md:text-[40px]", "tracking-[-0.02em]"]) {
      expect(h1.className.split(/\s+/)).toContain(c);
    }
    const eyebrow = screen.getByText("Christmas in Europe");
    expect(eyebrow.tagName).toBe("P");
    expect(eyebrow.compareDocumentPosition(h1) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("hides the meta line on phones unless metaOnMobile", () => {
    const { rerender } = render(<PageHeader title="Files" meta="3 files" />);
    expect(screen.getByText("3 files").className.split(/\s+/)).toEqual(expect.arrayContaining(["hidden", "md:block"]));
    rerender(<PageHeader title="Files" meta="3 files" metaOnMobile />);
    expect(screen.getByText("3 files").className.split(/\s+/)).not.toContain("hidden");
  });

  it("puts actions in an md+ cluster and the mobile action in a phone-only slot", () => {
    render(
      <PageHeader
        title="Money"
        actions={<button type="button">Add a cost</button>}
        mobileAction={<button type="button" aria-label="Add a cost (phone)" />}
      />,
    );
    const desktop = screen.getByRole("button", { name: "Add a cost" }).closest("[data-slot='page-header-actions']")!;
    expect(desktop.className.split(/\s+/)).toEqual(expect.arrayContaining(["hidden", "md:flex"]));
    const phone = screen.getByRole("button", { name: "Add a cost (phone)" }).closest("[data-slot='page-header-mobile-action']")!;
    expect(phone.className.split(/\s+/)).toContain("md:hidden");
  });

  it("renders trailing once, at every width, before the actions", () => {
    render(
      <PageHeader title="Money" trailing={<span data-testid="bell" />} actions={<button type="button">Add</button>} />,
    );
    expect(screen.getAllByTestId("bell")).toHaveLength(1);
    const bell = screen.getByTestId("bell");
    expect(bell.closest("[data-slot='page-header-actions']")).toBeNull();
    expect(bell.compareDocumentPosition(screen.getByRole("button", { name: "Add" })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("renders no empty slots", () => {
    const { container } = render(<PageHeader title="More" />);
    expect(container.querySelector("[data-slot='page-header-side']")).toBeNull();
    expect(container.querySelectorAll("p")).toHaveLength(0);
  });

  it("uses no soft-style classes", () => {
    const { container } = render(<PageHeader eyebrow="Trip" title="X" meta="m" actions={<span />} trailing={<span />} />);
    expect(container.innerHTML).not.toMatch(/shadow-soft|border-border\/70|bg-card\/40/);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npm test -- components/ui/page-header.test.tsx`
Expected: FAIL — `./page-header` does not resolve.

- [ ] **Step 3: Implement**

`components/ui/page-header.tsx`:

```tsx
import * as React from "react";
import { cn } from "@/lib/cn";

export interface PageHeaderProps {
  /** The trip name on trip pages; omit on account-level pages. */
  eyebrow?: React.ReactNode;
  title: string;
  /** One line; hidden below md unless `metaOnMobile`. */
  meta?: React.ReactNode;
  metaOnMobile?: boolean;
  /** md+ pills, outline first and the ink primary last. */
  actions?: React.ReactNode;
  /** Below md, the single 44px round ink button that replaces `actions`. */
  mobileAction?: React.ReactNode;
  /** The layout-provided cluster (bell, fork switcher) — every width, before the actions. */
  trailing?: React.ReactNode;
}

/**
 * The page's own header and its only h1 (AUDIT.md §1). On a trip page the
 * trip layout hides its header on this route (TripHeaderFrame +
 * isPageHeaderPath), so the eyebrow carries the trip name instead.
 */
export function PageHeader({ eyebrow, title, meta, metaOnMobile, actions, mobileAction, trailing }: PageHeaderProps) {
  const hasSide = Boolean(trailing || actions || mobileAction);
  return (
    <header data-slot="page-header" className="flex items-start gap-4 md:items-end">
      <div className="flex min-w-0 flex-1 flex-col">
        {eyebrow ? <p className="text-sm font-medium text-muted-foreground md:text-[15px]">{eyebrow}</p> : null}
        <h1 className="mt-0.5 break-words font-display text-[32px] font-extrabold leading-[1.05] tracking-[-0.02em] text-foreground md:text-[40px]">
          {title}
        </h1>
        {meta ? (
          <p className={cn("mt-1.5 text-[15px] font-semibold text-foreground/80", !metaOnMobile && "hidden md:block")}>{meta}</p>
        ) : null}
      </div>
      {hasSide ? (
        <div data-slot="page-header-side" className="flex shrink-0 items-center gap-2.5">
          {trailing}
          {actions ? (
            <div data-slot="page-header-actions" className="hidden items-center gap-2.5 md:flex">
              {actions}
            </div>
          ) : null}
          {mobileAction ? (
            <div data-slot="page-header-mobile-action" className="md:hidden">
              {mobileAction}
            </div>
          ) : null}
        </div>
      ) : null}
    </header>
  );
}
```

- [ ] **Step 4: Run the test**

Run: `npm test -- components/ui/page-header.test.tsx`
Expected: PASS.

- [ ] **Step 5: Gates and commit**

```bash
npx tsc --noEmit && npm run lint
git add components/ui/page-header.tsx components/ui/page-header.test.tsx
git commit -m "feat(ui): PageHeader — eyebrow, h1, meta, actions and a trailing slot (AUDIT §1)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Gg6xb4nJAsiAx7oToWgpT8"
```

---

### Task 5: Hide the layout header on PageHeader routes; `TripHeaderTrailing`

Read `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/layout.md` before editing the layout.

**Files:**
- Modify: `components/shell/app-paths.ts`, `components/shell/app-paths.test.ts`
- Modify: `components/trip/trip-header-frame.tsx`, `components/trip/trip-header-frame.test.tsx`
- Modify: `lib/trip-shell-reads.ts`, `lib/trip-shell-reads.test.ts`
- Modify: `app/(app)/trips/[tripId]/layout.tsx` (use `readForks`), `app/(app)/trips/[tripId]/layout.test.tsx` (mock stays `@/server/actions/forks`, which `readForks` delegates to — confirm it still passes)
- Create: `components/trip/trip-header-trailing.tsx`, `components/trip/trip-header-trailing.test.tsx`

**Interfaces:**
- Produces (cross-phase contract):
  - `export const PAGE_HEADER_ROUTES: readonly string[]` — trip sub-route segments whose page renders `PageHeader`. Starts **empty** here; Task 6 and Task 14 (and later phases) append.
  - `export function isPageHeaderPath(path: string | null, routes: readonly string[] = PAGE_HEADER_ROUTES): boolean` — true for exactly `/trips/:ref/<segment>` (trailing slash allowed), never deeper.
  - `export const readForks: (tripId: string) => Promise<ForkListItem[]>` (React `cache` over `listForks`).
  - `export async function TripHeaderTrailing({ tripId, slug }: { tripId: string; slug: string })` — renders `[data-slot="trip-header-trailing"]`: the compact trip-switcher pill (`hidden md:flex xl:hidden`, as the layout header had it), the `ForkSwitcher` exactly when the layout shows it (`forksEnabled` and phase not travelling/past), and the `NotificationBell`. `null` when the trip is gone. (`slug` is part of the contract; this component does not need it — destructure only `tripId`.)
- Consumes: `readTripShell`, `readUnreadActivityCount`, `readRecentActivity` (`@/lib/trip-shell-reads`), `tripTodayISO` (`@/lib/trip-today`), `computeTripPhase` (`@/lib/trip-phase`), `ForkSwitcher` (`@/components/trip/fork-switcher`), `NotificationBell` (`@/components/trip/notification-bell`), `TripSwitcherFromContext` (`@/components/shell/trip-switcher`).

- [ ] **Step 1: Write the failing tests**

Append to `components/shell/app-paths.test.ts` (add `isPageHeaderPath` to the import):

```ts
describe("isPageHeaderPath", () => {
  const routes = ["budget", "files"];
  it.each([
    ["/trips/t1/budget", true],
    ["/trips/christmas-in-europe-2026/budget/", true],
    ["/trips/t1/files", true],
    ["/trips/t1/files/x", false],
    ["/trips/t1/plan", false],
    ["/trips/t1/settings", false],
    ["/trips/t1", false],
    ["/trips/t1/day/2026-12-12", false],
    ["/trips/new", false],
    [null, false],
  ] as const)("%s → %s", (path, expected) => {
    expect(isPageHeaderPath(path, routes)).toBe(expected);
  });
  it("defaults to the shared route list", () => {
    expect(isPageHeaderPath("/trips/t1/plan")).toBe(false);
  });
});
```

In `components/trip/trip-header-frame.test.tsx`, add a mock of app-paths' list so the frame can be tested before any route is registered — replace the file's `vi.mock("next/navigation", …)` block with:

```tsx
vi.mock("next/navigation", () => ({ usePathname: () => pathname.current }));
vi.mock("@/components/shell/app-paths", async (orig) => {
  const actual = await orig<typeof import("@/components/shell/app-paths")>();
  return { ...actual, PAGE_HEADER_ROUTES: ["budget"], isPageHeaderPath: (p: string | null) => actual.isPageHeaderPath(p, ["budget"]) };
});
```

and add to the `it.each` table: `["/trips/t1/budget", "hidden"]`, `["/trips/t1/budget/", "hidden"]`, and a test:

```tsx
  it("marks a PageHeader route with data-trip-page-header", () => {
    pathname.current = "/trips/t1/budget";
    render(<TripHeaderFrame>h</TripHeaderFrame>);
    expect(screen.getByText("h")).toHaveAttribute("data-trip-page-header");
    expect(screen.getByText("h")).toHaveAttribute("data-trip-header");
  });
```

In `lib/trip-shell-reads.test.ts`, add a forks mock next to the activity mock and a test:

```ts
const listForks = vi.fn(async (..._args: unknown[]) => [{ id: "f1", name: "B", sortOrder: 0 }]);
vi.mock("@/server/actions/forks", () => ({ listForks: (...a: unknown[]) => listForks(...a) }));
```

```ts
  it("readForks delegates to listForks", async () => {
    expect(await readForks("t1")).toEqual([{ id: "f1", name: "B", sortOrder: 0 }]);
    expect(listForks).toHaveBeenCalledWith("t1");
  });
```

(import `readForks` in the existing import line). Also extend the structural `it.each` lists in that file with `["components/trip/trip-header-trailing.tsx", path.resolve(__dirname, "..", "components", "trip", "trip-header-trailing.tsx")]` in both blocks (it must use the cached reads and never `db.trip.findUnique`).

`components/trip/trip-header-trailing.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const shell = vi.hoisted(() => ({ current: null as null | Record<string, unknown> }));
const today = vi.hoisted(() => ({ current: "2026-10-10" }));
vi.mock("@/lib/trip-shell-reads", () => ({
  readTripShell: vi.fn(async () => shell.current),
  readUnreadActivityCount: vi.fn(async () => 2),
  readRecentActivity: vi.fn(async () => []),
  readForks: vi.fn(async () => [{ id: "f1", name: "B", sortOrder: 0 }]),
}));
vi.mock("@/lib/trip-today", () => ({ tripTodayISO: () => today.current }));
vi.mock("@/components/trip/fork-switcher", () => ({
  ForkSwitcher: ({ forks }: { forks: unknown[] }) => <div data-testid="fork-switcher" data-count={forks.length} />,
}));
vi.mock("@/components/trip/notification-bell", () => ({
  NotificationBell: ({ unreadCount }: { unreadCount: number }) => <div data-testid="bell" data-unread={unreadCount} />,
}));
vi.mock("@/components/shell/trip-switcher", () => ({
  TripSwitcherFromContext: ({ variant }: { variant: string }) => <div data-testid={`switcher-${variant}`} />,
}));

import { TripHeaderTrailing } from "./trip-header-trailing";
import { readForks } from "@/lib/trip-shell-reads";

const TRIP = { id: "t1", name: "EU", startDate: "2026-12-04", endDate: "2027-01-08", homeCurrency: "AUD", forksEnabled: true, members: [], stops: [] };

beforeEach(() => {
  vi.clearAllMocks();
  shell.current = TRIP;
  today.current = "2026-10-10";
});

async function renderIt() {
  const el = await TripHeaderTrailing({ tripId: "t1", slug: "eu" });
  if (el) render(el);
  return el;
}

describe("TripHeaderTrailing", () => {
  it("renders the switcher pill (768–1279 only), the fork switcher and the bell", async () => {
    await renderIt();
    const pill = screen.getByTestId("switcher-pill").parentElement!;
    for (const c of ["hidden", "md:flex", "xl:hidden"]) expect(pill.className.split(/\s+/)).toContain(c);
    expect(screen.getByTestId("fork-switcher")).toHaveAttribute("data-count", "1");
    expect(screen.getByTestId("bell")).toHaveAttribute("data-unread", "2");
  });

  it("drops the fork switcher when plan variants are off, without listing forks", async () => {
    shell.current = { ...TRIP, forksEnabled: false };
    await renderIt();
    expect(screen.queryByTestId("fork-switcher")).toBeNull();
    expect(readForks).not.toHaveBeenCalled();
  });

  it("drops the fork switcher while travelling and once past", async () => {
    today.current = "2026-12-10";
    await renderIt();
    expect(screen.queryByTestId("fork-switcher")).toBeNull();
  });

  it("renders nothing for a missing trip", async () => {
    shell.current = null;
    expect(await renderIt()).toBeNull();
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm test -- components/shell/app-paths.test.ts components/trip/trip-header-frame.test.tsx lib/trip-shell-reads.test.ts components/trip/trip-header-trailing.test.tsx`
Expected: FAIL (missing exports / module).

- [ ] **Step 3: Implement**

`components/shell/app-paths.ts` — append:

```ts
/**
 * Trip sub-routes whose page renders its own PageHeader (AUDIT.md §1), so
 * TripHeaderFrame hides the layout's trip header there at every width, the
 * way it does for the Day view. Each migration adds its segment here.
 */
export const PAGE_HEADER_ROUTES: readonly string[] = [];

/** Exactly /trips/:ref/<segment> for a listed segment — not deeper. */
export function isPageHeaderPath(path: string | null, routes: readonly string[] = PAGE_HEADER_ROUTES): boolean {
  if (!isTripPath(path)) return false;
  const seg = path!.replace(/\/+$/, "").split("/");
  return seg.length === 4 && routes.includes(seg[3]);
}
```

`components/trip/trip-header-frame.tsx` — import `isPageHeaderPath`; compute `const isPageHeader = isPageHeaderPath(pathname);`; add `data-trip-page-header={isPageHeader ? "" : undefined}`; the class becomes `cn("pb-4 pt-2", hideAtLg && "lg:hidden", (isDay || isPageHeader) && "hidden")`. Extend the doc comment with one sentence: "Routes in PAGE_HEADER_ROUTES render PageHeader, which carries the h1, the trip name as eyebrow, and the bell and fork switcher (TripHeaderTrailing) — so it is hidden there at every width too."

`lib/trip-shell-reads.ts` — add `import { listForks } from "@/server/actions/forks";` and:

```ts
export const readForks = cache((tripId: string) => listForks(tripId));
```

`app/(app)/trips/[tripId]/layout.tsx` — replace `listForks(tripId)` with `readForks(tripId)` (import from `@/lib/trip-shell-reads`; drop the `@/server/actions/forks` import).

`components/trip/trip-header-trailing.tsx`:

```tsx
import { readTripShell, readUnreadActivityCount, readRecentActivity, readForks } from "@/lib/trip-shell-reads";
import { tripTodayISO } from "@/lib/trip-today";
import { computeTripPhase } from "@/lib/trip-phase";
import { ForkSwitcher } from "@/components/trip/fork-switcher";
import { NotificationBell } from "@/components/trip/notification-bell";
import { TripSwitcherFromContext } from "@/components/shell/trip-switcher";

/**
 * What the trip layout's header carried beside the name, for PageHeader's
 * trailing slot (spec §A): the compact switcher pill (768–1279px; the sidebar
 * card takes over from xl), the fork switcher exactly when the layout shows
 * it, and the bell. Reads are request-cached, so the layout's own copies are
 * free on a cold load.
 */
export async function TripHeaderTrailing({ tripId }: { tripId: string; slug: string }) {
  const trip = await readTripShell(tripId);
  if (!trip) return null;
  const phase = computeTripPhase({ startDate: trip.startDate, endDate: trip.endDate, today: tripTodayISO(trip.stops) });
  const showForkSwitcher = trip.forksEnabled && phase !== "travelling" && phase !== "past";
  const [unreadCount, recent, forks] = await Promise.all([
    readUnreadActivityCount(tripId),
    readRecentActivity(tripId, 10),
    showForkSwitcher ? readForks(tripId) : Promise.resolve([]),
  ]);
  return (
    <div data-slot="trip-header-trailing" className="flex items-center gap-2">
      <div className="hidden md:flex xl:hidden">
        <TripSwitcherFromContext tripId={tripId} fallbackName={trip.name} variant="pill" />
      </div>
      {showForkSwitcher ? <ForkSwitcher tripId={tripId} forks={forks} phase={phase} /> : null}
      <NotificationBell tripId={tripId} unreadCount={unreadCount} recent={recent} />
    </div>
  );
}
```

- [ ] **Step 4: Run the tests**

Run: `npm test -- components/shell components/trip/trip-header-frame.test.tsx components/trip/trip-header-trailing.test.tsx lib/trip-shell-reads.test.ts "app/(app)/trips/[tripId]/layout.test.tsx"`
Expected: PASS.

- [ ] **Step 5: Gates and commit**

```bash
npx tsc --noEmit && npm run lint
git add components/shell/app-paths.ts components/shell/app-paths.test.ts components/trip/trip-header-frame.tsx components/trip/trip-header-frame.test.tsx lib/trip-shell-reads.ts lib/trip-shell-reads.test.ts "app/(app)/trips/[tripId]/layout.tsx" components/trip/trip-header-trailing.tsx components/trip/trip-header-trailing.test.tsx
git commit -m "feat(trip): PageHeader routes hide the layout header; TripHeaderTrailing carries bell + fork switcher

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Gg6xb4nJAsiAx7oToWgpT8"
```

---

### Task 6: The mechanical swap — Files, Activity, Compare, Journal, More, Help

AUDIT.md §2 "Light touch" rows and §1 "Replace these hand-rolled classes". Help is included because spec §A names its "tops out at h2" test; it is a trip page under the same layout.

**Files:**
- Create: `lib/page-meta.ts`, `lib/page-meta.test.ts`
- Modify: `components/shell/app-paths.ts` (append `"files", "activity", "compare", "journal", "more", "help"` to `PAGE_HEADER_ROUTES`)
- Modify: `app/(app)/trips/[tripId]/files/page.tsx` + `page.test.tsx`
- Modify: `app/(app)/trips/[tripId]/activity/page.tsx`; Create: `app/(app)/trips/[tripId]/activity/page.test.tsx`
- Modify: `app/(app)/trips/[tripId]/compare/page.tsx` + `page.test.tsx`
- Modify: `app/(app)/trips/[tripId]/journal/page.tsx` + `page.test.tsx`
- Modify: `app/(app)/trips/[tripId]/more/page.tsx` + `page.test.tsx`
- Modify: `app/(app)/trips/[tripId]/help/page.tsx` + `page.test.tsx`
- Modify: `app/(app)/trips/[tripId]/layout.test.tsx`

**Interfaces:**
- Consumes: `PageHeader` (Task 4), `TripHeaderTrailing` (Task 5), `readTripShell` (`@/lib/trip-shell-reads`), `tripSlugFor` (`@/lib/trip-slug-read`).
- Produces: `filesMeta(n: number): string | null` ("1 file", "3 files", null at 0); `activityMeta(n: number, cap?: number): string` ("No changes yet", "1 change", "42 changes", "Last 100 changes" at the cap of 100); `comparePlansMeta(n: number): string | null` ("3 plans"; null below 2). Deletes `FILES_TITLE_CLASS` and `COMPARE_TITLE_CLASS` (`CHECKLISTS_TITLE_CLASS` belongs to Phase 3's Checklists migration — leave it). `FILES_SECTION_HEADER_CLASS` and `JOURNAL_READING_WIDTH_CLASS` stay.

Every page follows the same pattern — load `readTripShell(tripId)` and `tripSlugFor(tripId)` in parallel after the access guard, and render the header as the first child **on every branch, empty states included** (the layout's h1 is gone on these routes):

```tsx
<PageHeader
  eyebrow={shell?.name}
  title="Files"
  meta={filesMeta(rows.length)}
  metaOnMobile
  trailing={<TripHeaderTrailing tripId={tripId} slug={slug} />}
/>
```

- [ ] **Step 1: Write the failing tests**

`lib/page-meta.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { filesMeta, activityMeta, comparePlansMeta } from "./page-meta";

describe("page meta lines (AUDIT.md §2)", () => {
  it("files", () => {
    expect(filesMeta(0)).toBeNull();
    expect(filesMeta(1)).toBe("1 file");
    expect(filesMeta(3)).toBe("3 files");
  });
  it("activity says when it is showing only the last 100", () => {
    expect(activityMeta(0)).toBe("No changes yet");
    expect(activityMeta(1)).toBe("1 change");
    expect(activityMeta(42)).toBe("42 changes");
    expect(activityMeta(100)).toBe("Last 100 changes");
  });
  it("compare counts plans, real plan included", () => {
    expect(comparePlansMeta(1)).toBeNull();
    expect(comparePlansMeta(3)).toBe("3 plans");
  });
});
```

For each page test, add these mocks (next to the existing ones) so the header renders without a DB or async children:

```tsx
vi.mock("@/lib/trip-shell-reads", () => ({ readTripShell: vi.fn(async () => ({ name: "Christmas in Europe", members: [] })) }));
vi.mock("@/components/trip/trip-header-trailing", () => ({ TripHeaderTrailing: () => <div data-testid="trip-header-trailing" /> }));
```

(and `vi.mock("@/lib/trip-slug-read", () => ({ tripSlugFor: async (id: string) => id }))` where the file doesn't already have it).

- `files/page.test.tsx`: delete the `FILES_TITLE_CLASS` test and its import; change the empty-state test's heading assertion to `screen.getByRole("heading", { level: 1, name: "Files" })`; add
  ```tsx
  it("carries the trip name as eyebrow and the bell cluster", async () => {
    render(await FilesPage({ params: Promise.resolve({ tripId: "t1" }) }));
    expect(screen.getByText("Christmas in Europe")).toBeInTheDocument();
    expect(screen.getByTestId("trip-header-trailing")).toBeInTheDocument();
  });
  ```
- `compare/page.test.tsx`: delete the `COMPARE_TITLE_CLASS` test and import; the empty-state test asserts `screen.getByRole("heading", { level: 1, name: "Compare plans" })`; the with-forks test also asserts `screen.getByText("2 plans")`.
- `activity/page.test.tsx` (new):
  ```tsx
  import { describe, it, expect, vi } from "vitest";
  import { render, screen } from "@testing-library/react";

  const findMany = vi.hoisted(() => vi.fn(async () => [] as unknown[]));
  vi.mock("@/lib/db", () => ({ db: { activity: { findMany } } }));
  vi.mock("@/lib/guards", () => ({ requireTripAccess: vi.fn() }));
  vi.mock("@/lib/trip-slug-read", () => ({ tripSlugFor: async (id: string) => id }));
  vi.mock("@/lib/trip-shell-reads", () => ({ readTripShell: vi.fn(async () => ({ name: "Christmas in Europe", members: [] })) }));
  vi.mock("@/components/trip/trip-header-trailing", () => ({ TripHeaderTrailing: () => <div data-testid="trip-header-trailing" /> }));
  vi.mock("@/components/trip/activity-feed", () => ({ ActivityFeed: () => <div data-testid="feed" /> }));
  vi.mock("@/components/trip/mark-read-on-view", () => ({ MarkReadOnView: () => null }));

  const { default: ActivityPage } = await import("./page");

  describe("Activity page header", () => {
    it("is the page h1 with the trip eyebrow and a capped count", async () => {
      findMany.mockResolvedValueOnce(Array.from({ length: 100 }, (_, i) => ({ id: String(i) })));
      render(await ActivityPage({ params: Promise.resolve({ tripId: "t1" }) }));
      expect(screen.getByRole("heading", { level: 1, name: "Activity" })).toBeInTheDocument();
      expect(screen.getByText("Christmas in Europe")).toBeInTheDocument();
      expect(screen.getByText("Last 100 changes")).toBeInTheDocument();
      expect(screen.getByTestId("trip-header-trailing")).toBeInTheDocument();
    });
  });
  ```
- `journal/page.test.tsx`: add a test that the populated page has `heading level 1 "Journal"` and the "{n} entries · {n} photos" meta, and that both empty states ("Opens on day 1 — …" and "No journal entries yet") also render the level-1 "Journal" heading. Existing level-3 date-heading assertions stay.
- `more/page.test.tsx`: replace "tops out at <h2>…" with
  ```tsx
  it("renders its own h1 (PageHeader) with the trip name as eyebrow", async () => {
    await renderPage();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("More");
    expect(screen.getByText("Christmas in Europe")).toBeInTheDocument();
  });
  ```
- `help/page.test.tsx`: replace "tops out at <h2>…" with the same shape for "How to use Teepee"; change "drops the guide's outline one level so it nests under this page's h2" to expect `data-level` `"2"` ("…nests under this page's h1"); change "styles its h2 as the kit display title" to target `{ level: 1 }`.
- `layout.test.tsx`: in the `it.each(["/trips/trip-1/plan", "/trips/trip-1/calendar", "/trips/trip-1/more"])` "keeps the trip header" table replace `/more` with `/trips/trip-1/settings`, and add
  ```tsx
  it.each(["files", "activity", "compare", "journal", "more", "help"])(
    "hides the trip header at every width on the PageHeader route /%s",
    async (seg) => {
      mockUsePathname.mockReturnValue(`/trips/trip-1/${seg}`);
      await renderLayout();
      expect(document.querySelector("[data-trip-header]")!.className.split(/\s+/)).toContain("hidden");
    },
  );
  ```

- [ ] **Step 2: Run them to see them fail**

Run: `npm test -- lib/page-meta.test.ts "app/(app)/trips/[tripId]"`
Expected: FAIL (no `page-meta`, headings still h2, layout still shows the header on these routes).

- [ ] **Step 3: Implement**

`lib/page-meta.ts`:

```ts
export function filesMeta(n: number): string | null {
  return n === 0 ? null : n === 1 ? "1 file" : `${n} files`;
}

/** The Activity page reads the newest 100 only, so at the cap it says so. */
export function activityMeta(n: number, cap = 100): string {
  if (n === 0) return "No changes yet";
  if (n >= cap) return `Last ${cap} changes`;
  return n === 1 ? "1 change" : `${n} changes`;
}

export function comparePlansMeta(n: number): string | null {
  return n < 2 ? null : `${n} plans`;
}
```

Pages (delete each hand-rolled `<h2>` block and its wrapping `div`, the class constants and the `<h2>` comments):
- **Files:** header as above, `meta={filesMeta(rows.length)}`.
- **Activity:** `meta={activityMeta(activities.length)}` with `metaOnMobile`; drop the "N events" line.
- **Compare:** both branches render `<PageHeader eyebrow={shell?.name} title="Compare plans" meta={comparePlansMeta(plans.length)} metaOnMobile trailing={…} />`. The `redirect` stays before any render. `tripSlugFor` is already imported.
- **Journal:** all three returns render the header; the populated branch's `meta` is the existing `photoCount ? \`${entryCount} · ${photoCount}\` : entryCount` with `metaOnMobile`; the two empty-state branches pass no meta. Wrap each empty-state return as `<div className="flex flex-col gap-6">{header}<EmptyState … /></div>` (build `header` once as a const after `slug`/`shell` are known; the "Opens on day 1" branch returns before the entry queries, so load `shell` alongside `slug` at the top).
- **More:** `<PageHeader eyebrow={shell?.name} title="More" trailing={…} />`; delete the "<h2>: the trip layout already renders…" comment.
- **Help:** `<PageHeader eyebrow={shell?.name} title="How to use Teepee" meta="Everything you need, shortest bits first. The links jump straight to the right screen in this trip." metaOnMobile trailing={…} />`; `HelpGuide` gets `level={2}`; delete the old heading block and comment.
- **app-paths:** `export const PAGE_HEADER_ROUTES: readonly string[] = ["files", "activity", "compare", "journal", "more", "help"];`

Finish with `grep -rn "FILES_TITLE_CLASS\|COMPARE_TITLE_CLASS\|tops out at" app components` — only `CHECKLISTS_TITLE_CLASS` (Phase 3) may remain.

- [ ] **Step 4: Run the tests**

Run: `npm test -- lib/page-meta.test.ts "app/(app)/trips/[tripId]" components/shell components/trip/trip-header-frame.test.tsx lib/help-guide.test.ts`
Expected: PASS.

- [ ] **Step 5: Gates and commit**

```bash
npx tsc --noEmit && npm run lint
git add lib/page-meta.ts lib/page-meta.test.ts components/shell/app-paths.ts "app/(app)/trips/[tripId]/files" "app/(app)/trips/[tripId]/activity" "app/(app)/trips/[tripId]/compare" "app/(app)/trips/[tripId]/journal" "app/(app)/trips/[tripId]/more" "app/(app)/trips/[tripId]/help" "app/(app)/trips/[tripId]/layout.test.tsx"
git commit -m "feat(trip): Files, Activity, Compare, Journal, More and Help render PageHeader (AUDIT §2)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Gg6xb4nJAsiAx7oToWgpT8"
```

---

### Task 7: The sidebar's Money count

Spec §B2: unpaid costs overdue or due within 14 days; hidden at 0; real plan only.

**Files:**
- Create: `lib/money-due-count.ts`, `lib/money-due-count.test.ts`
- Modify: `components/shell/sidebar-nav-counts.tsx`, `components/shell/sidebar-nav-counts.test.tsx`
- Modify: `components/shell/sidebar-nav.tsx` (`SidebarNavCounts.Money`, and the row's count lookup)
- Modify: `components/shell/sidebar-nav.test.tsx`
- Modify: `app/(app)/trips/[tripId]/layout.test.tsx` (the `RailTripPublisher` mock also reports `data-has-money-count`; the "publishes Suspense-wrapped … counts" test asserts it is `"yes"`)

**Interfaces:**
- Consumes: `readTripShell` (`@/lib/trip-shell-reads`), `tripTodayISO` (`@/lib/trip-today`), `addDays` (`@/lib/dates`), `REAL_PLAN` (`@/lib/plan-scope`), `requireTripAccess`, `db.cost.count`.
- Produces: `MONEY_DUE_WINDOW_DAYS = 14`; `loadMoneyDueCount: (tripId: string) => Promise<number>` (React `cache`); `MoneyCount({ tripId }): Promise<JSX.Element | null>`; `SidebarNavCounts` gains `Money?: ReactNode`; `sidebarNavCounts(tripId)` returns `{ Plan, Wishlist, Money }`.

- [ ] **Step 1: Write the failing tests**

`lib/money-due-count.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const count = vi.hoisted(() => vi.fn(async (..._a: unknown[]) => 3));
const shell = vi.hoisted(() => ({ current: { stops: [] } as null | { stops: unknown[] } }));
vi.mock("@/lib/db", () => ({ db: { cost: { count: (...a: unknown[]) => count(...a) } } }));
vi.mock("@/lib/guards", () => ({ requireTripAccess: vi.fn() }));
vi.mock("@/lib/trip-shell-reads", () => ({ readTripShell: vi.fn(async () => shell.current) }));
vi.mock("@/lib/trip-today", () => ({ tripTodayISO: () => "2026-10-10" }));

import { loadMoneyDueCount } from "./money-due-count";
import { requireTripAccess } from "@/lib/guards";

beforeEach(() => {
  vi.clearAllMocks();
  shell.current = { stops: [] };
});

describe("loadMoneyDueCount", () => {
  it("counts unpaid, dated real-plan costs due on or before today + 14 (overdue included)", async () => {
    expect(await loadMoneyDueCount("t1")).toBe(3);
    expect(requireTripAccess).toHaveBeenCalledWith("t1");
    expect(count).toHaveBeenCalledWith({
      where: { tripId: "t1", forkId: null, paidAt: null, dueDate: { not: null, lte: "2026-10-24" } },
    });
  });
  it("is 0 for a missing trip, without counting", async () => {
    shell.current = null;
    expect(await loadMoneyDueCount("t1")).toBe(0);
    expect(count).not.toHaveBeenCalled();
  });
});
```

In `components/shell/sidebar-nav-counts.test.tsx` add `const loadMoneyDueCountMock = vi.hoisted(() => vi.fn());` + `vi.mock("@/lib/money-due-count", () => ({ loadMoneyDueCount: loadMoneyDueCountMock }));`, import `MoneyCount`, and:

```tsx
describe("MoneyCount", () => {
  it("renders the due count when > 0", async () => {
    loadMoneyDueCountMock.mockResolvedValue(6);
    const el = (await MoneyCount({ tripId: "t1" })) as ReactElement<{ children: number }> | null;
    expect(el!.props.children).toBe(6);
    expect(loadMoneyDueCountMock).toHaveBeenCalledWith("t1");
  });
  it("renders nothing at 0", async () => {
    loadMoneyDueCountMock.mockResolvedValue(0);
    expect(await MoneyCount({ tripId: "t1" })).toBeNull();
  });
});
```

and in the `sidebarNavCounts` test also assert `counts.Money` is a `Suspense` whose child has `tripId "t1"`.

In `components/shell/sidebar-nav.test.tsx`:

```tsx
  it("shows the Money count beside Money", () => {
    mockUsePathname.mockReturnValue("/trips/t1/budget");
    render(<SidebarNav tripId="t1" counts={{ Money: <span>6</span> }} />);
    expect(screen.getByRole("link", { name: /Money/ })).toHaveTextContent("6");
  });
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm test -- lib/money-due-count.test.ts components/shell "app/(app)/trips/[tripId]/layout.test.tsx"`
Expected: FAIL.

- [ ] **Step 3: Implement**

`lib/money-due-count.ts`:

```ts
import { cache } from "react";
import { db } from "@/lib/db";
import { requireTripAccess } from "@/lib/guards";
import { REAL_PLAN } from "@/lib/plan-scope";
import { readTripShell } from "@/lib/trip-shell-reads";
import { tripTodayISO } from "@/lib/trip-today";
import { addDays } from "@/lib/dates";

export const MONEY_DUE_WINDOW_DAYS = 14;

/**
 * The sidebar's Money count (spec §B2): real-plan Costs not yet Paid whose Due
 * date is overdue or within 14 days of the Trip's own today. Due dates are
 * "YYYY-MM-DD" strings, so `lte` compares them in date order.
 */
export const loadMoneyDueCount = cache(async (tripId: string): Promise<number> => {
  await requireTripAccess(tripId);
  const trip = await readTripShell(tripId);
  if (!trip) return 0;
  const horizon = addDays(tripTodayISO(trip.stops), MONEY_DUE_WINDOW_DAYS);
  return db.cost.count({ where: { tripId, ...REAL_PLAN, paidAt: null, dueDate: { not: null, lte: horizon } } });
});
```

`components/shell/sidebar-nav-counts.tsx` — add `MoneyCount` (same shape as `PlanCount`, reading `loadMoneyDueCount`) and `Money: <Suspense fallback={null}><MoneyCount tripId={tripId} /></Suspense>` in `sidebarNavCounts`; update the doc comment to "Plan/Wishlist/Money".

`components/shell/sidebar-nav.tsx` — `SidebarNavCounts` gets `Money?: ReactNode;` (doc: "Money = costs due within 14 days"); the row's `count` becomes `item.label === "Plan" || item.label === "Wishlist" || item.label === "Money" ? counts?.[item.label] : undefined`.

- [ ] **Step 4: Run the tests**

Run: `npm test -- lib/money-due-count.test.ts components/shell "app/(app)/trips/[tripId]/layout.test.tsx"`
Expected: PASS.

- [ ] **Step 5: Gates and commit**

```bash
npx tsc --noEmit && npm run lint
git add lib/money-due-count.ts lib/money-due-count.test.ts components/shell/sidebar-nav-counts.tsx components/shell/sidebar-nav-counts.test.tsx components/shell/sidebar-nav.tsx components/shell/sidebar-nav.test.tsx "app/(app)/trips/[tripId]/layout.test.tsx"
git commit -m "feat(nav): Money count in the trip sidebar — costs due within 14 days

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Gg6xb4nJAsiAx7oToWgpT8"
```

---

### Task 8: Cost dialogs the Money page can open, and `PaidConfirm` on its own

The page no longer mounts `OtherCostEditor` (a whole list) or `CostChecklist`; it needs just their dialogs.

**Files:**
- Modify: `components/trip/other-cost-editor.tsx` (add `OtherCostFormDialog`)
- Modify: `components/trip/cost-editor.tsx` (hoist the form→input mapper to module level; add `OwnedCostFormDialog`)
- Create: `components/money/paid-confirm.tsx` (move `PaidConfirm` out of `cost-checklist.tsx`)
- Modify: `components/trip/cost-checklist.tsx` (import `PaidConfirm` from the new file; it is deleted in Task 14)
- Create: `components/money/cost-dialogs.test.tsx`
- Create: `components/money/paid-confirm.test.tsx`

**Interfaces:**
- Consumes: `createCost`, `updateCost`, `markCostPaid` (`@/server/actions/costs`), `CostRow` type.
- Produces:
  - `OtherCostFormDialog(props: { tripId: string; homeCurrency: string; cost?: CostRow | null; open: boolean; onOpenChange: (open: boolean) => void })` — create when `cost` is absent (title "Add a cost"), edit otherwise (title "Edit cost").
  - `OwnedCostFormDialog(props: { cost: CostRow; homeCurrency: string; open: boolean; onOpenChange: (open: boolean) => void })` — edits a TRANSPORT/ACCOMMODATION/ITEM cost via `updateCost` (title "Edit cost").
  - `interface PaidConfirmRow { id: string; label: string; costMinor: number; paidMinor: number | null; currency: string }`; `PaidConfirm(props: { row: PaidConfirmRow; onCancel: () => void; onDone: () => void })` — unchanged behaviour.

- [ ] **Step 1: Write the failing tests**

`components/money/cost-dialogs.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/server/actions/costs", () => ({
  createCost: vi.fn().mockResolvedValue({ success: true }),
  updateCost: vi.fn().mockResolvedValue({ success: true }),
  deleteCost: vi.fn().mockResolvedValue({ success: true }),
}));
import { createCost, updateCost } from "@/server/actions/costs";
import { OtherCostFormDialog } from "@/components/trip/other-cost-editor";
import { OwnedCostFormDialog } from "@/components/trip/cost-editor";
import type { CostRow } from "@/server/actions/costs";

const other: CostRow = {
  id: "cost-1", costMinor: 1250, paidMinor: null, currency: "AUD", rateToHome: 1, paidAt: null, dueDate: null,
  settlement: "BEFORE", ownerType: "OTHER", ownerId: null, label: "Travel insurance", category: "Insurance",
};
const owned: CostRow = { ...other, id: "cost-2", ownerType: "ACCOMMODATION", ownerId: "acc-1", label: null, category: null, costMinor: 50000 };

beforeEach(() => vi.clearAllMocks());

describe("OtherCostFormDialog", () => {
  it("creates an Other cost and closes", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<OtherCostFormDialog tripId="trip-1" homeCurrency="AUD" open onOpenChange={onOpenChange} />);
    expect(screen.getByRole("heading", { name: "Add a cost" })).toBeInTheDocument();
    await user.type(screen.getByPlaceholderText(/travel insurance/i), "eSIM");
    await user.type(screen.getByLabelText(/cost amount/i), "30");
    await user.click(screen.getByRole("button", { name: /save/i }));
    expect(createCost).toHaveBeenCalledWith("trip-1", expect.objectContaining({ costMinor: 3000, ownerType: "OTHER", label: "eSIM" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("edits an existing cost, prefilled", async () => {
    const user = userEvent.setup();
    render(<OtherCostFormDialog tripId="trip-1" homeCurrency="AUD" cost={other} open onOpenChange={() => {}} />);
    expect(screen.getByRole("heading", { name: "Edit cost" })).toBeInTheDocument();
    expect(screen.getByLabelText(/cost amount/i)).toHaveValue("12.50");
    await user.click(screen.getByRole("button", { name: /save/i }));
    expect(updateCost).toHaveBeenCalledWith("cost-1", expect.objectContaining({ costMinor: 1250, ownerType: "OTHER" }));
  });

  it("refuses a blank amount without calling the server", async () => {
    const user = userEvent.setup();
    render(<OtherCostFormDialog tripId="trip-1" homeCurrency="AUD" open onOpenChange={() => {}} />);
    await user.type(screen.getByPlaceholderText(/travel insurance/i), "eSIM");
    await user.click(screen.getByRole("button", { name: /save/i }));
    expect(createCost).not.toHaveBeenCalled();
    expect(await screen.findByText("Enter the cost")).toBeInTheDocument();
  });
});

describe("OwnedCostFormDialog", () => {
  it("edits the cost on its owner, keeping owner type and id", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<OwnedCostFormDialog cost={owned} homeCurrency="AUD" open onOpenChange={onOpenChange} />);
    expect(screen.getByLabelText(/cost amount/i)).toHaveValue("500.00");
    await user.click(screen.getByRole("button", { name: /save/i }));
    expect(updateCost).toHaveBeenCalledWith("cost-2", expect.objectContaining({ costMinor: 50000, ownerType: "ACCOMMODATION", ownerId: "acc-1" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
```

`components/money/paid-confirm.test.tsx` — port these cases from `components/trip/cost-checklist.test.tsx` verbatim in intent, rendering `<PaidConfirm row={…} onCancel={…} onDone={…} />` directly (same `@/server/actions/costs` and `@/components/ui/use-toast` mocks as that file): "asks how much, prefilled with the cost", "marks paid on confirm", "refuses to confirm an unparseable amount, and never calls markCostPaid", "confirms a genuine zero paid amount", "refuses to submit an empty date", "clears submitting and shows a destructive toast when marking paid throws", "locks the confirm to the row's currency instead of offering a picker", "prefills the preserved paid amount over the cost amount", "surfaces a server amount field error on the field", "surfaces a server date field error on the field", "falls back to a generic toast when the server fails without field errors", "prefills Date paid with the device-local today". Each must `expect` the same calls/strings as its original.

- [ ] **Step 2: Run them to see them fail**

Run: `npm test -- components/money`
Expected: FAIL (exports missing).

- [ ] **Step 3: Implement**

`components/trip/other-cost-editor.tsx` — add below `OtherCostDialog`:

```tsx
export interface OtherCostFormDialogProps {
  tripId: string;
  homeCurrency: string;
  /** Edit this cost; omit to create one. */
  cost?: CostRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** The Other-cost form on its own, for Money's + Add a cost and a To pay row's Edit. */
export function OtherCostFormDialog({ tripId, homeCurrency, cost, open, onOpenChange }: OtherCostFormDialogProps) {
  const [submitting, setSubmitting] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string[]>>({});

  async function handleSubmit(form: FormState) {
    const input = parseFormToInput(form);
    if (!input) {
      setErrors({ costMinor: ["Enter the cost"] });
      return;
    }
    setSubmitting(true);
    setErrors({});
    try {
      const result = cost ? await updateCost(cost.id, input) : await createCost(tripId, input);
      if (result.success) onOpenChange(false);
      else setErrors(result.errors);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <OtherCostDialog
      key={open ? (cost?.id ?? "add") : "closed"}
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setErrors({});
          onOpenChange(false);
        }
      }}
      title={cost ? "Edit cost" : "Add a cost"}
      onSubmit={handleSubmit}
      initialState={cost ? costToFormState(cost) : defaultFormState(homeCurrency)}
      submitting={submitting}
      errors={errors}
      onCancel={() => onOpenChange(false)}
    />
  );
}
```

`components/trip/cost-editor.tsx` — move `parseFormToInput` out of `CostEditor` to module level as `function parseOwnedFormToInput(form: FormState, ownerType: Exclude<CostOwnerType, "OTHER">, ownerId: string): CostRawInput | null` (body unchanged, reading the two new params instead of the closure), call it from `CostEditor` with its props, and add `OwnedCostFormDialog` built exactly like `OtherCostFormDialog` above but with `CostDialogForm`, `costToFormState(cost)`, `updateCost(cost.id, input)` only, `title="Edit cost"` and `parseOwnedFormToInput(form, cost.ownerType as Exclude<CostOwnerType, "OTHER">, cost.ownerId!)`. Its doc comment: "Edits a cost attached to a Transport, Accommodation or Item from outside its card (Money's To pay ⋯ menu). Callers only offer it when `ownerId` is set."

`components/money/paid-confirm.tsx` — `"use client"`; move `PaidConfirm` from `cost-checklist.tsx` unchanged, typed on the new `PaidConfirmRow` (the four fields it reads plus `id`, `label`), with its imports (`Button`, `Input`, `Field`, `formatMinor`, `parseAmountToMinor`, `todayLocalISO`, `markCostPaid`, `toast`). Keep its comments. In `cost-checklist.tsx`, delete the local copy and `import { PaidConfirm } from "@/components/money/paid-confirm";` so its tests keep passing until Task 14.

- [ ] **Step 4: Run the tests**

Run: `npm test -- components/money components/trip/cost-checklist.test.tsx components/trip/cost-editor.test.tsx components/trip/other-cost-editor.test.tsx`
Expected: PASS.

- [ ] **Step 5: Gates and commit**

```bash
npx tsc --noEmit && npm run lint
git add components/trip/other-cost-editor.tsx components/trip/cost-editor.tsx components/trip/cost-checklist.tsx components/money
git commit -m "refactor(costs): standalone cost dialogs and PaidConfirm for the Money page

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Gg6xb4nJAsiAx7oToWgpT8"
```

---

### Task 9: The Cost tile and paid bar

MONEY.md §3. Static here; M2/M3/M4 motion is Task 15.

**Files:**
- Modify: `app/globals.css` (add `@utility bg-unpaid-stripe` beside the other `@utility` blocks)
- Create: `app/globals.money.test.ts`
- Create: `components/money/paid-bar.tsx` (`"use client"`)
- Create: `components/money/cost-tile.tsx` (Server)
- Create: `components/money/cost-tile.test.tsx`

**Interfaces:**
- Consumes: `formatMoney`, `formatMoneyParts`, `formatMoneyWhole`, `paidPct`, `perNightMinor`, `perPersonMinor`, `BudgetTotals` type.
- Produces:
  - Tailwind utility `bg-unpaid-stripe` (cross-phase contract).
  - `PaidBar(props: { paidMinor: number; totalMinor: number; currency: string; tripId: string; className?: string })`
  - `CostTile(props: { tripId: string; homeCurrency: string; totals: BudgetTotals; paidSoFarMinor: number; nights: number; memberCount: number; showPaid: boolean; className?: string })`

- [ ] **Step 1: Write the failing tests**

`app/globals.money.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const css = readFileSync(path.resolve(__dirname, "globals.css"), "utf8");

describe("globals.css Money utilities (MONEY.md §1)", () => {
  it("defines bg-unpaid-stripe as a card / teal-12% repeating stripe, from tokens", () => {
    const block = css.match(/@utility bg-unpaid-stripe\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(block).toContain("repeating-linear-gradient");
    expect(block).toContain("hsl(var(--card))");
    expect(block).toContain("hsl(var(--teal) / 0.12)");
    expect(block).not.toMatch(/#[0-9a-fA-F]{3,8}/);
  });
});
```

`components/money/cost-tile.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { CostTile } from "./cost-tile";

const totals = {
  costTotalMinor: 1482040,
  paidTotalMinor: 934000,
  beforeTotalMinor: 1120000,
  onTripTotalMinor: 362040,
  beforePaidMinor: 934000,
  onTripPaidMinor: 0,
};
const base = { tripId: "t1", homeCurrency: "AUD", totals, paidSoFarMinor: 934000, nights: 35, memberCount: 2, showPaid: true };

describe("CostTile (MONEY.md §3)", () => {
  it("shows the total split into dollars and cents, with the full amount for screen readers", () => {
    render(<CostTile {...base} />);
    const tile = screen.getByRole("region", { name: "Trip cost" });
    expect(within(tile).getByText("$14,820")).toBeInTheDocument();
    expect(within(tile).getByText(".40")).toBeInTheDocument();
    expect(within(tile).getByText("$14,820.40")).toHaveClass("sr-only");
    expect(within(tile).getByText("Trip cost")).toBeInTheDocument();
  });

  it("reads per night and per person", () => {
    render(<CostTile {...base} />);
    expect(screen.getByText("$423 a night · $7,410 each")).toBeInTheDocument();
  });

  it("drops 'each' for one traveller and the whole line with no nights", () => {
    const { rerender } = render(<CostTile {...base} memberCount={1} />);
    expect(screen.getByText("$423 a night")).toBeInTheDocument();
    rerender(<CostTile {...base} nights={0} />);
    expect(screen.queryByText(/a night/)).toBeNull();
  });

  it("the settlement box: Before you go with what's paid, On the trip as spend money until something is", () => {
    const { rerender } = render(<CostTile {...base} />);
    const box = screen.getByTestId("settlement-box");
    expect(within(box).getByText("Before you go")).toBeInTheDocument();
    expect(within(box).getByText("$11,200")).toBeInTheDocument();
    expect(within(box).getByText("$9,340 paid")).toHaveClass("text-teal-text");
    expect(within(box).getByText("Spend money")).toBeInTheDocument();
    rerender(<CostTile {...base} totals={{ ...totals, onTripPaidMinor: 5000 }} />);
    expect(within(screen.getByTestId("settlement-box")).getByText("$50 paid")).toBeInTheDocument();
  });

  it("the paid bar is a labelled progressbar with paid · % and what's to go", () => {
    render(<CostTile {...base} />);
    const bar = screen.getByRole("progressbar", { name: "Paid so far" });
    expect(bar).toHaveAttribute("aria-valuenow", "63");
    expect(bar).toHaveAttribute("aria-valuemin", "0");
    expect(bar).toHaveAttribute("aria-valuemax", "100");
    expect(bar.className).toContain("bg-unpaid-stripe");
    expect(screen.getByText("$5,480 to go")).toBeInTheDocument();
    expect(screen.getByText(/· 63%/)).toHaveClass("hidden", "md:inline");
  });

  it("everything paid reads All paid", () => {
    render(<CostTile {...base} paidSoFarMinor={1482040} />);
    expect(screen.getByText("All paid")).toBeInTheDocument();
    expect(screen.queryByText(/to go/)).toBeNull();
  });

  it("on a fork: no bar, no paid lines, and the variant sentence", () => {
    render(<CostTile {...base} showPaid={false} />);
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.queryByText(/paid$/)).toBeNull();
    expect(screen.queryByText("Spend money")).toBeNull();
    expect(screen.getByText(/Paid tracking lives on the real plan/)).toBeInTheDocument();
  });

  it("a JPY trip shows no cents span", () => {
    render(<CostTile {...base} homeCurrency="JPY" totals={{ ...totals, costTotalMinor: 184000 }} />);
    expect(screen.getByText("¥184,000")).toBeInTheDocument();
    expect(screen.queryByTestId("cost-tile-fraction")).toBeNull();
  });

  it("is teal with hard, token-only styling", () => {
    const { container } = render(<CostTile {...base} />);
    const tile = screen.getByRole("region", { name: "Trip cost" });
    for (const c of ["bg-teal", "text-on-accent", "border-2", "rounded-xl", "shadow-hard-3"]) expect(tile.className.split(/\s+/)).toContain(c);
    expect(tile.className).not.toContain("island");
    expect(container.innerHTML).not.toMatch(/shadow-soft|bg-card\/40|border-border\/70|rounded-2xl|rounded-3xl/);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm test -- app/globals.money.test.ts components/money/cost-tile.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

`app/globals.css` (next to `@utility tap-target`):

```css
/* Money's paid bar (MONEY.md §1): the unpaid part reads as a pale stripe. */
@utility bg-unpaid-stripe {
  background-image: repeating-linear-gradient(-45deg, hsl(var(--card)) 0 7px, hsl(var(--teal) / 0.12) 7px 14px);
  background-color: hsl(var(--card));
}
```

`components/money/paid-bar.tsx` (`"use client"` now so Task 15 only adds motion):
- Props per Interfaces (`tripId` is unused until Task 15 — prefix nothing, just don't destructure it yet).
- `pct = paidPct(paidMinor, totalMinor)`, `toGo = Math.max(0, totalMinor - paidMinor)`, `allPaid = totalMinor > 0 && paidMinor >= totalMinor`.
- Markup:
  - wrapper `<div data-slot="paid-bar" className={cn("flex flex-col gap-2", className)}>`
  - `<div role="progressbar" aria-label="Paid so far" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} className="h-[22px] overflow-hidden rounded-full border-2 border-border bg-unpaid-stripe md:h-[30px]">` containing a full-width fill `<div data-slot="paid-fill" className="h-full w-full origin-left bg-on-accent" style={{ transform: \`scaleX(${pct / 100})\` }} />` (a transform, not width — MOTION M3).
  - row `<div className="flex justify-between gap-3 text-sm font-bold tabular-nums">`: left `<span>{formatMoneyWhole(paidMinor, currency)} paid<span className="hidden md:inline"> · {pct}%</span></span>`; right `allPaid ? <span className="inline-flex items-center gap-1">All paid <Check className="size-4" aria-hidden="true" /></span> : <span>{formatMoneyWhole(toGo, currency)} to go</span>`.

`components/money/cost-tile.tsx` (Server):
- `<section aria-label="Trip cost" data-slot="cost-tile" className={cn("grid grid-cols-1 gap-4 rounded-xl border-2 border-border bg-teal p-[18px] text-on-accent shadow-hard-3 [grid-template-areas:'head'_'bar'_'split'] lg:grid-cols-[minmax(0,1fr)_auto] lg:grid-rows-[auto_1fr] lg:px-6 lg:py-[22px] lg:[grid-template-areas:'head_split'_'bar_bar']", className)}>` — one settlement box that sits top-right from `lg` and under the bar below it.
- Head (`[grid-area:head] min-w-0`):
  - pill `<span className="inline-flex shrink-0 whitespace-nowrap rounded-full border-2 border-border bg-card px-2.5 py-0.5 text-[11px] font-extrabold uppercase tracking-[0.08em] text-card-foreground">Trip cost</span>`
  - total `<p className="mt-2 flex items-baseline font-display font-extrabold tabular-nums leading-[.85] tracking-[-0.05em]"><span className="sr-only">{formatMoney(total, homeCurrency)}</span><span aria-hidden="true" className="text-[56px] lg:text-[72px] xl:text-[88px]">{whole}</span>{fraction ? <span aria-hidden="true" data-testid="cost-tile-fraction" className="text-[20px] tracking-[-0.02em] lg:text-[28px]">{fraction}</span> : null}</p>` (from `formatMoneyParts`). `formatMoney(1482040, "AUD")` must equal the sr-only text the test expects ("$14,820.40") — it does in en-AU.
  - sub line (only when `perNightMinor(total, nights)` is non-null): parts `\`${formatMoneyWhole(perNight)} a night\`` and, when `perPersonMinor(total, memberCount)` is non-null, `\`${formatMoneyWhole(perPerson)} each\``, joined " · ", in `<p className="mt-3 text-[15px] font-bold">`.
- Settlement box (`[grid-area:split]`): `<dl data-testid="settlement-box" className="grid grid-cols-2 overflow-hidden rounded-[16px] border-2 border-border bg-card text-card-foreground">`; two cells `<div className="flex min-w-0 flex-col gap-0.5 px-3.5 py-2.5 first:border-r-2 first:border-border">` each with `<dt className="whitespace-nowrap text-[11px] font-extrabold uppercase tracking-[0.08em] text-muted-foreground">`, `<dd className="font-display text-[19px] font-extrabold tabular-nums tracking-[-0.03em] lg:text-[26px]">{formatMoneyWhole(value)}</dd>` and, when `showPaid`, a sub `<dd className="text-[13px] font-semibold">`: Before you go → `<span className="text-teal-text">{formatMoneyWhole(beforePaidMinor)} paid</span>`; On the trip → `onTripPaidMinor > 0` ? teal-text "{x} paid" : `<span className="text-muted-foreground">Spend money</span>`.
- Bar area (`[grid-area:bar] lg:self-end`): `showPaid ? <PaidBar paidMinor={paidSoFarMinor} totalMinor={total} currency={homeCurrency} tripId={tripId} /> : <p className="text-sm font-semibold text-on-accent-muted">Paid tracking lives on the real plan — this shows the variant&apos;s costs only.</p>`.

- [ ] **Step 4: Run the tests**

Run: `npm test -- app/globals.money.test.ts components/money/cost-tile.test.tsx`
Expected: PASS.

- [ ] **Step 5: Gates and commit**

```bash
npx tsc --noEmit && npm run lint
git add app/globals.css app/globals.money.test.ts components/money/paid-bar.tsx components/money/cost-tile.tsx components/money/cost-tile.test.tsx
git commit -m "feat(money): Cost tile — total, per night/each, settlement box, paid bar

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Gg6xb4nJAsiAx7oToWgpT8"
```

---

### Task 10: To pay

MONEY.md §4 with spec §B3–B5: the checkbox ticks paid in one tap (the amount pre-filled from the cost, ADR 0037 — a legacy row offers back its recorded amount); a ⋯ menu at every width holds **Mark partly paid**, **Edit cost** and (Other costs only) **Delete cost**; the row body opens the Other-cost editor for an Other cost; owned costs (Transport/Accommodation/Item) edit from the ⋯ menu only, because their owner forms need the Stop's context (spec §B5 fallback). **Delete cost** is added because the Other costs card, where Other costs were deleted, is gone.

**Files:**
- Create: `components/money/to-pay-row.tsx` (`"use client"`)
- Create: `components/money/to-pay-panel.tsx` (`"use client"`) — list, header pill, dialogs, the All costs Dialog
- Create: `components/money/to-pay-card.tsx` (Server) — runs `mergeToPay`, renders the panel
- Create: `components/money/to-pay.test.tsx`

**Interfaces:**
- Consumes: `mergeToPay`, `ToPayInput`, `ToPayRow` (Task 2), `formatMoneyWhole` (Task 1), `markCostPaid`, `markCostUnpaid`, `deleteCost` (`@/server/actions/costs`), `todayLocalISO` (`@/lib/dates`), `toast` (`@/components/ui/use-toast`), `useConfirm` (`@/components/ui/confirm-dialog`), `PaidConfirm` (Task 8), `OtherCostFormDialog`, `OwnedCostFormDialog` (Task 8), `Dialog*` (`@/components/ui/dialog`), `DropdownMenu*` (`@/components/ui/dropdown-menu`).
- Produces:
  - `ToPayRowView(props: { row: ToPayRow; homeCurrency: string; pending: boolean; onToggle: () => void; onPartlyPaid?: () => void; onEdit?: () => void; onDelete?: () => void; onOpen?: () => void })`
  - `ToPayPanel(props: { tripId: string; homeCurrency: string; rows: ToPayRow[]; costs: CostRow[]; ratesFooter?: React.ReactNode })`
  - `ToPayCard(props: { tripId: string; homeCurrency: string; today: string; costs: ToPayInput[]; costRows: CostRow[]; ratesFooter?: React.ReactNode; className?: string })`
  - `TO_PAY_DESKTOP_ROWS = 5`, `TO_PAY_PHONE_ROWS = 2`

- [ ] **Step 1: Write the failing test**

`components/money/to-pay.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const actions = vi.hoisted(() => ({
  markCostPaid: vi.fn(async (..._a: unknown[]) => ({ success: true as const })),
  markCostUnpaid: vi.fn(async (..._a: unknown[]) => ({ success: true as const })),
  deleteCost: vi.fn(async (..._a: unknown[]) => ({ success: true as const })),
}));
vi.mock("@/server/actions/costs", () => actions);
const toast = vi.hoisted(() => vi.fn());
vi.mock("@/components/ui/use-toast", () => ({ toast }));
vi.mock("@/lib/dates", async (orig) => ({ ...(await orig<typeof import("@/lib/dates")>()), todayLocalISO: () => "2026-10-10" }));
vi.mock("@/components/trip/other-cost-editor", () => ({
  OtherCostFormDialog: ({ open, cost }: { open: boolean; cost?: { id: string } }) =>
    open ? <div data-testid="other-cost-dialog" data-cost={cost?.id ?? "new"} /> : null,
}));
vi.mock("@/components/trip/cost-editor", () => ({
  OwnedCostFormDialog: ({ open, cost }: { open: boolean; cost: { id: string } }) =>
    open ? <div data-testid="owned-cost-dialog" data-cost={cost.id} /> : null,
}));
vi.mock("@/components/money/paid-confirm", () => ({
  PaidConfirm: ({ row }: { row: { id: string } }) => <div data-testid="paid-confirm" data-cost={row.id} />,
}));

import { ToPayCard } from "./to-pay-card";
import type { ToPayInput } from "@/lib/money/to-pay";
import type { CostRow } from "@/server/actions/costs";

function input(over: Partial<ToPayInput> & { id: string }): ToPayInput {
  return { displayLabel: over.id, costMinor: 10000, paidMinor: null, currency: "AUD", rateToHome: null, paidAt: null, dueDate: null, ownerType: "OTHER", settlement: "BEFORE", ...over };
}
const COSTS: ToPayInput[] = [
  input({ id: "rome", displayLabel: "Rome apartment · balance", currency: "EUR", costMinor: 76000, rateToHome: 2, dueDate: "2026-10-15", ownerType: "ACCOMMODATION" }),
  input({ id: "eurostar", displayLabel: "Eurostar London → Paris", dueDate: "2026-11-02", ownerType: "TRANSPORT" }),
  input({ id: "insurance", displayLabel: "Travel insurance", costMinor: 41200 }),
  input({ id: "legacy", displayLabel: "Old deposit", paidMinor: 5000 }),
  input({ id: "flights", displayLabel: "Flights SYD → LHR", paidMinor: 486000, costMinor: 486000, paidAt: new Date("2026-09-02") }),
];
const costRows = COSTS.map((c) => ({ ...c, label: c.displayLabel, category: null, ownerId: c.ownerType === "OTHER" ? null : `${c.id}-owner` })) as unknown as CostRow[];

function renderCard(costs = COSTS) {
  return render(<ToPayCard tripId="t1" homeCurrency="AUD" today="2026-10-10" costs={costs} costRows={costRows} ratesFooter={<div data-testid="rates-footer" />} />);
}

beforeEach(() => vi.clearAllMocks());

describe("To pay (MONEY.md §4)", () => {
  it("is headed To pay with an 'N left' pill", () => {
    renderCard();
    const card = screen.getByRole("region", { name: "To pay" });
    expect(within(card).getByRole("heading", { level: 2, name: "To pay" })).toBeInTheDocument();
    expect(within(card).getAllByText("4 left")[0]).toBeInTheDocument();
  });

  it("rows: label, due line in its tone, home amount and the original underneath", () => {
    renderCard();
    const rome = screen.getByRole("listitem", { name: "Rome apartment · balance" });
    expect(within(rome).getByText("Due Thu 15 Oct")).toHaveClass("text-coral-text");
    expect(within(rome).getByText("$1,520")).toHaveClass("tabular-nums");
    expect(within(rome).getByText("€760")).toBeInTheDocument();
    const eurostar = screen.getByRole("listitem", { name: "Eurostar London → Paris" });
    expect(within(eurostar).getByText("Due Mon 2 Nov")).toHaveClass("text-muted-foreground");
    const flights = screen.getByRole("listitem", { name: "Flights SYD → LHR" });
    expect(within(flights).getByText("Paid 2 Sep")).toHaveClass("text-teal-text");
    expect(within(flights).getByRole("checkbox", { name: "Flights SYD → LHR" })).toHaveAttribute("aria-checked", "true");
  });

  it("a legacy row says the date is missing and has a dashed box", () => {
    renderCard();
    const row = screen.getByRole("listitem", { name: "Old deposit" });
    expect(within(row).getByText("Paid · date missing")).toHaveClass("text-sun-text");
    expect(within(row).getByTestId("to-pay-box").className).toContain("border-dashed");
  });

  it("ticking an unpaid row marks it paid in one tap, with the cost amount and today", async () => {
    const user = userEvent.setup();
    renderCard();
    await user.click(screen.getByRole("checkbox", { name: "Travel insurance" }));
    expect(actions.markCostPaid).toHaveBeenCalledWith("insurance", 41200, "2026-10-10");
  });

  it("ticking a legacy row confirms it with the recorded amount", async () => {
    const user = userEvent.setup();
    renderCard();
    await user.click(screen.getByRole("checkbox", { name: "Old deposit" }));
    expect(actions.markCostPaid).toHaveBeenCalledWith("legacy", 5000, "2026-10-10");
  });

  it("un-ticking a paid row un-marks it", async () => {
    const user = userEvent.setup();
    renderCard();
    await user.click(screen.getByRole("checkbox", { name: "Flights SYD → LHR" }));
    expect(actions.markCostUnpaid).toHaveBeenCalledWith("flights");
  });

  it("shows the tick at once, and rolls back with a toast when the server refuses", async () => {
    let resolve!: (v: { success: false; errors: Record<string, string[]> }) => void;
    actions.markCostPaid.mockImplementationOnce(() => new Promise((r) => (resolve = r)) as never);
    const user = userEvent.setup();
    renderCard();
    const box = screen.getByRole("checkbox", { name: "Travel insurance" });
    await user.click(box);
    expect(box).toHaveAttribute("aria-checked", "true");
    resolve({ success: false, errors: { _form: ["x"] } });
    await waitFor(() => expect(box).toHaveAttribute("aria-checked", "false"));
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" }));
  });

  it("the ⋯ menu offers Mark partly paid, which opens the amount confirm", async () => {
    const user = userEvent.setup();
    renderCard();
    await user.click(screen.getByRole("button", { name: "More for Travel insurance" }));
    await user.click(await screen.findByRole("menuitem", { name: "Mark partly paid" }));
    expect(await screen.findByTestId("paid-confirm")).toHaveAttribute("data-cost", "insurance");
  });

  it("Edit cost opens the owner-appropriate editor", async () => {
    const user = userEvent.setup();
    renderCard();
    await user.click(screen.getByRole("button", { name: "More for Rome apartment · balance" }));
    await user.click(await screen.findByRole("menuitem", { name: "Edit cost" }));
    expect(await screen.findByTestId("owned-cost-dialog")).toHaveAttribute("data-cost", "rome");
  });

  it("tapping an Other cost's row opens its editor; an owned cost's row is not a button", async () => {
    const user = userEvent.setup();
    renderCard();
    await user.click(screen.getByRole("button", { name: "Edit Travel insurance" }));
    expect(await screen.findByTestId("other-cost-dialog")).toHaveAttribute("data-cost", "insurance");
    expect(screen.queryByRole("button", { name: "Edit Rome apartment · balance" })).toBeNull();
  });

  it("Delete cost is offered for Other costs only and asks first", async () => {
    const user = userEvent.setup();
    renderCard();
    await user.click(screen.getByRole("button", { name: "More for Travel insurance" }));
    await user.click(await screen.findByRole("menuitem", { name: "Delete cost" }));
    await user.click(await screen.findByRole("button", { name: "Delete" }));
    expect(actions.deleteCost).toHaveBeenCalledWith("insurance");
    await user.click(screen.getByRole("button", { name: "More for Eurostar London → Paris" }));
    expect(screen.queryByRole("menuitem", { name: "Delete cost" })).toBeNull();
  });

  it("shows five rows from md and two on phones; the rest are in All N costs", async () => {
    const user = userEvent.setup();
    renderCard([...COSTS, input({ id: "extra", displayLabel: "Extra" })]);
    const items = within(screen.getByRole("list", { name: "To pay" })).getAllByRole("listitem");
    expect(items[1].className).not.toContain("max-md:hidden");
    expect(items[2].className).toContain("max-md:hidden");
    expect(items[5].className).toContain("md:hidden");
    await user.click(screen.getByRole("button", { name: "All 6 costs" }));
    const dialog = await screen.findByRole("dialog", { name: "All costs" });
    expect(within(dialog).getAllByRole("listitem")).toHaveLength(6);
    expect(within(dialog).getByTestId("rates-footer").parentElement!.className).toContain("md:hidden");
  });

  it("everything paid: an All paid pill", () => {
    renderCard([COSTS[4]]);
    expect(screen.getAllByText("All paid")[0].className).toContain("bg-teal");
  });
});
```

(`getByRole("listitem", { name })` works because each `<li>` gets `aria-label={row.label}`.)

- [ ] **Step 2: Run it to see it fail**

Run: `npm test -- components/money/to-pay.test.tsx`
Expected: FAIL (modules missing).

- [ ] **Step 3: Implement**

`components/money/to-pay-card.tsx` (Server): `const rows = mergeToPay(costs, { today, homeCurrency });` then `<section aria-labelledby="to-pay-heading" data-slot="to-pay" className={cn("flex min-h-0 flex-col rounded-xl border-2 border-border bg-card p-[18px] text-card-foreground shadow-hard-3 lg:px-[22px] lg:py-5", className)}><ToPayPanel tripId={tripId} homeCurrency={homeCurrency} rows={rows} costs={costRows} ratesFooter={ratesFooter} /></section>`.

`components/money/to-pay-panel.tsx` (`"use client"`):
- State: `const [optimistic, setPaid] = React.useOptimistic(rows, (state, u: { id: string; paid: boolean }) => state.map((r) => (r.id === u.id ? { ...r, paid: u.paid, legacy: false, dueLine: u.paid ? "Paid today" : r.unpaidDueLine, dueTone: u.paid ? "paid" : r.unpaidDueTone } : r)))`; `const [pendingId, setPendingId] = useState<string | null>(null)`; `partly`, `editing`, `allOpen` state; `const { confirm, dialog } = useConfirm()`.
- `toggle(row)`: `React.startTransition(async () => { setPaid({ id: row.id, paid: !row.paid }); setPendingId(row.id); try { const r = row.paid ? await markCostUnpaid(row.id) : await markCostPaid(row.id, row.paidMinor ?? row.costMinor, todayLocalISO()); if (!r.success) toast({ variant: "destructive", title: "Couldn't update that cost." }); } catch { toast({ variant: "destructive", title: "Couldn't update that cost." }); } finally { setPendingId(null); } })`. `useOptimistic` rolls back by itself when the transition ends without new `rows` from the server; the action's `revalidatePath` delivers the new rows on success.
- `unpaidCount = optimistic.filter((r) => !r.paid).length`.
- Header: `<div className="flex items-center justify-between gap-3"><h2 id="to-pay-heading" className="font-display text-[19px] font-extrabold tracking-[-0.02em] md:text-[22px]">To pay</h2>{pill}</div>` where pill is, at md+, `<span className={cn("hidden shrink-0 whitespace-nowrap rounded-full border-2 border-border px-2.5 text-[13px] font-bold md:inline-flex", unpaidCount ? "bg-sun text-on-accent" : "bg-teal text-on-accent")}>{unpaidCount ? \`${unpaidCount} left\` : "All paid"}</span>` and, below md, a `<button type="button" onClick={() => setAllOpen(true)} className="inline-flex min-h-11 items-center gap-0.5 whitespace-nowrap text-[13px] font-bold md:hidden">{unpaidCount ? \`${unpaidCount} left\` : "All paid"}<ChevronRight className="size-4" aria-hidden="true" /></button>` (give the "All paid" variant `bg-teal` too so the test's first match carries it — render the phone text inside a `<span className={unpaidCount ? undefined : "rounded-full border-2 border-border bg-teal px-2.5 text-on-accent"}>`).
- List: `<ul aria-label="To pay" className="mt-2 min-h-0 flex-1 overflow-y-auto">`; each row `<ToPayRowView … />` wrapped by the row itself as the `<li>`; pass a `className` computed as `cn(i >= TO_PAY_PHONE_ROWS && "max-md:hidden", i >= TO_PAY_DESKTOP_ROWS && "md:hidden")` — add `className?: string` to `ToPayRowView`'s props.
- Per row callbacks: `onToggle={() => toggle(row)}`; `onPartlyPaid={!row.paid ? () => setPartly(row) : undefined}`; `onEdit` when `row.ownerType === "OTHER"` or the matching `costs` entry has an `ownerId`; `onDelete` for `OTHER` only: `async () => { if (await confirm({ title: \`Delete "${row.label}"?\`, description: "This can't be undone.", confirmLabel: "Delete", destructive: true })) await deleteCost(row.id); }`; `onOpen={row.ownerType === "OTHER" ? () => setEditing(row.id) : undefined}`.
- Footer (md+): `<button type="button" onClick={() => setAllOpen(true)} className="mt-3 hidden min-h-11 items-center justify-between text-sm font-bold md:flex">All {rows.length} costs <ChevronRight className="size-4" aria-hidden="true" /></button>` — accessible name "All 6 costs".
- Dialogs: `Dialog open={allOpen}` → `DialogContent` with `DialogHeader`/`DialogTitle` "All costs", the full `<ul aria-label="All costs">` of `ToPayRowView` (same callbacks, no hiding classes), then `{ratesFooter ? <div className="md:hidden">{ratesFooter}</div> : null}`. `Dialog open={partly != null}` → title "Paid how much?" (sr-only is fine; `PaidConfirm` shows its own prompt) and `<PaidConfirm row={partly} onCancel={close} onDone={close} />`. Editing: find `const cost = costs.find((c) => c.id === editing)`; `cost?.ownerType === "OTHER"` → `<OtherCostFormDialog tripId homeCurrency cost={cost} open onOpenChange={(o) => !o && setEditing(null)} />`, else `<OwnedCostFormDialog cost={cost} homeCurrency open onOpenChange=… />`. Render `{dialog}` (confirm).

`components/money/to-pay-row.tsx` (`"use client"`) — MONEY.md §4 row:
- `<li aria-label={row.label} aria-busy={pending || undefined} className={cn("flex min-h-[52px] items-center gap-1 border-b-2 border-muted py-2.5", className)}>`
- Checkbox: `<button type="button" role="checkbox" aria-checked={row.paid} aria-label={row.label} onClick={onToggle} disabled={pending} className="-ml-2.5 grid size-11 shrink-0 place-items-center">` with `<span data-testid="to-pay-box" className={cn("grid size-[26px] place-items-center rounded-[7px] border-2 md:size-6", row.paid ? "border-teal-text bg-teal-text text-background" : "border-border", row.legacy && "border-dashed")}>{row.paid ? <Check className="size-4" strokeWidth={3} aria-hidden="true" /> : null}</span>`.
- Label block (a `<button type="button" aria-label={\`Edit ${row.label}\`} onClick={onOpen} className="min-w-0 flex-1 text-left">` when `onOpen`, else a `<div className="min-w-0 flex-1">`): `<p className={cn("truncate text-sm font-bold", row.paid && "text-muted-foreground line-through")}>{row.label}</p>` and, when `row.dueLine`, `<p className={cn("text-xs font-semibold", TONE[row.dueTone])}>{row.dueLine}</p>` where `TONE = { overdue: "text-coral-text", soon: "text-coral-text", later: "text-muted-foreground", none: "text-muted-foreground", paid: "text-teal-text", legacy: "text-sun-text" }`.
- Amount: `<div className="shrink-0 text-right"><p className="text-[15px] font-extrabold tabular-nums">{row.homeMinor != null ? formatMoneyWhole(row.homeMinor, homeCurrency) : formatMoneyWhole(row.originalMinor, row.currency)}</p>{row.foreign && row.homeMinor != null ? <p className="text-[11px] font-semibold tabular-nums text-muted-foreground">{formatMoneyWhole(row.originalMinor, row.currency)}</p> : null}</div>`.
- ⋯ menu (every width): `DropdownMenu` → `DropdownMenuTrigger asChild` `<button type="button" aria-label={\`More for ${row.label}\`} className="grid size-11 shrink-0 place-items-center rounded-full text-muted-foreground hover:text-foreground"><Ellipsis className="size-5" aria-hidden="true" /></button>`; `DropdownMenuContent align="end"` with `DropdownMenuItem`s "Mark partly paid" (`onSelect={onPartlyPaid}`, only when given), "Edit cost" (only when `onEdit`), "Delete cost" (only when `onDelete`). Render the trigger only if at least one item exists.

- [ ] **Step 4: Run the test**

Run: `npm test -- components/money/to-pay.test.tsx`
Expected: PASS.

- [ ] **Step 5: Gates and commit**

```bash
npx tsc --noEmit && npm run lint
git add components/money/to-pay-row.tsx components/money/to-pay-panel.tsx components/money/to-pay-card.tsx components/money/to-pay.test.tsx
git commit -m "feat(money): To pay — one merged list, one-tap paid, ⋯ menu for partly paid/edit/delete

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Gg6xb4nJAsiAx7oToWgpT8"
```

---

### Task 11: Where it goes

MONEY.md §5. Read `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-router.md` and `use-search-params.md` first.

**Files:**
- Create: `components/money/breakdown-switch.tsx` (`"use client"`)
- Create: `components/money/stacked-bar.tsx` (`"use client"` — for M5 later)
- Create: `components/money/breakdown-card.tsx` (Server)
- Create: `components/money/breakdown.test.tsx`

**Interfaces:**
- Consumes: `BreakdownBy`, `BreakdownRow`, `BarSegment`, `MoneyCategoryIcon` (Task 3), `HUE_CLASSES` (`@/lib/hues`), `ChapterChip` (`@/components/trip/chapter-chip`), `Segmented`, `SegmentedItem` (`@/components/ui/segmented`), `formatMoneyWhole`.
- Produces:
  - `BreakdownSwitch(props: { value: BreakdownBy; options: { value: BreakdownBy; label: string }[] })` — `router.replace(\`${pathname}?${qs}\`, { scroll: false })`, `by` removed for `category`, other params (e.g. `plan`) kept.
  - `StackedBar(props: { segments: BarSegment[]; by: BreakdownBy; className?: string })` — `aria-hidden`.
  - `BreakdownCard(props: { by: BreakdownBy; options: { value: BreakdownBy; label: string }[]; rows: BreakdownRow[]; segments: BarSegment[]; homeCurrency: string; showPaid: boolean; className?: string })`
  - `BREAKDOWN_ROW_CLASS` (exported from `breakdown-card.tsx`).

- [ ] **Step 1: Write the failing test**

`components/money/breakdown.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const replace = vi.hoisted(() => vi.fn());
const search = vi.hoisted(() => ({ current: new URLSearchParams("plan=f1") }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/trips/eu/budget",
  useSearchParams: () => search.current,
}));

import { BreakdownCard, BREAKDOWN_ROW_CLASS } from "./breakdown-card";
import type { BreakdownRow, BarSegment } from "@/lib/money/breakdown";

const OPTIONS = [
  { value: "category" as const, label: "Category" },
  { value: "place" as const, label: "Place" },
  { value: "day" as const, label: "Day" },
];
const ROWS: BreakdownRow[] = [
  { key: "cat:Transport", label: "Transport", hue: "sun", icon: "transport", pct: 42, costMinor: 624000, paidMinor: 517800, muted: false, missingRate: false },
  { key: "cat:Other", label: "Other", hue: "lilac", icon: "other", pct: 4, costMinor: 72000, paidMinor: 0, muted: false, missingRate: true },
];
const SEGS: BarSegment[] = [
  { key: "cat:Transport", hue: "sun", fraction: 0.9 },
  { key: "cat:Other", hue: "lilac", fraction: 0.1 },
];
const base = { by: "category" as const, options: OPTIONS, rows: ROWS, segments: SEGS, homeCurrency: "AUD", showPaid: true };

beforeEach(() => {
  replace.mockClear();
  search.current = new URLSearchParams("plan=f1");
});

describe("Where it goes (MONEY.md §5)", () => {
  it("is headed Where it goes, with the grouping control", () => {
    render(<BreakdownCard {...base} />);
    const card = screen.getByRole("region", { name: "Where it goes" });
    expect(within(card).getByRole("heading", { level: 2, name: "Where it goes" })).toBeInTheDocument();
    expect(within(card).getByRole("radio", { name: "Category" })).toHaveAttribute("data-state", "on");
    expect(within(card).getByRole("combobox", { name: "Group by" })).toHaveValue("category");
  });

  it("rows: swatch in the hue, name, %, paid and amount; the No rate chip", () => {
    render(<BreakdownCard {...base} />);
    const transport = screen.getByRole("listitem", { name: "Transport" });
    expect(transport.className).toBe(BREAKDOWN_ROW_CLASS);
    expect(within(transport).getByTestId("breakdown-swatch").className).toContain("bg-hue-sun");
    expect(within(transport).getByText("42%")).toBeInTheDocument();
    expect(within(transport).getByText("$5,178 paid")).toHaveClass("text-teal-text");
    expect(within(transport).getByText("$6,240")).toHaveClass("tabular-nums");
    const other = screen.getByRole("listitem", { name: "Other" });
    expect(within(other).getByText("No rate")).toHaveClass("bg-sun", "whitespace-nowrap", "shrink-0");
    expect(within(other).queryByText(/paid/)).toBeNull();
  });

  it("hides paid on a fork", () => {
    render(<BreakdownCard {...base} showPaid={false} />);
    expect(screen.queryByText("$5,178 paid")).toBeNull();
  });

  it("the stacked bar is decorative and sized by fraction; Day has no bar", () => {
    const { rerender, container } = render(<BreakdownCard {...base} />);
    const bar = container.querySelector("[data-slot='stacked-bar']")!;
    expect(bar).toHaveAttribute("aria-hidden", "true");
    const segs = bar.querySelectorAll("[data-slot='stacked-segment']");
    expect(segs).toHaveLength(2);
    expect((segs[0] as HTMLElement).style.width).toBe("90%");
    rerender(<BreakdownCard {...base} by="day" rows={[{ ...ROWS[0], key: "day:x", label: "Sat 12 Dec", pct: null, hue: "stone", icon: null }]} />);
    expect(container.querySelector("[data-slot='stacked-bar']")).toBeNull();
    expect(screen.queryByText("42%")).toBeNull();
  });

  it("chapter rows use the ChapterChip; muted rows have no swatch", () => {
    render(
      <BreakdownCard
        {...base}
        by="place"
        rows={[
          { key: "ch:c1", label: "Italy", hue: "coral", icon: null, chapterColour: "orange", pct: 60, costMinor: 60000, paidMinor: 0, muted: false, missingRate: false },
          { key: "rec:ungrouped", label: "Ungrouped", hue: null, icon: null, pct: 40, costMinor: 40000, paidMinor: 0, muted: true, missingRate: false },
        ]}
      />,
    );
    expect(within(screen.getByRole("listitem", { name: "Italy" })).getByText("Italy")).toBeInTheDocument();
    const ungrouped = screen.getByRole("listitem", { name: "Ungrouped" });
    expect(within(ungrouped).queryByTestId("breakdown-swatch")).toBeNull();
    expect(within(ungrouped).getByText("Ungrouped")).toHaveClass("text-muted-foreground");
  });

  it("switching replaces ?by= without scrolling and keeps ?plan=", async () => {
    const user = userEvent.setup();
    render(<BreakdownCard {...base} />);
    await user.click(screen.getByRole("radio", { name: "Place" }));
    expect(replace).toHaveBeenCalledWith("/trips/eu/budget?plan=f1&by=place", { scroll: false });
  });

  it("choosing Category drops ?by=, from the phone select too", async () => {
    const user = userEvent.setup();
    search.current = new URLSearchParams("by=day");
    render(<BreakdownCard {...base} by="day" />);
    await user.selectOptions(screen.getByRole("combobox", { name: "Group by" }), "category");
    expect(replace).toHaveBeenCalledWith("/trips/eu/budget", { scroll: false });
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npm test -- components/money/breakdown.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

`components/money/breakdown-switch.tsx` (`"use client"`):
- `const router = useRouter(); const pathname = usePathname(); const params = useSearchParams();`
- `function choose(v: string) { if (!v || v === value) return; const next = new URLSearchParams(params.toString()); if (v === "category") next.delete("by"); else next.set("by", v); const qs = next.toString(); router.replace(qs ? \`${pathname}?${qs}\` : pathname, { scroll: false }); }`
- md+: `<Segmented type="single" tone="ink" value={value} onValueChange={choose} aria-label="Group by" className="hidden gap-0 overflow-hidden border-border p-0 md:inline-flex">` with one `<SegmentedItem value={o.value} className="h-9 rounded-none border-0 border-r-2 border-border px-3.5 last:border-r-0 pointer-coarse:h-11">{o.label}</SegmentedItem>` per option (active = `bg-primary text-primary-foreground` from `tone="ink"`).
- Below md: `<div className="relative md:hidden"><select aria-label="Group by" value={value} onChange={(e) => choose(e.target.value)} className="h-11 appearance-none rounded-full border-2 border-border bg-card pl-4 pr-9 text-[13px] font-extrabold text-card-foreground">{options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select><ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2" aria-hidden="true" /></div>`.

`components/money/stacked-bar.tsx` (`"use client"`):
- `<div data-slot="stacked-bar" aria-hidden="true" className={cn("flex h-[22px] overflow-hidden rounded-full border-2 border-border md:h-[26px]", className)}>{segments.map((s) => <div key={s.key} data-slot="stacked-segment" className={cn("h-full border-r-2 border-border last:border-r-0", HUE_CLASSES[s.hue].fill)} style={{ width: \`${Math.round(s.fraction * 1000) / 10}%\` }} />)}</div>` (width `90%` for 0.9). `by` is accepted now for Task 16's re-keying.

`components/money/breakdown-card.tsx` (Server):
- `export const BREAKDOWN_ROW_CLASS = "grid grid-cols-[14px_minmax(0,1fr)_auto_70px] items-center gap-3 border-b-2 border-muted py-[9px] md:grid-cols-[28px_minmax(0,1fr)_56px_120px_110px] md:gap-3.5";`
- `const ICON: Record<MoneyCategoryIcon, LucideIcon> = { transport: Plane, accommodation: BedDouble, activity: Ticket, food: UtensilsCrossed, other: Ellipsis };`
- `<section aria-labelledby="where-heading" data-slot="where-it-goes" className={cn("flex min-h-0 flex-col rounded-xl border-2 border-border bg-card p-[18px] text-card-foreground shadow-hard-3 lg:px-6 lg:py-[22px]", className)}>` → header row `flex items-center justify-between gap-3` with `<h2 id="where-heading" className="font-display text-[19px] font-extrabold tracking-[-0.02em] md:text-[22px]">Where it goes</h2>` and `<BreakdownSwitch value={by} options={options} />`; then `{by !== "day" && segments.length > 0 ? <StackedBar segments={segments} by={by} className="mt-4" /> : null}`; then `<ul aria-label={\`By ${by}\`} className="mt-2 min-h-0 flex-1 overflow-y-auto">`.
- Each row: `<li key={r.key} aria-label={r.label} className={BREAKDOWN_ROW_CLASS}>`
  1. swatch: `r.hue ? <span data-testid="breakdown-swatch" className={cn("size-3.5 rounded-full border-2 border-border md:grid md:size-7 md:place-items-center md:rounded-[9px]", HUE_CLASSES[r.hue].fill, "text-on-accent")}>{r.icon ? <Icon className="hidden size-3.5 md:block" aria-hidden="true" /> : null}</span> : <span />`
  2. name: `r.chapterColour ? <ChapterChip name={r.label} colour={r.chapterColour} /> : <span className={cn("flex min-w-0 items-center gap-2 text-[15px] font-bold", r.muted && "text-muted-foreground")}><span className="truncate">{r.label}</span>{r.missingRate ? <span className="shrink-0 whitespace-nowrap rounded-full border-2 border-border bg-sun px-2 text-[11px] font-extrabold text-on-accent">No rate</span> : null}</span>`
  3. `<span className="text-right text-[13px] font-bold tabular-nums text-muted-foreground">{r.pct != null ? \`${r.pct}%\` : ""}</span>`
  4. `<span className="hidden text-right text-[13px] font-semibold tabular-nums text-teal-text md:block">{showPaid && r.paidMinor > 0 ? \`${formatMoneyWhole(r.paidMinor, homeCurrency)} paid\` : ""}</span>` — render the text only when non-empty so `queryByText(/paid/)` finds nothing.
  5. `<span className="text-right text-base font-extrabold tabular-nums">{formatMoneyWhole(r.costMinor, homeCurrency)}</span>`

- [ ] **Step 4: Run the test**

Run: `npm test -- components/money/breakdown.test.tsx`
Expected: PASS.

- [ ] **Step 5: Gates and commit**

```bash
npx tsc --noEmit && npm run lint
git add components/money/breakdown-switch.tsx components/money/stacked-bar.tsx components/money/breakdown-card.tsx components/money/breakdown.test.tsx
git commit -m "feat(money): Where it goes — ?by= grouping, stacked bar and rows

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Gg6xb4nJAsiAx7oToWgpT8"
```

---

### Task 12: The Rates strip

MONEY.md §6. The missing-rates banner is replaced by the one line under the grid.

**Files:**
- Create: `components/money/rate-cell.tsx` (`"use client"`)
- Create: `components/money/rates-strip.tsx` (Server)
- Create: `components/money/rates-strip.test.tsx`

**Interfaces:**
- Consumes: `RatesPanel`, `RateEntry`, `formatRate` (`@/components/trip/rates-panel`), `Dialog*`.
- Produces:
  - `RateCell(props: { tripId: string; homeCurrency: string; entry: RateEntry })`
  - `RatesStrip(props: { tripId: string; homeCurrency: string; rates: RateEntry[]; note: string | null; missingLine: string | null; className?: string })` — returns `null` when `rates` is empty.

- [ ] **Step 1: Write the failing test**

`components/money/rates-strip.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/components/trip/rates-panel", async (orig) => ({
  ...(await orig<typeof import("@/components/trip/rates-panel")>()),
  RatesPanel: ({ rates }: { rates: { currency: string }[] }) => <div data-testid="rates-panel" data-currencies={rates.map((r) => r.currency).join(",")} />,
}));

import { RatesStrip } from "./rates-strip";
import type { RateEntry } from "@/components/trip/rates-panel";

const RATES: RateEntry[] = [
  { currency: "EUR", rate: 1.63, source: "fetched", stale: false },
  { currency: "GBP", rate: 1.94, source: "stale", stale: true },
  { currency: "IDR", rate: null, source: "none", stale: false },
];
const base = { tripId: "t1", homeCurrency: "AUD", rates: RATES, note: "Updated 2h ago", missingLine: "2 IDR costs left out of totals until you set a rate." };

describe("Rates strip (MONEY.md §6)", () => {
  it("a sun tile headed Rates to AUD with the updated note", () => {
    render(<RatesStrip {...base} />);
    const strip = screen.getByRole("region", { name: /Rates to AUD/ });
    for (const c of ["bg-sun", "text-on-accent", "border-2", "rounded-xl", "shadow-hard-3"]) expect(strip.className.split(/\s+/)).toContain(c);
    expect(within(strip).getByText("Updated 2h ago")).toBeInTheDocument();
  });

  it("one cell per currency: fetched, stale (with a refresh icon) and missing (dashed, Set rate)", () => {
    render(<RatesStrip {...base} />);
    expect(screen.getByRole("button", { name: "EUR rate 1.63" })).toBeInTheDocument();
    const gbp = screen.getByRole("button", { name: "GBP rate 1.94, may be out of date" });
    expect(within(gbp).getByText("1.94").className).toContain("text-sun-text");
    expect(gbp.querySelector("svg")).not.toBeNull();
    const idr = screen.getByRole("button", { name: "Set a rate for IDR" });
    expect(idr.className).toContain("border-dashed");
    expect(within(idr).getByText("Set rate")).toBeInTheDocument();
  });

  it("the missing line sits under the grid", () => {
    render(<RatesStrip {...base} />);
    expect(screen.getByText("2 IDR costs left out of totals until you set a rate.")).toBeInTheDocument();
  });

  it("a cell opens the rates panel for that currency", async () => {
    const user = userEvent.setup();
    render(<RatesStrip {...base} />);
    await user.click(screen.getByRole("button", { name: "Set a rate for IDR" }));
    expect(await screen.findByTestId("rates-panel")).toHaveAttribute("data-currencies", "IDR");
  });

  it("renders nothing with no foreign currencies", () => {
    const { container } = render(<RatesStrip {...base} rates={[]} />);
    expect(container.innerHTML).toBe("");
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npm test -- components/money/rates-strip.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

`components/money/rates-strip.tsx` (Server): return `null` for no rates; otherwise `<section aria-labelledby="rates-heading" data-slot="rates-strip" className={cn("rounded-xl border-2 border-border bg-sun p-4 text-on-accent shadow-hard-3 lg:px-5", className)}>` → header `flex items-center justify-between gap-3` with `<h2 id="rates-heading" className="inline-flex items-center gap-1 whitespace-nowrap text-[11px] font-extrabold uppercase tracking-[0.08em]">Rates <ArrowRight className="size-3" aria-hidden="true" /><span className="sr-only">to</span> {homeCurrency}</h2>` and `{note ? <p className="text-xs font-semibold text-on-accent-muted">{note}</p> : null}`; `<ul className="mt-2.5 grid grid-cols-3 gap-2">` of `<li key={r.currency}><RateCell … /></li>`; `{missingLine ? <p className="mt-2.5 text-[13px] font-semibold">{missingLine}</p> : null}`.

`components/money/rate-cell.tsx` (`"use client"`):
- `missing = entry.source === "none" || entry.rate == null`, `stale = entry.source === "stale"`.
- `label = missing ? \`Set a rate for ${entry.currency}\` : \`${entry.currency} rate ${formatRate(entry.rate!)}${stale ? ", may be out of date" : ""}\``
- `<Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><button type="button" aria-label={label} className={cn("pressable flex min-h-11 w-full flex-col items-start rounded-[12px] border-2 border-border px-2.5 py-2 text-left text-card-foreground", missing ? "border-dashed bg-background" : "bg-card")}><span className="text-[13px] font-extrabold">{entry.currency}</span><span className="inline-flex items-center gap-1"><span className={cn("font-display text-[17px] font-extrabold tabular-nums", stale && "text-sun-text")}>{missing ? "Set rate" : formatRate(entry.rate!)}</span>{stale ? <RefreshCw className="size-3.5 text-sun-text" aria-hidden="true" /> : null}</span></button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>{entry.currency} to {homeCurrency}</DialogTitle></DialogHeader><RatesPanel tripId={tripId} homeCurrency={homeCurrency} rates={[entry]} /></DialogContent></Dialog>`
  (The value has its own span carrying `text-sun-text`, so `getByText("1.94")` lands on it; the icon is a sibling.)

- [ ] **Step 4: Run the test**

Run: `npm test -- components/money/rates-strip.test.tsx`
Expected: PASS.

- [ ] **Step 5: Gates and commit**

```bash
npx tsc --noEmit && npm run lint
git add components/money/rate-cell.tsx components/money/rates-strip.tsx components/money/rates-strip.test.tsx
git commit -m "feat(money): Rates strip — a cell per currency, stale and missing states, one missing line

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Gg6xb4nJAsiAx7oToWgpT8"
```

---

### Task 13: Money's header — Split with N and + Add a cost

MONEY.md §2 on `PageHeader`; spec §B1 (Split with N for ≥2 members, to `settings#travellers`).

**Files:**
- Create: `components/money/add-cost-button.tsx` (`"use client"`)
- Create: `components/money/split-with-pill.tsx` (Server)
- Create: `components/money/money-header.tsx` (Server)
- Create: `components/money/money-header.test.tsx`

**Interfaces:**
- Consumes: `PageHeader` (Task 4), `TripHeaderTrailing` (Task 5), `OtherCostFormDialog` (Task 8), `TravellerAvatar`, `TravellerLike`, `tripPath`.
- Produces:
  - `AddCostButton(props: { tripId: string; homeCurrency: string; variant: "pill" | "round" })`
  - `SplitWithPill(props: { slug: string; members: TravellerLike[] })` — `null` below 2.
  - `MoneyHeader(props: { tripId: string; slug: string; tripName: string; meta: string; members: TravellerLike[]; homeCurrency: string; showAddCost: boolean })`

- [ ] **Step 1: Write the failing test**

`components/money/money-header.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/components/trip/trip-header-trailing", () => ({ TripHeaderTrailing: () => <div data-testid="trip-header-trailing" /> }));
vi.mock("@/components/trip/other-cost-editor", () => ({
  OtherCostFormDialog: ({ open }: { open: boolean }) => (open ? <div data-testid="add-cost-dialog" /> : null),
}));

import { MoneyHeader } from "./money-header";
import { AddCostButton } from "./add-cost-button";

const A = { id: "u1", name: "Cam", image: null };
const B = { id: "u2", name: "Sam", image: null };
const base = { tripId: "t1", slug: "eu", tripName: "Christmas in Europe", meta: "In AUD · 35 nights", members: [A, B], homeCurrency: "AUD", showAddCost: true };

describe("MoneyHeader (MONEY.md §2)", () => {
  it("eyebrow, h1 Money, meta, bell cluster", () => {
    render(<MoneyHeader {...base} />);
    expect(screen.getByRole("heading", { level: 1, name: "Money" })).toBeInTheDocument();
    expect(screen.getByText("Christmas in Europe")).toBeInTheDocument();
    expect(screen.getByText("In AUD · 35 nights")).toBeInTheDocument();
    expect(screen.getByTestId("trip-header-trailing")).toBeInTheDocument();
  });

  it("Split with N links to the travellers and needs two people", () => {
    const { rerender } = render(<MoneyHeader {...base} />);
    expect(screen.getByRole("link", { name: "Split with 2" })).toHaveAttribute("href", "/trips/eu/settings#travellers");
    rerender(<MoneyHeader {...base} members={[A]} />);
    expect(screen.queryByRole("link", { name: /Split with/ })).toBeNull();
  });

  it("+ Add a cost is an ink pill at md+ and a round button on phones, hidden on a fork", () => {
    const { rerender } = render(<MoneyHeader {...base} />);
    const pill = within(document.querySelector("[data-slot='page-header-actions']") as HTMLElement).getByRole("button", { name: "Add a cost" });
    for (const c of ["h-11", "rounded-full", "bg-foreground", "text-background", "shadow-cta", "pressable"]) expect(pill.className.split(/\s+/)).toContain(c);
    const round = within(document.querySelector("[data-slot='page-header-mobile-action']") as HTMLElement).getByRole("button", { name: "Add a cost" });
    expect(round.className).toContain("size-11");
    rerender(<MoneyHeader {...base} showAddCost={false} />);
    expect(screen.queryAllByRole("button", { name: "Add a cost" })).toHaveLength(0);
  });
});

describe("AddCostButton", () => {
  it("opens the Other cost form", async () => {
    const user = userEvent.setup();
    render(<AddCostButton tripId="t1" homeCurrency="AUD" variant="pill" />);
    await user.click(screen.getByRole("button", { name: "Add a cost" }));
    expect(screen.getByTestId("add-cost-dialog")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npm test -- components/money/money-header.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

`components/money/add-cost-button.tsx` (`"use client"`): `const [open, setOpen] = useState(false)`; pill → `<button type="button" onClick={() => setOpen(true)} className="pressable inline-flex h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border-2 border-border bg-foreground px-[18px] text-sm font-extrabold text-background shadow-cta"><Plus className="size-4" strokeWidth={3} aria-hidden="true" />Add a cost</button>`; round → `<button type="button" aria-label="Add a cost" onClick={…} className="pressable grid size-11 place-items-center rounded-full border-2 border-border bg-foreground text-background shadow-[3px_3px_0_hsl(var(--coral))]"><Plus className="size-5" strokeWidth={3} aria-hidden="true" /></button>`; then `<OtherCostFormDialog tripId={tripId} homeCurrency={homeCurrency} open={open} onOpenChange={setOpen} />`. (The pill's accessible name comes from its text "Add a cost"; the `+` is the icon.)

`components/money/split-with-pill.tsx`: `members.length < 2 → null`; else `<Link href={tripPath(slug, "/settings#travellers")} aria-label={\`Split with ${members.length}\`} className="pressable inline-flex h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-full border-2 border-border bg-card pl-4 pr-1.5 text-sm font-extrabold text-card-foreground">Split with {members.length}<span className="flex -space-x-2">{members.slice(0, 3).map((m) => <TravellerAvatar key={m.id} traveller={m} size={32} ring />)}</span></Link>`.

`components/money/money-header.tsx`: `<PageHeader eyebrow={tripName} title="Money" meta={meta} trailing={<TripHeaderTrailing tripId={tripId} slug={slug} />} actions={<><SplitWithPill slug={slug} members={members} />{showAddCost ? <AddCostButton tripId={tripId} homeCurrency={homeCurrency} variant="pill" /> : null}</>} mobileAction={showAddCost ? <AddCostButton tripId={tripId} homeCurrency={homeCurrency} variant="round" /> : undefined} />`.

- [ ] **Step 4: Run the test**

Run: `npm test -- components/money/money-header.test.tsx`
Expected: PASS.

- [ ] **Step 5: Gates and commit**

```bash
npx tsc --noEmit && npm run lint
git add components/money/add-cost-button.tsx components/money/split-with-pill.tsx components/money/money-header.tsx components/money/money-header.test.tsx
git commit -m "feat(money): header — Split with N and + Add a cost on PageHeader

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Gg6xb4nJAsiAx7oToWgpT8"
```

---

### Task 14: Assemble the Money page; retire the old sections

MONEY.md §7–§9, spec §B. Same data fetching as today (fork scoping, rates, `buildBudget`, `buildSpendSoFar`, `buildCostLabelMap`); `buildUpcomingPayments` and `legacyPaidCount` are no longer used here. Read `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md` (`searchParams` is a Promise) first.

**Files:**
- Modify: `app/(app)/trips/[tripId]/budget/page.tsx` (rewrite the presentation)
- Rewrite: `app/(app)/trips/[tripId]/budget/page.test.tsx`, `app/(app)/trips/[tripId]/budget/budget-page.test.tsx`
- Modify: `components/shell/app-paths.ts` (append `"budget"`), `app/(app)/trips/[tripId]/layout.test.tsx` (add `"budget"` to the PageHeader-route `it.each`)
- Delete: `components/trip/budget-hero-row.tsx` + `.test.tsx`, `components/trip/cost-checklist.tsx` + `.test.tsx` (their `PaidConfirm` cases live in `components/money/paid-confirm.test.tsx` since Task 8)
- Modify: `components/trip/other-cost-editor.tsx` + `.test.tsx` — delete the `OtherCostEditor` list component once `grep -rn "OtherCostEditor\b" app components lib` shows only its own file/test; port every form-behaviour test in `other-cost-editor.test.tsx` (paid toggle, ON_TRIP settlement, due date, blank/unparseable amounts, zero paid, legacy edit) to render `<OtherCostFormDialog open … />` (create) or `cost={sampleCost}` (edit) and keep its assertions; delete the list-only tests (list rows, pencil/delete buttons, empty state, home-currency equivalent in the row, Add button placement) — delete now lives in To pay (Task 10).
- Create: `components/money/money-style.test.ts` (source scan)

Keep `SpendSoFarCard`, `UpcomingPaymentsCard`, `CostAmounts`, `CostEditor`, `RatesPanel` (used by Home, Summary, entity cards). Run `grep` for each deleted export before deleting.

**Interfaces:**
- Consumes: everything from Tasks 1–13; `readTripShell` (name + members), `tripSlugFor`, `chapterForStop` (`@/lib/chapters`).
- Produces: `MONEY_PAGE_CLASS`, `MONEY_DESKTOP_GRID_CLASS` (replaces `BUDGET_DESKTOP_GRID_CLASS`), `MONEY_DESKTOP_GRID_FORK_CLASS` exported from the page; `BUDGET_CATEGORY_ROW_CLASS`, `BUDGET_AMOUNT_ROW_CLASS`, `SettlementSplit` are deleted.

- [ ] **Step 1: Write the failing tests**

`app/(app)/trips/[tripId]/budget/page.test.tsx` (replace the file):

```tsx
import { describe, it, expect, vi } from "vitest";

vi.mock("next/navigation", () => ({ notFound: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/guards", () => ({ requireTripAccess: vi.fn() }));

const { MONEY_PAGE_CLASS, MONEY_DESKTOP_GRID_CLASS, MONEY_DESKTOP_GRID_FORK_CLASS } = await import("./page");

describe("Money desktop layout (MONEY.md §7)", () => {
  it("12 columns with a 268px first row that the rest fills, from lg", () => {
    for (const c of ["lg:grid-cols-12", "lg:grid-rows-[268px_minmax(0,1fr)]", "lg:gap-[18px]", "lg:min-h-0", "lg:flex-1"]) {
      expect(MONEY_DESKTOP_GRID_CLASS.split(/\s+/)).toContain(c);
    }
    expect(MONEY_DESKTOP_GRID_CLASS.split(/\s+/)).toContain("grid-cols-1");
  });
  it("a fork's tile has no bar, so its first row sizes to the total", () => {
    expect(MONEY_DESKTOP_GRID_FORK_CLASS).toContain("lg:grid-rows-[auto_minmax(0,1fr)]");
  });
  it("the page fills the viewport from lg only when it is at least 760px tall", () => {
    expect(MONEY_PAGE_CLASS).toContain("lg:[@media(min-height:760px)]:h-[calc(100dvh-4.5rem)]");
  });
});
```

`app/(app)/trips/[tripId]/budget/budget-page.test.tsx` (replace the file):

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";

const mockDb = vi.hoisted(() => ({
  trip: { findUnique: vi.fn() },
  fork: { findFirst: vi.fn() },
  cost: { findMany: vi.fn() },
  stop: { findMany: vi.fn() },
  item: { findMany: vi.fn() },
  accommodation: { findMany: vi.fn() },
  transport: { findMany: vi.fn() },
  exchangeRate: { findMany: vi.fn() },
  chapter: { findMany: vi.fn() },
}));
const shell = vi.hoisted(() => ({ current: { name: "Christmas in Europe", members: [{ user: { id: "u1", name: "Cam", image: null } }, { user: { id: "u2", name: "Sam", image: null } }] } }));

vi.mock("next/navigation", () => ({ notFound: vi.fn() }));
vi.mock("next/link", () => ({ default: ({ href, children, ...p }: { href: string; children?: React.ReactNode }) => <a href={href} {...p}>{children}</a> }));
vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("@/lib/guards", () => ({ requireTripAccess: vi.fn() }));
vi.mock("@/lib/trip-slug-read", () => ({ tripSlugFor: async (id: string) => id }));
vi.mock("@/lib/trip-shell-reads", () => ({ readTripShell: vi.fn(async () => shell.current) }));
vi.mock("@/lib/fx", () => ({ isRateStale: vi.fn(() => false) }));
vi.mock("@/lib/tz", () => ({ todayISOInZone: vi.fn(() => "2026-01-05"), currentTripTimezone: vi.fn(() => "UTC") }));
vi.mock("@/lib/dates", async (orig) => ({ ...(await orig<typeof import("@/lib/dates")>()), nightsBetween: vi.fn(() => 9) }));
vi.mock("@/lib/budget", () => ({ buildBudget: vi.fn() }));
vi.mock("@/lib/spend-so-far", () => ({ buildSpendSoFar: vi.fn(() => ({ paidSoFarMinor: 0 })) }));
vi.mock("@/components/trip/trip-header-trailing", () => ({ TripHeaderTrailing: () => <div data-testid="trip-header-trailing" /> }));
vi.mock("@/components/trip/variant-banner", () => ({
  VariantBanner: ({ variantName }: { variantName: string }) => <div data-testid="variant-banner">{variantName}</div>,
}));
vi.mock("@/components/money/add-cost-button", () => ({ AddCostButton: ({ variant }: { variant: string }) => <button type="button" data-testid={`add-cost-${variant}`}>Add a cost</button> }));
vi.mock("@/components/money/paid-bar", () => ({ PaidBar: () => <div data-testid="paid-bar" /> }));
vi.mock("@/components/money/to-pay-panel", () => ({
  ToPayPanel: ({ rows }: { rows: { id: string }[] }) => <div data-testid="to-pay-panel" data-ids={rows.map((r) => r.id).join(",")} />,
}));
vi.mock("@/components/money/breakdown-switch", () => ({
  BreakdownSwitch: ({ value, options }: { value: string; options: { value: string }[] }) => (
    <div data-testid="breakdown-switch" data-value={value} data-options={options.map((o) => o.value).join(",")} />
  ),
}));
vi.mock("@/components/money/stacked-bar", () => ({ StackedBar: () => <div data-testid="stacked-bar" /> }));
vi.mock("@/components/money/rate-cell", () => ({ RateCell: ({ entry }: { entry: { currency: string } }) => <div data-testid={`rate-${entry.currency}`} /> }));
vi.mock("@/components/trip/chapter-chip", () => ({ ChapterChip: ({ name }: { name: string }) => <span>{name}</span> }));

const { default: BudgetPage } = await import("./page");
const { buildBudget } = await import("@/lib/budget");

const zero = { costTotalMinor: 0, paidTotalMinor: 0 };
const BUDGET = {
  homeCurrency: "GBP",
  grandTotal: { costTotalMinor: 1000, paidTotalMinor: 0, beforeTotalMinor: 1000, onTripTotalMinor: 0, beforePaidMinor: 0, onTripPaidMinor: 0 },
  byCategory: [{ category: "Transport", costTotalMinor: 1000, paidTotalMinor: 0 }],
  byStop: [],
  byDay: [],
  missingRates: [] as string[],
  hasMissingRates: false,
  byChapter: [] as unknown[],
  chapterReconciliation: { ungrouped: zero, betweenLegs: zero, otherCosts: zero },
};
const ONE_COST = [
  { id: "cost-1", costMinor: 1000, paidMinor: null, currency: "GBP", rateToHome: 1, paidAt: null, dueDate: null, ownerType: "OTHER", ownerId: null, label: "Flight", category: "Transport", settlement: "BEFORE" },
];
const TRIP = { homeCurrency: "GBP", startDate: "2026-01-01", endDate: "2026-01-10", chaptersEnabled: true, forksEnabled: true };

async function renderPage(search: Record<string, string | string[]> = {}) {
  render(await BudgetPage({ params: Promise.resolve({ tripId: "trip-1" }), searchParams: Promise.resolve(search) }));
}

beforeEach(() => {
  vi.clearAllMocks();
  shell.current = { name: "Christmas in Europe", members: [{ user: { id: "u1", name: "Cam", image: null } }, { user: { id: "u2", name: "Sam", image: null } }] };
  vi.mocked(buildBudget).mockReturnValue(BUDGET as never);
  mockDb.trip.findUnique.mockResolvedValue(TRIP);
  mockDb.cost.findMany.mockResolvedValue(ONE_COST);
  for (const k of ["stop", "item", "accommodation", "transport", "exchangeRate", "chapter"] as const) mockDb[k].findMany.mockResolvedValue([]);
  mockDb.fork.findFirst.mockResolvedValue(null);
});

describe("Money page — header", () => {
  it("h1 Money under the trip name, with the meta line and no sr-only heading", async () => {
    await renderPage();
    expect(screen.getByRole("heading", { level: 1, name: "Money" })).toBeInTheDocument();
    expect(screen.getByText("Christmas in Europe")).toBeInTheDocument();
    expect(screen.getByText("In GBP · 9 nights · 1 cost")).toBeInTheDocument();
    expect(document.querySelector("h2.sr-only")).toBeNull();
    expect(screen.getByRole("link", { name: "Split with 2" })).toHaveAttribute("href", "/trips/trip-1/settings#travellers");
  });
  it("one traveller: no Split pill and no 'each'", async () => {
    shell.current = { ...shell.current, members: [shell.current.members[0]] };
    await renderPage();
    expect(screen.queryByRole("link", { name: /Split with/ })).toBeNull();
    expect(screen.queryByText(/each/)).toBeNull();
  });
});

describe("Money page — plan scoping", () => {
  it("scopes every plan query to the active fork; rates stay trip-wide", async () => {
    mockDb.fork.findFirst.mockResolvedValue({ id: "fork-9", name: "Plus Switzerland" });
    await renderPage({ plan: "fork-9" });
    expect(mockDb.fork.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "fork-9", tripId: "trip-1" } }));
    for (const k of ["cost", "stop", "item", "accommodation", "transport", "chapter"] as const) {
      expect(mockDb[k].findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ tripId: "trip-1", forkId: "fork-9" }) }));
    }
    expect(mockDb.exchangeRate.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { tripId: "trip-1" } }));
  });

  it("a fork hides To pay, Add a cost and the paid bar, and says why", async () => {
    mockDb.fork.findFirst.mockResolvedValue({ id: "fork-9", name: "Plus Switzerland" });
    await renderPage({ plan: "fork-9" });
    expect(screen.getByTestId("variant-banner")).toHaveTextContent("Plus Switzerland");
    expect(screen.getByText(/Paid tracking lives on the real plan/)).toBeInTheDocument();
    expect(screen.queryByTestId("to-pay-panel")).toBeNull();
    expect(screen.queryByTestId("paid-bar")).toBeNull();
    expect(screen.queryByText("Add a cost")).toBeNull();
  });

  it("the real plan shows To pay, the paid bar and Add a cost", async () => {
    await renderPage();
    expect(mockDb.fork.findFirst).not.toHaveBeenCalled();
    expect(screen.getByTestId("to-pay-panel")).toHaveAttribute("data-ids", "cost-1");
    expect(screen.getByTestId("paid-bar")).toBeInTheDocument();
    expect(screen.getByTestId("add-cost-pill")).toBeInTheDocument();
    expect(screen.getByTestId("add-cost-round")).toBeInTheDocument();
  });

  it("falls back to the real plan for a fork of another trip, and takes the first of a repeated ?plan= (AB-02)", async () => {
    await renderPage({ plan: ["a", "b"] });
    expect(mockDb.fork.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "a", tripId: "trip-1" } }));
    expect(mockDb.cost.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ forkId: null }) }));
  });

  it("ignores ?plan= when plan variants are off", async () => {
    mockDb.trip.findUnique.mockResolvedValue({ ...TRIP, forksEnabled: false });
    await renderPage({ plan: "fork-9" });
    expect(mockDb.fork.findFirst).not.toHaveBeenCalled();
    expect(screen.queryByTestId("variant-banner")).toBeNull();
  });
});

describe("Money page — Where it goes", () => {
  it("passes ?by= through when it is available", async () => {
    await renderPage({ by: "place" });
    expect(screen.getByTestId("breakdown-switch")).toHaveAttribute("data-value", "place");
    expect(screen.getByTestId("breakdown-switch")).toHaveAttribute("data-options", "category,place");
  });
  it("falls back to Category when the grouping isn't available", async () => {
    mockDb.trip.findUnique.mockResolvedValue({ ...TRIP, chaptersEnabled: false });
    await renderPage({ by: "chapter" });
    expect(screen.getByTestId("breakdown-switch")).toHaveAttribute("data-value", "category");
    await renderPage({ by: ["day", "place"] });
    expect(screen.getAllByTestId("breakdown-switch")[1]).toHaveAttribute("data-value", "category");
  });
  it("passes no chapters into the budget when chapters are off", async () => {
    mockDb.trip.findUnique.mockResolvedValue({ ...TRIP, chaptersEnabled: false });
    mockDb.chapter.findMany.mockResolvedValue([{ id: "c1", name: "One", colour: "sky", startDate: "2026-01-02", endDate: "2026-01-05" }]);
    await renderPage();
    expect(vi.mocked(buildBudget)).toHaveBeenCalledWith(expect.objectContaining({ chapters: [] }));
  });
});

describe("Money page — rates", () => {
  it("a strip per foreign currency and the missing line instead of a banner", async () => {
    mockDb.cost.findMany.mockResolvedValue([
      ...ONE_COST,
      { ...ONE_COST[0], id: "c2", currency: "IDR", rateToHome: null },
      { ...ONE_COST[0], id: "c3", currency: "IDR", rateToHome: null },
    ]);
    vi.mocked(buildBudget).mockReturnValue({ ...BUDGET, missingRates: ["IDR"], hasMissingRates: true } as never);
    await renderPage();
    expect(screen.getAllByTestId("rate-IDR").length).toBeGreaterThan(0);
    expect(screen.getAllByText("2 IDR costs left out of totals until you set a rate.").length).toBeGreaterThan(0);
    expect(screen.queryByText(/Some costs are missing exchange rates/)).toBeNull();
  });
});

describe("Money page — states (MONEY.md §9)", () => {
  it("no dates: the header and a Set dates call to action", async () => {
    mockDb.trip.findUnique.mockResolvedValue({ ...TRIP, startDate: null, endDate: null });
    await renderPage();
    expect(screen.getByRole("heading", { level: 1, name: "Money" })).toBeInTheDocument();
    expect(screen.getByText("No dates yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Set dates" })).toHaveAttribute("href", "/trips/trip-1/settings");
  });

  it("no costs: a coral Nothing costed yet tile with Add a cost, and the dashed To pay placeholder", async () => {
    mockDb.cost.findMany.mockResolvedValue([]);
    await renderPage();
    const tile = screen.getByRole("heading", { name: "Nothing costed yet" }).closest("section")!;
    expect(tile.className).toContain("bg-coral");
    expect(within(tile).getByText("Costs show up here as you add flights, stays and things to do.")).toBeInTheDocument();
    expect(within(tile).getByTestId("add-cost-pill")).toBeInTheDocument();
    expect(screen.getByText("Due dates will line up here")).toBeInTheDocument();
    expect(screen.queryByTestId("paid-bar")).toBeNull();
  });

  it("no costs on a fork: no Add a cost", async () => {
    mockDb.fork.findFirst.mockResolvedValue({ id: "fork-9", name: "Plus Switzerland" });
    mockDb.cost.findMany.mockResolvedValue([]);
    await renderPage({ plan: "fork-9" });
    expect(screen.getByTestId("variant-banner")).toBeInTheDocument();
    expect(screen.queryByText("Add a cost")).toBeNull();
  });
});
```

`components/money/money-style.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "..", "..");
const files = [
  ...readdirSync(path.join(root, "components", "money"))
    .filter((f) => f.endsWith(".tsx") && !f.includes(".test."))
    .map((f) => path.join("components", "money", f)),
  "components/ui/page-header.tsx",
  "components/trip/trip-header-trailing.tsx",
  "app/(app)/trips/[tripId]/budget/page.tsx",
];

describe("Money and PageHeader use the hard-edged kit only", () => {
  it.each(files)("%s has no soft styles, raw hex, island or off-scale radii", (file) => {
    const src = readFileSync(path.join(root, file), "utf8");
    expect(src).not.toMatch(/shadow-soft|border-border\/70|bg-card\/40/);
    expect(src).not.toMatch(/["'`\s(]#[0-9a-fA-F]{3,8}["'`\s)]/);
    expect(src).not.toMatch(/\bisland\b/);
    expect(src).not.toMatch(/rounded-2xl|rounded-3xl/);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm test -- "app/(app)/trips/[tripId]/budget" components/money/money-style.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the page**

In `page.tsx`:
- Imports: drop `AlertTriangle`, `Card*`, `OtherCostEditor`, `CostAmounts`, `RatesPanel` (keep the `RateEntry` type import), `ChapterChip`, `SpendSoFarCard`, `BudgetHeroRow`, `CostChecklist`, `UpcomingPaymentsCard`, `buildUpcomingPayments`, `legacyPaidCount`, `cn` if unused. Add `Link`, `Button`, `readTripShell`, `chapterForStop`, the `lib/money/*` helpers and the `components/money/*` components.
- `searchParams: Promise<{ plan?: string | string[]; by?: string | string[] }>`; `const { plan, by: rawBy } = await searchParams;`.
- After the trip read: `const [shell, slug] = await Promise.all([readTripShell(tripId), tripSlugFor(tripId)]); const members = shell?.members.map((m) => m.user) ?? [];`.
- Constants:
  ```ts
  export const MONEY_PAGE_CLASS = "flex flex-col gap-3.5 md:gap-5 lg:[@media(min-height:760px)]:h-[calc(100dvh-4.5rem)]";
  const GRID_BASE = "grid grid-cols-1 gap-3.5 lg:min-h-0 lg:flex-1 lg:grid-cols-12 lg:gap-[18px]";
  export const MONEY_DESKTOP_GRID_CLASS = `${GRID_BASE} lg:grid-rows-[268px_minmax(0,1fr)]`;
  export const MONEY_DESKTOP_GRID_FORK_CLASS = `${GRID_BASE} lg:grid-rows-[auto_minmax(0,1fr)]`;
  const SPAN = {
    tile: "lg:col-span-8 lg:row-start-1",
    right: "flex min-h-0 flex-col gap-3.5 lg:col-span-4 lg:col-start-9 lg:row-span-2 lg:row-start-1 lg:gap-[18px]",
    where: "lg:col-span-8 lg:row-start-2",
    full: "lg:col-span-12",
  };
  ```
  (4.5rem = the trip layout's `pt-6` + the content wrapper's `py-6` at md+. Verify in the browser in Task 17 that 1440×900 does not scroll; adjust this one number if the layout's padding differs.)
- `header(meta)` builds `<MoneyHeader tripId={tripId} slug={slug} tripName={shell?.name ?? ""} meta={meta} members={members} homeCurrency={homeCurrency} showAddCost={!activeFork} />`.
- **No dates** (before any cost query, as today): `<div className="flex flex-col gap-5">{header(\`In ${trip.homeCurrency}\`)}{activeFork && <VariantBanner …/>}<EmptyState icon={Wallet} tone="teal" title="No dates yet" description="Set your trip's start and end dates to see where the money goes." action={<Button asChild><Link href={tripPath(slug, "/settings")}>Set dates</Link></Button>} /></div>`.
- Keep the existing fetch block, `ownerName`, `budgetCosts`/stops/items/…, `buildBudget`, `spendCosts`, `today`, `spend`, `foreignCurrencies`, `rateByBase`, `rateEntries`, `daysWithCosts`, `categoriesWithMissingRates` exactly as they are.
- Derived:
  ```ts
  const nights = nightsBetween(startDate, endDate);
  const currencyCount = new Set([homeCurrency.toUpperCase(), ...allCosts.map((c) => c.currency.toUpperCase())]).size;
  const meta = moneyMetaLine({ homeCurrency, nights, costCount: allCosts.length, currencyCount });
  const options = breakdownOptions({ chapters: chaptersEnabled && budget.byChapter.length > 0, days: daysWithCosts.length > 0 });
  const by = parseBy(rawBy, options.map((o) => o.value));
  const stopChapterColour = new Map(
    chaptersEnabled ? budgetStops.flatMap((s) => { const ch = chapterForStop(s, chapters); return ch ? [[s.id, ch.colour] as const] : []; }) : [],
  );
  const rows = rowsFor(budget, by, { stopChapterColour, missingRateCategories: categoriesWithMissingRates });
  const segments = by === "day" ? [] : segmentsFor(rows, budget.grandTotal.costTotalMinor);
  const toPayInputs = allCosts.map((c) => ({ ...c, displayLabel: c.label ?? ownerName.get(c.ownerId ?? "") ?? "Cost" }));
  const ratesNote = ratesUpdatedNote(foreignCurrencies.flatMap((c) => { const r = rateByBase.get(c); return r ? [{ manual: r.manual, fetchedAt: r.fetchedAt }] : []; }), now);
  const missingLine = budget.hasMissingRates ? missingRatesLine(allCosts, budget.missingRates) : null;
  const ratesStrip = foreignCurrencies.length > 0 ? <RatesStrip tripId={tripId} homeCurrency={homeCurrency} rates={rateEntries} note={ratesNote} missingLine={missingLine} /> : null;
  const showToPay = !activeFork;
  const hasRight = showToPay || ratesStrip != null;
  ```
- **No costs** (`allCosts.length === 0`): `<div className={MONEY_PAGE_CLASS}>{header(meta)}{banner}<div className="grid grid-cols-1 gap-3.5 lg:grid-cols-12 lg:gap-[18px]"><section aria-labelledby="nothing-costed" className="flex flex-col items-start gap-3 rounded-xl border-2 border-border bg-coral p-6 text-on-accent shadow-hard-3 lg:col-span-8"><h2 id="nothing-costed" className="font-display text-[28px] font-extrabold tracking-[-0.02em]">Nothing costed yet</h2><p className="max-w-[46ch] text-[15px] font-semibold">Costs show up here as you add flights, stays and things to do.</p>{!activeFork && <AddCostButton tripId={tripId} homeCurrency={homeCurrency} variant="pill" />}</section><div className="grid min-h-32 place-items-center rounded-xl border-2 border-dashed border-border-soft p-6 text-center text-[15px] font-semibold text-muted-foreground lg:col-span-4">Due dates will line up here</div></div></div>` where `banner = activeFork ? <VariantBanner tripId={tripId} variantName={activeFork.name} /> : null`.
- **Main:**
  ```tsx
  <div className={MONEY_PAGE_CLASS}>
    {header(meta)}
    {banner}
    <div className={activeFork ? MONEY_DESKTOP_GRID_FORK_CLASS : MONEY_DESKTOP_GRID_CLASS} data-testid="money-grid">
      <CostTile className={hasRight ? SPAN.tile : SPAN.full} tripId={tripId} homeCurrency={homeCurrency} totals={budget.grandTotal} paidSoFarMinor={spend.paidSoFarMinor} nights={nights} memberCount={members.length} showPaid={!activeFork} />
      {hasRight ? (
        <div className={SPAN.right}>
          {showToPay ? <ToPayCard className="lg:min-h-0 lg:flex-1" tripId={tripId} homeCurrency={homeCurrency} today={today} costs={toPayInputs} costRows={allCosts} ratesFooter={ratesStrip} /> : null}
          {ratesStrip ? <div className={cn("lg:flex-none", showToPay && "hidden md:block")}>{ratesStrip}</div> : null}
        </div>
      ) : null}
      <BreakdownCard className={hasRight ? SPAN.where : SPAN.full} by={by} options={options} rows={rows} segments={segments} homeCurrency={homeCurrency} showPaid={!activeFork} />
    </div>
  </div>
  ```
  DOM order gives the phone order of MONEY.md §8 (Cost tile, To pay, Where it goes); the Rates strip is off the phone page when To pay exists (it's in the All costs sheet footer).
- Delete `SettlementSplit`, the old constants, the missing-rates banner, the legend, the legacy notice and the Other costs card.
- `components/shell/app-paths.ts`: `PAGE_HEADER_ROUTES` gains `"budget"`; the layout test's PageHeader `it.each` gains `"budget"`.
- Delete the retired components/tests listed under Files (grep first) and port the Other-cost form tests as described.

- [ ] **Step 4: Run the tests**

Run: `npm test -- "app/(app)/trips/[tripId]" components/money components/trip components/shell lib`
Expected: PASS.

- [ ] **Step 5: Gates and commit**

```bash
npx tsc --noEmit && npm run lint
git add -A "app/(app)/trips/[tripId]/budget" components/money components/shell/app-paths.ts "app/(app)/trips/[tripId]/layout.test.tsx" components/trip/budget-hero-row.tsx components/trip/budget-hero-row.test.tsx components/trip/cost-checklist.tsx components/trip/cost-checklist.test.tsx components/trip/other-cost-editor.tsx components/trip/other-cost-editor.test.tsx
git commit -m "feat(money): the Money page — Cost tile, To pay, Where it goes, Rates strip (MONEY.md)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Gg6xb4nJAsiAx7oToWgpT8"
```

---

### Task 15: Motion A — entrance, count-up and the paid bar (M1–M4, M9 re-tween)

MOTION.md "Money page" M1–M4 and the M9 total re-tween. Only transforms and opacity; nothing loops; reduced motion shows final values at once (`useReducedMotion()` from `motion/react`; the app already wraps in `<MotionConfig reducedMotion="user">`).

**Files:**
- Create: `components/money/money-entrance.tsx` (`"use client"`) + `.test.tsx`
- Create: `components/money/use-tween.ts` (`"use client"` hook) + `.test.tsx`
- Create: `components/money/money-count-up.tsx` (`"use client"`)
- Modify: `components/money/paid-bar.tsx`, `components/money/cost-tile.tsx`, `app/(app)/trips/[tripId]/budget/page.tsx` (M1 classes)
- Modify: `components/money/cost-tile.test.tsx` (wrap-safe assertions still pass)

**Interfaces:**
- Produces:
  - `MONEY_COUNT_KEY = (tripId: string) => \`money-count:${tripId}\``
  - `MoneyEntrance({ tripId, children })` provider; `useMoneyEntrance(): "pending" | "play" | "static"` — `"pending"` on the server and first render; a layout effect reads `sessionStorage` once: key present or reduced motion → `"static"`; otherwise writes the key and switches to `"play"`. Storage errors → `"static"`.
  - `useTween(value: number, opts: { from?: number; duration: number; delay?: number; ease?: [number, number, number, number]; skip: boolean }): number` — uses `animate()` from `motion/react` on a plain number with `onUpdate` (rAF); returns `value` straight away when `skip`; later changes tween from the current shown value.
  - `MoneyCountUp({ minor, currency, tripId })` — renders `formatMoneyParts(Math.round(shown))` as the two spans (same classes as the tile) with the sr-only final text; `"play"` → 0→total over 700ms `--ease-pop` ([0.2, 0.8, 0.2, 1]); later value changes → 320ms (M9); `"static"`/`"pending"` → final.

- [ ] **Step 1: Write the failing tests**

`components/money/money-entrance.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const reduced = vi.hoisted(() => ({ current: false }));
vi.mock("motion/react", async (orig) => ({ ...(await orig<typeof import("motion/react")>()), useReducedMotion: () => reduced.current }));

import { MoneyEntrance, useMoneyEntrance, MONEY_COUNT_KEY } from "./money-entrance";

function Probe() {
  return <span data-testid="state">{useMoneyEntrance()}</span>;
}

beforeEach(() => {
  sessionStorage.clear();
  reduced.current = false;
});

describe("MoneyEntrance (MOTION M2: once per session per trip)", () => {
  it("plays the first time and remembers it", () => {
    render(<MoneyEntrance tripId="t1"><Probe /></MoneyEntrance>);
    expect(screen.getByTestId("state")).toHaveTextContent("play");
    expect(sessionStorage.getItem(MONEY_COUNT_KEY("t1"))).not.toBeNull();
  });
  it("is static on the next visit, and per trip", () => {
    sessionStorage.setItem(MONEY_COUNT_KEY("t1"), "1");
    render(<><MoneyEntrance tripId="t1"><Probe /></MoneyEntrance></>);
    expect(screen.getByTestId("state")).toHaveTextContent("static");
  });
  it("is static under reduced motion", () => {
    reduced.current = true;
    render(<MoneyEntrance tripId="t2"><Probe /></MoneyEntrance>);
    expect(screen.getByTestId("state")).toHaveTextContent("static");
  });
});
```

`components/money/use-tween.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { useTween } from "./use-tween";

function Probe({ value, skip }: { value: number; skip: boolean }) {
  return <span data-testid="v">{Math.round(useTween(value, { from: 0, duration: 0.7, skip }))}</span>;
}

describe("useTween", () => {
  it("returns the value at once when skipped (reduced motion / static)", () => {
    render(<Probe value={1234} skip />);
    expect(screen.getByTestId("v")).toHaveTextContent("1234");
  });
  it("starts from `from` when animating", () => {
    render(<Probe value={1234} skip={false} />);
    expect(Number(screen.getByTestId("v").textContent)).toBeLessThan(1234);
  });
});
```

Add to `components/money/cost-tile.test.tsx`:

```tsx
  it("the paid fill is a transform on a full-width element, origin left (M3)", () => {
    render(<CostTile {...base} />);
    const fill = document.querySelector("[data-slot='paid-fill']") as HTMLElement;
    expect(fill.className).toContain("origin-left");
    expect(fill.className).toContain("w-full");
    expect(fill.style.width).toBe("");
  });
```

and change the total assertions to tolerate the count-up: the sr-only final amount (`getByText("$14,820.40")`) stays exact; the visible parts are asserted after `sessionStorage.setItem("money-count:t1", "1")` in a `beforeEach` (static path).

- [ ] **Step 2: Run them to see them fail**

Run: `npm test -- components/money`
Expected: FAIL (new modules missing).

- [ ] **Step 3: Implement**

- `money-entrance.tsx`: context + provider as specified; `React.useLayoutEffect` (guarded `typeof window`) does the storage read in `try/catch`.
- `use-tween.ts`: `const [shown, setShown] = useState(skip ? value : (opts.from ?? value)); const cur = useRef(shown);` effect on `[value, skip]`: if `skip` → `cur.current = value; setShown(value); return;` else `const c = animate(cur.current, value, { duration, delay, ease, onUpdate: (v) => { cur.current = v; setShown(v); } }); return () => c.stop();`. Return `skip ? value : shown`.
- `money-count-up.tsx`: `const entrance = useMoneyEntrance(); const reduce = useReducedMotion(); const first = useRef(true);` — `skip = reduce || entrance !== "play" && first.current`; duration `first.current ? 0.7 : 0.32`; after the first run set `first.current = false`. When `entrance` is `"static"` and the value later changes (M9 — a new cost saved), tween 320ms unless reduced. Visible spans `aria-hidden` with `suppressHydrationWarning`, sr-only final text.
- `paid-bar.tsx`: wrap in motion. Fill → `<motion.div data-slot="paid-fill" className="h-full w-full origin-left bg-on-accent" initial={false} animate={{ scaleX: pct / 100 }} transition={phase === "play" ? { duration: 0.7, delay: 0.12, ease: [0.2, 0.8, 0.2, 1] } : { type: "spring", stiffness: 300, damping: 30 }} style={{ scaleX: phase === "play" && !mounted ? 0 : pct / 100 }} />` — the first `"play"` render starts at `scaleX 0`; later value changes spring (M4). The `pct` label (`useTween(pct, { from: 0, duration: 0.7, delay: 0.12, skip })`) counts with the fill (M3); the paid and to-go numbers `useTween(…, { duration: 0.32, skip: reduce || first })` (M4). Keep the `role="progressbar"` `aria-valuenow` on the final `pct`.
- `cost-tile.tsx`: wrap the section's children in `<MoneyEntrance tripId={tripId}>`; replace the static total spans with `<MoneyCountUp minor={total} currency={homeCurrency} tripId={tripId} />`.
- `page.tsx` (M1): the four tiles get `tp-rise-in` and `style={{ animationDelay: "0ms" | "60ms" | "120ms" | "180ms" }}` — Cost tile 0, To pay 60, Where it goes 120, Rates 180 (pass `className`/`style` through: add an optional `style?: React.CSSProperties` prop to `CostTile`, `ToPayCard`, `BreakdownCard`, `RatesStrip`). Because a `?by=` change re-renders the same elements, the CSS animation does not replay.

- [ ] **Step 4: Run the tests**

Run: `npm test -- components/money "app/(app)/trips/[tripId]/budget"`
Expected: PASS.

- [ ] **Step 5: Gates and commit**

```bash
npx tsc --noEmit && npm run lint
git add components/money "app/(app)/trips/[tripId]/budget/page.tsx"
git commit -m "feat(money): motion — tiles rise in, the total counts up once per session, the paid bar fills and springs

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Gg6xb4nJAsiAx7oToWgpT8"
```

---

### Task 16: Motion B — breakdown, To pay ticks and rate cells (M5–M7, M9 row entry, M10)

**Files:**
- Modify: `components/money/stacked-bar.tsx` (M5; export `FadeSwap`)
- Modify: `components/money/breakdown-switch.tsx` (M6 shared pill), `components/money/breakdown-card.tsx` (rows in `FadeSwap`)
- Modify: `components/money/to-pay-row.tsx`, `components/money/to-pay-panel.tsx` (M7, M9)
- Modify: `components/money/rate-cell.tsx`, `components/money/rates-strip.tsx` (M10; export `CollapsibleLine` from `rate-cell.tsx`)
- Modify: `components/money/breakdown.test.tsx`, `components/money/to-pay.test.tsx`, `components/money/rates-strip.test.tsx`

**Interfaces:**
- Produces: `FadeSwap({ swapKey: string; children })` (AnimatePresence `mode="wait"`, opacity 120ms out / 120ms in, no height animation); `CollapsibleLine({ children })` (AnimatePresence, `height 0` + opacity over 180ms on exit).

- [ ] **Step 1: Write the failing tests**

Add to `components/money/breakdown.test.tsx`:

```tsx
  it("M6: the active segment carries the shared ink pill", () => {
    const { container } = render(<BreakdownCard {...base} />);
    const on = screen.getByRole("radio", { name: "Category" });
    expect(on.querySelector("[data-slot='by-pill']")).not.toBeNull();
    expect(container.querySelectorAll("[data-slot='by-pill']")).toHaveLength(1);
  });
  it("M5: each segment grows from the left", () => {
    const { container } = render(<BreakdownCard {...base} />);
    for (const seg of container.querySelectorAll("[data-slot='stacked-segment']")) expect(seg.className).toContain("origin-left");
  });
```

Add to `components/money/to-pay.test.tsx`:

```tsx
  it("M7: ticking pops the check, draws the strike and pops the left count", async () => {
    const user = userEvent.setup();
    renderCard();
    await user.click(screen.getByRole("checkbox", { name: "Travel insurance" }));
    const row = screen.getByRole("listitem", { name: "Travel insurance" });
    expect(within(row).getByTestId("to-pay-box").querySelector("svg")!.getAttribute("class")).toContain("tp-pop");
    expect(within(row).getByText("Travel insurance").className).toContain("bg-[length:100%_2px]");
    expect(screen.getAllByText("3 left")[0].className).toContain("tp-pop");
  });
  it("M9: a newly added cost rises in; rows present on mount do not", () => {
    const { rerender } = renderCard();
    expect(screen.getByRole("listitem", { name: "Travel insurance" }).className).not.toContain("tp-rise-in");
    rerender(
      <ToPayCard tripId="t1" homeCurrency="AUD" today="2026-10-10" costs={[input({ id: "new", displayLabel: "eSIM" }), ...COSTS]} costRows={costRows} />,
    );
    expect(screen.getByRole("listitem", { name: "eSIM" }).className).toContain("tp-rise-in");
  });
```

(The existing "shows five rows…" and legacy tests keep passing: the strike moves from `line-through` to the background-size line — update the paid-row assertion in Task 10's test only if it asserted `line-through`; it doesn't.)

Add to `components/money/rates-strip.test.tsx`:

```tsx
  it("M10: a rate that was missing pops once it is set", () => {
    const { rerender } = render(<RatesStrip {...base} />);
    rerender(<RatesStrip {...base} rates={[RATES[0], RATES[1], { currency: "IDR", rate: 0.0001, source: "manual", stale: false }]} missingLine={null} />);
    const idr = screen.getByRole("button", { name: /IDR rate/ });
    expect(idr.className).toContain("tp-pop");
    expect(idr.className).not.toContain("border-dashed");
  });
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm test -- components/money`
Expected: FAIL on the new cases.

- [ ] **Step 3: Implement**

- **M5 (`stacked-bar.tsx`)**: wrap the bar in `<AnimatePresence mode="wait" initial={true}>` keyed by `by` on a `motion.div` with `exit={{ opacity: 0 }} transition={{ duration: 0.12 }}`; each segment a `motion.div` with `className` gaining `origin-left`, `initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 0.32, delay: i * 0.04, ease: [0.2, 0.8, 0.2, 1] }}`. Export `FadeSwap` (same `AnimatePresence mode="wait"`, `motion.div` keyed by `swapKey`, `initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }}`).
- **M6 (`breakdown-switch.tsx`)**: items get `data-[state=on]:bg-transparent data-[state=on]:text-primary-foreground` and, inside the active item only, `<motion.span data-slot="by-pill" layoutId="by-pill" aria-hidden="true" className="absolute inset-0 -z-10 bg-primary" transition={{ duration: 0.18 }} />` (give the item `relative isolate`). The label colour swap at the midpoint: `transition-colors duration-[90ms] delay-[90ms]` on the item. `breakdown-card.tsx` wraps the `<ul>` in `<FadeSwap swapKey={by}>`.
- **M7 (`to-pay-row.tsx` / `to-pay-panel.tsx`)**: the `Check` icon gets `className="size-4 tp-pop"` (it mounts on tick, so the pop plays once). Replace `line-through` with a drawn strike: label classes `bg-[linear-gradient(currentColor,currentColor)] bg-no-repeat bg-[position:0_55%] transition-[background-size] duration-[var(--dur-base)] ease-pop` plus `bg-[length:100%_2px] text-muted-foreground` when paid, `bg-[length:0%_2px]` when not. The count pill number: `<span key={unpaidCount} className="tp-pop">{unpaidCount} left</span>`. Reorder after 400ms: keep `const [order, setOrder] = useState(() => rows.map((r) => r.id))`; when `rows` (server order) changes, update `order` after `setTimeout(400)` (clear on unmount); render the list as `motion.li` with `layout transition={{ duration: 0.32, ease: [0.2, 0.8, 0.2, 1] }}` (make `ToPayRowView` render a `motion.li`). Un-ticking reverses naturally. Rollback on failure is already `useOptimistic` + toast.
- **M9 (`to-pay-panel.tsx`)**: `const seen = useRef<Set<string> | null>(null)`; on first render record all ids; a row whose id is not in `seen` gets `tp-rise-in`; add ids after render in an effect.
- **M10 (`rate-cell.tsx` / `rates-strip.tsx`)**: `const prev = useRef(entry.source)`; if `prev.current === "none" && entry.source !== "none"` add `tp-pop` to the button (keep it until next change); update `prev` in an effect. `RatesStrip` renders the missing line through `<CollapsibleLine>{missingLine ? <p key="missing" …>{missingLine}</p> : null}</CollapsibleLine>` where `CollapsibleLine` is `AnimatePresence` with the child wrapped in `motion.div initial={false} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.18 }} className="overflow-hidden"`.
- M8: nothing (no pulse on overdue).

- [ ] **Step 4: Run the tests**

Run: `npm test -- components/money`
Expected: PASS.

- [ ] **Step 5: Gates and commit**

```bash
npx tsc --noEmit && npm run lint
git add components/money
git commit -m "feat(money): motion — segments grow, shared grouping pill, ticks pop and reorder, rate cells pop

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Gg6xb4nJAsiAx7oToWgpT8"
```

---

### Task 17: Phase gate

- [ ] **Step 1: Full test suite**

Run: `npm test`
Expected: all green. Fix anything this phase broke (common: another test importing a deleted export — `grep -rn "BudgetHeroRow\|CostChecklist\|OtherCostEditor\b\|SettlementSplit\|BUDGET_DESKTOP_GRID_CLASS\|FILES_TITLE_CLASS\|COMPARE_TITLE_CLASS" app components lib scripts`).

- [ ] **Step 2: Typecheck, lint, build**

```bash
npx tsc --noEmit
npm run lint
npx next build
```
Expected: all clean.

- [ ] **Step 3: Look at it**

With `npx next dev -p 3100` (never `next start`), sign in with the dev login and open a populated trip's `/budget` at 1440×900 and 390×844 (light and dark). Check against `money-desktop.png` / `money-mobile.png`: no page scroll at 1440×900 (adjust `MONEY_PAGE_CLASS`'s `4.5rem` if it scrolls by the layout's padding), the layout header is gone on Money/Files/Activity/Compare/Journal/More/Help and still present on Plan/Settings/Calendar, the bell and fork switcher sit in each PageHeader, the Money count shows in the sidebar. Stop the dev server.

- [ ] **Step 4: Tag**

```bash
git status --short   # must be clean
git tag phase-1-money
```
