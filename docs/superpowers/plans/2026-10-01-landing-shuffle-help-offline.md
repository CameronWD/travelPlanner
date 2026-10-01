# Landing card fan, Trip home stats, Help restructure, sign-in deep links, offline, tester welcome — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the 2026-10-01 batch on one branch: the Landing's centred card fan that shuffles between four sample trips (with the Google button's G mark, press feedback, tester wording and a one-time welcome), the Trip home stats column, a How to use Teepee page that opens with a plain walkthrough beside a sticky section rail, sign-in that returns people to the page they asked for, and an offline story that fails gracefully, warms more of the trip and says "Saved for offline".

**Architecture:** Six independent parts touching disjoint files. The Landing becomes a client-driven fan: a `useTripShuffle` hook animates positioned wrappers with the Web Animations API while the cards keep their CSS entrance tilt; the ribbon loops with one CSS keyframe. The help guide keeps its content and gains a new top (intro, walkthrough) and a shared `OnThisPage` rail extracted from the legal pages. Sign-in guards carry the requested path through the Landing's existing `callbackUrl` plumbing. Offline adds one shared failure message, three warmed paths plus the cover, and a small client store that drives a "Saved for offline" row in Settings. The welcome is a per-user `welcomeSeenAt` column read by a server gate, same shape as What's new.

**Tech Stack:** Next.js 16 App Router (**read `node_modules/next/dist/docs/` before touching routing, proxy or server actions — this version differs from training data**), React 19, Tailwind v4, Prisma/Postgres, Auth.js, Vitest + Testing Library (jsdom), lucide-react, Web Animations API.

**Spec:** `docs/specs/2026-10-01-landing-shuffle-help-offline.md` (Landing source of truth: `design_handoff/landing-shuffle-handoff/LANDING.md`; glossary: CONTEXT.md **Landing**, **Saved for offline**).

## Global Constraints

- Work only on branch `feat/landing-shuffle-2026-10-01`. Never commit to `main`, never push, never deploy, never run `feedback:pull`, `feedback:resolve` or `feedback:accept`.
- Node 24 is installed and is what runs here; no nvm step is needed.
- Run tests with `npm test -- <path>` (sets `TZ=UTC`). Run `npx tsc --noEmit` and `npm run lint` before each commit; both must be clean. `npm run build` must be green at the end of each part (Tasks 6, 9, 13, 18, 21).
- Every commit message ends with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. The only `Resolves-Feedback:` trailer in this plan is on Task 7's commit (`Resolves-Feedback: cmunprdsr000004l6da68grrp`), placed above the Co-Authored-By line.
- Tokens only (no raw hex), 2px ink borders, hard shadows (`shadow-hard-*`), no `shadow-soft*`. Bricolage Grotesque 800 (`font-display`) for display text. `tabular-nums` on times and amounts. Every chip `whitespace-nowrap shrink-0`. The Landing stays forced-light (`data-theme="light"`).
- Respect `prefers-reduced-motion`: the shuffle swaps with no animation, the marquee is `animation: none`, the launcher pulse is none.
- Landing card copy must not use "stay", "staying" or "hotel" (existing test rule).
- The mock's glyphs map to lucide: ☀/☁ → `Sun`/`Cloud`, → → `ArrowRight`, ↻ → `RefreshCw`, ✓ → `Check`, ♡ → `Heart`.
- Offline message, verbatim: `You're offline. Plan changes need a connection.` Welcome copy verbatim from spec §G. Tester wording verbatim from spec §G's table.
- No new dependencies. No `loading.tsx`/`template.tsx`. Comments only for a non-obvious why.
- The service worker registers in production builds only; offline behaviour is verified with `next build` + a local server using a non-production env (never `next start` with `.env.production.local` present — move it aside or use a separate env file).

## Review Focus

1. **Leaving the Landing mid-shuffle.** A visitor taps the front card and immediately follows the Privacy link: the hook's commit and `finally` run against an unmounted tree. Expectation: no throw, no React error. (Test in Task 2, Step R.)
2. **A browser without the Web Animations API.** `Element.animate` is missing; both batches are empty. Expectation: the trip still swaps on tap and the guard clears for the next tap. (Test in Task 2, Step R.)
3. **A word countdown with a photo.** "Sometime in September" is far wider than "26"; the stats column must obey the same single width rule and never overlap. (Test in Task 7, Step R; browser check in Task 7, Step 5.)
4. **"Save again" while offline or with no service worker.** Expectation: no fetches, no "Saving…" that never ends, the row keeps its last honest state. (Test in Task 17, Step R.)
5. **Dismissing the Welcome by tapping outside the sheet on a phone.** Expectation: it is marked seen like every other close, so it never nags again. (Test in Task 20, Step R.)

**Line numbers** in the tasks were read at the branch start (`304926c5`). Later tasks shift them; locate edits by the quoted code, not the number. Tasks 19–21 edit files that Tasks 1–6 also touch (`sign-in-panel.tsx`, `landing.test.tsx`): apply the string changes to whatever the file looks like then.

**Order:** 1 → 21. Part boundaries: Tasks 1–6 (Landing + Google button), 7 (Trip home note), 8–9 (sign-in deep links), 10–13 (Help), 14–18 (Offline), 19–21 (tester wording + Welcome).

---

## Part 1 — §A Landing card fan + §B Google button

Context every task relies on (all paths absolute under `/work`):

- Branch `feat/landing-shuffle-2026-10-01` is checked out (`git branch --show-current`). Before `npm`/`npx` in a shell: `export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use` (`.nvmrc` = 22).
- The handoff is the source of truth: `/work/design_handoff/landing-shuffle-handoff/LANDING.md` (§2 phone, §3 desktop, §5 motion, §6 a11y, §7 tests) and `/work/design_handoff/landing-shuffle-handoff/app/landing/sample-trips.ts`. The spec `/work/docs/specs/2026-10-01-landing-shuffle-help-offline.md` §A/§B records the departures (`max-[379px]:` variant, lucide icons, audit retired, `flushSync`, `align` prop, Google mark + loading).
- Current code: `/work/app/landing/landing.tsx` (phone tree lines 62–77), `/work/app/landing/sample-cards.tsx` (`entrance()` lines 14–20, `Initials` lines 22–28, `CollageCards` lines 37–109, `PhoneSampleCards` lines 126–192), `/work/app/landing/sign-in-panel.tsx` (`LandingActions` lines 107–134), `/work/app/landing/signin-buttons.tsx` (54 lines), `/work/app/globals.css` (`tp-card-in` block lines 540–570; `--ease-bounce`/`--ease-exit` lines 429–430; `.text-label` line 729; `@utility pressable` line 476).
- Kit: `Card` and `cardVariants` are exported from `/work/components/ui/card.tsx` (line 79); `Badge` from `/work/components/ui/badge.tsx` (`[&_svg]:size-3` built in, `caps` prop); `Button` from `/work/components/ui/button.tsx` with `loading?: boolean` (spinner `data-testid="button-spinner"`, `aria-busy`, `disabled`, label kept in flow at `opacity-0`, size `lg` sets `[&_svg]:size-5`). `cn` from `/work/lib/cn.ts`.
- Tests: Vitest + Testing Library (jsdom), `npm test -- <path>`. `/work/test/setup.ts` stubs `window.matchMedia` (every query false except `(min-width: 640px)`) and exports `setMatchMedia(matches)`; it does **not** restore it after a test, so any test that overrides it restores it in `afterEach` with `setMatchMedia((q) => q === "(min-width: 640px)")`. jsdom has no `Element.prototype.animate` / `getAnimations` — tests install them. Vitest's jsdom is `pretendToBeVisual`, so `document.hidden` is `false`.
- §G (another part) renames "Request access" → "Become a tester" and "Teepee is invite-only" → "Teepee is in testing" in `sign-in-panel.tsx`, `landing.test.tsx`, `sign-in-panel.test.tsx`. Tasks here **do not touch those strings**; new tests below avoid quoting them so the two parts merge cleanly in either order.

---

### Task 1: Sample-trip data, ribbon CSS, centred phone hero, `LandingActions align`

**Files:**
- Create: `/work/app/landing/sample-trips.ts` (verbatim copy of the handoff file)
- Create: `/work/app/landing/sample-trips.test.ts`
- Modify: `/work/app/globals.css` (comment lines 540–547; insert after line 570)
- Modify: `/work/app/globals.landing-motion.test.ts`
- Modify: `/work/app/landing/sign-in-panel.tsx` lines 1–6 (import) and 107–134 (`LandingActions`)
- Modify: `/work/app/landing/sign-in-panel.test.tsx` (append one test)
- Modify: `/work/app/landing/landing.tsx` lines 6–24 (comment) and 62–77 (phone tree)
- Modify: `/work/app/landing/landing.test.tsx` (append one test)

**Interfaces:**
- Produces: `export type SampleTrip`, `export const SAMPLE_TRIPS: SampleTrip[]` (4 entries; index 0 = "Japan in Autumn") in `app/landing/sample-trips.ts`.
- Produces: `LandingActions({ size, align = "start" }: { size: "md" | "lg"; align?: "start" | "center" })`.
- Produces: CSS `@keyframes tp-marquee`, `.tp-marquee`, `.tp-marquee:active`, reduced-motion `animation: none`.

- [ ] **Step 1: Copy the data file and write its test**

Run: `cp /work/design_handoff/landing-shuffle-handoff/app/landing/sample-trips.ts /work/app/landing/sample-trips.ts` then `diff /work/design_handoff/landing-shuffle-handoff/app/landing/sample-trips.ts /work/app/landing/sample-trips.ts` (must print nothing).

Create `/work/app/landing/sample-trips.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { SAMPLE_TRIPS } from "./sample-trips";

describe("SAMPLE_TRIPS (handoff LANDING.md §4)", () => {
  it("has four trips, Japan first, in the order planning / on the road / done / planning", () => {
    expect(SAMPLE_TRIPS).toHaveLength(4);
    expect(SAMPLE_TRIPS[0].name).toBe("Japan in Autumn");
    expect(SAMPLE_TRIPS[1].name).toBe("Portugal by rail");
    expect(SAMPLE_TRIPS.map((t) => t.status)).toEqual(["Planning", "On the road", "Done", "Planning"]);
  });
  it("every trip has four stops, a three-row plan, two initials and two note lines", () => {
    for (const t of SAMPLE_TRIPS) {
      expect(t.stops).toHaveLength(4);
      expect(t.plan).toHaveLength(3);
      expect(t.who).toHaveLength(2);
      expect(t.note).toHaveLength(2);
      expect(t.small).toHaveLength(2);
    }
  });
  it("never says stay, staying or hotel, and carries no unicode glyphs (lucide draws them)", () => {
    const text = JSON.stringify(SAMPLE_TRIPS);
    expect(text).not.toMatch(/\bhotel\b|\bstay\b|staying/i);
    expect(text).not.toMatch(/→|♡|☀|☁|↻|✓/);
  });
});
```

Run: `npm test -- app/landing/sample-trips.test.ts` → PASS (the data is already right; this pins it).

- [ ] **Step 2: Write the failing CSS test**

Append to `/work/app/globals.landing-motion.test.ts` (inside the file, after the existing `describe`):

```ts
describe("Landing route ribbon (handoff LANDING.md §5.4)", () => {
  it("defines the tp-marquee keyframe to -50% and loops it linearly on --tp-marquee-dur", () => {
    expect(css).toMatch(/@keyframes tp-marquee \{ to \{ transform: translateX\(-50%\); \} \}/);
    expect(css).toMatch(/\.tp-marquee \{ animation: tp-marquee var\(--tp-marquee-dur, 22s\) linear infinite; \}/);
  });
  it("pauses on press and is switched off, not run once, under reduced motion", () => {
    expect(css).toMatch(/\.tp-marquee:active \{ animation-play-state: paused; \}/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{ \.tp-marquee \{ animation: none; \} \}/);
  });
  it("the card comment no longer claims nothing loops — the ribbon does", () => {
    expect(css).not.toContain("nothing loops");
    expect(css).toMatch(/ribbon/);
  });
});
```

Run: `npm test -- app/globals.landing-motion.test.ts` → FAIL ×3 (no `tp-marquee`, comment still says "nothing loops").

- [ ] **Step 3: Edit `globals.css`**

Replace lines 540–547 (the comment starting `/* Landing / Sign in sample cards (spec 2026-09-29 §1.4): a springy` and ending `on these elements. */`) with:

```css
/* Landing sample cards (spec 2026-09-29 §1.4; 2026-10-01 card fan): a springy
   staggered entrance, once per load. The one looping element on the page is
   the route ribbon's marquee (tp-marquee, below). Each card sets --tp-tilt
   (its rest rotation) and --tp-i (its place in the stagger) inline. Cards may
   set --tp-delay for uneven arrival (spec 2026-09-29 collage C7). The rest
   transform lives here, not in the keyframe's `to`, and the fill is
   `backwards` only, so :hover below can move the card once it has landed.
   Tailwind's rotate-* utilities set the `rotate` property and would double
   up — never use them on these elements. The shuffle
   (app/landing/use-trip-shuffle.ts) animates each card's positioned
   wrapper, never the .tp-card-in element: that would fight this transform. */
```

Insert immediately after line 570 (the `}` closing `@media (prefers-reduced-motion: reduce) { .tp-card-in, .tp-card-pop-in, ... }`):

```css
/* Landing route ribbon (handoff LANDING.md §5.4). The track holds two
   identical halves and moves by -50%, so the loop has no seam. The
   reduced-motion rule is explicit: the global rule in @layer base would run
   it once and leave the track at -50% — the same content, but one moving
   frame. */
@keyframes tp-marquee { to { transform: translateX(-50%); } }
.tp-marquee { animation: tp-marquee var(--tp-marquee-dur, 22s) linear infinite; }
.tp-marquee:active { animation-play-state: paused; } /* press to read */
@media (prefers-reduced-motion: reduce) { .tp-marquee { animation: none; } }
```

Run: `npm test -- app/globals.landing-motion.test.ts` → PASS.

- [ ] **Step 4: Write the failing `LandingActions` test**

Append inside the `describe` in `/work/app/landing/sign-in-panel.test.tsx`:

```ts
  it("align='center' centres the legal row; the row never wraps in either mode (LANDING.md §2.1)", () => {
    const { unmount } = render(
      <SignInPanelProvider controls={<span />}>
        <LandingActions size="md" align="center" />
      </SignInPanelProvider>,
    );
    const centred = screen.getByRole("navigation", { name: "Legal" }).parentElement!;
    expect(centred.className).toContain("justify-center");
    expect(centred.className).toContain("whitespace-nowrap");
    expect(centred.className).not.toContain("flex-wrap");
    unmount();
    setup();
    const start = screen.getByRole("navigation", { name: "Legal" }).parentElement!;
    expect(start.className).not.toContain("justify-center");
    expect(start.className).toContain("whitespace-nowrap");
    expect(start.className).not.toContain("flex-wrap");
  });
```

Run: `npm test -- app/landing/sign-in-panel.test.tsx` → FAIL (no `justify-center`, no `whitespace-nowrap`, `flex-wrap` present).

- [ ] **Step 5: Add the prop**

In `/work/app/landing/sign-in-panel.tsx` add after line 5 (`import { Button } ...`):

```ts
import { cn } from "@/lib/cn";
```

Replace lines 107–134 (`export function LandingActions ...` to its closing `}`) with:

```tsx
export function LandingActions({ size, align = "start" }: { size: "md" | "lg"; align?: "start" | "center" }) {
  const open = useContext(OpenPanel);
  const grow = size === "md" ? "flex-1" : undefined;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-3">
        <Button type="button" size={size} className={grow} onClick={() => open("sign-in")}>
          Sign in
        </Button>
        <Button type="button" variant="secondary" size={size} className={grow} onClick={() => open("request")}>
          Request access
        </Button>
      </div>
      {/* One line even at 393px; centred under the phone hero (LANDING.md §2.1). */}
      <div
        className={cn(
          "flex items-center gap-x-1.5 whitespace-nowrap text-[13px] font-medium text-muted-foreground",
          align === "center" && "justify-center",
        )}
      >
        <span>Teepee is invite-only</span>
        <span aria-hidden="true">·</span>
        <nav aria-label="Legal" className="flex items-center gap-x-1.5">
          <Link href="/privacy" className="tap-target underline underline-offset-2">
            Privacy
          </Link>
          <span aria-hidden="true">·</span>
          <Link href="/terms" className="tap-target underline underline-offset-2">
            Terms
          </Link>
        </nav>
      </div>
    </div>
  );
}
```

(The button labels and "Teepee is invite-only" are §G's to change; if §G has already landed, keep its strings and apply only the signature, the `cn` import and the legal-row `className`.)

Run: `npm test -- app/landing/sign-in-panel.test.tsx` → PASS.

- [ ] **Step 6: Write the failing Landing test**

Append inside the `describe` in `/work/app/landing/landing.test.tsx`:

```ts
  it("phone: the hero is centred and the legal row sits centred on one line; desktop keeps start alignment (LANDING.md §2.1)", () => {
    render(<Landing />);
    expect(phone().className).toContain("items-center");
    expect(phone().className).toContain("text-center");
    expect(within(phone()).getByRole("heading", { level: 1 }).className).toContain("text-balance");
    const phoneLegal = within(phone()).getByRole("navigation", { name: "Legal" }).parentElement!;
    expect(phoneLegal.className).toContain("justify-center");
    expect(phoneLegal.className).toContain("whitespace-nowrap");
    const desktopLegal = within(desktop()).getByRole("navigation", { name: "Legal" }).parentElement!;
    expect(desktopLegal.className).not.toContain("justify-center");
    expect(desktopLegal.className).toContain("whitespace-nowrap");
  });
```

Run: `npm test -- app/landing/landing.test.tsx` → FAIL on the new test only.

- [ ] **Step 7: Centre the phone hero**

In `/work/app/landing/landing.tsx` replace lines 62–77 (from `{/* ── Phone, below lg: ...` to the closing `</div>` of `data-slot="landing-phone"`) with:

```tsx
        {/* ── Phone, below lg: centred hero, way in, then the card fan ── */}
        <div data-slot="landing-phone" className="flex h-dvh flex-col items-center overflow-hidden px-6 text-center lg:hidden">
          <div className="pt-3.5">
            <Logo size={26} />
          </div>
          <h1 className="pt-7 font-display text-[50px] font-extrabold leading-[0.95] tracking-[-0.05em] text-balance">
            Plan it with your people<span className="text-coral">.</span>
          </h1>
          <p className="mt-3.5 max-w-[310px] text-[15px] font-semibold leading-[1.4] text-balance">
            Stops, trains, beds and budget all in one place. For the trip you&apos;re dreaming up, the one you&apos;re on, and everywhere you&apos;ve been.
          </p>
          <div className="mt-5 self-stretch">
            <LandingActions size="md" align="center" />
          </div>
          <PhoneSampleCards />
        </div>
```

And in the file comment (lines 6–11) change `desktop tree (hero + way in left, a nine-piece collage on a clipped sun panel right) from lg, and the phone tree (hero, way in, sample cards filling the rest of the screen) below it.` to `desktop tree (hero + way in left, a nine-piece card fan on a clipped sun panel right) from lg, and the phone tree (centred hero, way in, a five-piece card fan filling the rest of the screen) below it — handoff design_handoff/landing-shuffle-handoff/LANDING.md.`

Run: `npm test -- app/landing` → PASS.

- [ ] **Step 8: Gates and commit**

Run: `npx tsc --noEmit && npm run lint` → clean.

```
git add app/landing/sample-trips.ts app/landing/sample-trips.test.ts app/globals.css app/globals.landing-motion.test.ts app/landing/sign-in-panel.tsx app/landing/sign-in-panel.test.tsx app/landing/landing.tsx app/landing/landing.test.tsx
git commit -m "feat(landing): sample trips data, ribbon marquee CSS, centred phone hero, LandingActions align

Copies sample-trips.ts verbatim from the 2026-10-01 handoff, adds tp-marquee
(the one looping element; explicit reduced-motion off), centres the phone
hero and legal row, and gives LandingActions an align prop. Spec
2026-10-01 §A, handoff LANDING.md §2.1 and §5.4.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: `useTripShuffle` — Web Animations shuffle and auto-rotate

**Files:**
- Create: `/work/app/landing/use-trip-shuffle.ts`
- Create: `/work/app/landing/use-trip-shuffle.test.tsx`

**Interfaces:**
- Consumes: `SAMPLE_TRIPS`, `SampleTrip` from `./sample-trips`; `flushSync` from `react-dom`.
- Produces:
  ```ts
  export type ShuffleTiming = { outStaggerMs: number; inStaggerMs: number };
  export const PHONE_TIMING: ShuffleTiming;    // { outStaggerMs: 30, inStaggerMs: 70 }
  export const DESKTOP_TIMING: ShuffleTiming;  // { outStaggerMs: 20, inStaggerMs: 55 }
  export const SHUFFLE_OUT_MS = 170; SHUFFLE_IN_MS = 380; AUTO_ROTATE_MS = 8000; TAP_COOLDOWN_MS = 16000;
  export function useTripShuffle(pieceOrder: readonly string[], timing: ShuffleTiming): {
    index: number;
    trip: SampleTrip;
    pieceRef: (name: string) => (el: HTMLElement | null) => void;  // stable per name
    shuffle: () => Promise<void>;                                  // the tap; records the cooldown
  };
  ```
  Out order = DOM order of the registered wrappers; in order = `pieceOrder`. The piece named `"stops"` fades opacity only.

- [ ] **Step 1: Write the failing tests**

Create `/work/app/landing/use-trip-shuffle.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { setMatchMedia } from "@/test/setup";
import { useTripShuffle, PHONE_TIMING, AUTO_ROTATE_MS, TAP_COOLDOWN_MS, type ShuffleTiming } from "./use-trip-shuffle";

type Call = { el: Element; keyframes: Keyframe[]; options: KeyframeAnimationOptions; cancel: ReturnType<typeof vi.fn> };
let calls: Call[];
// Each animate() resolves at once unless a test parks `gate`; `finished`
// then waits for gate.resolve().
let gate: { promise: Promise<void>; resolve: () => void; reject: (e: Error) => void } | null;
let lingering: { cancel: ReturnType<typeof vi.fn> };

function installAnimate() {
  calls = [];
  gate = null;
  lingering = { cancel: vi.fn() };
  Element.prototype.animate = vi.fn(function (this: Element, keyframes: Keyframe[] | PropertyIndexedKeyframes | null, options?: number | KeyframeAnimationOptions) {
    const cancel = vi.fn();
    calls.push({ el: this, keyframes: keyframes as Keyframe[], options: options as KeyframeAnimationOptions, cancel });
    const finished = gate ? gate.promise : Promise.resolve();
    return { finished, cancel, pause: vi.fn(), play: vi.fn() } as unknown as Animation;
  }) as unknown as typeof Element.prototype.animate;
  Element.prototype.getAnimations = vi.fn(() => [lingering as unknown as Animation]) as unknown as typeof Element.prototype.getAnimations;
}

function park() {
  let resolve!: () => void;
  let reject!: (e: Error) => void;
  const promise = new Promise<void>((res, rej) => { resolve = res; reject = rej; });
  gate = { promise, resolve, reject };
  return gate;
}

const ORDER = ["countdown", "lilac", "stops"] as const;

function Harness({ timing = PHONE_TIMING }: { timing?: ShuffleTiming }) {
  const { trip, pieceRef, shuffle } = useTripShuffle(ORDER, timing);
  return (
    <div>
      <div data-piece="lilac" ref={pieceRef("lilac")} />
      <div data-piece="countdown" ref={pieceRef("countdown")}>
        <button type="button" onClick={() => void shuffle()}>{trip.name}</button>
      </div>
      <div data-piece="stops" ref={pieceRef("stops")} />
    </div>
  );
}

const name = () => screen.getByRole("button").textContent;
const piece = (el: Element) => (el as HTMLElement).dataset.piece;
const flush = () => act(async () => {});

beforeEach(installAnimate);
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  setMatchMedia((q) => q === "(min-width: 640px)");
});

describe("useTripShuffle (handoff LANDING.md §5.2)", () => {
  it("a tap runs the outs in DOM order, commits, runs the ins in piece order, and cancels the outs", async () => {
    render(<Harness />);
    expect(name()).toBe("Japan in Autumn");
    await act(async () => { fireEvent.click(screen.getByRole("button")); });
    await flush();
    expect(name()).toBe("Portugal by rail");
    expect(calls).toHaveLength(6);
    const outs = calls.slice(0, 3);
    const ins = calls.slice(3);
    expect(outs.map((c) => piece(c.el))).toEqual(["lilac", "countdown", "stops"]);
    expect(outs.map((c) => c.options.delay)).toEqual([0, 30, 60]);
    for (const c of outs) {
      expect(c.options.duration).toBe(170);
      expect(c.options.fill).toBe("forwards");
      expect(c.options.easing).toBe("cubic-bezier(0.4, 0, 1, 1)");
      expect(c.cancel).toHaveBeenCalled();
    }
    expect(outs[1].keyframes).toEqual([{ transform: "none", opacity: 1 }, { transform: "translateY(24px) scale(.9)", opacity: 0 }]);
    expect(outs[2].keyframes).toEqual([{ opacity: 1 }, { opacity: 0 }]); // the ribbon only fades
    expect(ins.map((c) => piece(c.el))).toEqual(["countdown", "lilac", "stops"]);
    expect(ins.map((c) => c.options.delay)).toEqual([0, 70, 140]);
    for (const c of ins) {
      expect(c.options.duration).toBe(380);
      expect(c.options.fill).toBe("backwards");
      expect(c.options.easing).toBe("cubic-bezier(0.34, 1.56, 0.64, 1)");
    }
    expect(ins[0].keyframes[0]).toEqual({ transform: "translateY(-36px) rotate(-6deg) scale(1.06)", opacity: 0 });
    expect(ins[1].keyframes[0]).toEqual({ transform: "translateY(-36px) rotate(6deg) scale(1.06)", opacity: 0 });
    expect(ins[2].keyframes).toEqual([{ opacity: 0 }, { transform: "none", opacity: 1 }]);
  });

  it("desktop timing staggers 20ms out and 55ms in", async () => {
    render(<Harness timing={{ outStaggerMs: 20, inStaggerMs: 55 }} />);
    await act(async () => { fireEvent.click(screen.getByRole("button")); });
    await flush();
    expect(calls.slice(0, 3).map((c) => c.options.delay)).toEqual([0, 20, 40]);
    expect(calls.slice(3).map((c) => c.options.delay)).toEqual([0, 55, 110]);
  });

  it("a second tap while one is running is ignored (guard)", async () => {
    render(<Harness />);
    const g = park();
    await act(async () => { fireEvent.click(screen.getByRole("button")); });
    await act(async () => { fireEvent.click(screen.getByRole("button")); });
    expect(calls).toHaveLength(3); // one out batch, nothing more
    expect(name()).toBe("Japan in Autumn");
    gate = null;
    await act(async () => { g.resolve(); });
    await flush();
    expect(name()).toBe("Portugal by rail");
    expect(calls).toHaveLength(6);
  });

  it("the finally still advances, cancels anything left on the wrappers and clears the guard when an animation rejects", async () => {
    render(<Harness />);
    const g = park();
    await act(async () => { fireEvent.click(screen.getByRole("button")); });
    gate = null;
    await act(async () => { g.reject(new Error("AbortError")); });
    await flush();
    expect(name()).toBe("Portugal by rail");
    expect(lingering.cancel).toHaveBeenCalled();
    await act(async () => { fireEvent.click(screen.getByRole("button")); });
    await flush();
    expect(name()).toBe("Patagonia loop");
  });

  it("reduced motion: a tap swaps at once with no animation, and no interval is started", async () => {
    setMatchMedia((q) => q === "(prefers-reduced-motion: reduce)");
    const setInterval = vi.spyOn(window, "setInterval");
    render(<Harness />);
    await act(async () => { fireEvent.click(screen.getByRole("button")); });
    expect(name()).toBe("Portugal by rail");
    expect(Element.prototype.animate).not.toHaveBeenCalled();
    expect(setInterval).not.toHaveBeenCalled();
  });

  it("wraps from the last trip back to the first", async () => {
    render(<Harness />);
    for (let i = 0; i < 4; i++) {
      await act(async () => { fireEvent.click(screen.getByRole("button")); });
      await flush();
    }
    expect(name()).toBe("Japan in Autumn");
  });
});

describe("useTripShuffle auto-rotate (handoff LANDING.md §5.3)", () => {
  it("advances every 8s", async () => {
    vi.useFakeTimers();
    render(<Harness />);
    act(() => { vi.advanceTimersByTime(AUTO_ROTATE_MS); });
    await flush();
    expect(name()).toBe("Portugal by rail");
    act(() => { vi.advanceTimersByTime(AUTO_ROTATE_MS); });
    await flush();
    expect(name()).toBe("Patagonia loop");
  });

  it("skips ticks for 16s after a tap", async () => {
    vi.useFakeTimers();
    render(<Harness />);
    await act(async () => { fireEvent.click(screen.getByRole("button")); });
    await flush();
    expect(name()).toBe("Portugal by rail");
    act(() => { vi.advanceTimersByTime(TAP_COOLDOWN_MS); }); // two ticks, both inside the cooldown
    await flush();
    expect(name()).toBe("Portugal by rail");
    act(() => { vi.advanceTimersByTime(AUTO_ROTATE_MS); }); // third tick, cooldown over
    await flush();
    expect(name()).toBe("Patagonia loop");
  });

  it("skips a tick while the document is hidden", async () => {
    vi.useFakeTimers();
    vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    render(<Harness />);
    act(() => { vi.advanceTimersByTime(AUTO_ROTATE_MS); });
    await flush();
    expect(name()).toBe("Japan in Autumn");
  });

  it("skips a tick while a shuffle is running", async () => {
    vi.useFakeTimers();
    render(<Harness />);
    park();
    await act(async () => { fireEvent.click(screen.getByRole("button")); });
    act(() => { vi.advanceTimersByTime(TAP_COOLDOWN_MS + AUTO_ROTATE_MS); });
    await flush();
    expect(calls).toHaveLength(3); // the tick did not start a second shuffle
  });

  it("clears the interval on unmount", () => {
    vi.useFakeTimers();
    const clear = vi.spyOn(window, "clearInterval");
    const { unmount } = render(<Harness />);
    unmount();
    expect(clear).toHaveBeenCalled();
  });
});
```

Run: `npm test -- app/landing/use-trip-shuffle.test.tsx` → FAIL: cannot resolve `./use-trip-shuffle`.

- [ ] **Step 2: Implement the hook**

Create `/work/app/landing/use-trip-shuffle.ts`:

```ts
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { SAMPLE_TRIPS, type SampleTrip } from "./sample-trips";

/**
 * The Landing card fan's shuffle (handoff LANDING.md §5.2–5.3): tap the front
 * card, or every 8s on its own, every piece drops out and the next sample
 * trip drops in. One instance per tree; the phone and desktop trees rotate
 * independently (only one is displayed). Web Animations on each piece's
 * positioned *wrapper* — never on the .tp-card-in card, whose transform is
 * its tilt.
 */
export const SHUFFLE_OUT_MS = 170;
export const SHUFFLE_IN_MS = 380;
export const AUTO_ROTATE_MS = 8_000;
export const TAP_COOLDOWN_MS = 2 * AUTO_ROTATE_MS;

export type ShuffleTiming = { outStaggerMs: number; inStaggerMs: number };
export const PHONE_TIMING: ShuffleTiming = { outStaggerMs: 30, inStaggerMs: 70 };
export const DESKTOP_TIMING: ShuffleTiming = { outStaggerMs: 20, inStaggerMs: 55 };

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";
// The ribbon is a band, not a card: it fades in place rather than dropping.
const FADE_ONLY = "stops";
// el.animate() needs a literal easing; var() is not a timing function. These
// mirror --ease-exit / --ease-bounce in app/globals.css.
const EASE_EXIT = "cubic-bezier(0.4, 0, 1, 1)";
const EASE_BOUNCE = "cubic-bezier(0.34, 1.56, 0.64, 1)";

function reducedMotion() {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(REDUCED_MOTION).matches;
}

type Piece = { name: string; el: HTMLElement };

function canAnimate(el: HTMLElement) {
  return typeof el.animate === "function";
}

export function useTripShuffle(pieceOrder: readonly string[], timing: ShuffleTiming) {
  const [index, setIndex] = useState(0);
  const indexRef = useRef(0);
  const busy = useRef(false);
  const lastTap = useRef(0);
  const pieces = useRef(new Map<string, HTMLElement>());
  const refCallbacks = useRef(new Map<string, (el: HTMLElement | null) => void>());

  const pieceRef = useCallback((name: string) => {
    let cb = refCallbacks.current.get(name);
    if (!cb) {
      cb = (el) => {
        if (el) pieces.current.set(name, el);
        else pieces.current.delete(name);
      };
      refCallbacks.current.set(name, cb);
    }
    return cb;
  }, []);

  // flushSync, not requestAnimationFrame: rAF never fires in a background
  // tab, and the cards would stay hidden at opacity 0 until it did.
  const commit = useCallback((next: number) => {
    indexRef.current = next;
    flushSync(() => setIndex(next));
  }, []);

  const run = useCallback(async () => {
    if (busy.current) return;
    const next = (indexRef.current + 1) % SAMPLE_TRIPS.length;
    if (reducedMotion()) {
      commit(next);
      return;
    }
    busy.current = true;
    const registered: Piece[] = Array.from(pieces.current, ([name, el]) => ({ name, el })).filter((p) => canAnimate(p.el));
    const outOrder = registered.sort((a, b) => (a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
    const inOrder = pieceOrder
      .map((name) => ({ name, el: pieces.current.get(name) }))
      .filter((p): p is Piece => !!p.el && canAnimate(p.el));
    try {
      const outs = outOrder.map(({ name, el }, k) =>
        el.animate(
          name === FADE_ONLY
            ? [{ opacity: 1 }, { opacity: 0 }]
            : [{ transform: "none", opacity: 1 }, { transform: "translateY(24px) scale(.9)", opacity: 0 }],
          { duration: SHUFFLE_OUT_MS, delay: k * timing.outStaggerMs, easing: EASE_EXIT, fill: "forwards" },
        ),
      );
      await Promise.all(outs.map((a) => a.finished));
      commit(next);
      const ins = inOrder.map(({ name, el }, k) =>
        el.animate(
          [
            name === FADE_ONLY ? { opacity: 0 } : { transform: `translateY(-36px) rotate(${k % 2 ? 6 : -6}deg) scale(1.06)`, opacity: 0 },
            { transform: "none", opacity: 1 },
          ],
          { duration: SHUFFLE_IN_MS, delay: k * timing.inStaggerMs, easing: EASE_BOUNCE, fill: "backwards" },
        ),
      );
      // A card that lands early would otherwise fall back to its out
      // animation's forwards fill (opacity 0) until the last card lands.
      outs.forEach((a) => a.cancel());
      await Promise.all(ins.map((a) => a.finished));
    } catch {
      // A cancelled animation rejects `finished`; the finally puts things right.
    } finally {
      if (indexRef.current !== next) commit(next);
      for (const el of pieces.current.values()) el.getAnimations?.().forEach((a) => a.cancel());
      busy.current = false;
    }
  }, [pieceOrder, timing, commit]);

  const shuffle = useCallback(() => {
    lastTap.current = Date.now();
    return run();
  }, [run]);

  useEffect(() => {
    if (reducedMotion()) return;
    const id = window.setInterval(() => {
      if (document.hidden || reducedMotion() || busy.current) return;
      if (Date.now() - lastTap.current <= TAP_COOLDOWN_MS) return;
      void run();
    }, AUTO_ROTATE_MS);
    return () => window.clearInterval(id);
  }, [run]);

  return { index, trip: SAMPLE_TRIPS[index], pieceRef, shuffle };
}
```

Run: `npm test -- app/landing/use-trip-shuffle.test.tsx` → PASS (11 tests).

- [ ] **Step 3: Gates and commit**

Run: `npx tsc --noEmit && npm run lint` → clean (if `react-hooks/exhaustive-deps` flags `commit`, it is already in `run`'s deps; do not disable the rule).

```
git add app/landing/use-trip-shuffle.ts app/landing/use-trip-shuffle.test.tsx
git commit -m "feat(landing): useTripShuffle — Web Animations shuffle and 8s auto-rotate

Out in DOM order, flushSync commit, in by piece order with alternating
±6° and the outs cancelled as soon as the ins start; a finally that
advances, cancels and clears the guard. Auto-rotate skips hidden tabs,
reduced motion, a running shuffle and 16s after a tap. Handoff
LANDING.md §5.2–5.3; spec 2026-10-01 §A.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

- [ ] **Step R (Review Focus 1 and 2): unmount mid-shuffle, and a browser with no Web Animations**

Append inside `describe("useTripShuffle (handoff LANDING.md §5.2)", …)` in `/work/app/landing/use-trip-shuffle.test.tsx`:

```tsx
  it("unmounting mid-shuffle neither throws nor logs a React error", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const g = park();
    const { unmount } = render(<Harness />);
    await act(async () => { fireEvent.click(screen.getByRole("button")); });
    unmount();
    g.resolve();
    await flush();
    expect(error).not.toHaveBeenCalled();
  });

  it("with no Element.animate (an old Safari) the index still advances and the guard clears", async () => {
    const saved = Element.prototype.animate;
    // Simulate a browser without the Web Animations API.
    delete (Element.prototype as Partial<Element>).animate;
    try {
      render(<Harness />);
      await act(async () => { fireEvent.click(screen.getByRole("button")); });
      await flush();
      expect(name()).toBe("Portugal by rail");
      await act(async () => { fireEvent.click(screen.getByRole("button")); });
      await flush();
      expect(name()).toBe("Patagonia loop");
    } finally {
      Element.prototype.animate = saved;
    }
  });
```

Run: `npm test -- app/landing/use-trip-shuffle.test.tsx`
Expected: PASS. If the unmount test logs "Can't perform a React state update on an unmounted component" or throws from `flushSync`, guard the commit with a `mounted` ref set false in the hook's unmount cleanup, and skip `flushSync`/the in-animations when it is false (the `finally` still cancels animations on the wrappers it still holds). Amend the Task 2 commit (`git commit --amend --no-edit`) rather than adding a commit.

---

### Task 3: Phone tree — five pieces, wrappers vs cards, button front card, ribbon

**Files:**
- Modify: `/work/app/landing/sample-cards.tsx` — lines 1–28 (header, imports, helpers) and lines 111–192 (`PhoneSampleCards`); `CollageCards` (lines 37–109) is left byte-for-byte as it is until Task 4
- Modify: `/work/app/landing/sample-cards.test.tsx` lines 49–77 (the `PhoneSampleCards` describe)
- Modify: `/work/app/landing/landing.test.tsx` line 30

**Interfaces:**
- Consumes: `useTripShuffle`, `PHONE_TIMING` (Task 2); `SampleTrip` (Task 1); `Card`, `cardVariants`, `Badge`, `Avatar`, `AvatarFallback`, `cn`; lucide `Sun`, `Cloud`, `ArrowRight`, `RefreshCw`.
- Produces: `export const PHONE_PIECE_ORDER = ["countdown", "lilac", "weather", "train", "stops"] as const;` `export function PhoneSampleCards(): JSX` (unchanged name); internal `Ribbon` and `FrontCard` helpers reused by Task 4.

- [ ] **Step 1: Write the failing phone tests**

Replace lines 49–77 of `/work/app/landing/sample-cards.test.tsx` (the whole `describe("PhoneSampleCards (spec collage §1.4)"...)`) with:

```tsx
describe("PhoneSampleCards (handoff LANDING.md §2.2–2.3)", () => {
  it("renders five pieces in a clipped, centred area around a fixed 268px stage", () => {
    const { getByTestId } = render(<PhoneSampleCards />);
    const root = getByTestId("sample-cards-phone");
    expect(root).not.toHaveAttribute("aria-hidden");
    for (const c of ["overflow-hidden", "flex-1", "min-h-0", "items-center", "justify-center", "-mx-6", "self-stretch", "text-left"]) {
      expect(root.className).toContain(c);
    }
    const stage = root.firstElementChild as HTMLElement;
    expect(stage.className).toContain("h-[268px]");
    expect(stage.className).toContain("max-w-[393px]");
    expect(pieces(root).map((p) => p.dataset.piece)).toEqual(["lilac", "weather", "countdown", "train", "stops"]);
  });
  it("each piece is a positioned wrapper around a tp-card-in card with a tilt and uneven delays (§5.1)", () => {
    const { getByTestId } = render(<PhoneSampleCards />);
    const ps = pieces(getByTestId("sample-cards-phone"));
    for (const p of ps) {
      expect(p.className).toContain("absolute");
      expect(p.className).not.toContain("tp-card-in");
      const card = p.firstElementChild as HTMLElement;
      expect(card.className).toContain("tp-card-in");
      expect(card.style.getPropertyValue("--tp-tilt")).toMatch(/deg$/);
      expect(card.style.getPropertyValue("--tp-delay")).toMatch(/ms$/);
      expect(card.className).not.toMatch(/(^|\s)rotate-/);
    }
    const delays = ps.map((p) => parseInt((p.firstElementChild as HTMLElement).style.getPropertyValue("--tp-delay"), 10)).sort((a, b) => a - b);
    expect(delays[0]).toBeGreaterThanOrEqual(250);
    const steps = new Set(delays.slice(1).map((d, i) => d - delays[i]));
    expect(steps.size).toBeGreaterThan(2); // irregular, not a fixed beat
  });
  it("lays the fan out symmetrically with the narrow-phone variant, the front card untilted and the chip inert", () => {
    const { getByTestId } = render(<PhoneSampleCards />);
    const root = getByTestId("sample-cards-phone");
    const by = (n: string) => root.querySelector<HTMLElement>(`[data-piece="${n}"]`)!;
    for (const c of ["left-3.5", "top-[34px]", "w-[116px]", "max-[379px]:w-[104px]"]) expect(by("lilac").className).toContain(c);
    for (const c of ["right-3.5", "top-[34px]", "w-[116px]", "max-[379px]:w-[104px]"]) expect(by("weather").className).toContain(c);
    for (const c of ["left-1/2", "-ml-[90px]", "top-2.5", "z-20", "w-[180px]", "max-[379px]:w-[168px]", "max-[379px]:-ml-[84px]"]) expect(by("countdown").className).toContain(c);
    for (const c of ["inset-x-0", "top-[166px]", "z-30", "justify-center", "pointer-events-none"]) expect(by("train").className).toContain(c);
    for (const c of ["-inset-x-3", "top-[216px]"]) expect(by("stops").className).toContain(c);
    expect((by("countdown").firstElementChild as HTMLElement).style.getPropertyValue("--tp-tilt")).toBe("0deg");
    expect((by("lilac").firstElementChild as HTMLElement).style.getPropertyValue("--tp-tilt")).toBe("-7deg");
    expect((by("weather").firstElementChild as HTMLElement).style.getPropertyValue("--tp-tilt")).toBe("7deg");
    expect((by("train").firstElementChild as HTMLElement).style.getPropertyValue("--tp-tilt")).toBe("-4deg");
    const band = by("stops").firstElementChild as HTMLElement;
    for (const c of ["border-y-2", "bg-card", "py-2.5", "overflow-hidden"]) expect(band.className).toContain(c);
    const track = band.firstElementChild as HTMLElement;
    expect(track.className).toContain("tp-marquee");
    expect(track.className).toContain("[--tp-marquee-dur:22s]");
    expect(track.children).toHaveLength(2);
    expect(track.children[0].querySelectorAll("span.bg-coral")).toHaveLength(8); // four stops twice per half
  });
  it("carries the Japan copy from sample-trips with lucide glyphs — no unicode arrows, hearts or suns, no stay/hotel", () => {
    const { getByTestId } = render(<PhoneSampleCards />);
    const root = getByTestId("sample-cards-phone");
    const t = root.textContent!;
    for (const s of ["Planning", "Japan in Autumn", "26", "sleeps", "to go", "Kyoto · 4 nights", "Machiya near Gion", "Kyoto", "21°", "light jacket tonight", "Shinkansen · 11:12", "Tokyo", "Hakone", "Osaka"]) {
      expect(t).toContain(s);
    }
    expect(t).not.toMatch(/→|♡|☀|☁|↻|✓/);
    expect(t).not.toMatch(/\bhotel\b|\bstay\b|staying|free for up to/i);
    expect(t).not.toMatch(/Fushimi Inari|Jess forked|¥2,400|Naoshima|let's go/); // dropped from phone
    expect(root.querySelector("svg.lucide-sun")).not.toBeNull();
    expect(root.querySelector("svg.lucide-refresh-cw")).not.toBeNull();
    expect(root.querySelectorAll("svg.lucide-arrow-right").length).toBeGreaterThan(8);
  });
});
```

In `/work/app/landing/landing.test.tsx` change line 30 from
`expect(within(phone()).getByTestId("sample-cards-phone")).toHaveAttribute("aria-hidden", "true");` to
`expect(within(phone()).getByTestId("sample-cards-phone")).not.toHaveAttribute("aria-hidden");`

Run: `npm test -- app/landing/sample-cards.test.tsx app/landing/landing.test.tsx` → FAIL (ten pieces, aria-hidden present, old copy).

- [ ] **Step 2: Rewrite the phone half of `sample-cards.tsx`**

Replace lines 1–28 of `/work/app/landing/sample-cards.tsx` with:

```tsx
"use client";

import type { CSSProperties } from "react";
import { ArrowRight, Check, Cloud, Heart, RefreshCw, Sun } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, cardVariants } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/cn";
import type { SampleTrip } from "./sample-trips";
import { useTripShuffle, PHONE_TIMING, DESKTOP_TIMING } from "./use-trip-shuffle";

/**
 * The Landing's card fan (handoff design_handoff/landing-shuffle-handoff/
 * LANDING.md; spec 2026-10-01 §A): a centred, mirrored group of tilted sample
 * cards that shuffles between four sample trips, with a route ribbon
 * underneath — the one piece that bleeds off the edges. Every piece is a
 * positioned *wrapper* (what the shuffle animates) around a *card* carrying
 * tp-card-in and its tilt (§5.1); Tailwind rotate-* utilities are
 * deliberately absent (they would double the rotation).
 *
 * Accessibility (§6): neither container is aria-hidden — that would hide the
 * one button. Each decorative wrapper is aria-hidden; the coral front card is
 * a <button aria-label="Show another sample trip"> with its visible content
 * aria-hidden. No live region: the cards are illustrative.
 */
export function entrance(tilt: number, i: number, delayMs?: number): CSSProperties {
  return {
    "--tp-tilt": `${tilt}deg`,
    "--tp-i": i,
    ...(delayMs === undefined ? {} : { "--tp-delay": `${delayMs}ms` }),
  } as CSSProperties;
}

function Initials({ initials, tone }: { initials: string; tone: "sun" | "lilac" }) {
  return (
    <Avatar className="size-[26px]">
      <AvatarFallback className={tone === "sun" ? "bg-sun text-[10px]" : "bg-lilac text-[10px]"}>{initials}</AvatarFallback>
    </Avatar>
  );
}

/** The route ribbon (§2.3): two identical halves on a -50% marquee, so the loop has no seam. */
function Ribbon({ stops, repeats, size, i, delayMs }: { stops: readonly string[]; repeats: 2 | 3; size: "phone" | "desktop"; i: number; delayMs: number }) {
  const phone = size === "phone";
  const items = Array.from({ length: repeats }, () => stops).flat();
  return (
    <div
      className={cn(
        "tp-card-in overflow-hidden border-y-2 border-border bg-card",
        phone ? "py-2.5 shadow-[0_3px_0_hsl(var(--shadow-ink))]" : "py-3 shadow-[0_4px_0_hsl(var(--shadow-ink))]",
      )}
      style={entrance(0, i, delayMs)}
    >
      <div className={cn("tp-marquee flex w-max", phone ? "[--tp-marquee-dur:22s]" : "[--tp-marquee-dur:30s]")}>
        {[0, 1].map((half) => (
          <div
            key={half}
            data-ribbon-half=""
            className={cn("flex items-center whitespace-nowrap font-bold", phone ? "gap-2.5 pr-2.5 text-[13px]" : "gap-3 pr-3 text-[15px]")}
          >
            {items.map((stop, k) => (
              <span key={k} className="flex items-center gap-2">
                <span className={cn("rounded-full bg-coral", phone ? "size-2" : "size-[9px]")} />
                {stop}
                <ArrowRight className="size-3 text-muted-foreground" />
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** The coral front card — the only focusable thing in the fan (§6). Untilted, so hover and press are free to use `pressable`. */
function FrontCard({ trip, size, onShuffle }: { trip: SampleTrip; size: "phone" | "desktop"; onShuffle: () => void }) {
  const phone = size === "phone";
  return (
    <button
      type="button"
      aria-label="Show another sample trip"
      onClick={onShuffle}
      className={cn(
        cardVariants({ tone: "coral", shadow: phone ? 2 : 4, radius: "xl" }),
        "tp-card-in pressable flex w-full flex-col items-center text-center",
        phone ? "p-4" : "p-5",
      )}
      style={entrance(0, 0, 300)}
    >
      <span aria-hidden="true" className="contents">
        <RefreshCw className={phone ? "absolute right-3 top-2.5 size-3.5" : "absolute right-4 top-3.5 size-4"} />
        <Badge caps>{trip.status}</Badge>
        <span className={cn("whitespace-nowrap font-display font-extrabold", phone ? "mt-2.5 text-[18px] leading-[1.2]" : "mt-3 text-[24px] leading-[1.1] tracking-[-0.03em]")}>
          {trip.name}
        </span>
        <span className={cn("flex items-baseline", phone ? "gap-1.5" : "gap-2")}>
          <span className={cn("font-display font-extrabold leading-[0.9] tracking-[-0.05em]", phone ? "text-[56px]" : "text-[76px]")}>{trip.big}</span>
          <span className={cn("text-left font-display font-extrabold leading-[1.2]", phone ? "text-[15px]" : "text-[20px]")}>
            {trip.small[0]}
            <br />
            {trip.small[1]}
          </span>
        </span>
      </span>
    </button>
  );
}
```

Replace lines 111–192 (the `PhoneSampleCards` doc comment and function, to the end of the file) with:

```tsx
export const PHONE_PIECE_ORDER = ["countdown", "lilac", "weather", "train", "stops"] as const;

/**
 * Phone fan (§2.2): five pieces on a 393×268 stage centred in whatever is
 * left under the buttons. Side cards 116px (104px under 380px wide), the
 * front card 180px (168px), the sun chip across the seam, the ribbon as the
 * one bleed. Delays are deliberately uneven so the cards land like they were
 * tossed, not dealt.
 */
export function PhoneSampleCards() {
  const { trip, pieceRef, shuffle } = useTripShuffle(PHONE_PIECE_ORDER, PHONE_TIMING);
  const Sky = trip.sky === "sun" ? Sun : Cloud;
  return (
    <div
      data-testid="sample-cards-phone"
      className="relative -mx-6 flex min-h-0 flex-1 items-center justify-center self-stretch overflow-hidden text-left"
    >
      <div className="relative h-[268px] w-full max-w-[393px] shrink-0">
        <div ref={pieceRef("lilac")} data-piece="lilac" aria-hidden="true" className="absolute left-3.5 top-[34px] w-[116px] max-[379px]:w-[104px]">
          <Card tone="lilac" shadow={1} className="tp-card-in p-3" style={entrance(-7, 1, 520)}>
            <p className="text-[11px] font-bold leading-[1.2]">{trip.place}</p>
            <p className="mt-1 font-display text-[15px] font-extrabold leading-[1.2]">{trip.bed}</p>
            <div className="h-10" />
          </Card>
        </div>
        <div ref={pieceRef("weather")} data-piece="weather" aria-hidden="true" className="absolute right-3.5 top-[34px] w-[116px] max-[379px]:w-[104px]">
          <Card tone="teal" shadow={1} className="tp-card-in p-3 text-right" style={entrance(7, 2, 700)}>
            <p className="text-[10px] font-bold">{trip.city}</p>
            <p className="flex items-center justify-end gap-1 font-display text-[26px] font-extrabold leading-none tracking-[-0.04em]">
              {trip.temp}
              <Sky className="size-[18px]" />
            </p>
            <p className="mt-1 text-[11px] font-medium">{trip.wear}</p>
            <div className="h-[26px]" />
          </Card>
        </div>
        <div ref={pieceRef("countdown")} data-piece="countdown" className="absolute left-1/2 top-2.5 z-20 -ml-[90px] w-[180px] max-[379px]:-ml-[84px] max-[379px]:w-[168px]">
          <FrontCard trip={trip} size="phone" onShuffle={() => void shuffle()} />
        </div>
        <div ref={pieceRef("train")} data-piece="train" aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-[166px] z-30 flex justify-center">
          <Badge variant="sun" className="tp-card-in px-2.5 py-1 text-[11px] shadow-hard-1" style={entrance(-4, 3, 610)}>
            <ArrowRight />
            {trip.leg}
          </Badge>
        </div>
        <div ref={pieceRef("stops")} data-piece="stops" aria-hidden="true" className="absolute -inset-x-3 top-[216px]">
          <Ribbon stops={trip.stops} repeats={2} size="phone" i={4} delayMs={880} />
        </div>
      </div>
    </div>
  );
}
```

`Check`, `Heart` and `DESKTOP_TIMING` are only used by Task 4; until then ESLint reports them unused. To keep this commit green, write the two import lines as `import { ArrowRight, Cloud, RefreshCw, Sun } from "lucide-react";` and `import { useTripShuffle, PHONE_TIMING } from "./use-trip-shuffle";` here, and widen them to the full lists in Task 4 Step 2. (`cardVariants`, `cn` and `SampleTrip` are already used by `FrontCard` and `Ribbon`.)

Run: `npm test -- app/landing` → PASS (the untouched `CollageCards` tests still pass; `landing.test.tsx` line 58 still finds "Zz Machiya near Gion" in the desktop tree).

- [ ] **Step 3: Gates and commit**

Run: `npx tsc --noEmit && npm run lint` → clean.

```
git add app/landing/sample-cards.tsx app/landing/sample-cards.test.tsx app/landing/landing.test.tsx
git commit -m "feat(landing): phone card fan — five pieces, button front card, route ribbon

Replaces the ten-piece percentage spread with the handoff's 393×268 fan:
lilac / weather side cards, the coral front card as the one button,
the sun chip and a two-half marquee ribbon. Wrappers carry position and
take the shuffle; cards keep tp-card-in and their tilt. LANDING.md
§2.2–2.3, §5.1, §6.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Desktop tree — nine pieces in a mirrored fan

**Files:**
- Modify: `/work/app/landing/sample-cards.tsx` — the lucide/hook import lines, and the `CollageCards` doc comment + function (currently lines 30–109 of the original; after Task 3 they sit between `FrontCard` and `PHONE_PIECE_ORDER`)
- Modify: `/work/app/landing/sample-cards.test.tsx` lines 20–47 (the `CollageCards` describe)
- Modify: `/work/app/landing/landing.test.tsx` lines 29 and 58

**Interfaces:**
- Produces: `export const DESKTOP_PIECE_ORDER = ["countdown", "lilac", "weather", "day", "money", "fork", "wishlist", "train", "stops"] as const;` `export function CollageCards(): JSX` (name kept; `data-testid="collage-cards"` kept).

- [ ] **Step 1: Write the failing desktop tests**

Replace lines 20–47 of `/work/app/landing/sample-cards.test.tsx` (the `describe("CollageCards (spec collage §1.3)"...)`) with:

```tsx
describe("CollageCards (handoff LANDING.md §3)", () => {
  it("renders nine pieces in three mirrored rows on a 600×630 stage with the scale ladder", () => {
    const { getByTestId } = render(<CollageCards />);
    const root = getByTestId("collage-cards");
    expect(root).not.toHaveAttribute("aria-hidden");
    for (const c of ["h-[630px]", "w-[600px]", "-translate-x-1/2", "-translate-y-1/2", "scale-[.9]", "min-[1280px]:scale-100", "min-[2560px]:scale-[1.75]"]) {
      expect(root.className).toContain(c);
    }
    expect(pieces(root).map((p) => p.dataset.piece)).toEqual(["day", "money", "lilac", "weather", "countdown", "train", "fork", "wishlist", "stops"]);
    const by = (n: string) => root.querySelector<HTMLElement>(`[data-piece="${n}"]`)!;
    for (const c of ["left-10", "top-[18px]", "w-[210px]"]) expect(by("day").className).toContain(c);
    for (const c of ["right-10", "top-[18px]", "w-[210px]"]) expect(by("money").className).toContain(c);
    for (const c of ["left-3", "top-[196px]", "w-[170px]"]) expect(by("lilac").className).toContain(c);
    for (const c of ["right-3", "top-[196px]", "w-[170px]"]) expect(by("weather").className).toContain(c);
    for (const c of ["left-[170px]", "top-[150px]", "z-20", "w-[260px]"]) expect(by("countdown").className).toContain(c);
    for (const c of ["inset-x-0", "top-[360px]", "z-30", "justify-center", "pointer-events-none"]) expect(by("train").className).toContain(c);
    for (const c of ["left-[70px]", "top-[418px]", "w-[180px]"]) expect(by("fork").className).toContain(c);
    for (const c of ["right-[70px]", "top-[418px]", "w-[190px]"]) expect(by("wishlist").className).toContain(c);
    for (const c of ["-inset-x-10", "top-[574px]"]) expect(by("stops").className).toContain(c);
    // colours cross over: lilac/teal in the middle row, teal/lilac in the bottom row
    expect(by("lilac").firstElementChild!.className).toContain("bg-lilac");
    expect(by("weather").firstElementChild!.className).toContain("bg-teal");
    expect(by("fork").firstElementChild!.className).toContain("bg-teal");
    expect(by("wishlist").firstElementChild!.className).toContain("bg-lilac");
  });
  it("each piece is a wrapper around a tp-card-in card with the mock's tilt and uneven delays (§5.1)", () => {
    const { getByTestId } = render(<CollageCards />);
    const root = getByTestId("collage-cards");
    const ps = pieces(root);
    const tilts: Record<string, string> = { day: "-8deg", money: "8deg", lilac: "-5deg", weather: "5deg", countdown: "0deg", train: "-4deg", fork: "6deg", wishlist: "-6deg", stops: "0deg" };
    for (const p of ps) {
      expect(p.className).toContain("absolute");
      expect(p.className).not.toContain("tp-card-in");
      const card = p.firstElementChild as HTMLElement;
      expect(card.className).toContain("tp-card-in");
      expect(card.style.getPropertyValue("--tp-tilt")).toBe(tilts[p.dataset.piece!]);
      expect(card.style.getPropertyValue("--tp-delay")).toMatch(/ms$/);
      expect(card.className).not.toMatch(/(^|\s)rotate-/);
    }
    const delays = ps.map((p) => parseInt((p.firstElementChild as HTMLElement).style.getPropertyValue("--tp-delay"), 10)).sort((a, b) => a - b);
    expect(delays[0]).toBeGreaterThanOrEqual(250);
    const steps = new Set(delays.slice(1).map((d, i) => d - delays[i]));
    expect(steps.size).toBeGreaterThan(2); // irregular, not a fixed beat
    const track = root.querySelector<HTMLElement>('[data-piece="stops"] .tp-marquee')!;
    expect(track.className).toContain("[--tp-marquee-dur:30s]");
    expect(track.children).toHaveLength(2);
    expect(track.children[0].querySelectorAll("span.bg-coral")).toHaveLength(12); // four stops, three repeats per half
  });
  it("carries the Japan copy from sample-trips with lucide glyphs and no stay/hotel wording", () => {
    const { getByTestId } = render(<CollageCards />);
    const root = getByTestId("collage-cards");
    const t = root.textContent!;
    for (const s of ["Planning", "Japan in Autumn", "26", "sleeps", "to go", "Kyoto · 4 nights", "Machiya near Gion", "paid", "Kyoto", "21°", "light jacket tonight", "Shinkansen · 11:12", "Tue 14 Oct", "09:00", "Fushimi Inari", "Nishiki lunch", "Pontochō", "Ramen at Ichiran", "¥2,400", "Jess owes you ¥1,200", "JM", "AL", "Jess forked", "“Slow Kyoto”", "Wishlist", "Naoshima art island", "2", "Tokyo", "Hakone", "Osaka"]) {
      expect(t).toContain(s);
    }
    expect(t).not.toMatch(/→|♡|☀|☁|↻|✓/);
    expect(t).not.toMatch(/\bhotel\b|\bstay\b|staying|Odawara|Zz /i);
    expect(root.querySelector("svg.lucide-sun")).not.toBeNull();
    expect(root.querySelector("svg.lucide-check")).not.toBeNull();
    expect(root.querySelector("svg.lucide-heart")).not.toBeNull();
    expect(root.querySelector("svg.lucide-refresh-cw")).not.toBeNull();
  });
});
```

In `/work/app/landing/landing.test.tsx`:
- line 29: `expect(within(desktop()).getByTestId("collage-cards")).toHaveAttribute("aria-hidden", "true");` → `expect(within(desktop()).getByTestId("collage-cards")).not.toHaveAttribute("aria-hidden");`
- line 58: `expect(within(desktop()).getByText("Zz Machiya near Gion")).toBeInTheDocument();` → `expect(within(desktop()).getByText("Machiya near Gion")).toBeInTheDocument();`

Run: `npm test -- app/landing/sample-cards.test.tsx app/landing/landing.test.tsx` → FAIL (old collage).

- [ ] **Step 2: Rebuild `CollageCards`**

In `/work/app/landing/sample-cards.tsx` set the two import lines to:

```ts
import { ArrowRight, Check, Cloud, Heart, RefreshCw, Sun } from "lucide-react";
import { useTripShuffle, PHONE_TIMING, DESKTOP_TIMING } from "./use-trip-shuffle";
```

Replace the `CollageCards` doc comment and function (from `/**\n * The desktop collage (spec 2026-09-29 collage §1.3)` through its closing `}`) with:

```tsx
export const DESKTOP_PIECE_ORDER = ["countdown", "lilac", "weather", "day", "money", "fork", "wishlist", "train", "stops"] as const;

/**
 * Desktop fan (§3): nine pieces in three mirrored rows on a 600×630 stage
 * centred in the sun panel and scaled per breakpoint. Top row day / money,
 * middle row lilac / coral / teal, bottom row teal / lilac (the colours cross
 * over), the sun chip across the middle seam and the ribbon across the
 * bottom — the only piece that runs off the panel.
 */
export function CollageCards() {
  const { trip, pieceRef, shuffle } = useTripShuffle(DESKTOP_PIECE_ORDER, DESKTOP_TIMING);
  const Sky = trip.sky === "sun" ? Sun : Cloud;
  return (
    <div
      data-testid="collage-cards"
      className="absolute left-1/2 top-1/2 h-[630px] w-[600px] -translate-x-1/2 -translate-y-1/2 scale-[.9] min-[1152px]:scale-[.95] min-[1280px]:scale-100 min-[1536px]:scale-110 min-[1920px]:scale-[1.3] min-[2560px]:scale-[1.75]"
    >
      <div ref={pieceRef("day")} data-piece="day" aria-hidden="true" className="absolute left-10 top-[18px] w-[210px]">
        <Card shadow={3} radius="xl" className="tp-card-in p-4" style={entrance(-8, 3, 740)}>
          <p className="text-label text-muted-foreground">{trip.date}</p>
          <ul className="mt-2 flex flex-col gap-1.5 text-[13px] font-semibold">
            {trip.plan.map((row) => (
              <li key={row.time} className="truncate">
                <span className="tabular-nums text-muted-foreground">{row.time}</span> {row.what}
              </li>
            ))}
          </ul>
        </Card>
      </div>
      <div ref={pieceRef("money")} data-piece="money" aria-hidden="true" className="absolute right-10 top-[18px] w-[210px]">
        <Card shadow={3} radius="xl" className="tp-card-in flex flex-col items-end p-4 text-right" style={entrance(8, 7, 1180)}>
          <p className="whitespace-nowrap text-[12px] font-bold">{trip.spend}</p>
          <p className="font-display text-[32px] font-extrabold leading-none tracking-[-0.04em] tabular-nums">{trip.amount}</p>
          <Badge variant="sun" className="mt-2">{trip.owes}</Badge>
        </Card>
      </div>
      <div ref={pieceRef("lilac")} data-piece="lilac" aria-hidden="true" className="absolute left-3 top-[196px] w-[170px]">
        <Card tone="lilac" shadow={2} className="tp-card-in p-4" style={entrance(-5, 1, 520)}>
          <p className="text-[11px] font-bold leading-[1.2]">{trip.place}</p>
          <p className="mt-1.5 font-display text-lg font-extrabold leading-[1.2]">{trip.bed}</p>
          <Badge variant="teal" className="mt-2.5">
            paid
            <Check />
          </Badge>
          <div className="h-[18px]" />
        </Card>
      </div>
      <div ref={pieceRef("weather")} data-piece="weather" aria-hidden="true" className="absolute right-3 top-[196px] w-[170px]">
        <Card tone="teal" shadow={2} radius="xl" className="tp-card-in p-4 text-right" style={entrance(5, 6, 1050)}>
          <p className="text-[11px] font-bold">{trip.city}</p>
          <p className="flex items-center justify-end gap-1.5 font-display text-[40px] font-extrabold leading-none tracking-[-0.04em]">
            {trip.temp}
            <Sky className="size-7" />
          </p>
          <p className="mt-1 text-[12px] font-medium">{trip.wear}</p>
          <div className="h-[30px]" />
        </Card>
      </div>
      <div ref={pieceRef("countdown")} data-piece="countdown" className="absolute left-[170px] top-[150px] z-20 w-[260px]">
        <FrontCard trip={trip} size="desktop" onShuffle={() => void shuffle()} />
      </div>
      <div ref={pieceRef("train")} data-piece="train" aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-[360px] z-30 flex justify-center">
        <Badge variant="sun" className="tp-card-in px-3.5 py-2 text-xs shadow-hard-2" style={entrance(-4, 2, 610)}>
          <ArrowRight />
          {trip.leg}
        </Badge>
      </div>
      <div ref={pieceRef("fork")} data-piece="fork" aria-hidden="true" className="absolute left-[70px] top-[418px] w-[180px]">
        <Card tone="teal" shadow={2} className="tp-card-in p-3.5" style={entrance(6, 4, 880)}>
          <div className="flex gap-1.5">
            <Initials initials={trip.who[0]} tone="sun" />
            <Initials initials={trip.who[1]} tone="lilac" />
          </div>
          <p className="mt-2 text-[13px] font-medium leading-snug">
            {trip.note[0]}
            <br />
            {trip.note[1]}
          </p>
        </Card>
      </div>
      <div ref={pieceRef("wishlist")} data-piece="wishlist" aria-hidden="true" className="absolute right-[70px] top-[418px] w-[190px]">
        <Card tone="lilac" shadow={2} radius="xl" className="tp-card-in p-4" style={entrance(-6, 5, 960)}>
          <p className="text-label">Wishlist</p>
          <p className="mt-1 font-display text-lg font-extrabold leading-tight">{trip.wish}</p>
          <Badge className="mt-2">
            <Heart />
            {trip.hearts}
          </Badge>
        </Card>
      </div>
      <div ref={pieceRef("stops")} data-piece="stops" aria-hidden="true" className="absolute -inset-x-10 top-[574px]">
        <Ribbon stops={trip.stops} repeats={3} size="desktop" i={8} delayMs={1370} />
      </div>
    </div>
  );
}
```

Run: `npm test -- app/landing` → PASS.

- [ ] **Step 3: Gates and commit**

Run: `npx tsc --noEmit && npm run lint` → clean.

```
git add app/landing/sample-cards.tsx app/landing/sample-cards.test.tsx app/landing/landing.test.tsx
git commit -m "feat(landing): desktop card fan — nine pieces in three mirrored rows

Rebuilds the collage as the handoff's 600×630 fan: day / money on top,
lilac / coral / teal across the middle, teal / lilac below, the sun chip
on the seam and a three-repeat marquee ribbon as the only bleed. Wrappers
take the shuffle; cards keep tp-card-in. LANDING.md §3.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Accessibility and shuffle tests across both trees; retire the Playwright audit

**Files:**
- Modify: `/work/app/landing/sample-cards.test.tsx` (imports at lines 1–3; append two describes)
- Delete: `/work/scripts/landing-cards-audit.ts`, `/work/scripts/landing-cards-audit/checks.ts`, `/work/scripts/landing-cards-audit/checks.test.ts`
- Modify: `/work/package.json` line 23 (`"audit:landing-cards": "tsx scripts/landing-cards-audit.ts",`)

**Interfaces:**
- Consumes: `CollageCards`, `PhoneSampleCards` (Tasks 3–4); `AUTO_ROTATE_MS`, `TAP_COOLDOWN_MS` (Task 2); `setMatchMedia` from `@/test/setup`.
- Produces: nothing new; removes the `audit:landing-cards` npm script.

- [ ] **Step 1: Write the accessibility and shuffle tests**

Change lines 1–3 of `/work/app/landing/sample-cards.test.tsx` to:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within, fireEvent, act } from "@testing-library/react";
import { setMatchMedia } from "@/test/setup";
import { CollageCards, PhoneSampleCards, entrance } from "./sample-cards";
import { AUTO_ROTATE_MS, TAP_COOLDOWN_MS } from "./use-trip-shuffle";
```

Append at the end of the file:

```tsx
describe("Card fan accessibility (handoff LANDING.md §6)", () => {
  it.each([
    ["phone", () => render(<PhoneSampleCards />).getByTestId("sample-cards-phone")],
    ["desktop", () => render(<CollageCards />).getByTestId("collage-cards")],
  ])("%s: the front card is the only focusable element, a pressable button named 'Show another sample trip' whose content is aria-hidden", (_, mount) => {
    const root = mount();
    expect(root).not.toHaveAttribute("aria-hidden");
    const focusable = root.querySelectorAll("button, a, input, [tabindex]");
    expect(focusable).toHaveLength(1);
    const button = within(root).getByRole("button", { name: "Show another sample trip" });
    expect(button).toBe(focusable[0]);
    expect(button).toHaveAttribute("type", "button");
    expect(button.className).toContain("pressable");
    expect(button.className).toContain("tp-card-in");
    expect(button.className).toContain("bg-coral");
    expect(button.firstElementChild).toHaveAttribute("aria-hidden", "true");
    expect(button.closest("[data-piece]")).toHaveAttribute("data-piece", "countdown");
    expect(button.closest("[data-piece]")).not.toHaveAttribute("aria-hidden");
    for (const p of pieces(root)) {
      if (p.dataset.piece !== "countdown") expect(p).toHaveAttribute("aria-hidden", "true");
    }
    expect(root.querySelector("[aria-live], [role='status']")).toBeNull();
  });
});

describe("Card fan shuffle (handoff LANDING.md §5, §7)", () => {
  beforeEach(() => {
    Element.prototype.animate = vi.fn(() => ({ finished: Promise.resolve(), cancel: vi.fn() }) as unknown as Animation) as unknown as typeof Element.prototype.animate;
    Element.prototype.getAnimations = vi.fn(() => []) as unknown as typeof Element.prototype.getAnimations;
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    setMatchMedia((q) => q === "(min-width: 640px)");
  });
  const tap = async (root: HTMLElement) => {
    await act(async () => { fireEvent.click(within(root).getByRole("button", { name: "Show another sample trip" })); });
    await act(async () => {});
  };

  it("phone: clicking the front card shows Portugal by rail", async () => {
    const root = render(<PhoneSampleCards />).getByTestId("sample-cards-phone");
    await tap(root);
    expect(root.textContent).toContain("Portugal by rail");
    expect(root.textContent).toContain("Alfa Pendular · 09:39");
    expect(root.textContent).not.toContain("Japan in Autumn");
    expect(root.querySelector("svg.lucide-cloud")).not.toBeNull();
  });
  it("desktop: clicking the front card shows Portugal by rail on every piece", async () => {
    const root = render(<CollageCards />).getByTestId("collage-cards");
    await tap(root);
    for (const s of ["Portugal by rail", "Porto · 3 nights", "Flat on the Ribeira", "18°", "Sat 9 May", "Livraria Lello", "€9.60", "Sam added", "Surf lesson in Ericeira", "Lisbon", "Coimbra"]) {
      expect(root.textContent).toContain(s);
    }
  });
  it("the two trees rotate independently", async () => {
    render(<><PhoneSampleCards /><CollageCards /></>);
    const phone = screen.getByTestId("sample-cards-phone");
    const desktop = screen.getByTestId("collage-cards");
    await tap(phone);
    expect(phone.textContent).toContain("Portugal by rail");
    expect(desktop.textContent).toContain("Japan in Autumn");
  });
  it("auto-rotates after 8s, but not within 16s of a click", async () => {
    vi.useFakeTimers();
    const root = render(<PhoneSampleCards />).getByTestId("sample-cards-phone");
    act(() => { vi.advanceTimersByTime(AUTO_ROTATE_MS); });
    await act(async () => {});
    expect(root.textContent).toContain("Portugal by rail");
    await tap(root);
    expect(root.textContent).toContain("Patagonia loop");
    act(() => { vi.advanceTimersByTime(TAP_COOLDOWN_MS); });
    await act(async () => {});
    expect(root.textContent).toContain("Patagonia loop");
    act(() => { vi.advanceTimersByTime(AUTO_ROTATE_MS); });
    await act(async () => {});
    expect(root.textContent).toContain("Lakes weekend");
  });
  it("under reduced motion there is no interval and a click swaps the trip at once", async () => {
    setMatchMedia((q) => q === "(prefers-reduced-motion: reduce)");
    const setInterval = vi.spyOn(window, "setInterval");
    const root = render(<CollageCards />).getByTestId("collage-cards");
    await act(async () => { fireEvent.click(within(root).getByRole("button", { name: "Show another sample trip" })); });
    expect(root.textContent).toContain("Portugal by rail");
    expect(Element.prototype.animate).not.toHaveBeenCalled();
    expect(setInterval).not.toHaveBeenCalled();
  });
  it.each([
    ["phone", () => render(<PhoneSampleCards />).getByTestId("sample-cards-phone"), 8],
    ["desktop", () => render(<CollageCards />).getByTestId("collage-cards"), 12],
  ])("%s: the two ribbon halves have identical text", (_, mount, perHalf) => {
    const root = mount();
    const halves = root.querySelectorAll<HTMLElement>("[data-ribbon-half]");
    expect(halves).toHaveLength(2);
    expect(halves[0].textContent).toBe(halves[1].textContent);
    expect(halves[0].querySelectorAll("span.bg-coral")).toHaveLength(perHalf);
    expect(halves[0].textContent).toContain("Tokyo");
  });
});
```

Run: `npm test -- app/landing/sample-cards.test.tsx` → PASS (Tasks 3–4 already satisfy these; this step pins §6/§7). If the a11y `it.each` fails on `focusable` count, the cause is a stray `tabindex` or `<a>` — fix the component, not the test.

- [ ] **Step 2: Retire the Playwright audit**

```
git rm scripts/landing-cards-audit.ts scripts/landing-cards-audit/checks.ts scripts/landing-cards-audit/checks.test.ts
```

In `/work/package.json` delete line 23: `    "audit:landing-cards": "tsx scripts/landing-cards-audit.ts",` (leave `audit:layout:crops` above and `audit:nav` below untouched; the JSON stays valid because the removed line is not the last entry).

Confirm nothing live still points at it:

```
grep -rn "landing-cards-audit\|audit:landing-cards" /work --include=*.ts --include=*.tsx --include=*.json --include=*.md --include=*.mjs --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=design_handoff
```

Expected hits only in history, which stays: `docs/superpowers/plans/2026-09-29-one-landing.md` (the plan that created it) and `docs/specs/2026-10-01-landing-shuffle-help-offline.md` (the spec retiring it). `app/landing/sample-cards.tsx` line 124's `npm run audit:landing-cards` comment was removed in Task 3. `scripts/lib/audit-browser.ts` and `scripts/layout-audit/config.ts` stay — `nav-audit.ts`, `layout-audit.ts` and `contrast-audit.ts` import them. `.verify/` is gitignored (`.gitignore` line 24) and was only this script's default `OUT_DIR`; nothing in `docs/` names a landing-cards capture.

Run: `npm test -- scripts app/landing` → PASS (no `scripts/landing-cards-audit` suite any more).

- [ ] **Step 3: Gates and commit**

Run: `npx tsc --noEmit && npm run lint && npm test` → clean / green.

```
git add app/landing/sample-cards.test.tsx package.json
git commit -m "test(landing): one-button rule, shuffle and ribbon tests; retire the landing-cards audit

Pins LANDING.md §6 (no aria-hidden container, every decorative piece
hidden, one pressable button named 'Show another sample trip') and §7
(click shows Portugal, 8s auto-rotate with the 16s tap cooldown, reduced
motion swaps at once, identical ribbon halves) on both trees. Removes
scripts/landing-cards-audit and its npm script: the fan is fixed-pixel
and symmetrical, and the coverage property it measured no longer exists.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Google mark and press feedback on the sign-in buttons (§B)

**Files:**
- Create: `/work/components/ui/google-mark.tsx`
- Create: `/work/components/ui/google-mark.test.tsx`
- Modify: `/work/app/landing/signin-buttons.tsx` (whole file, 54 lines)
- Create: `/work/app/landing/signin-buttons.test.tsx`
- Test (unchanged, must stay green): `/work/app/landing/sign-in-controls.test.tsx`, `/work/app/landing/sign-in-panel.test.tsx`

**Interfaces:**
- Produces: `export function GoogleMark({ className }: { className?: string }): JSX` — 18px inline SVG, `aria-hidden`, `data-testid="google-mark"`, official four colours, never recoloured.
- Produces (unchanged signatures): `GoogleSignInButton({ variant?, className?, callbackUrl? })`, `DevSignInButton({ email, label, callbackUrl? })`; both now show `loading` from click until `pageshow` (bfcache) or a rejected `signIn`.
- Consumes: `Button` `loading` prop (`/work/components/ui/button.tsx` lines 169, 205–208); `signIn` from `next-auth/react` (`Promise<void>` with redirect, `node_modules/next-auth/react.d.ts` line 79).

- [ ] **Step 1: Write the failing mark test**

Create `/work/components/ui/google-mark.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { GoogleMark } from "./google-mark";

describe("GoogleMark (spec 2026-10-01 §B)", () => {
  it("is an 18px decorative SVG in Google's four colours, never recoloured", () => {
    const { container } = render(<GoogleMark />);
    const svg = container.querySelector("svg")!;
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg).toHaveAttribute("width", "18");
    expect(svg).toHaveAttribute("height", "18");
    expect(svg).toHaveAttribute("data-testid", "google-mark");
    const fills = Array.from(svg.querySelectorAll("path")).map((p) => p.getAttribute("fill"));
    expect(fills).toEqual(["#EA4335", "#4285F4", "#FBBC05", "#34A853"]);
    expect(svg.outerHTML).not.toContain("currentColor");
  });
  it("takes a className for layout only", () => {
    const { container } = render(<GoogleMark className="mr-1" />);
    expect(container.querySelector("svg")!.className.baseVal).toContain("shrink-0");
    expect(container.querySelector("svg")!.className.baseVal).toContain("mr-1");
  });
});
```

Run: `npm test -- components/ui/google-mark.test.tsx` → FAIL: cannot resolve `./google-mark`.

- [ ] **Step 2: Create the mark**

Create `/work/components/ui/google-mark.tsx`:

```tsx
import { cn } from "@/lib/cn";

/**
 * Server Component. Google's four-colour "G" (the sign-in branding mark), for
 * the Continue with Google button. Fixed brand colours, like the tent-pin in
 * logo.tsx — never `currentColor`, never themed.
 */
export function GoogleMark({ className }: { className?: string }) {
  return (
    <svg width={18} height={18} viewBox="0 0 48 48" aria-hidden="true" data-testid="google-mark" className={cn("shrink-0", className)}>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}
```

Run: `npm test -- components/ui/google-mark.test.tsx` → PASS.

- [ ] **Step 3: Write the failing button tests**

Create `/work/app/landing/signin-buttons.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import { GoogleSignInButton, DevSignInButton } from "./signin-buttons";

const signInMock = vi.hoisted(() => vi.fn());
vi.mock("next-auth/react", () => ({ signIn: signInMock }));

beforeEach(() => {
  signInMock.mockReset();
  signInMock.mockResolvedValue(undefined);
});

const bfcacheReturn = () =>
  act(() => {
    window.dispatchEvent(Object.assign(new Event("pageshow"), { persisted: true }));
  });

describe("GoogleSignInButton (spec 2026-10-01 §B)", () => {
  it("shows the Google G, left of the label, inside the button", () => {
    render(<GoogleSignInButton />);
    const button = screen.getByRole("button", { name: "Continue with Google" });
    const g = button.querySelector('[data-testid="google-mark"]')!;
    expect(g).not.toBeNull();
    expect(g).toHaveAttribute("aria-hidden", "true");
    expect(g.compareDocumentPosition(screen.getByText("Continue with Google")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(button.className).toContain("[&_svg]:size-[18px]");
    expect(button).not.toHaveAttribute("aria-busy");
    expect(button).not.toBeDisabled();
  });
  it("clicking calls signIn with the callbackUrl and shows the loading state with 'Opening Google…'", async () => {
    render(<GoogleSignInButton callbackUrl="/trips/abc/plan" />);
    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));
    expect(signInMock).toHaveBeenCalledWith("google", { callbackUrl: "/trips/abc/plan" });
    const busy = await screen.findByRole("button", { name: "Opening Google…" });
    expect(busy).toHaveAttribute("aria-busy", "true");
    expect(busy).toBeDisabled();
    expect(screen.getByTestId("button-spinner")).toBeInTheDocument();
    expect(busy.querySelector('[data-testid="google-mark"]')).toBeNull(); // the spinner replaces the G
    expect(screen.queryByText("Continue with Google")).toBeNull();
  });
  it("defaults the callbackUrl to /trips", () => {
    render(<GoogleSignInButton />);
    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));
    expect(signInMock).toHaveBeenCalledWith("google", { callbackUrl: "/trips" });
  });
  it("resets when the page is restored from the bfcache", async () => {
    render(<GoogleSignInButton />);
    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));
    await screen.findByRole("button", { name: "Opening Google…" });
    bfcacheReturn();
    const button = screen.getByRole("button", { name: "Continue with Google" });
    expect(button).not.toHaveAttribute("aria-busy");
    expect(button).not.toBeDisabled();
    expect(button.querySelector('[data-testid="google-mark"]')).not.toBeNull();
  });
  it("resets when signIn rejects", async () => {
    signInMock.mockRejectedValueOnce(new Error("offline"));
    render(<GoogleSignInButton />);
    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Continue with Google" })).not.toHaveAttribute("aria-busy"));
  });
  it("keeps the variant and extra classes", () => {
    render(<GoogleSignInButton variant="secondary" className="lg:self-start" />);
    const button = screen.getByRole("button", { name: "Continue with Google" });
    expect(button.className).toContain("bg-card");
    expect(button.className).toContain("lg:self-start");
    expect(button.className).toContain("w-full");
  });
});

describe("DevSignInButton (spec 2026-10-01 §B)", () => {
  it("clicking calls signIn('dev-login') and shows 'Signing in…' with aria-busy", async () => {
    render(<DevSignInButton email="you@example.com" label="You" callbackUrl="/trips/new" />);
    fireEvent.click(screen.getByRole("button", { name: "Continue as You" }));
    expect(signInMock).toHaveBeenCalledWith("dev-login", { email: "you@example.com", callbackUrl: "/trips/new" });
    const busy = await screen.findByRole("button", { name: "Signing in…" });
    expect(busy).toHaveAttribute("aria-busy", "true");
    expect(busy).toBeDisabled();
  });
  it("resets on bfcache return and when signIn rejects", async () => {
    render(<DevSignInButton email="you@example.com" label="You" />);
    fireEvent.click(screen.getByRole("button", { name: "Continue as You" }));
    await screen.findByRole("button", { name: "Signing in…" });
    bfcacheReturn();
    expect(screen.getByRole("button", { name: "Continue as You" })).not.toHaveAttribute("aria-busy");
    signInMock.mockRejectedValueOnce(new Error("offline"));
    fireEvent.click(screen.getByRole("button", { name: "Continue as You" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Continue as You" })).not.toHaveAttribute("aria-busy"));
    expect(signInMock).toHaveBeenLastCalledWith("dev-login", { email: "you@example.com", callbackUrl: "/trips" });
  });
});
```

Run: `npm test -- app/landing/signin-buttons.test.tsx` → FAIL (no G, no loading state).

- [ ] **Step 4: Rewrite `signin-buttons.tsx`**

Replace the whole of `/work/app/landing/signin-buttons.tsx` with:

```tsx
"use client";

import { useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { GoogleMark } from "@/components/ui/google-mark";
import { cn } from "@/lib/cn";

/**
 * Press feedback for a sign-in button (spec 2026-10-01 §B): the kit Button's
 * loading state from the click until the provider's page takes over. Coming
 * back through the bfcache restores this page as it was left — loading — so
 * `pageshow` clears it; a rejected signIn (offline, blocked) clears it too.
 * Same pattern as app/share/[token]/pending-link.tsx.
 */
function useSignInPending() {
  const [pending, setPending] = useState(false);
  useEffect(() => {
    if (!pending) return;
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted) setPending(false);
    };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, [pending]);
  const start = async (go: () => Promise<unknown>) => {
    setPending(true);
    try {
      await go();
    } catch {
      setPending(false);
    }
  };
  return { pending, start };
}

/** "Continue with Google" with Google's G — fine to render even when Google
 * isn't configured locally; it just won't complete the flow without
 * credentials. The Sign in panel uses the outline look; its "Ask to join"
 * mode uses the kit's secondary button (spec 2026-09-29 §1.3). */
export function GoogleSignInButton({
  variant = "outline",
  className,
  callbackUrl = "/trips",
}: {
  variant?: "outline" | "secondary";
  className?: string;
  callbackUrl?: string;
}) {
  const { pending, start } = useSignInPending();
  return (
    <Button
      variant={variant}
      size="lg"
      loading={pending}
      // The G is 18px by brand guidance; size="lg" would make every svg 20px.
      className={cn("w-full [&_svg]:size-[18px]", className)}
      onClick={() => void start(() => signIn("google", { callbackUrl }))}
    >
      {!pending && <GoogleMark />}
      {pending ? "Opening Google…" : "Continue with Google"}
    </Button>
  );
}

/** Dev-only quick sign-in for a seeded traveller (no password). */
export function DevSignInButton({
  email,
  label,
  callbackUrl = "/trips",
}: {
  email: string;
  label: string;
  callbackUrl?: string;
}) {
  const { pending, start } = useSignInPending();
  return (
    <Button
      variant="secondary"
      size="md"
      className="w-full"
      loading={pending}
      onClick={() => void start(() => signIn("dev-login", { email, callbackUrl }))}
    >
      {pending ? "Signing in…" : `Continue as ${label}`}
    </Button>
  );
}
```

Run: `npm test -- app/landing` → PASS. In particular `sign-in-controls.test.tsx` "never renders an input, a form, or a disabled placeholder control" still passes (nothing is disabled at rest) and its two `signIn` callbackUrl tests still pass (the mock there returns `undefined`, which `await` accepts).

- [ ] **Step 5: Gates and commit**

Run: `npx tsc --noEmit && npm run lint && npm test` → clean / green. Then the visual check from the spec's Verification: `next dev`, open `/`, click Sign in, confirm the G sits left of the label on the outline button and the spinner replaces it on click (then press Back: the button is idle again).

```
git add components/ui/google-mark.tsx components/ui/google-mark.test.tsx app/landing/signin-buttons.tsx app/landing/signin-buttons.test.tsx
git commit -m "feat(landing): Google G on the sign-in button and press feedback

Adds components/ui/google-mark.tsx (official four-colour G, 18px,
aria-hidden) and puts it left of the label. On click the button shows the
kit loading state with 'Opening Google…' (dev logins 'Signing in…'),
reset on bfcache pageshow and when signIn rejects. Spec 2026-10-01 §B.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Part 1 — interfaces produced

- `app/landing/sample-trips.ts`: `type SampleTrip`, `SAMPLE_TRIPS: SampleTrip[]` (4 entries, index 0 Japan).
- `app/landing/use-trip-shuffle.ts`: `useTripShuffle(pieceOrder: readonly string[], timing: ShuffleTiming): { index: number; trip: SampleTrip; pieceRef: (name: string) => (el: HTMLElement | null) => void; shuffle: () => Promise<void> }`; `type ShuffleTiming = { outStaggerMs: number; inStaggerMs: number }`; `PHONE_TIMING`, `DESKTOP_TIMING`, `SHUFFLE_OUT_MS = 170`, `SHUFFLE_IN_MS = 380`, `AUTO_ROTATE_MS = 8000`, `TAP_COOLDOWN_MS = 16000`.
- `app/landing/sample-cards.tsx`: `entrance(tilt, i, delayMs?)` (unchanged), `PhoneSampleCards()`, `CollageCards()` (now client components; `data-testid` `sample-cards-phone` / `collage-cards` kept, no `aria-hidden`), `PHONE_PIECE_ORDER`, `DESKTOP_PIECE_ORDER`. Every piece: `[data-piece]` wrapper → first child `.tp-card-in`. Ribbon halves carry `data-ribbon-half`. The one button: `aria-label="Show another sample trip"`.
- `app/landing/sign-in-panel.tsx`: `LandingActions({ size: "md" | "lg"; align?: "start" | "center" })`.
- `components/ui/google-mark.tsx`: `GoogleMark({ className?: string })`, `data-testid="google-mark"`.
- `app/landing/signin-buttons.tsx`: `GoogleSignInButton` / `DevSignInButton` signatures unchanged; labels while pending: "Opening Google…" / "Signing in…".
- CSS: `tp-marquee` keyframe + class, `--tp-marquee-dur` custom property.
- Removed: npm script `audit:landing-cards`, `scripts/landing-cards-audit.ts`, `scripts/landing-cards-audit/`.

---

### Task 7: Countdown tile — stats as a column beside the number when there is a photo (§C)

**Files:**
- Modify: `/work/components/trip/home/desktop/countdown-tile.tsx` (the `statsRow` const, lines ~104–115; the `Card` className, line ~122; the `hasPhoto` branch, lines ~130–147)
- Test: `/work/components/trip/home/desktop/countdown-tile.test.tsx` (append two tests after the last `it`, line ~128)

**Interfaces:**
- Consumes: `CountdownTileProps` (unchanged, `/work/components/trip/home/desktop/countdown-tile.tsx:8-26`), `HomeStat { label: string; value: string }` (`/work/lib/home-stats.ts:3-6`), `CountdownPolaroid` whose root `<div data-polaroid …>` is the polaroid (`/work/components/trip/home/desktop/countdown-polaroid.tsx:36-39`).
- Produces: `CountdownTile(props: CountdownTileProps)` — same export and props. New DOM contract with a photo: the inner wrapper's children are, in order, the left column (chip, then number + first leg), the `<ul aria-label="Trip at a glance">`, the polaroid.

Context the implementer needs: Tailwind v4 container queries are already used in this repo — `@container` on `/work/components/plan/day-strip.tsx:75` with `@[90px]:block` on line 101, and `/work/components/trip/checklist.tsx:207`. The tile is the row-1 `col-span-8` cell of a 12-column grid with 18px gaps (`/work/components/trip/home/desktop/desktop-home-grid.tsx:12-33`), beside the 248px sidebar from `xl` (`/work/components/shell/sidebar.tsx:51`), inside `px-8` trip content capped at `max-w-page-wide` = 100rem (`/work/app/(app)/trips/[tripId]/layout.tsx:122-123`, `/work/app/globals.css:433`). So the tile is about 986px wide at 1800×1008 (≈61.6rem) and about 746px at 1440 (≈46.6rem). The row is 300px with a cover, the tile has `p-6`, so the column has 252px of height: four items at `py-1.5` (12 + 4 border + 22 value + 4 + 13 label = 55px) plus three `gap-1.5` gaps = 238px, which fits; the row-mode `py-2` would not (4×59 + 18 = 254px).

- [ ] **Step 1: Write the failing tests**

Append inside the `describe("CountdownTile", …)` block of `/work/components/trip/home/desktop/countdown-tile.test.tsx`, after the "shows the stat tiles between the chip and the number…" test:

```tsx
  const FOUR_STATS = [
    { label: "Nights", value: "35" },
    { label: "Stops", value: "11" },
    { label: "Countries", value: "3" },
    { label: "Chapters", value: "4" },
  ];

  it("with a photo, the stats are a column between the number block and the polaroid, shown only from the tile width where they fit (Feedback cmunprdsr000004l6da68grrp)", () => {
    renderTile({ cover: COVER, stats: FOUR_STATS });
    const list = screen.getByRole("list", { name: "Trip at a glance" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(4);
    expect(list.className).toContain("flex-col");
    expect(list.className).toContain("hidden");
    expect(list.className).toContain("@[52rem]:flex");
    expect(list.className).not.toContain("flex-wrap");

    // DOM order: [left column] [stats] [polaroid].
    const left = list.previousElementSibling as HTMLElement;
    expect(within(left).getByText("PLANNING")).toBeInTheDocument();
    expect(within(left).getByRole("img", { name: "68 sleeps to go" })).toBeInTheDocument();
    expect(within(left).getByText("Fri 4 Dec · Sydney → Denpasar, Bali")).toBeInTheDocument();
    expect(within(left).queryByRole("list")).toBeNull();
    const right = list.nextElementSibling as HTMLElement;
    expect(right).toHaveAttribute("data-polaroid");

    // The tile itself is the container the column's width rule reads.
    const tile = screen.getByRole("heading", { level: 2, name: "Countdown" }).parentElement as HTMLElement;
    expect(tile.className).toContain("@container");
  });

  it("without a photo the stats stay a wrapping row under the chip, above the number", () => {
    renderTile({ stats: FOUR_STATS });
    const list = screen.getByRole("list", { name: "Trip at a glance" });
    expect(list.className).toContain("flex-wrap");
    expect(list.className).not.toContain("flex-col");
    expect(list.className).not.toContain("hidden");
    const above = list.previousElementSibling as HTMLElement;
    expect(within(above).getByText("PLANNING")).toBeInTheDocument();
    const below = list.nextElementSibling as HTMLElement;
    expect(within(below).getByRole("img", { name: "68 sleeps to go" })).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm test -- components/trip/home/desktop/countdown-tile.test.tsx`
Expected: FAIL on the "with a photo" test — `expected 'flex flex-wrap gap-2 mt-5' to contain 'flex-col'`. The "without a photo" test passes already (it pins behaviour that must not change).

- [ ] **Step 3: Split the stats into a row and a column in the component**

In `/work/components/trip/home/desktop/countdown-tile.tsx`, replace the whole `const statsRow = …` block (from `const statsRow =` through its closing `: null;`) with:

```tsx
  const glance = stats && stats.length > 0 ? stats : null;
  const statItem = (s: HomeStat, padY: "py-2" | "py-1.5") => (
    <li
      key={s.label}
      className={cn("island flex min-w-[72px] flex-col rounded-[14px] border-2 border-border bg-card px-3 text-foreground", padY)}
    >
      <span className="font-display text-[22px] font-extrabold leading-none tracking-[-0.03em]">{s.value}</span>
      <span className="text-label mt-1">{s.label}</span>
    </li>
  );

  // No photo: the row under the chip, as before.
  const statsRow = glance ? (
    <ul aria-label="Trip at a glance" className="mt-4 flex flex-wrap gap-2">
      {glance.map((s) => statItem(s, "py-2"))}
    </ul>
  ) : null;

  // With a photo: a column between the number and the polaroid (Feedback
  // cmunprdsr000004l6da68grrp — a row above the number pushed it down and
  // clipped the first-leg line). Shown only from a tile width where the
  // 132px number, this column and the 176px polaroid fit side by side:
  // 52rem (832px). At 1800×1008 the tile is ~986px (8 of 12 columns beside
  // the 248px sidebar) so the column shows; at 1440 it is ~746px and the
  // column is hidden. It never wraps back into a row — below that width the
  // stats are simply not shown. The tighter py keeps four items inside the
  // 300px row (4 × 55px + 3 × 6px = 238px of the 252px available).
  const statsColumn = glance ? (
    <ul aria-label="Trip at a glance" className="hidden shrink-0 flex-col justify-center gap-1.5 self-stretch @[52rem]:flex">
      {glance.map((s) => statItem(s, "py-1.5"))}
    </ul>
  ) : null;
```

Then make the `Card` the container — change its `className` from
`"relative flex h-full min-h-0 overflow-hidden text-on-accent"` to
`"@container relative flex h-full min-h-0 overflow-hidden text-on-accent"`.

Then change the `hasPhoto` branch from:

```tsx
        <div className="pointer-events-none relative z-10 flex min-h-0 flex-1 gap-6 p-6">
          <div className="flex min-w-0 flex-1 flex-col">
            {chip}
            {statsRow}
            <div className="mt-auto">
              {numberRow}
              {legLine}
            </div>
          </div>
          <CountdownPolaroid
```

to:

```tsx
        <div className="pointer-events-none relative z-10 flex min-h-0 flex-1 gap-6 p-6">
          <div className="flex min-w-0 flex-1 flex-col">
            {chip}
            <div className="mt-auto">
              {numberRow}
              {legLine}
            </div>
          </div>
          {statsColumn}
          <CountdownPolaroid
```

The no-photo branch keeps `{statsRow}` exactly where it is. Update the one-line prop doc on `stats` (line ~25) to: `/** The "at a glance" stats (nights, Stops, countries, Chapters) — a row under the chip, or a column beside the number with a photo; omitted when empty. */`

- [ ] **Step 4: Run the tile tests and the Home trees that render it**

Run: `npm test -- components/trip/home`
Expected: PASS (including `desktop-home-grid.test.tsx`, `home-header.test.tsx`; the phone/desktop phase trees in `components/trip/home/*.test.tsx` only assert the list's label and items).

Then run: `npm test -- "app/(app)/trips/[tripId]/page.test.tsx"`
Expected: PASS.

- [ ] **Step R (Review Focus 3): a word countdown with a photo keeps the same column rule**

Append inside `describe("CountdownTile", …)` in `/work/components/trip/home/desktop/countdown-tile.test.tsx` (after the two tests from Step 1):

```tsx
  it("a word countdown (rough month) with a photo keeps the same column rule — one threshold for everyone", () => {
    renderTile({ cover: COVER, stats: FOUR_STATS, countdown: { kind: "rough-month", month: "September" } });
    const list = screen.getByRole("list", { name: "Trip at a glance" });
    expect(list.className).toContain("hidden");
    expect(list.className).toContain("@[52rem]:flex");
    expect(list.previousElementSibling).toHaveTextContent("September");
    expect(list.nextElementSibling).toHaveAttribute("data-polaroid");
  });
```

Run: `npm test -- components/trip/home/desktop/countdown-tile.test.tsx`
Expected: PASS. In Step 5's browser check, also open a Trip with a rough month and a cover at 1800×1008: the 64px word must not touch the column. If it does, the single threshold goes up (class, test and comment together).

- [ ] **Step 5: Measure in the browser, then adjust the threshold if needed**

With `npx next dev -p 3100` (never `next start`) open a Trip with a cover and four stats at 1800×1008 and at 1440×900. Expected at 1800: chip top-left, the number and first-leg line bottom-left, the four-stat column, then the polaroid, nothing clipped. Expected at 1440: no stats, the number and first-leg line unclipped. If the column overlaps or wraps at 1800, raise the value in both the class (`@[52rem]:flex`) and the test's `toContain("@[52rem]:flex")`, and rewrite the comment's numbers to the value you measured.

- [ ] **Step 6: Gates and commit**

Run: `npx tsc --noEmit && npm run lint`
Expected: both clean.

```
git add components/trip/home/desktop/countdown-tile.tsx components/trip/home/desktop/countdown-tile.test.tsx
git commit -m "$(cat <<'EOF'
fix(home): countdown tile stats become a column beside the number with a photo

The at-a-glance row above the number pushed the countdown down and
clipped the first-leg line at 1800×1008. With a cover the stats now sit
as a column between the number block and the polaroid, shown only from
52rem of tile width (a container query on the tile) and not at all
below it. Without a cover the row under the chip is unchanged.

Resolves-Feedback: cmunprdsr000004l6da68grrp
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Sign-in deep links — the proxy records the requested path, one `signInRedirect()` for the three guards (§E)

**Files:**
- Create: `/work/lib/sign-in-href.ts` (pure: header name + `signInHref`)
- Create: `/work/lib/sign-in-href.test.ts`
- Create: `/work/lib/sign-in-redirect.ts` (Next-bound: reads the header, calls `redirect`)
- Create: `/work/lib/sign-in-redirect.test.ts`
- Modify: `/work/proxy.ts` (the `proxy` function, lines ~179–209; `config.matcher`, line ~211; the "One proxy, two jobs" comment, lines ~172–178)
- Modify: `/work/proxy.test.ts` (imports lines 1–4; the matcher test at the end; new describe)
- Modify: `/work/lib/guards.ts` (import line 2; `requireUser` lines 29–35; comment lines 12–14)
- Modify: `/work/lib/guards.test.ts` (mocks block lines 6–33; one new test in `describe("requireUser")`)
- Modify: `/work/app/(app)/layout.tsx` (import line 2; the two `redirect("/")` at lines 61–64 and 73–75)
- Modify: `/work/app/(app)/layout.test.tsx` (the `next/headers` mock lines 70–73; the "redirects to / when no session" test lines 166–180)
- Modify: `/work/app/(focus)/layout.tsx` (import line 1; lines 13 and 16)
- Modify: `/work/app/(focus)/layout.test.tsx` (mocks lines 4–15; two tests)

**Interfaces:**
- Consumes: `safeCallbackPath(raw: string | string[] | undefined): string | null` (`/work/lib/safe-callback.ts:39`) — the Landing already feeds `?callbackUrl=` through it and onto the sign-in buttons (`/work/app/page.tsx:36-46`, `/work/app/landing/landing.tsx:38`, `/work/app/landing/signin-buttons.tsx:25,48`), so nothing on the Landing changes. `headers()` from `next/headers` — async, read-only, request-time (`/work/node_modules/next/dist/docs/01-app/03-api-reference/04-functions/headers.md`, lines 6–47). `NextResponse.next({ request: { headers } })` / `NextResponse.rewrite(url, { request: { headers } })` forward request headers upstream to the page, route or server action without exposing them to the client (`/work/node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md` "Setting Headers", lines ~413–451, and `/work/node_modules/next/dist/docs/01-app/03-api-reference/04-functions/next-response.md` `next()`, lines ~130–160; proxy.md line 23: "To pass information from Proxy to your application, use headers, cookies, rewrites, redirects, or the URL"). In a unit test those forwarded headers appear on the response as `x-middleware-request-<name>` plus `x-middleware-override-headers` (`/work/node_modules/next/dist/server/web/spec-extension/response.js:24-40`, `handleMiddlewareField`) — exactly what `proxy.test.ts` already reads for `cookie`.
- Produces:
  - `export const REQUEST_PATH_HEADER = "x-request-path"` and `export function signInHref(requestPath: string | null | undefined): string` in `lib/sign-in-href.ts`.
  - `export async function signInRedirect(): Promise<never>` in `lib/sign-in-redirect.ts`.
  - `proxy.ts` `config.matcher` widened to every signed-in route so the header exists wherever a guard runs: `/trips`, `/globe`, `/account`, `/help`, `/whats-new`, `/admin` (the `(app)` tree, `/work/app/(app)/*`) and `/trips/new` (the `(focus)` tree, already matched by `/trips/:ref/:path*`).

Why one header, and why it is run through `safeCallbackPath`: the proxy overwrites any incoming `x-request-path`, but a guard on a route outside the matcher (a server action POSTed to an unmatched path) could in principle see a client-supplied value — so the helper only ever emits a same-origin path, and the Landing checks it again. `referer` is never read.

- [ ] **Step 1: Write the failing `signInHref` test**

Create `/work/lib/sign-in-href.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { REQUEST_PATH_HEADER, signInHref } from "./sign-in-href";

describe("signInHref (spec 2026-10-01 §E)", () => {
  it("names the request header the proxy sets", () => {
    expect(REQUEST_PATH_HEADER).toBe("x-request-path");
  });
  it("sends a signed-out visitor to the Landing carrying the page they asked for", () => {
    expect(signInHref("/trips/kyoto/plan?day=3")).toBe("/?callbackUrl=%2Ftrips%2Fkyoto%2Fplan%3Fday%3D3");
    expect(signInHref("/admin")).toBe("/?callbackUrl=%2Fadmin");
  });
  it("is plain / when there is no path, or the path is the Landing itself", () => {
    expect(signInHref(null)).toBe("/");
    expect(signInHref(undefined)).toBe("/");
    expect(signInHref("")).toBe("/");
    expect(signInHref("/")).toBe("/");
  });
  it("drops anything that is not a same-origin path (never a header the client could have forged)", () => {
    expect(signInHref("https://evil.example/trips")).toBe("/");
    expect(signInHref("//evil.example/trips")).toBe("/");
    expect(signInHref("/\\evil.example")).toBe("/");
    expect(signInHref("trips")).toBe("/");
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npm test -- lib/sign-in-href.test.ts`
Expected: FAIL — `Failed to resolve import "./sign-in-href"`.

- [ ] **Step 3: Create the pure helper**

Create `/work/lib/sign-in-href.ts`:

```ts
import { safeCallbackPath } from "@/lib/safe-callback";

/**
 * Request header proxy.ts sets to the requested pathname + search, so a
 * server layout or guard can learn the page it is rendering (Next gives a
 * server component no URL of its own; `referer` is never trusted).
 */
export const REQUEST_PATH_HEADER = "x-request-path";

/**
 * Where a signed-out visitor is sent: the Landing, carrying the page they
 * asked for as `callbackUrl` so sign-in returns them there (spec 2026-10-01
 * §E). Only a same-origin path survives — the value may be absent or, on an
 * unmatched route, client-supplied — and the Landing checks it again.
 */
export function signInHref(requestPath: string | null | undefined): string {
  const path = safeCallbackPath(requestPath ?? undefined);
  if (!path || path === "/") return "/";
  return `/?callbackUrl=${encodeURIComponent(path)}`;
}
```

Run: `npm test -- lib/sign-in-href.test.ts`
Expected: PASS.

- [ ] **Step 4: Write the failing proxy tests**

In `/work/proxy.test.ts`, change the import block (lines 1–4) to:

```ts
import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { config, authCallbackCookieGuard as proxy, proxy as fullProxy } from "./proxy";
import { REQUEST_PATH_HEADER } from "./lib/sign-in-href";

// The trip branch of `proxy` lazy-imports Prisma through lib/trip-ref; stub
// it so this file keeps never loading a database. A null viewer is the
// signed-out case the request-path header exists for.
vi.mock("@/lib/trip-ref", () => ({
  resolveTripRef: vi.fn(),
  viewerIdFromRequest: vi.fn(async () => null),
  viewerIsTripMember: vi.fn(async () => false),
}));
```

Replace the last test ("runs on the Auth.js routes and on trip pages…") with:

```ts
  it("runs on the Auth.js routes, on trip pages (slug resolution, ADR 0064) and on every other signed-in route (request path)", () => {
    expect(config.matcher).toEqual([
      "/api/auth/:path*",
      "/trips",
      "/trips/:ref/:path*",
      "/globe/:path*",
      "/account/:path*",
      "/help/:path*",
      "/whats-new/:path*",
      "/admin/:path*",
    ]);
  });
```

Append a new describe at the end of the file:

```ts
/** The header the page will actually receive (response.js `handleMiddlewareField`). */
function forwardedPath(response: Response): string | null {
  return response.headers.get(`x-middleware-request-${REQUEST_PATH_HEADER}`);
}

describe("proxy — request path header (spec 2026-10-01 §E)", () => {
  it("forwards pathname + search on a signed-in route outside /trips", async () => {
    const response = await fullProxy(new NextRequest(`${ORIGIN}/globe?tab=2`));
    expect(forwardedPath(response)).toBe("/globe?tab=2");
    expect(response.headers.get("x-middleware-override-headers")).toContain(REQUEST_PATH_HEADER);
  });

  it("forwards it on the trips list and on a trip page for a signed-out visitor, with no rewrite", async () => {
    expect(forwardedPath(await fullProxy(new NextRequest(`${ORIGIN}/trips`)))).toBe("/trips");
    const response = await fullProxy(new NextRequest(`${ORIGIN}/trips/kyoto/plan?day=3`));
    expect(forwardedPath(response)).toBe("/trips/kyoto/plan?day=3");
    expect(response.headers.get("x-middleware-rewrite")).toBeNull();
  });

  it("overwrites a client-supplied value", async () => {
    const response = await fullProxy(
      new NextRequest(`${ORIGIN}/account`, { headers: { [REQUEST_PATH_HEADER]: "/evil" } }),
    );
    expect(forwardedPath(response)).toBe("/account");
  });

  it("leaves the Auth.js routes to the cookie guard, which does not set it", async () => {
    const response = await fullProxy(new NextRequest(`${ORIGIN}/api/auth/session`));
    expect(forwardedPath(response)).toBeNull();
  });
});
```

- [ ] **Step 5: Run them to see them fail**

Run: `npm test -- proxy.test.ts`
Expected: FAIL — the matcher test (`expected [ '/api/auth/:path*', '/trips/:ref/:path*' ] to deeply equal …`) and the three header tests (`expected null to be '/globe?tab=2'`).

- [ ] **Step 6: Set the header in the proxy and widen the matcher**

In `/work/proxy.ts`, add the import under the existing one (line 1):

```ts
import { REQUEST_PATH_HEADER } from "@/lib/sign-in-href";
```

Replace the comment and function from `/**\n * One proxy, two jobs` through the end of the file with:

```ts
/**
 * One proxy, three jobs (Next allows a single proxy.ts):
 * - /api/auth/*: the callback-url cookie guard above.
 * - Every signed-in route: forward the requested pathname + search as the
 *   `x-request-path` request header (lib/sign-in-href.ts), so a signed-out
 *   guard can send the visitor to the Landing with a callbackUrl back here
 *   (spec 2026-10-01 §E). Set before any other decision and overwriting
 *   whatever the client sent.
 * - /trips/<ref>/*: resolve a Trip's slug to its id once, at the route boundary
 *   (ADR 0064; lib/trip-route.ts has the decision table). The DB modules are
 *   imported lazily so the auth guard's path — and its tests — never load Prisma.
 */
export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname, search } = request.nextUrl;
  if (pathname.startsWith("/api/auth/")) return authCallbackCookieGuard(request);

  const headers = new Headers(request.headers);
  headers.set(REQUEST_PATH_HEADER, pathname + search);
  const forward = { request: { headers } };
  if (!pathname.startsWith("/trips/")) return NextResponse.next(forward);

  const [{ decideTripRoute }, { resolveTripRef, viewerIdFromRequest, viewerIsTripMember }] = await Promise.all([
    import("@/lib/trip-route"),
    import("@/lib/trip-ref"),
  ]);
  // Signed out: nothing to rewrite or redirect for (see decideTripRoute), so
  // skip the lookups too — no DB work, and no timing difference between a real
  // slug and an unknown one.
  const viewerId = await viewerIdFromRequest(request);
  if (!viewerId) return NextResponse.next(forward);
  const decision = await decideTripRoute({
    pathname,
    search,
    method: request.method,
    resolve: resolveTripRef,
    isMember: (tripId) => viewerIsTripMember(tripId, viewerId),
  });
  if (decision.kind === "redirect") return NextResponse.redirect(new URL(decision.location, request.url), 308);
  if (decision.kind === "rewrite") {
    const url = request.nextUrl.clone();
    url.pathname = decision.pathname;
    return NextResponse.rewrite(url, forward);
  }
  return NextResponse.next(forward);
}

export const config = {
  matcher: [
    "/api/auth/:path*",
    "/trips",
    "/trips/:ref/:path*",
    "/globe/:path*",
    "/account/:path*",
    "/help/:path*",
    "/whats-new/:path*",
    "/admin/:path*",
  ],
};
```

Run: `npm test -- proxy.test.ts proxy.contract.test.ts`
Expected: PASS.

- [ ] **Step 7: Write the failing `signInRedirect` test and the helper**

Create `/work/lib/sign-in-redirect.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

const { headersGet, redirectMock } = vi.hoisted(() => ({
  headersGet: vi.fn<(name: string) => string | null>(() => null),
  redirectMock: vi.fn((href: string) => {
    throw new Error(`NEXT_REDIRECT ${href}`);
  }),
}));
vi.mock("next/headers", () => ({ headers: async () => ({ get: headersGet }) }));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));

import { signInRedirect } from "./sign-in-redirect";

afterEach(() => vi.clearAllMocks());

describe("signInRedirect", () => {
  it("redirects to the Landing with the proxy's request path as callbackUrl", async () => {
    headersGet.mockReturnValueOnce("/trips/kyoto/plan?day=3");
    await expect(signInRedirect()).rejects.toThrow("NEXT_REDIRECT /?callbackUrl=%2Ftrips%2Fkyoto%2Fplan%3Fday%3D3");
    expect(headersGet).toHaveBeenCalledWith("x-request-path");
  });
  it("redirects to plain / when the header is absent", async () => {
    await expect(signInRedirect()).rejects.toThrow("NEXT_REDIRECT /");
    expect(redirectMock).toHaveBeenCalledWith("/");
  });
});
```

Run: `npm test -- lib/sign-in-redirect.test.ts`
Expected: FAIL — `Failed to resolve import "./sign-in-redirect"`.

Create `/work/lib/sign-in-redirect.ts`:

```ts
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { REQUEST_PATH_HEADER, signInHref } from "@/lib/sign-in-href";

/**
 * The one signed-out exit for every guard (app and focus layouts,
 * requireUser): to the Landing, carrying the requested page so sign-in
 * returns there. Reads the path from the header proxy.ts set — a server
 * component has no URL of its own, and `referer` is never trusted.
 */
export async function signInRedirect(): Promise<never> {
  const path = (await headers()).get(REQUEST_PATH_HEADER);
  redirect(signInHref(path));
}
```

Run: `npm test -- lib/sign-in-redirect.test.ts`
Expected: PASS.

- [ ] **Step 8: `requireUser` uses it — failing test first**

In `/work/lib/guards.test.ts`, add to the `vi.hoisted` object (line 6–18) a line `headersGetMock: vi.fn<(name: string) => string | null>(() => null),` and destructure it (`const { authMock, findManyMock, forkFindUniqueMock, notFoundMock, redirectMock, headersGetMock, cacheStore } =`). After the `vi.mock("next/navigation", …)` block add:

```ts
vi.mock("next/headers", () => ({ headers: async () => ({ get: headersGetMock }) }));
```

In `describe("requireUser", …)`, after "redirects an unauthenticated user to sign-in", add:

```ts
  it("carries the requested page to the Landing as callbackUrl (spec 2026-10-01 §E)", async () => {
    authMock.mockResolvedValue(null);
    headersGetMock.mockReturnValueOnce("/admin?tab=requests");

    await expect(requireUser()).rejects.toThrow("NEXT_REDIRECT");
    expect(redirectMock).toHaveBeenCalledWith("/?callbackUrl=%2Fadmin%3Ftab%3Drequests");
  });
```

Run: `npm test -- lib/guards.test.ts`
Expected: FAIL on the new test only — `expected "spy" to be called with arguments: [ '/?callbackUrl=…' ]` (received `"/"`).

In `/work/lib/guards.ts`: change line 2 to `import { notFound } from "next/navigation";`, add `import { signInRedirect } from "@/lib/sign-in-redirect";` after it, change the doc comment lines 13–14 to:

```ts
 * Require an authenticated user. Returns the session user, or redirects to
 * the Landing with the requested page as callbackUrl (lib/sign-in-redirect.ts;
 * there is no sign-in page — ADR 0057, amended 2026-10-01). Use at the top
 * of server components / actions.
```

and replace lines 29–35 with:

```ts
export const requireUser = cache(async () => {
  const session = await auth();
  if (!session?.user?.id) return signInRedirect();
  return session.user;
});
```

Run: `npm test -- lib/guards.test.ts`
Expected: PASS (the `cacheWrapped` length-2 pin is untouched).

- [ ] **Step 9: The focus layout — failing test first**

In `/work/app/(focus)/layout.test.tsx`, add `headersGet: vi.fn<(name: string) => string | null>(() => null),` to the hoisted object and destructure it; after the `next/navigation` mock add `vi.mock("next/headers", () => ({ headers: async () => ({ get: headersGet }) }));`. Add this test after "sends a signed-out visitor to /":

```tsx
  it("carries the requested page to the Landing as callbackUrl (spec 2026-10-01 §E)", async () => {
    auth.mockResolvedValue(null);
    headersGet.mockReturnValueOnce("/trips/new?fromShare=tok");
    await expect(FocusLayout({ children: null })).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/?callbackUrl=%2Ftrips%2Fnew%3FfromShare%3Dtok");
  });
```

Run: `npm test -- "app/(focus)/layout.test.tsx"`
Expected: FAIL on the new test (received `"/"`).

In `/work/app/(focus)/layout.tsx`: replace line 1 `import { redirect } from "next/navigation";` with `import { signInRedirect } from "@/lib/sign-in-redirect";`; line 13 becomes `if (!session?.user?.id) return signInRedirect();`; line 16 becomes `if (!traveller) return signInRedirect();`.

Run: `npm test -- "app/(focus)/layout.test.tsx"`
Expected: PASS (the two existing "/" assertions still hold: no header → `/`).

- [ ] **Step 10: The app layout — failing test first**

In `/work/app/(app)/layout.test.tsx`, change the `next/headers` mock (lines 70–73) to:

```ts
const cookiesGetMock = vi.hoisted(() => vi.fn().mockReturnValue(undefined));
const headersGetMock = vi.hoisted(() => vi.fn<(name: string) => string | null>(() => null));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: cookiesGetMock }),
  headers: async () => ({ get: headersGetMock }),
}));
```

Add after the "redirects to / when no session" test:

```tsx
  it("carries the requested page to the Landing as callbackUrl when signed out (spec 2026-10-01 §E)", async () => {
    const { redirect } = await import("next/navigation");
    vi.mocked(auth).mockResolvedValue(null as never);
    headersGetMock.mockReturnValueOnce("/globe?tab=2");
    try {
      const ui = await AppLayout({ children: <div /> });
      render(ui as React.ReactElement);
    } catch (e) {
      if (!(e instanceof TypeError)) throw e;
    }
    expect(redirect).toHaveBeenCalledWith("/?callbackUrl=%2Fglobe%3Ftab%3D2");
    expect(redirect).toHaveBeenCalledTimes(1);
  });
```

Run: `npm test -- "app/(app)/layout.test.tsx"`
Expected: FAIL on the new test (received `"/"`).

In `/work/app/(app)/layout.tsx`: delete line 2 `import { redirect } from "next/navigation";` and add `import { signInRedirect } from "@/lib/sign-in-redirect";` in its place. Replace lines 61–64:

```ts
  const session = await auth();
  if (!session?.user?.id) return signInRedirect();
```

and lines 73–75:

```ts
  if (!traveller) return signInRedirect();
```

Run: `npm test -- "app/(app)/layout.test.tsx"`
Expected: PASS — the existing "redirects to / when no session" still sees `"/"` (no header).

- [ ] **Step 11: Whole suite, gates, commit**

Run: `npm test`
Expected: PASS. Then `npx tsc --noEmit && npm run lint` — both clean (if tsc complains that `session` may be undefined after `return signInRedirect()`, the layout's early return is not narrowing: use `if (!session?.user?.id) { return signInRedirect(); }` with braces — identical semantics — and re-run).

```
git add lib/sign-in-href.ts lib/sign-in-href.test.ts lib/sign-in-redirect.ts lib/sign-in-redirect.test.ts proxy.ts proxy.test.ts lib/guards.ts lib/guards.test.ts "app/(app)/layout.tsx" "app/(app)/layout.test.tsx" "app/(focus)/layout.tsx" "app/(focus)/layout.test.tsx"
git commit -m "$(cat <<'EOF'
feat(auth): signed-out guards send the requested page to the Landing as callbackUrl

proxy.ts forwards pathname + search as the x-request-path request header
on every signed-in route (matcher widened to /trips, /globe, /account,
/help, /whats-new, /admin). One helper, signInRedirect(), reads it and
redirects to /?callbackUrl=<same-origin path>; the app and focus layouts
and requireUser all use it, so a deep link survives sign-in. Never the
referer; the Landing re-checks the path with safeCallbackPath.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Docs — no `/signin` page: ADR 0057 amendment, landing specs superseded notes (§E)

**Files:**
- Modify: `/work/docs/adr/0057-one-door-sign-in-allowlist.md` (lines 211–215 bullet; line 234 bullet; append an amendment after line 254)
- Modify: `/work/docs/specs/2026-09-29-landing-kit.md` (insert after line 1)
- Modify: `/work/docs/specs/2026-09-29-landing-collage.md` (insert after line 1)

**Interfaces:**
- Consumes: the facts established in Task 8 (`signInRedirect`, `x-request-path`, `lib/sign-in-href.ts`) and `lib/auth.ts:77` `pages: { signIn: "/", error: "/" }`. The `lib/guards.ts` comment change ("to the Landing") was made in Task 8 Step 8; nothing to do for it here.
- Produces: no code. Amendment style follows `/work/docs/adr/0017-invites-accepted-by-email-match-reconciled-on-app-load.md:18` (`## Amendment — <date> (<branch>, <ref>)`) and the inline "superseded in part, see the … amendment" pointers of `/work/docs/adr/0018-duplicate-trip-copy-semantics.md:1,9`.

- [ ] **Step 1: Confirm the three stale references and nothing else**

Run: `grep -rn "/signin" docs/adr/0057-one-door-sign-in-allowlist.md docs/specs/2026-09-29-landing-kit.md docs/specs/2026-09-29-landing-collage.md lib/guards.ts | head -20`
Expected: ADR 0057 lines 212, 214, 234; many lines in both 2026-09-29 specs (those stay — historical); nothing in `lib/guards.ts`.

- [ ] **Step 2: ADR 0057 inline pointers**

In `/work/docs/adr/0057-one-door-sign-in-allowlist.md`, the bullet at lines 211–215 currently ends `resolves against \`pages.error\`.` — append to that bullet (same paragraph):

```
  *Amended 2026-10-01: both now point at `/`; see the amendment below.*
```

The bullet at line 234 begins `- **\`/signin\`'s refusal card promises nothing.**` — change that opening to:

```
- **`/signin`'s refusal card promises nothing** *(since 2026-10-01 the card is the Landing's panel in denied mode — amendment below; the wording rule stands)*.
```

- [ ] **Step 3: ADR 0057 amendment section**

Append to the end of the file (after line 254):

```
## Amendment — 2026-10-01 (`feat/landing-shuffle-2026-10-01`, spec 2026-10-01 §E)

**There is no `/signin` page.** The Sign in page folded into the Landing:
`lib/auth.ts` sets `pages: { signIn: "/", error: "/" }`, so a refused Google
sign-in comes back as `/?error=AccessDenied` and the Landing opens its Sign in
panel in denied mode (`app/landing/sign-in-panel.tsx`). The "refusal card"
above is that panel's denied mode; its promise-nothing wording is unchanged.

**Deep links survive the door.** Every signed-out guard — `app/(app)/layout.tsx`,
`app/(focus)/layout.tsx` and `requireUser` in `lib/guards.ts` — exits through
one helper, `signInRedirect()` (`lib/sign-in-redirect.ts`), which sends the
visitor to `/?callbackUrl=<the page they asked for>`. The page comes from the
`x-request-path` request header that `proxy.ts` sets to the requested
pathname + search on every signed-in route, never from `referer`; the helper
and the Landing both keep only a same-origin path (`lib/safe-callback.ts`),
and the Landing's sign-in buttons pass it to Auth.js as `callbackUrl`. Share
links already used this `callbackUrl` route in (`lib/share-ref.ts`).

Nothing about the gate — who may sign in, and how — changes.
```

- [ ] **Step 4: Superseded notes on the two 2026-09-29 specs**

In `/work/docs/specs/2026-09-29-landing-kit.md`, insert after line 1 (the H1), as lines 2–3:

```

> **Superseded in part (2026-10-01):** there is no `/signin` page — the Sign in page folded into the Landing at `/`, and `pages.signIn`/`pages.error` point at `/` (ADR 0057 amendment 2026-10-01; `docs/specs/2026-10-01-landing-shuffle-help-offline.md` §E). Mentions of `/signin` below are historical.
```

In `/work/docs/specs/2026-09-29-landing-collage.md`, insert the identical blockquote after its line 1.

- [ ] **Step 5: Check and commit**

Run: `grep -n "Amended 2026-10-01\|Amendment — 2026-10-01" docs/adr/0057-one-door-sign-in-allowlist.md && grep -n "Superseded in part (2026-10-01)" docs/specs/2026-09-29-landing-kit.md docs/specs/2026-09-29-landing-collage.md`
Expected: three hits in the ADR (two inline, one heading), one in each spec at line 3.

Run: `npm run lint`
Expected: clean (markdown is not linted; this is the gate the brief asks for before every commit).

```
git add docs/adr/0057-one-door-sign-in-allowlist.md docs/specs/2026-09-29-landing-kit.md docs/specs/2026-09-29-landing-collage.md
git commit -m "$(cat <<'EOF'
docs(auth): no /signin page — ADR 0057 amendment, landing specs superseded notes

pages.signIn and pages.error point at /; the refusal card is the Landing
panel's denied mode; signed-out guards carry the requested page as
callbackUrl via x-request-path. The 2026-09-29 landing specs carry a
one-line superseded note.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

### Part 2 — interfaces produced

- `CountdownTile(props: CountdownTileProps)` — unchanged signature; with a photo the `<ul aria-label="Trip at a glance">` is now a sibling between the left column and `[data-polaroid]`, classes `hidden … flex-col … @[52rem]:flex`; the Card carries `@container`.
- `REQUEST_PATH_HEADER = "x-request-path"` and `signInHref(requestPath: string | null | undefined): string` — `/work/lib/sign-in-href.ts` (pure; safe to import from the proxy).
- `signInRedirect(): Promise<never>` — `/work/lib/sign-in-redirect.ts`; use `return signInRedirect();` in any server component, layout or action that needs the signed-out exit.
- `proxy.ts` `config.matcher` now covers `/trips`, `/globe/*`, `/account/*`, `/help/*`, `/whats-new/*`, `/admin/*` in addition to `/api/auth/*` and `/trips/:ref/*`; every matched page/action request carries `x-request-path`.

---

### Task 10: Shared `OnThisPage` rail, used by the legal pages

**Files:**
- Create: `components/ui/on-this-page.tsx`
- Create: `components/ui/on-this-page.test.tsx`
- Modify: `components/legal/legal-page.tsx` (lines 4, 74–95)
- Test: `components/legal/legal-page.test.tsx` (unchanged; must stay green)

**Interfaces:**
- Produces: `OnThisPage({ groups, className }: { groups: OnThisPageGroup[]; className?: string })` — a server component rendering `<nav aria-label="On this page">` of plain `#id` anchors; returns `null` when every group is empty. Exports `interface OnThisPageEntry { id: string; title: string }` and `interface OnThisPageGroup { label?: string; entries: OnThisPageEntry[] }`.
- Consumes: `cn` from `@/lib/cn`; the `text-label` utility (`app/globals.css` line 729).

- [ ] **Step 1: Write the failing test**

Create `components/ui/on-this-page.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { OnThisPage } from "./on-this-page";

describe("OnThisPage", () => {
  it("renders nothing when there is nothing to link to", () => {
    const { container } = render(<OnThisPage groups={[{ entries: [] }, { label: "Later", entries: [] }]} />);
    expect(container.innerHTML).toBe("");
  });

  it("links every entry by anchor, grouped under its label, in order", () => {
    render(
      <OnThisPage
        groups={[
          { entries: [{ id: "walk", title: "The walkthrough" }] },
          { label: "Going deeper", entries: [{ id: "chapters", title: "Chapters, in depth" }] },
        ]}
      />,
    );
    const nav = screen.getByRole("navigation", { name: "On this page" });
    expect(nav.textContent).toContain("On this page");
    expect(screen.getByRole("link", { name: "The walkthrough" })).toHaveAttribute("href", "#walk");
    expect(screen.getByRole("link", { name: "Chapters, in depth" })).toHaveAttribute("href", "#chapters");
    expect(screen.getByText("Going deeper")).toBeInTheDocument();
    const texts = Array.from(nav.querySelectorAll("a")).map((a) => a.textContent);
    expect(texts).toEqual(["The walkthrough", "Chapters, in depth"]);
  });

  it("skips a group with no entries but keeps the others", () => {
    render(
      <OnThisPage
        groups={[
          { label: "Empty", entries: [] },
          { label: "Full", entries: [{ id: "a", title: "A" }] },
        ]}
      />,
    );
    expect(screen.queryByText("Empty")).toBeNull();
    expect(screen.getByText("Full")).toBeInTheDocument();
  });

  it("is hidden below lg, then sticky with its own scroll (the What's new column)", () => {
    render(<OnThisPage groups={[{ entries: [{ id: "a", title: "A" }] }]} className="help-print-hide" />);
    const nav = screen.getByRole("navigation", { name: "On this page" });
    expect(nav.className).toMatch(/(^|\s)hidden(\s|$)/);
    expect(nav.className).toContain("lg:block");
    expect(nav.className).toContain("lg:sticky");
    expect(nav.className).toContain("lg:top-6");
    expect(nav.className).toContain("lg:self-start");
    expect(nav.className).toContain("lg:max-h-[calc(100dvh-3rem)]");
    expect(nav.className).toContain("lg:overflow-y-auto");
    expect(nav.className).toContain("help-print-hide");
  });

  it("styles links as 13px muted text that darkens on hover (legal-page style)", () => {
    render(<OnThisPage groups={[{ entries: [{ id: "a", title: "A" }] }]} />);
    const link = screen.getByRole("link", { name: "A" });
    expect(link.className).toContain("text-[13px]");
    expect(link.className).toContain("text-muted-foreground");
    expect(link.className).toContain("hover:text-foreground");
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npm test -- components/ui/on-this-page.test.tsx`
Expected: FAIL — `Cannot find module './on-this-page'`.

- [ ] **Step 3: Create the component**

Create `components/ui/on-this-page.tsx`:

```tsx
import * as React from "react";
import { cn } from "@/lib/cn";

export interface OnThisPageEntry {
  id: string;
  title: string;
}

export interface OnThisPageGroup {
  /** A small heading over this run of links; the first run usually has none. */
  label?: string;
  entries: OnThisPageEntry[];
}

/**
 * The sticky "On this page" column (legal pages, the help guide). Plain `#id`
 * anchors and no client state, so each page's own hash handling (if any) does
 * the rest. Hidden below lg, where a page keeps its in-flow contents instead.
 * Capped to the viewport so a long list scrolls in place; -m-1/p-1 keeps the
 * links' focus rings inside the scroll clip.
 */
export function OnThisPage({
  groups,
  className,
}: {
  groups: OnThisPageGroup[];
  className?: string;
}) {
  const shown = groups.filter((group) => group.entries.length > 0);
  if (shown.length === 0) return null;
  return (
    <nav
      aria-label="On this page"
      className={cn(
        "hidden lg:-m-1 lg:block lg:sticky lg:top-6 lg:max-h-[calc(100dvh-3rem)] lg:self-start lg:overflow-y-auto lg:p-1",
        className,
      )}
    >
      <p className="text-label text-muted-foreground">On this page</p>
      <ul className="mt-3 flex flex-col gap-4">
        {shown.map((group, i) => (
          <li key={group.label ?? `run-${i}`}>
            {group.label ? (
              <p className="mb-2 text-[13px] font-extrabold text-foreground">{group.label}</p>
            ) : null}
            <ul className="flex flex-col gap-2">
              {group.entries.map((entry) => (
                <li key={entry.id}>
                  <a
                    href={`#${entry.id}`}
                    className="text-[13px] font-semibold text-muted-foreground underline decoration-transparent underline-offset-2 hover:text-foreground hover:decoration-current"
                  >
                    {entry.title}
                  </a>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </nav>
  );
}
```

- [ ] **Step 4: Make the legal page use it**

In `components/legal/legal-page.tsx`:

Add after line 4 (`import { Logo } from "@/components/ui/logo";`):

```tsx
import { OnThisPage } from "@/components/ui/on-this-page";
```

Replace lines 74–95 (from `{toc.length > 0 ? (` through `) : null}`) with:

```tsx
        <OnThisPage groups={[{ entries: toc }]} />
```

(`OnThisPage` already returns `null` for an empty `toc`, and already carries `hidden lg:block lg:sticky lg:self-start`; the only visible change is `lg:top-8` → `lg:top-6`, which matches What's new and the spec.)

Update the docblock line 14–15 of `legal-page.tsx` from `column built from the section titles (legalToc) — no client state, just anchors into the page.` to `column (components/ui/on-this-page.tsx) built from the section titles (legalToc).`

- [ ] **Step 5: Run the tests**

Run: `npm test -- components/ui/on-this-page.test.tsx components/legal/legal-page.test.tsx`
Expected: PASS (legal-page's "renders a sticky contents column beside the text on desktop" still finds `lg:sticky` and the `#your-rights` link).

- [ ] **Step 6: Gates and commit**

```bash
npx tsc --noEmit && npm run lint
git add components/ui/on-this-page.tsx components/ui/on-this-page.test.tsx components/legal/legal-page.tsx
git commit -m "feat(ui): OnThisPage sticky contents rail; legal pages use it

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 11: `HELP_SECTIONS` gains the intro and walkthrough, drops the 60-second version; `helpContents()`

**Files:**
- Modify: `lib/help-guide.ts` (lines 173–195, 338–343, 559–562)
- Modify: `lib/help-guide.test.ts` (lines 588–597, 641–645; new tests)

**Interfaces:**
- Produces (all in `lib/help-guide.ts`, pure):
  - `type HelpGroup = "intro" | "everyday" | "advanced" | "reference"`
  - `HELP_SECTIONS` now starts `what-teepee-is`, `the-life-of-one-trip` (group `"intro"`); `sixty-seconds` is gone.
  - `HELP_LEGEND_ID = "help-legend"`
  - `HELP_GROUP_LABELS: { everyday: "Using it day to day"; advanced: "Going deeper"; reference: "Looking something up" }`
  - `collapsibleSections(): HelpSection[]` — every section except group `"intro"`.
  - `interface HelpContentsGroup { label?: string; entries: { id: string; title: string }[] }` and `helpContents(): HelpContentsGroup[]` — walkthrough + legend unlabelled, then one labelled group per collapsible group. Structurally identical to `OnThisPageGroup[]`, so it can be passed straight to `OnThisPage`.
- Consumes: nothing new.

- [ ] **Step 1: Write the failing tests**

In `lib/help-guide.test.ts`, change the import block (lines 588–597) to:

```ts
import {
  HELP_SECTIONS,
  HELP_GROUP_LABELS,
  HELP_LEGEND_ID,
  GUIDE_NAV_LABELS,
  GUIDE_TRIP_SEGMENTS,
  GUIDE_UI_STRINGS,
  sectionsInGroup,
  collapsibleSections,
  helpContents,
  guideTripHref,
  guideLabelOnScreen,
  guideLabelPositions,
} from "./help-guide";
```

Replace the test `"orders groups everyday, then advanced, then reference"` (lines 641–645) with:

```ts
  it("orders groups intro, everyday, advanced, then reference", () => {
    const rank = { intro: 0, everyday: 1, advanced: 2, reference: 3 } as const;
    const ranks = HELP_SECTIONS.map((s) => rank[s.group]);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
  });

  it("opens with what Teepee is and the walkthrough, and the 60-second version is gone", () => {
    expect(HELP_SECTIONS.slice(0, 2).map((s) => [s.id, s.group])).toEqual([
      ["what-teepee-is", "intro"],
      ["the-life-of-one-trip", "intro"],
    ]);
    expect(HELP_SECTIONS.some((s) => s.id === "sixty-seconds")).toBe(false);
    expect(HELP_SECTIONS.some((s) => s.title.includes("60-second"))).toBe(false);
  });
```

Add after the `describe("sectionsInGroup", …)` block (after line 665):

```ts
describe("collapsibleSections", () => {
  it("is every section except the intro ones, in document order", () => {
    const ids = collapsibleSections().map((s) => s.id);
    expect(ids).toEqual(HELP_SECTIONS.filter((s) => s.group !== "intro").map((s) => s.id));
    expect(ids).not.toContain("what-teepee-is");
    expect(ids).not.toContain("the-life-of-one-trip");
    expect(ids[0]).toBe("your-trips");
  });
});

describe("helpContents", () => {
  it("lists the walkthrough and the legend first, unlabelled", () => {
    const [first] = helpContents();
    expect(first.label).toBeUndefined();
    expect(first.entries).toEqual([
      { id: "the-life-of-one-trip", title: "The life of one trip" },
      { id: HELP_LEGEND_ID, title: "What the buttons mean" },
    ]);
  });

  it("then groups every collapsible section under its group's on-page label", () => {
    const [, ...groups] = helpContents();
    expect(groups.map((g) => g.label)).toEqual([
      HELP_GROUP_LABELS.everyday,
      HELP_GROUP_LABELS.advanced,
      HELP_GROUP_LABELS.reference,
    ]);
    expect(groups.flatMap((g) => g.entries.map((e) => e.id))).toEqual(
      collapsibleSections().map((s) => s.id),
    );
    for (const g of groups) {
      for (const e of g.entries) {
        expect(e.title).toBe(HELP_SECTIONS.find((s) => s.id === e.id)?.title);
      }
    }
  });

  it("does not list the intro paragraph — the page lands on it already", () => {
    const ids = helpContents().flatMap((g) => g.entries.map((e) => e.id));
    expect(ids).not.toContain("what-teepee-is");
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npm test -- lib/help-guide.test.ts`
Expected: FAIL — `HELP_GROUP_LABELS`, `HELP_LEGEND_ID`, `collapsibleSections`, `helpContents` are not exported; the order test fails on `rank[...]` being undefined for nothing yet (the first two ids are still `sixty-seconds`, `your-trips`).

- [ ] **Step 3: Edit the data module**

In `lib/help-guide.ts`:

Replace line 174 with:

```ts
export type HelpGroup = "intro" | "everyday" | "advanced" | "reference";
```

Replace lines 185–195 (the doc comment and the first `HELP_SECTIONS` entry, `sixty-seconds`) with:

```ts
/**
 * Section order IS document order. Groups must stay contiguous and in the
 * order intro → everyday → advanced → reference (asserted by test). The two
 * "intro" sections are open prose at the top of the guide, not collapsible
 * cards — see collapsibleSections().
 */
export const HELP_SECTIONS: readonly HelpSection[] = [
  {
    id: "what-teepee-is",
    title: "What Teepee is",
    blurb: "A place to plan a trip with the people going on it.",
    group: "intro",
  },
  {
    id: "the-life-of-one-trip",
    title: "The life of one trip",
    blurb: "Six steps from a rough idea to the days you're away.",
    group: "intro",
  },
```

(The next entry, `your-trips`, follows unchanged.)

Replace lines 559–562 (`sectionsInGroup`) with:

```ts
/** Sections in one group, in document order. */
export function sectionsInGroup(group: HelpGroup): HelpSection[] {
  return HELP_SECTIONS.filter((s) => s.group === group);
}

/** The sections drawn as collapsible cards — everything but the intro prose. */
export function collapsibleSections(): HelpSection[] {
  return HELP_SECTIONS.filter((s) => s.group !== "intro");
}

/** Anchor id of the legend block ("What the buttons mean") in the guide. */
export const HELP_LEGEND_ID = "help-legend";

/** The on-page heading of each collapsible group; the rail reuses them. */
export const HELP_GROUP_LABELS = {
  everyday: "Using it day to day",
  advanced: "Going deeper",
  reference: "Looking something up",
} as const satisfies Record<Exclude<HelpGroup, "intro">, string>;

export interface HelpContentsGroup {
  label?: string;
  entries: { id: string; title: string }[];
}

/**
 * What the contents (chip box below lg, the "On this page" rail from lg) link
 * to: the walkthrough and the legend first, then every card under its group.
 * The intro paragraph is left out — it is the first thing on the page.
 */
export function helpContents(): HelpContentsGroup[] {
  const walkthrough = HELP_SECTIONS.find((s) => s.id === "the-life-of-one-trip")!;
  const entry = (s: HelpSection) => ({ id: s.id, title: s.title });
  return [
    {
      entries: [entry(walkthrough), { id: HELP_LEGEND_ID, title: "What the buttons mean" }],
    },
    { label: HELP_GROUP_LABELS.everyday, entries: sectionsInGroup("everyday").map(entry) },
    { label: HELP_GROUP_LABELS.advanced, entries: sectionsInGroup("advanced").map(entry) },
    { label: HELP_GROUP_LABELS.reference, entries: sectionsInGroup("reference").map(entry) },
  ];
}
```

- [ ] **Step 4: Run the lib tests**

Run: `npm test -- lib/help-guide.test.ts`
Expected: PASS. (`components/trip/help-guide.test.tsx` now FAILS — `sectionById("sixty-seconds")` throws, and `what-teepee-is` has no `<details>` — that is Task 12.)

- [ ] **Step 5: Do not commit yet**

`npx tsc --noEmit` is clean here, but `components/trip/help-guide.test.tsx` is red until Task 12 catches the guide up. Task 12's commit includes `lib/help-guide.ts` and `lib/help-guide.test.ts`, so every commit on the branch stays green.

---

### Task 12: The new top of the guide: intro, walkthrough, legend demoted, Expand all moved, HG-03 copy

**Files:**
- Modify: `components/trip/help-guide.tsx` (lines 1–42 imports, 139 `SiteLink` href union, 171–197 `SECTION_TILES`, 277–290 `TOPIC_GRID` comment, 292–363 `sixtySteps`, 379–472 the top of `HelpGuide`, 1047–1081 the `away` section, 1224–1233 and 1644–1649 group headings)
- Modify: `components/trip/help-guide.test.tsx` (many assertions; listed exactly below)
- Modify: `docs/open-follow-ups.md` (HG-03 entry, line ~1026)
- Test: `components/trip/help-hash-open.test.tsx` (unchanged; stays green)

**Interfaces:**
- Produces: `HelpGuide({ tripId?, level? })` unchanged signature. New DOM contract: `section#what-teepee-is`, `section#the-life-of-one-trip` (with `ol[aria-label="The life of one trip"]` of 6 `li`, each with `[data-slot="walk-tile"]`), `section#help-legend`, then the three group `<section aria-labelledby=…>` blocks whose grids carry `data-slot="help-topic-grid"`. Every `<details>` is closed by default. `HelpExpandAll` sits in the everyday group's heading row.
- Consumes: `HELP_GROUP_LABELS`, `HELP_LEGEND_ID`, `helpContents` from `@/lib/help-guide` (Task 11).

- [ ] **Step 1: Update the tests (they fail until Step 3)**

In `components/trip/help-guide.test.tsx`:

(a) Replace line 4 with:

```ts
import {
  HELP_SECTIONS,
  HELP_LEGEND_ID,
  collapsibleSections,
  helpContents,
  sectionsInGroup,
  type HelpGroup,
} from "@/lib/help-guide";
```

and add after line 17 (`const MIN_BODY_CHARS = 200;`):

```ts
/** The sections drawn as <details> cards; the intro prose is not one. */
const CARDS = collapsibleSections();
```

(b) In these tests, replace `HELP_SECTIONS` with `CARDS`: "renders a heading for every section" (line 25), "renders each section as a native <details>" (line 35), "uses no client-side disclosure state" (line 46), "gives every section a real body" (line 53), "renders the sections in HELP_SECTIONS order" (line 68 — and rename the test to `"renders the cards in HELP_SECTIONS order"`), "titles every section with a real heading inside its summary" (line 490), "shifts the whole outline down one level" (line 515), "gives every section summary the kit's accent icon tile" (line 536), "keeps every section's body at a readable measure" (line 585; rename to `"keeps every card's body at a readable measure"` and replace its two comment lines with `// No card opts out of the reading-measure cap.`).

(c) Replace the test "offers a contents list linking every section by anchor" (lines 213–223) with:

```ts
  it("offers a contents list linking the walkthrough, the legend and every card by anchor", () => {
    const { container } = render(<HelpGuide tripId="t1" />);
    const nav = container.querySelector('nav[aria-label="Contents"]');
    expect(nav).toBeTruthy();
    const expected = helpContents().flatMap((g) => g.entries.map((e) => e.id));
    expect(expected).toContain("the-life-of-one-trip");
    expect(expected).toContain(HELP_LEGEND_ID);
    for (const id of expected) {
      expect(nav?.querySelector(`a[href="#${id}"]`), `contents is missing a link to ${id}`).toBeTruthy();
    }
    expect(nav?.querySelector('a[href="#what-teepee-is"]')).toBeNull();
  });
```

(d) Replace the test "opens the first section so the page never lands looking empty" (lines 225–230) with:

```ts
  it("lands on the intro, the walkthrough and the legend, then the cards — all collapsed", () => {
    const { container } = render(<HelpGuide tripId="t1" />);
    const landmarks = Array.from(
      container.querySelectorAll("section#what-teepee-is, section#the-life-of-one-trip, section#help-legend, details"),
    ).map((el) => el.id);
    expect(landmarks.slice(0, 3)).toEqual(["what-teepee-is", "the-life-of-one-trip", "help-legend"]);
    expect(landmarks.slice(3)).toEqual(CARDS.map((s) => s.id));
    const all = Array.from(container.querySelectorAll("details"));
    expect(all.every((d) => !d.hasAttribute("open"))).toBe(true);
  });

  it("says what Teepee is in one short paragraph before anything else", () => {
    const { container } = render(<HelpGuide tripId="t1" />);
    const intro = container.querySelector("section#what-teepee-is");
    expect(intro?.querySelector("h2")?.textContent).toBe("What Teepee is");
    const paragraphs = intro?.querySelectorAll("p") ?? [];
    expect(paragraphs.length).toBe(1);
    expect(paragraphs[0].textContent).toContain("plan a trip with the people going on it");
    expect(paragraphs[0].textContent).toContain("look back on it");
  });

  it("walks the life of one trip in six numbered steps with hue tiles", () => {
    const { container } = render(<HelpGuide />);
    const list = screen.getByRole("list", { name: "The life of one trip" });
    expect(list.className).toMatch(/\bflex-col\b/);
    const steps = Array.from(list.querySelectorAll(":scope > li"));
    expect(steps).toHaveLength(6);
    const hues = new Set<string>();
    steps.forEach((li, i) => {
      const tile = li.querySelector("[data-slot='walk-tile']");
      expect(tile, `step ${i + 1} has no tile`).toBeTruthy();
      expect(tile?.closest("[aria-hidden='true']")).toBeTruthy();
      expect(tile?.querySelector("svg")).toBeTruthy();
      const hue = tile?.className.match(/\bbg-hue-[a-z]+\b/)?.[0];
      expect(hue, `step ${i + 1} tile has no hue fill`).toBeTruthy();
      hues.add(hue!);
      expect(li.textContent).toContain(String(i + 1));
    });
    expect(hues.size).toBe(6);
    const titles = steps.map((li) => li.querySelector("[data-slot='walk-title']")?.textContent);
    expect(titles).toEqual([
      "Make a trip",
      "Sketch the stops",
      "Firm up the dates",
      "Fill the days",
      "Put money on it",
      "Bring your people",
    ]);
  });

  it("links each walkthrough step into the trip, the link text naming the page", () => {
    const { container } = render(<HelpGuide tripId="t1" />);
    const links = Array.from(
      container.querySelectorAll<HTMLAnchorElement>("section#the-life-of-one-trip ol a"),
    ).map((a) => [a.getAttribute("href"), a.textContent]);
    expect(links).toEqual([
      ["/trips/new", "New trip"],
      ["/trips/t1/plan", "Plan"],
      ["/trips/t1/plan", "Plan"],
      ["/trips/t1/plan", "Plan"],
      ["/trips/t1/day", "Days"],
      ["/trips/t1/budget", "Money"],
      ["/trips/t1/settings", "Settings"],
    ]);
  });

  it("without a tripId the walkthrough still links New trip and names the other pages in bold", () => {
    const { container } = render(<HelpGuide />);
    const walk = container.querySelector("section#the-life-of-one-trip")!;
    const hrefs = Array.from(walk.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(["/trips/new"]);
    const bold = Array.from(walk.querySelectorAll("strong")).map((s) => s.textContent);
    expect(bold).toEqual(["Plan", "Plan", "Plan", "Days", "Money", "Settings"]);
  });

  it("puts Expand all at the head of Using it day to day, not in the contents box", () => {
    const { container } = render(<HelpGuide />);
    const contents = container.querySelector('nav[aria-label="Contents"]');
    expect(contents?.textContent).not.toContain("Expand all");
    const everyday = container.querySelector("section[aria-labelledby='help-everyday-heading']")!;
    const heading = everyday.querySelector("#help-everyday-heading")!;
    const expand = screen.getByRole("button", { name: "Expand all" });
    expect(heading.parentElement).toBe(expand.closest("div.flex")!.parentElement);
    expect(heading.compareDocumentPosition(expand) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(everyday.querySelector("[data-slot='help-topic-grid']")!.compareDocumentPosition(expand) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
  });

  it("While you're away: changes need a connection, except a Feedback note; Saved for offline lives in Settings (HG-03)", () => {
    const { container } = render(<HelpGuide tripId="t1" />);
    const body = container.querySelector("details#away")?.textContent ?? "";
    expect(body).toContain("Changes do need a connection to save");
    expect(body).toContain("The one exception is a Feedback note");
    expect(body).toContain("sends itself when you’re back");
    expect(body).toContain("Saved for offline");
    expect(body).toContain("Save again");
    expect(body).toMatch(/Settings/);
  });

  it("anchors the legend so the contents can jump to it", () => {
    const { container } = render(<HelpGuide />);
    const legend = container.querySelector(`section#${HELP_LEGEND_ID}`);
    expect(legend?.getAttribute("aria-labelledby")).toBe("help-legend-heading");
    expect(legend?.querySelector("[data-slot='help-legend']")).toBeTruthy();
  });
```

(e) In "shifts the whole outline down one level when the page already owns an h2" (line 509) change the selector `"section[aria-labelledby='help-everyday-heading'] > h3"` to `"section[aria-labelledby='help-everyday-heading'] h3"` (the heading now sits in a flex row with Expand all).

(f) In "lays collapsed sections out as the kit's three-up grid" (line 548) change `"section[aria-labelledby='help-everyday-heading'] > div"` to `"section[aria-labelledby='help-everyday-heading'] [data-slot='help-topic-grid']"`. In "prints every section full width" (line 561) change `` `section[aria-labelledby='${id}'] > div` `` to `` `section[aria-labelledby='${id}'] [data-slot='help-topic-grid']` ``.

(g) Delete these four tests entirely: "runs the 60-second steps down the page in one column, not two" (593–601), "gives each 60-second step a numbered, hue-coloured icon tile" (603–618), "links the 60-second steps that name a screen into the trip" (620–631). Rename "the open 60-second card doesn't change the grid's column count" (633) to `"an open first card doesn't change the grid's column count"`.

- [ ] **Step 2: Run to see them fail**

Run: `npm test -- components/trip/help-guide.test.tsx`
Expected: FAIL — `Unknown help section: sixty-seconds` thrown from `sectionById` on every render.

- [ ] **Step 3: Edit `components/trip/help-guide.tsx` — imports, SiteLink, tiles**

Line 26 (`Timer,` in the lucide import): delete it. Keep `Route, Pin, Plus, CalendarDays, Wallet, Users` (all already imported).

Replace lines 37–42 with:

```tsx
import {
  HELP_GROUP_LABELS,
  HELP_LEGEND_ID,
  HELP_SECTIONS,
  guideTripHref,
  helpContents,
  type GuideTripSegment,
  type HelpSection,
} from "@/lib/help-guide";
```

Line 139: change the `href` union to `href: "/globe" | "/account" | "/trips" | "/trips/new";` and update the docblock line 133 to `Link to an account-level page (/globe, /account, /trips, /trips/new).`

Line 172: delete `"sixty-seconds": { icon: Timer, tone: "coral" },`.

Lines 277–288 (the LA-027 comment): replace the sentence `first card open (the everyday grid's 60-second version, by default): the rest pair up on their own, so an EVEN total strands the last one` with `first card open (nothing is open by default now, but the reader can open it): the rest pair up on their own, so an EVEN total strands the last one`. `TOPIC_GRID` itself is unchanged.

- [ ] **Step 4: Replace `sixtySteps` with the walkthrough**

Replace lines 292–363 (the `sixtySteps` docblock and function) with:

```tsx
/**
 * "The life of one trip": six steps down the page, each with a numbered,
 * hue-coloured icon tile and a link into the app. A function of `tripId`
 * because the links sit inside the bodies: a <Go>'s text must be the nav's
 * own label for its route (drift guard in help-guide.test.tsx), so each step
 * links only the page name. Step 1 is account-level, so it links on /help too.
 */
function lifeOfOneTrip(tripId?: string): {
  icon: LucideIcon;
  hue: Hue;
  key: string;
  title: string;
  body: React.ReactNode;
}[] {
  return [
    {
      icon: Plus,
      hue: "coral",
      key: "make",
      title: "Make a trip",
      body: (
        <>
          <SiteLink href="/trips/new">New trip</SiteLink> asks for a name, a
          rough month or real dates, and your home base. That&rsquo;s all it
          needs to exist.
        </>
      ),
    },
    {
      icon: Route,
      hue: "sun",
      key: "stops",
      title: "Sketch the stops",
      body: (
        <>
          On <Go tripId={tripId} segment="plan">Plan</Go>, add the places
          you&rsquo;ll be based in and a rough number of nights each, in the
          order you&rsquo;ll travel.
        </>
      ),
    },
    {
      icon: Pin,
      hue: "leaf",
      key: "dates",
      title: "Firm up the dates",
      body: (
        <>
          Still on <Go tripId={tripId} segment="plan">Plan</Go>: firm up from
          the start, and pin whatever is already booked so it stays put.
        </>
      ),
    },
    {
      icon: CalendarDays,
      hue: "sky",
      key: "days",
      title: "Fill the days",
      body: (
        <>
          Open a place on <Go tripId={tripId} segment="plan">Plan</Go>, or a
          day on <Go tripId={tripId} segment="day">Days</Go>, and add the
          things to do, the beds, and the trains between.
        </>
      ),
    },
    {
      icon: Wallet,
      hue: "lilac",
      key: "money",
      title: "Put money on it",
      body: (
        <>
          <Go tripId={tripId} segment="budget">Money</Go> keeps what each thing
          costs, what&rsquo;s been paid, and what&rsquo;s still to pay.
        </>
      ),
    },
    {
      icon: Users,
      hue: "teal",
      key: "people",
      title: "Bring your people",
      body: (
        <>
          In <Go tripId={tripId} segment="settings">Settings</Go>, invite them
          by email or make a share link. Want to try two versions of the trip?
          Make a variant and compare them side by side.
        </>
      ),
    },
  ];
}
```

- [ ] **Step 5: Rewrite the top of `HelpGuide`**

Replace lines 379–472 (from `return (` through the closing `</Section>` of the `sixty-seconds` card) with:

```tsx
  return (
    <div className="flex flex-col gap-8">
      <style>{HELP_PRINT_STYLE}</style>
      <HelpHashOpen />

      {/* ── Contents (below lg; the page's OnThisPage rail takes over from lg) ──
          Server-rendered anchors. With script, HelpHashOpen opens whichever
          section is linked to and clears the fragment so it can be closed
          again; without script, the :target rules above still open it. */}
      <nav
        aria-label="Contents"
        className="help-print-hide rounded-lg border-2 border-border bg-background p-[18px] text-card-foreground shadow-hard-2"
      >
        <Group className="mb-3.5 font-display text-lg font-extrabold leading-tight tracking-[-0.03em] text-foreground">
          What&rsquo;s in here
        </Group>
        {/* gap-y-4: chips are 28px with a 44px ::after (8px spill each side),
            so 16px between rows keeps neighbouring hit areas from overlapping. */}
        <ol className="flex flex-wrap gap-x-2 gap-y-4">
          {helpContents()
            .flatMap((g) => g.entries)
            .map((entry) => (
              <li key={entry.id}>
                <a
                  href={`#${entry.id}`}
                  className="relative inline-flex min-h-7 items-center rounded-full border-2 border-border bg-card px-2.5 py-1 text-[11px] font-extrabold leading-tight text-foreground transition-[transform,box-shadow] duration-[var(--dur-fast)] ease-pop after:absolute after:inset-x-0 after:top-1/2 after:h-11 after:-translate-y-1/2 hover:-translate-x-px hover:-translate-y-px hover:shadow-hard-1 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  {entry.title}
                </a>
              </li>
            ))}
        </ol>
      </nav>

      {/* ── What Teepee is ── */}
      <section id="what-teepee-is" aria-labelledby="help-what-heading" className="scroll-mt-20 md:scroll-mt-6">
        <Group id="help-what-heading" className={cn("mb-3.5", GROUP_HEADING)}>
          {sectionById("what-teepee-is").title}
        </Group>
        <p className="max-w-reading text-[15px] font-medium leading-relaxed text-foreground">
          Teepee is a place to plan a trip with the people going on it. It
          starts as a rough idea &mdash; a name and a month &mdash; and grows
          into the days you&rsquo;re away: where you&rsquo;re staying, what
          you&rsquo;re doing and what it costs. When you&rsquo;re home again,
          it&rsquo;s where you look back on it.
        </p>
      </section>

      {/* ── The walkthrough ── */}
      <section id="the-life-of-one-trip" aria-labelledby="help-walk-heading" className="scroll-mt-20 md:scroll-mt-6">
        <Group id="help-walk-heading" className={cn("mb-3.5", GROUP_HEADING)}>
          {sectionById("the-life-of-one-trip").title}
        </Group>
        <div className="rounded-lg border-2 border-border bg-card p-[18px] text-card-foreground shadow-hard-2">
          <ol aria-label="The life of one trip" className="flex max-w-reading flex-col gap-3">
            {lifeOfOneTrip(tripId).map((s, i) => {
              const Icon = s.icon;
              return (
                <li key={s.key} className="flex items-start gap-3.5">
                  {/* The number sits OUTSIDE the island: inside it, bg-card
                      is re-scoped to a translucent cream that reads badly
                      over the dark page where the badge overhangs. */}
                  <span aria-hidden="true" className="relative shrink-0">
                    <span
                      data-slot="walk-tile"
                      className={cn(
                        "island grid size-11 place-items-center rounded-lg border-2 border-border",
                        HUE_CLASSES[s.hue].fill,
                      )}
                    >
                      <Icon className="size-5" strokeWidth={2.5} />
                    </span>
                    <span className="absolute -right-2 -top-2 grid size-5 place-items-center rounded-full border-2 border-border bg-card font-display text-[11px] font-extrabold text-foreground">
                      {i + 1}
                    </span>
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <span data-slot="walk-title" className="font-display text-base font-extrabold tracking-[-0.02em]">
                      {s.title}
                    </span>
                    <span className="text-sm text-muted-foreground">{s.body}</span>
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      </section>

      {/* ── The key ── */}
      <section id={HELP_LEGEND_ID} aria-labelledby="help-legend-heading" className="scroll-mt-20 md:scroll-mt-6">
        <Group id="help-legend-heading" className={cn("mb-3.5", GROUP_HEADING)}>
          What the buttons mean
        </Group>
        <div className="rounded-lg border-2 border-border bg-card p-[18px] text-card-foreground shadow-hard-2">
          <HelpLegend headingLevel={level + 1 as 3 | 4} />
        </div>
      </section>

      {/* ── Everyday sections ── */}
      <section aria-labelledby="help-everyday-heading">
        <div className="mb-3.5 flex flex-wrap items-center justify-between gap-2">
          <Group id="help-everyday-heading" className={GROUP_HEADING}>
            {HELP_GROUP_LABELS.everyday}
          </Group>
          <HelpExpandAll />
        </div>
        <div data-slot="help-topic-grid" className={TOPIC_GRID}>
          {/* One <Section> per everyday id, in HELP_SECTIONS order. */}
```

(The next line after this block is the existing `<Section heading={Sub} section={sectionById("your-trips")}>`.)

- [ ] **Step 6: The other two group headings and grids**

Lines 1224–1233 (advanced): change `Going deeper` inside the `<Group>` to `{HELP_GROUP_LABELS.advanced}` and `<div className={TOPIC_GRID}>` to `<div data-slot="help-topic-grid" className={TOPIC_GRID}>`.

Lines 1644–1649 (reference): change `Looking something up` to `{HELP_GROUP_LABELS.reference}` and `<div className={TOPIC_GRID}>` to `<div data-slot="help-topic-grid" className={TOPIC_GRID}>`.

- [ ] **Step 7: HG-03 — the "While you're away" paragraph**

Replace lines 1064–1070 (the paragraph beginning `You won&rsquo;t always have signal.`) with:

```tsx
            <p>
              You won&rsquo;t always have signal. Pages you&rsquo;ve already
              opened keep working when you lose it, and the trip you opened
              last is kept on your phone on purpose &mdash;{" "}
              <Go tripId={tripId} segment="settings">
                Settings
              </Go>{" "}
              shows it as <strong className="font-semibold">Saved for offline</strong>,
              with a <strong className="font-semibold">Save again</strong>{" "}
              button if you want it fresh. Changes do need a connection to save,
              though, so don&rsquo;t count on editing while you&rsquo;re
              offline. The one exception is a Feedback note: write it offline
              and it waits, then sends itself when you&rsquo;re back.
            </p>
```

Then in `docs/open-follow-ups.md`, append to the HG-03 bullet (after `does not silently contradict it.`):

```
  *Closed 2026-10-01 (spec §D/§F): the paragraph now names the Feedback-note
  exception and the Settings "Saved for offline" row.*
```

- [ ] **Step 8: Run the guide tests**

Run: `npm test -- components/trip/help-guide.test.tsx components/trip/help-hash-open.test.tsx components/trip/help-expand-all.test.tsx lib/help-guide.test.ts`
Expected: PASS. Watch the two drift guards specifically: "every <Go> link's visible text matches primaryNav/moreNav's current label" (the walkthrough's `Plan`/`Days`/`Money`/`Settings` all match `components/trip/trip-nav.tsx` lines 29–47), and the heading-outline tests (walkthrough step titles are `<span>`s, so no new heading levels).

- [ ] **Step 9: Gates and commit**

```bash
npx tsc --noEmit && npm run lint
git add lib/help-guide.ts lib/help-guide.test.ts components/trip/help-guide.tsx components/trip/help-guide.test.tsx docs/open-follow-ups.md
git commit -m "feat(help): open with What Teepee is and The life of one trip; legend demoted; Expand all heads Day to day; HG-03 offline copy

Replaces the 60-second version (spec 2026-10-01 §D). The away section now
names the Feedback-note exception (ADR 0041) and the Saved for offline row.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 13: The sticky "On this page" rail on `/help` and the trip help page; chip box hidden from `lg`

**Files:**
- Modify: `app/(app)/help/page.tsx` (lines 1–24)
- Modify: `app/(app)/help/page.test.tsx`
- Modify: `app/(app)/trips/[tripId]/help/page.tsx` (lines 72–103)
- Modify: `app/(app)/trips/[tripId]/help/page.test.tsx`
- Modify: `components/trip/help-guide.tsx` (the Contents nav className from Task 12 Step 5)
- Modify: `components/trip/help-guide.test.tsx` (chip box `lg:hidden`; rail-click test)

**Interfaces:**
- Consumes: `OnThisPage` (Task 10), `helpContents()` (Task 11), `HelpHashOpen` (existing — opens the `<details>` named by the fragment on mount and on every `hashchange`, then strips the fragment so `:target` releases and so a second click on the same entry is again a hash *change*).
- Produces: both pages render `<div className="lg:grid lg:grid-cols-[minmax(0,1fr)_14rem] lg:items-start lg:gap-x-12"><HelpGuide … /><OnThisPage groups={helpContents()} className="help-print-hide" /></div>`.

Why plain anchors are enough: the rail entries are `<a href="#id">`. Clicking one is same-document fragment navigation — the browser scrolls to `#id` and fires `hashchange` (HTML "navigate to a fragment" fires it whenever the fragment differs from the current one). `HelpHashOpen` listens for `hashchange`, sets `details.open = true` on the targeted card, and `replaceState`s the fragment away, which is exactly why a *repeat* click on the same entry still fires `hashchange` (`""` → `"#id"`). For the walkthrough and legend (not `<details>`), `HelpHashOpen` returns early and the native scroll is all that is needed. jsdom implements anchor activation → fragment navigation → `hashchange`, which the test below relies on.

- [ ] **Step 1: Write the failing page tests**

In `app/(app)/help/page.test.tsx`, add at the end of the `describe("global /help page", …)` block:

```tsx
  it("runs the guide beside a sticky On this page rail from lg", () => {
    const { container } = render(<HelpPage />);
    const rail = screen.getByRole("navigation", { name: "On this page" });
    expect(rail.className).toContain("lg:sticky");
    expect(rail.className).toContain("lg:top-6");
    expect(rail.className).toContain("lg:max-h-[calc(100dvh-3rem)]");
    expect(rail.className).toContain("help-print-hide");
    const grid = rail.parentElement as HTMLElement;
    expect(grid.className).toContain("lg:grid");
    expect(grid.className).toContain("lg:grid-cols-[minmax(0,1fr)_14rem]");
    expect(grid.querySelector("[data-testid='guide']")).toBeTruthy();
    expect(container.querySelector("[data-testid='guide']")?.nextElementSibling).toBe(rail);
  });

  it("the rail lists the walkthrough, the legend, then every card under its group", () => {
    render(<HelpPage />);
    const rail = screen.getByRole("navigation", { name: "On this page" });
    const hrefs = Array.from(rail.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(helpContents().flatMap((g) => g.entries.map((e) => `#${e.id}`)));
    expect(hrefs.slice(0, 2)).toEqual(["#the-life-of-one-trip", `#${HELP_LEGEND_ID}`]);
    for (const label of Object.values(HELP_GROUP_LABELS)) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });
```

and add to its imports (after line 35):

```tsx
import { HELP_GROUP_LABELS, HELP_LEGEND_ID, helpContents } from "@/lib/help-guide";
```

In `app/(app)/trips/[tripId]/help/page.test.tsx`, add at the end of the `describe("trip-scoped help page", …)` block:

```tsx
  it("runs the guide beside a sticky On this page rail from lg", async () => {
    const ui = await TripHelpPage({ params: Promise.resolve({ tripId: "t1" }) });
    const { container } = render(ui);
    const rail = screen.getByRole("navigation", { name: "On this page" });
    expect(rail.className).toContain("lg:sticky");
    expect(rail.className).toContain("help-print-hide");
    const grid = rail.parentElement as HTMLElement;
    expect(grid.className).toContain("lg:grid-cols-[minmax(0,1fr)_14rem]");
    expect(container.querySelector("[data-testid='guide']")?.nextElementSibling).toBe(rail);
    const hrefs = Array.from(rail.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(helpContents().flatMap((g) => g.entries.map((e) => `#${e.id}`)));
  });
```

with the import added after line 120:

```tsx
import { helpContents } from "@/lib/help-guide";
```

In `components/trip/help-guide.test.tsx`, add inside `describe("HelpGuide", …)`:

```tsx
  it("hides the What's in here chip box from lg, where the page's rail replaces it", () => {
    const { container } = render(<HelpGuide />);
    const nav = container.querySelector('nav[aria-label="Contents"]');
    expect(nav?.className).toContain("lg:hidden");
  });

  it("a rail entry for a collapsed card opens it (HelpHashOpen on hashchange)", async () => {
    // Same-document anchor click → fragment navigation → hashchange, which
    // HelpHashOpen answers by setting `open` and stripping the fragment.
    window.history.replaceState(null, "", "/help");
    const { container } = render(
      <div>
        <HelpGuide tripId="t1" />
        <OnThisPage groups={helpContents()} />
      </div>,
    );
    const forks = container.querySelector<HTMLDetailsElement>("details#forks")!;
    expect(forks.open).toBe(false);
    fireEvent.click(screen.getByRole("navigation", { name: "On this page" }).querySelector('a[href="#forks"]')!);
    await waitFor(() => expect(forks.open).toBe(true));
    await waitFor(() => expect(window.location.hash).toBe(""));
    // A second click on the same entry is again a hash change, so it still opens.
    forks.open = false;
    fireEvent.click(screen.getByRole("navigation", { name: "On this page" }).querySelector('a[href="#forks"]')!);
    await waitFor(() => expect(forks.open).toBe(true));
    window.history.replaceState(null, "", "/help");
  });
```

and change line 2 to `import { render, screen, fireEvent, waitFor } from "@testing-library/react";` and add after the lib import:

```tsx
import { OnThisPage } from "@/components/ui/on-this-page";
```

- [ ] **Step 2: Run to see them fail**

Run: `npm test -- "app/(app)/help/page.test.tsx" "app/(app)/trips/[tripId]/help/page.test.tsx" components/trip/help-guide.test.tsx`
Expected: FAIL — no `navigation` named "On this page" on either page; the chip box lacks `lg:hidden`. (The rail-click test passes already if run alone, because it mounts `OnThisPage` itself — that is fine; it pins the mechanism.)

- [ ] **Step 3: `/help` page**

Replace `app/(app)/help/page.tsx` in full:

```tsx
import type { Metadata } from "next";
import { HelpGuide } from "@/components/trip/help-guide";
import { OnThisPage } from "@/components/ui/on-this-page";
import { helpContents } from "@/lib/help-guide";

export const metadata: Metadata = {
  title: "How to use Teepee",
  description: "A short guide to planning a trip together in Teepee.",
};

export default function HelpPage() {
  return (
    <div className="flex w-full flex-col gap-6 lg:gap-8">
      <div className="flex flex-col gap-1.5">
        <h1 className="font-display text-3xl font-extrabold tracking-[-0.03em] text-foreground lg:text-4xl">
          How to use Teepee
        </h1>
        <p className="max-w-[60ch] text-[13px] font-medium text-muted-foreground">
          Everything you need, shortest bits first. Open a trip to get links
          that jump straight to the right screen.
        </p>
      </div>
      {/* From lg the guide's three-up card grid keeps the fluid column and the
          rail takes a fixed 14rem (What's new's proportions); legal-page's
          38rem reading track would squeeze the cards. Below lg the guide's own
          "What's in here" chip box is the contents and the rail is hidden. */}
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_14rem] lg:items-start lg:gap-x-12">
        <HelpGuide />
        <OnThisPage groups={helpContents()} className="help-print-hide" />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Trip help page**

In `app/(app)/trips/[tripId]/help/page.tsx`, add after line 74 (`import { TripHeaderTrailing } …`):

```tsx
import { OnThisPage } from "@/components/ui/on-this-page";
import { helpContents } from "@/lib/help-guide";
```

Replace lines 99–101 (the comment and `<HelpGuide tripId={slug} level={2} />`) with:

```tsx
      {/* HelpGuide builds links from this; it is the Trip's URL ref (slug), ADR 0064.
          level={2}: this page's own h1 (PageHeader) is the only heading above it now.
          Same two-column shape as /help: fluid guide, 14rem sticky rail from lg. */}
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_14rem] lg:items-start lg:gap-x-12">
        <HelpGuide tripId={slug} level={2} />
        <OnThisPage groups={helpContents()} className="help-print-hide" />
      </div>
```

- [ ] **Step 5: Chip box `lg:hidden`**

In `components/trip/help-guide.tsx`, the Contents `<nav>` from Task 12 Step 5: change its className to

```tsx
        className="help-print-hide rounded-lg border-2 border-border bg-background p-[18px] text-card-foreground shadow-hard-2 lg:hidden"
```

- [ ] **Step 6: Run the tests**

Run: `npm test -- "app/(app)/help/page.test.tsx" "app/(app)/trips/[tripId]/help/page.test.tsx" components/trip/help-guide.test.tsx components/trip/help-hash-open.test.tsx components/ui/on-this-page.test.tsx components/legal/legal-page.test.tsx lib/help-guide.test.ts`
Expected: PASS.

- [ ] **Step 7: Gates, full suite, commit**

```bash
npx tsc --noEmit && npm run lint && npm test
git add "app/(app)/help/page.tsx" "app/(app)/help/page.test.tsx" "app/(app)/trips/[tripId]/help/page.tsx" "app/(app)/trips/[tripId]/help/page.test.tsx" components/trip/help-guide.tsx components/trip/help-guide.test.tsx
git commit -m "feat(help): sticky On this page rail beside the guide from lg; chip box stays below lg

A rail entry for a collapsed card opens it through HelpHashOpen's hashchange
listener — plain #id anchors, no new client state.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

Manual check (dev server, 1440×900): `/help` and `/trips/<slug>/help` show the rail on the right, sticky while scrolling, scrolling inside itself when the window is short; clicking "Variants and comparing plans" opens that card and the URL has no fragment afterwards; at 1023px the rail is gone and the chip box is back at the top; Print preview shows neither.

---

### Part 3 — interfaces produced

- `components/ui/on-this-page.tsx`: `OnThisPage({ groups: OnThisPageGroup[]; className?: string })`, `interface OnThisPageEntry { id: string; title: string }`, `interface OnThisPageGroup { label?: string; entries: OnThisPageEntry[] }`. Renders `nav[aria-label="On this page"]`, `hidden lg:block lg:sticky lg:top-6 lg:self-start lg:max-h-[calc(100dvh-3rem)] lg:overflow-y-auto`; `null` when every group is empty.
- `lib/help-guide.ts`: `HelpGroup` adds `"intro"`; `HELP_SECTIONS[0..1]` = `what-teepee-is`, `the-life-of-one-trip`; `sixty-seconds` removed; `collapsibleSections(): HelpSection[]`; `HELP_LEGEND_ID = "help-legend"`; `HELP_GROUP_LABELS = { everyday, advanced, reference }`; `interface HelpContentsGroup`; `helpContents(): HelpContentsGroup[]`.
- `components/trip/help-guide.tsx` DOM contract: `section#what-teepee-is`, `section#the-life-of-one-trip` (`ol[aria-label="The life of one trip"]`, `[data-slot="walk-tile"]`, `[data-slot="walk-title"]`), `section#help-legend`, `[data-slot="help-topic-grid"]` on each group grid; every `<details>` closed by default; `nav[aria-label="Contents"]` is `lg:hidden`. `SiteLink` href union now includes `"/trips/new"`.
- For Part 5 (§F): once the Settings row exists, add `"Saved for offline"` and `"Save again"` to `GUIDE_UI_STRINGS` in `lib/help-guide.ts` — the guide quotes both from Task 12 on, and the drift guard will then pin them.

---

### Task 14: Plan handlers that fail like their siblings — `handleAssign` reverts and toasts, `handleSuggestChapters` toasts instead of reaching the Plan error boundary

**Files:**
- Modify: `/work/components/trip/itinerary-manager.tsx` (new module-level `toastRejected()` above line 495 `export function ItineraryManager(`; `handleAssign` at lines 1045–1057; `handleSuggestChapters` at lines 1071–1081)
- Test: `/work/components/trip/itinerary-manager.test.tsx` (chapters mock at lines 66–72; imports at line 176; new describe appended at the end of the file)

**Interfaces:**
- Consumes: `assignStopToChapter(stopId: string, chapterId: string | null): Promise<ActionResult>` from `@/server/actions/chapters` (the component imports it from there — `itinerary-manager.tsx:65` — even though the test file's `@/server/actions/stops` mock at line 32 also lists one; the chapters mock does not, so the test must add it); `suggestChaptersFromCountries(tripId: string): Promise<ActionResult<{ created: number }>>` (`server/actions/chapters.ts:288`); `toast(options)` from `@/components/ui/use-toast` (mocked in the test at lines 140–143).
- Produces: `function toastRejected(): void` — module-level in `itinerary-manager.tsx`, the one place the Plan editor reports a *rejected* (thrown) action. Task 15 swaps its body for the shared message; nothing else needs to know.

Background for an engineer new to the repo: the Plan editor keeps an optimistic copy of the stops in `localStops` state. Every sibling handler (`handleMoveStop` at 725, `handleTogglePin` at 739, `handleScheduleThing` at 1091…) wraps its server action in `try/catch` and, on a throw, toasts `"Something went wrong — nothing was changed. Try again."`. `handleAssign` does not: a thrown `assignStopToChapter` (the network is gone) leaves Athens drawn under the chapter it never joined and the click handler rejects unhandled. `handleSuggestChapters` awaits inside `startSuggestTransition` with only `try/finally`, so a throw propagates out of the transition into `app/(app)/trips/[tripId]/plan/error.tsx`, replacing the whole Plan page for an action that changed nothing.

- [ ] **Step 1: Add `assignStopToChapter` to the chapters mock and import it**

In `/work/components/trip/itinerary-manager.test.tsx`, replace the chapters mock (lines 66–72) with:

```tsx
vi.mock("@/server/actions/chapters", () => ({
  createChapter: vi.fn().mockResolvedValue({ success: true }),
  updateChapter: vi.fn().mockResolvedValue({ success: true }),
  reorderChapters: vi.fn().mockResolvedValue({ success: true }),
  deleteChapter: vi.fn().mockResolvedValue({ success: true }),
  assignStopToChapter: vi.fn().mockResolvedValue({ success: true }),
  suggestChaptersFromCountries: vi.fn().mockResolvedValue({ success: true, created: 0 }),
}));
```

Change the import on line 176 to:

```tsx
import { createChapter, deleteChapter, assignStopToChapter, suggestChaptersFromCountries } from "@/server/actions/chapters";
```

- [ ] **Step 2: Write the two failing tests**

Append to the end of `/work/components/trip/itinerary-manager.test.tsx`:

```tsx
// ---------------------------------------------------------------------------
// Spec 2026-10-01 §F1: the two chapter handlers that did not fail like their
// siblings. A rejected action (the connection is gone) must revert anything
// optimistic and toast — never leave a phantom change, never throw into
// plan/error.tsx.
// ---------------------------------------------------------------------------

describe("rejected chapter actions fail like their siblings (spec 2026-10-01 §F1)", () => {
  const roughChapter = {
    id: "ch-asia",
    name: "Asia",
    colour: "rose" as const,
    startDate: null,
    endDate: null,
    sortOrder: 0,
  };

  it("assign to chapter: a rejected action reverts the optimistic move and toasts", async () => {
    const user = userEvent.setup();
    let reject!: (e: Error) => void;
    vi.mocked(assignStopToChapter).mockImplementationOnce(
      () => new Promise((_, r) => { reject = r; }) as ReturnType<typeof assignStopToChapter>,
    );
    const athens = makeStop({ id: "s-athens", name: "Athens", arriveDate: null, departDate: null });

    renderPlan(<ItineraryManager {...baseProps} initialStops={[athens]} chapters={[roughChapter]} />);

    // Asia starts empty; Athens is Ungrouped.
    expect(desktop().getByText("No stops yet")).toBeInTheDocument();

    await user.click(desktop().getByRole("button", { name: "More actions for Athens" }));
    await user.click(await screen.findByRole("menuitem", { name: /Assign to chapter/ }));
    await user.click(await screen.findByRole("button", { name: "Asia" }));

    // Optimistic: Athens sits under Asia before the server answers.
    await waitFor(() => expect(desktop().getByText("1 stop · rough")).toBeInTheDocument());
    expect(assignStopToChapter).toHaveBeenCalledWith("s-athens", "ch-asia");

    await act(async () => reject(new Error("offline")));

    // Reverted: Asia is empty again, and the Traveller was told.
    await waitFor(() => expect(desktop().getByText("No stops yet")).toBeInTheDocument());
    expect(desktop().queryByText("1 stop · rough")).toBeNull();
    expect(vi.mocked(toast)).toHaveBeenCalledWith(
      expect.objectContaining({
        variant: "destructive",
        title: expect.stringMatching(/nothing was changed/i),
      }),
    );
  });

  it("suggest chapters: a rejected action toasts and releases the in-flight guard", async () => {
    const user = userEvent.setup();
    vi.mocked(suggestChaptersFromCountries).mockRejectedValueOnce(new Error("offline"));
    function Trigger() {
      const { actions } = usePlanBody();
      return <button onClick={actions.suggestChapters}>header suggest</button>;
    }
    render(
      <PlanBody initialOpen={[]} today="2030-01-01">
        <Trigger />
        <ItineraryManager {...baseProps} initialStops={[makeStop()]} />
      </PlanBody>,
    );

    await user.click(screen.getByRole("button", { name: "header suggest" }));

    await waitFor(() =>
      expect(vi.mocked(toast)).toHaveBeenCalledWith(
        expect.objectContaining({
          variant: "destructive",
          title: expect.stringMatching(/nothing was changed/i),
        }),
      ),
    );

    // The guard released, so a retry goes through.
    vi.mocked(suggestChaptersFromCountries).mockResolvedValueOnce({ success: true, created: 0 });
    await user.click(screen.getByRole("button", { name: "header suggest" }));
    await waitFor(() => expect(suggestChaptersFromCountries).toHaveBeenCalledTimes(2));
  });
});
```

- [ ] **Step 3: Run them to see them fail**

Run: `npm test -- components/trip/itinerary-manager.test.tsx -t "rejected chapter actions"`
Expected: FAIL ×2 — the assign test times out waiting for "No stops yet" (Athens stays under Asia; Vitest also reports an unhandled rejection from the click handler); the suggest test fails on `toast` never being called with `/nothing was changed/` (Vitest reports an unhandled error from the transition).

- [ ] **Step 4: Add `toastRejected()` and use it in the two handlers**

In `/work/components/trip/itinerary-manager.tsx`, directly above line 495 `export function ItineraryManager({`, insert:

```tsx
// A rejected action (network drop, thrown server error) must behave like a
// failed one — report, and the caller reverts whatever it drew optimistically.
function toastRejected() {
  toast({ variant: "destructive", title: "Something went wrong — nothing was changed. Try again." });
}
```

Replace `handleAssign` (lines 1042–1057, from the `// Assign a rough stop to a chapter` comment through the closing brace) with:

```tsx
  // Assign a rough stop to a chapter (or null = Ungrouped) from the picker dialog.
  // Optimistically updates localStops, then persists via assignStopToChapter.
  // On a failed OR rejected action, reverts and shows an error toast.
  async function handleAssign(stopId: string, chapterId: string | null) {
    setAssigningStop(null);
    const snapshot = localStops;
    setLocalStops((prev) =>
      prev.map((s) => (s.id === stopId ? { ...s, chapterId } : s)),
    );
    try {
      const res = await assignStopToChapter(stopId, chapterId);
      if (!res.success) {
        setLocalStops(snapshot);
        const firstError = res.errors ? Object.values(res.errors).flat()[0] : undefined;
        toast({ variant: "destructive", title: firstError ?? "Couldn't assign stop to chapter." });
      }
    } catch {
      setLocalStops(snapshot);
      toastRejected();
    }
  }
```

Replace `handleSuggestChapters` (lines 1071–1081) with:

```tsx
  function handleSuggestChapters() {
    if (suggestingRef.current) return;
    suggestingRef.current = true;
    startSuggestTransition(async () => {
      try {
        const result = await suggestChaptersFromCountries(tripId);
        toast(suggestResultToast(result));
      } catch {
        // Caught inside the transition: a throw here would otherwise unmount
        // the Plan page into plan/error.tsx for an action that changed nothing.
        toastRejected();
      } finally {
        suggestingRef.current = false;
      }
    });
  }
```

The comment block above `handleSuggestChapters` (lines 1065–1070, "Suggest chapters from countries and toast the outcome…") stays as it is.

- [ ] **Step 5: Run the tests**

Run: `npm test -- components/trip/itinerary-manager.test.tsx`
Expected: PASS, including the two new tests and the existing "Suggest from countries in-flight guard" and "deleteChapter rejects (P2-1 regression)" tests.

- [ ] **Step 6: Gates and commit**

Run: `npx tsc --noEmit && npm run lint`
Expected: both clean.

```
git add components/trip/itinerary-manager.tsx components/trip/itinerary-manager.test.tsx
git commit -m "fix(plan): assign-to-chapter reverts and toasts on a rejected action; suggest chapters catches inside its transition

handleAssign had no try/catch, so a thrown assignStopToChapter (no
connection) left the stop drawn under a chapter it never joined.
handleSuggestChapters awaited inside startTransition with try/finally
only, so a throw reached plan/error.tsx and replaced the Plan page.
Both now fail like their siblings: revert, toast, release the guard.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 15: One shared offline message at the point of failure — `failureMessage()`

**Files:**
- Create: `/work/components/ui/failure-message.ts`
- Create: `/work/components/ui/failure-message.test.ts`
- Modify: `/work/components/ui/use-server-action.ts` (lines 47–56, the `catch` block)
- Modify: `/work/components/trip/itinerary-manager.tsx` (`toastRejected()` from Task 14; the ten literal `toast({ variant: "destructive", title: "Something went wrong — nothing was changed. Try again." })` sites at lines 732, 746, 768, 908, 944, 966, 1026, 1102, 1120, 1165 — line numbers as of before Task 14; re-grep)
- Test: `/work/components/ui/use-server-action.test.tsx` (new test appended), `/work/components/trip/itinerary-manager.test.tsx` (one new test in the Task 14 describe)

**Interfaces:**
- Produces (`components/ui/failure-message.ts`):
  - `export const OFFLINE_MESSAGE = "You're offline. Plan changes need a connection."`
  - `export function failureMessage(fallback: string): string` — `OFFLINE_MESSAGE` when `typeof navigator !== "undefined" && navigator.onLine === false`, otherwise `fallback` unchanged.
- Consumes: nothing — pure, no React, no browser API beyond the `navigator.onLine` read.

Why a sibling module rather than inside `use-server-action.ts`: that file is `"use client"` and imports React; `itinerary-manager.tsx` would otherwise import a hook module for one string. The spec (§F1) calls the helper `offlineMessage()`; the name here is `failureMessage()` because it returns the generic text too — it answers "what do I say about this failure?", not "what is the offline copy?". Use `failureMessage` consistently; do not add an `offlineMessage` alias.

Why each caller keeps its own fallback: `useServerAction` says "Something went wrong. Check your connection and try again." (form-level, under a field form), the Plan editor says "Something went wrong — nothing was changed. Try again." (toast after an optimistic edit). Both are already pinned by tests; the offline case is the only new string, and it is one string in one place.

- [ ] **Step 1: Write the failing unit test for the helper**

Create `/work/components/ui/failure-message.test.ts`:

```ts
import { describe, it, expect, afterEach } from "vitest";
import { failureMessage, OFFLINE_MESSAGE } from "./failure-message";

const ORIGINAL_ONLINE = Object.getOwnPropertyDescriptor(Navigator.prototype, "onLine");

function setOnLine(value: boolean) {
  Object.defineProperty(navigator, "onLine", { configurable: true, get: () => value });
}

afterEach(() => {
  // Put jsdom's own getter back so other files see the real value.
  if (ORIGINAL_ONLINE) Object.defineProperty(navigator, "onLine", ORIGINAL_ONLINE);
});

describe("failureMessage", () => {
  it("returns the caller's wording while online", () => {
    setOnLine(true);
    expect(failureMessage("Something went wrong — nothing was changed. Try again.")).toBe(
      "Something went wrong — nothing was changed. Try again.",
    );
  });

  it("names the connection when the device is offline at the time of the failure", () => {
    setOnLine(false);
    expect(failureMessage("Something went wrong — nothing was changed. Try again.")).toBe(OFFLINE_MESSAGE);
    expect(OFFLINE_MESSAGE).toBe("You're offline. Plan changes need a connection.");
  });

  it("reads navigator at call time, not at import time", () => {
    setOnLine(true);
    expect(failureMessage("generic")).toBe("generic");
    setOnLine(false);
    expect(failureMessage("generic")).toBe(OFFLINE_MESSAGE);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npm test -- components/ui/failure-message.test.ts`
Expected: FAIL — `Cannot find module './failure-message'`.

- [ ] **Step 3: Create the helper**

Create `/work/components/ui/failure-message.ts`:

```ts
/**
 * The one message for a plan change that failed. When the device is known to
 * be offline the reason is the connection, so say so (ADR 0016, amended
 * 2026-10-01: the banner plus one shared message at the point of failure —
 * still no per-action copy). Otherwise the caller's own wording stands.
 *
 * Read at call time: `navigator.onLine` is whatever it is when the action
 * fails, not when the module loaded.
 */
export const OFFLINE_MESSAGE = "You're offline. Plan changes need a connection.";

export function failureMessage(fallback: string): string {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return OFFLINE_MESSAGE;
  return fallback;
}
```

Run: `npm test -- components/ui/failure-message.test.ts`
Expected: PASS ×3.

- [ ] **Step 4: Write the failing `useServerAction` test**

Append to `/work/components/ui/use-server-action.test.tsx`, inside the existing `describe("useServerAction", …)` block (before its closing `});`):

```tsx
  it("reports the offline message when navigator.onLine is false at the time of the failure", async () => {
    const original = Object.getOwnPropertyDescriptor(Navigator.prototype, "onLine");
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => false });
    try {
      const boom = vi.fn().mockRejectedValue(new Error("offline"));
      const onError = vi.fn();
      const { result } = renderHook(() => useServerAction(boom, { onError }));

      act(() => result.current.run());
      await waitFor(() => expect(result.current.isPending).toBe(false));
      expect(result.current.errors._form).toEqual(["You're offline. Plan changes need a connection."]);
      expect(onError).toHaveBeenCalledWith({
        _form: ["You're offline. Plan changes need a connection."],
      });
    } finally {
      if (original) Object.defineProperty(navigator, "onLine", original);
    }
  });
```

Run: `npm test -- components/ui/use-server-action.test.tsx`
Expected: FAIL on the new test — `_form` is still `["Something went wrong. Check your connection and try again."]`. The existing "surfaces a rejected action" test still passes (jsdom reports online).

- [ ] **Step 5: Use the helper in `useServerAction`**

In `/work/components/ui/use-server-action.ts`, add the import after line 4:

```ts
import { failureMessage } from "@/components/ui/failure-message";
```

Replace lines 47–56 (the `catch` block) with:

```ts
      } catch {
        // A rejected action (network drop, server crash) must never vanish
        // silently — surface it like a failed result, naming the connection
        // when the device is offline.
        const errors: FieldErrors = {
          _form: [failureMessage("Something went wrong. Check your connection and try again.")],
        };
        setErrors(errors);
        optionsRef.current?.onError?.(errors, ...args);
        return;
      }
```

Run: `npm test -- components/ui/use-server-action.test.tsx`
Expected: PASS ×5.

- [ ] **Step 6: Write the failing Plan-editor offline test**

In `/work/components/trip/itinerary-manager.test.tsx`, inside the `describe("rejected chapter actions fail like their siblings …")` block from Task 14, add a third test:

```tsx
  it("while offline, a rejected action says so instead of the generic wording", async () => {
    const original = Object.getOwnPropertyDescriptor(Navigator.prototype, "onLine");
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => false });
    try {
      const user = userEvent.setup();
      vi.mocked(suggestChaptersFromCountries).mockRejectedValueOnce(new Error("offline"));
      function Trigger() {
        const { actions } = usePlanBody();
        return <button onClick={actions.suggestChapters}>header suggest</button>;
      }
      render(
        <PlanBody initialOpen={[]} today="2030-01-01">
          <Trigger />
          <ItineraryManager {...baseProps} initialStops={[makeStop()]} />
        </PlanBody>,
      );

      await user.click(screen.getByRole("button", { name: "header suggest" }));

      await waitFor(() =>
        expect(vi.mocked(toast)).toHaveBeenCalledWith(
          expect.objectContaining({
            variant: "destructive",
            title: "You're offline. Plan changes need a connection.",
          }),
        ),
      );
    } finally {
      if (original) Object.defineProperty(navigator, "onLine", original);
    }
  });
```

Run: `npm test -- components/trip/itinerary-manager.test.tsx -t "while offline"`
Expected: FAIL — the toast title is still "Something went wrong — nothing was changed. Try again.".

- [ ] **Step 7: Route every rejected-action toast through `toastRejected()` and the helper**

In `/work/components/trip/itinerary-manager.tsx`:

Add the import next to line 67 (`import { toast } from "@/components/ui/use-toast";`):

```tsx
import { failureMessage } from "@/components/ui/failure-message";
```

Replace the `toastRejected` helper from Task 14 with:

```tsx
// A rejected action (network drop, thrown server error) must behave like a
// failed one — report, and the caller reverts whatever it drew optimistically.
// One message for the whole editor; it names the connection when offline.
function toastRejected() {
  toast({ variant: "destructive", title: failureMessage("Something went wrong — nothing was changed. Try again.") });
}
```

Then replace **every** remaining occurrence of the line

```tsx
      toast({ variant: "destructive", title: "Something went wrong — nothing was changed. Try again." });
```

with

```tsx
      toastRejected();
```

Find them with: `grep -n 'Something went wrong — nothing was changed' components/trip/itinerary-manager.tsx` — after this step the only hit must be inside `toastRejected()` itself (ten call sites become `toastRejected();`: `handleMoveStop`, `handleTogglePin`, `handleMakeRough`, the drag-end reorder, `handleFirmUp*` pair, `handleScheduleThing`, `handleMoveItem`, `handleSaveAdjustDates`, and the two others the grep lists). Keep each site's surrounding comment; only the `toast(...)` line changes.

- [ ] **Step 8: Run the tests**

Run: `npm test -- components/trip/itinerary-manager.test.tsx components/ui/use-server-action.test.tsx components/ui/failure-message.test.ts`
Expected: PASS. The existing `/nothing was changed/i` matchers (deleteChapter P2-1, scheduleItem rejects at ~2382/2410/2632, firmUpSegment at ~2418) still pass because jsdom reports online.

- [ ] **Step 9: Gates and commit**

Run: `npx tsc --noEmit && npm run lint`
Expected: both clean.

```
git add components/ui/failure-message.ts components/ui/failure-message.test.ts components/ui/use-server-action.ts components/ui/use-server-action.test.tsx components/trip/itinerary-manager.tsx components/trip/itinerary-manager.test.tsx
git commit -m "feat(offline): one shared message when a plan change fails offline

failureMessage(fallback) returns \"You're offline. Plan changes need a
connection.\" when navigator.onLine is false at the moment of failure,
else the caller's wording. useServerAction and the Plan editor's
rejected-action toast both use it. ADR 0016 amended: the banner plus
one shared message at the point of failure; per-action copy still not
pursued.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 16: Wider warm — Today, Money, Calendar and the cover photo

**Files:**
- Modify: `/work/lib/offline.ts` (header comment lines 1–8; `tripOfflinePaths` lines 25–56; new `isCoverRoute` after `isAttachmentRoute` at 110–117; `cacheStrategyFor` doc + Rule 3a at 123–157)
- Modify: `/work/lib/offline.test.ts` (imports line 2; `isAttachmentRoute` describe 34–45; the "keeps the trip cover route network-only" test at 132–135; `tripOfflinePaths` describe 197–243)
- Modify: `/work/public/sw.js` (strategy summary lines 7–13; `CACHE_VERSION` line 23; new `isCoverRoute` after `isAttachmentRoute` at 57–64; Rule 3a at 89–91)
- Modify: `/work/public/sw.test.ts` (new describe appended)
- Modify: `/work/lib/trip-shell-reads.ts` (`TRIP_SHELL_SELECT`, lines 27–40)
- Modify: `/work/app/(app)/trips/[tripId]/layout.tsx` (line 97, `offlinePaths`)
- Test: `/work/app/(app)/trips/[tripId]/layout.test.tsx` (the `OfflineWarmer` mock at line 97; new describe)

**Interfaces:**
- Produces:
  - `tripOfflinePaths(tripRef: string, startDate: string | null, endDate: string | null, attachments: WarmAttachment[] = [], coverUrl: string | null = null): string[]` — ten fixed pages (`''`, `/plan`, `/today`, `/summary`, `/budget`, `/calendar`, `/checklists`, `/files`, `/help`, `/whats-new`), then day pages, then attachments, then `coverUrl` when given.
  - `isCoverRoute(url: string): boolean` — true for `/api/trips/<id>/cover` (any query string).
  - `cacheStrategyFor` Rule 3a now returns `'network-first'` for attachment **or** cover routes.
  - `TRIP_SHELL_SELECT` gains `coverImageKey: true`, so `TripShell` carries `coverImageKey: string | null`.
  - `public/sw.js` `CACHE_VERSION = 'trip-planner-v5'`.
- Consumes: `tripPath(tripRef, suffix?)` from `@/lib/trip-path`; the cover URL shape `/api/trips/${tripId}/cover?v=${encodeURIComponent(coverImageKey)}` already rendered by `app/(app)/trips/[tripId]/page.tsx:121` and `lib/trips/trips-page-loader.ts:121` (the warm URL must be byte-identical to the `<img src>`, because the service worker cache is keyed by URL; both cover `<Image>`s use a passthrough loader — `components/trip/home/desktop/countdown-polaroid.tsx:16`, `components/trips/cover-photo-image.tsx:17` — so the `<img src>` is that raw URL, not `/_next/image?…`).

Size cap note (spec §F2 "subject to the same 10 MiB cap as attachments"): the Trip row stores no cover size, so there is nothing to compare at warm time. The cap is enforced earlier by the same constant: `setTripCover` runs `validateUpload({ mime, size })` (`server/actions/cover.ts:32`), whose `MAX_BYTES` is the 10 MiB that `MAX_WARM_ATTACHMENT_BYTES` mirrors (`lib/storage.ts:356`), and the browser compresses covers to about 1 MB before upload (`lib/image-compress.ts:2`). Record this in the `tripOfflinePaths` comment and in the ADR 0043 amendment (Task 18); do not invent a size column.

- [ ] **Step 1: Write the failing `lib/offline` tests**

In `/work/lib/offline.test.ts`:

Change line 2 to:

```ts
import { cacheStrategyFor, isNextStaticAsset, isApiRoute, isAttachmentRoute, isCoverRoute, tripOfflinePaths, MAX_WARM_DAYS, MAX_WARM_ATTACHMENT_BYTES } from './offline';
```

After the `isAttachmentRoute` describe (ends line 45) add:

```ts
describe('isCoverRoute', () => {
  it('returns true for the trip cover serve URL, with or without its ?v= cache-buster', () => {
    expect(isCoverRoute('http://localhost:3000/api/trips/t1/cover')).toBe(true);
    expect(isCoverRoute('http://localhost:3000/api/trips/t1/cover?v=covers%2Ft1%2Fabc.webp')).toBe(true);
  });
  it('returns false for other trip API routes and lookalikes', () => {
    expect(isCoverRoute('http://localhost:3000/api/trips/t1')).toBe(false);
    expect(isCoverRoute('http://localhost:3000/api/trips/t1/cover/extra')).toBe(false);
    expect(isCoverRoute('http://localhost:3000/api/trips/cover')).toBe(false);
    expect(isCoverRoute('http://localhost:3000/api/attachments/abc')).toBe(false);
    expect(isCoverRoute('not a url')).toBe(false);
  });
});
```

Replace the test at lines 132–135 ("keeps the trip cover route network-only (deliberately outside the carve-out)") with:

```ts
  it('caches the trip cover network-first (ADR 0043, amended 2026-10-01)', () => {
    expect(cacheStrategyFor({ method: 'GET', url: `${origin}/api/trips/t1/cover?v=abc`, sameOrigin: true }))
      .toBe('network-first');
  });
  it('keeps a non-GET cover request network-only', () => {
    expect(cacheStrategyFor({ method: 'POST', url: `${origin}/api/trips/t1/cover`, sameOrigin: true }))
      .toBe('network-only');
  });
```

Replace the whole `describe('tripOfflinePaths', …)` block (lines 197–243) with:

```ts
describe('tripOfflinePaths', () => {
  const FIXED = [
    '/trips/t1',
    '/trips/t1/plan',
    '/trips/t1/today',
    '/trips/t1/summary',
    '/trips/t1/budget',
    '/trips/t1/calendar',
    '/trips/t1/checklists',
    '/trips/t1/files',
    '/trips/t1/help',
    '/whats-new',
  ];

  it('returns the fixed pages + one /day/ path per date in an inclusive range', () => {
    const paths = tripOfflinePaths('t1', '2026-07-01', '2026-07-03');
    expect(paths).toEqual([
      ...FIXED,
      '/trips/t1/day/2026-07-01',
      '/trips/t1/day/2026-07-02',
      '/trips/t1/day/2026-07-03',
    ]);
  });

  it('returns only the ten fixed pages when dates are null', () => {
    expect(tripOfflinePaths('t1', null, null)).toEqual(FIXED);
  });

  it('warms Today, Money and Calendar — the read-on-the-road views (spec 2026-10-01 §F2)', () => {
    const paths = tripOfflinePaths('t1', null, null);
    expect(paths).toContain('/trips/t1/today');
    expect(paths).toContain('/trips/t1/budget');
    expect(paths).toContain('/trips/t1/calendar');
  });

  it('caps day paths at MAX_WARM_DAYS for a 400-day range', () => {
    const paths = tripOfflinePaths('t1', '2026-01-01', '2027-02-05'); // > 400 days
    expect(paths).toHaveLength(FIXED.length + MAX_WARM_DAYS);
  });

  it('appends attachment urls within the size cap and skips oversized ones', () => {
    const paths = tripOfflinePaths('t1', null, null, [
      { url: '/api/attachments/small', size: 1024 },
      { url: '/api/attachments/huge', size: MAX_WARM_ATTACHMENT_BYTES + 1 },
    ]);
    expect(paths).toContain('/api/attachments/small');
    expect(paths).not.toContain('/api/attachments/huge');
  });

  it('warms no attachments when none are passed', () => {
    expect(tripOfflinePaths('t1', null, null).some((p) => p.startsWith('/api/'))).toBe(false);
  });

  it('appends the cover URL exactly as given (query string intact) when the trip has a photo', () => {
    const cover = '/api/trips/trip-id/cover?v=covers%2Ftrip-id%2Fabc.webp';
    const paths = tripOfflinePaths('t1', null, null, [], cover);
    expect(paths[paths.length - 1]).toBe(cover);
  });

  it('adds nothing for the cover when the trip has no photo', () => {
    expect(tripOfflinePaths('t1', null, null, [], null)).toEqual(FIXED);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm test -- lib/offline.test.ts`
Expected: FAIL — `isCoverRoute` is not exported (the file fails to import); once you glance past that, the tripOfflinePaths and cover-strategy expectations fail too.

- [ ] **Step 3: Implement in `lib/offline.ts`**

Replace lines 25–56 (`tripOfflinePaths` and its doc comment) with:

```ts
/**
 * The set of same-origin paths worth pre-caching for offline viewing of a trip:
 * the read-while-travelling essentials — Home, Plan, Today, Summary, Money,
 * Calendar, Checklists, Files, the user guide and the What's new page (ADR
 * 0056) — + one page per dated day (capped) + attachments under the size cap
 * + the cover photo. Pure — no browser APIs.
 *
 * `tripRef` is the Trip's URL ref — its slug, or id fallback (ADR 0064) —
 * built into paths via `tripPath`.
 *
 * `coverUrl` is the exact `<img src>` the pages render for the cover
 * (`/api/trips/<id>/cover?v=<key>`): the service worker cache is keyed by
 * URL, so anything else would warm a different entry. No size check here —
 * the Trip row stores none, and the same 10 MiB `validateUpload` cap that
 * `MAX_WARM_ATTACHMENT_BYTES` mirrors already bounds every cover on upload
 * (ADR 0043, amended 2026-10-01).
 */
export function tripOfflinePaths(
  tripRef: string,
  startDate: string | null,
  endDate: string | null,
  attachments: WarmAttachment[] = [],
  coverUrl: string | null = null,
): string[] {
  const base = tripPath(tripRef);
  // `/whats-new` is account-level, not trip-scoped, but it's a read-only doc
  // route exactly like `${base}/help` — the project already treats those as
  // worth warming — so it rides along in the same list rather than needing
  // its own warm-set mechanism.
  const paths = [
    base,
    `${base}/plan`,
    `${base}/today`,
    `${base}/summary`,
    `${base}/budget`,
    `${base}/calendar`,
    `${base}/checklists`,
    `${base}/files`,
    `${base}/help`,
    '/whats-new',
  ];
  if (startDate && endDate && endDate >= startDate) {
    const span = Math.min(daysBetween(startDate, endDate), MAX_WARM_DAYS - 1);
    for (let i = 0; i <= span; i++) {
      paths.push(`${base}/day/${addDays(startDate, i)}`);
    }
  }
  for (const att of attachments) {
    if (att.size <= MAX_WARM_ATTACHMENT_BYTES) paths.push(att.url);
  }
  if (coverUrl) paths.push(coverUrl);
  return paths;
}
```

After `isAttachmentRoute` (ends line 117) add:

```ts
/**
 * Returns true for the member-gated trip cover serve route
 * (`/api/trips/<id>/cover`, with or without its `?v=` cache-buster). Warmed
 * alongside attachments so the Home tile and Trips list don't show a broken
 * photo offline (ADR 0043, amended 2026-10-01).
 */
export function isCoverRoute(url: string): boolean {
  try {
    const { pathname } = new URL(url);
    return /^\/api\/trips\/[^/]+\/cover$/.test(pathname);
  } catch {
    return false;
  }
}
```

In the `cacheStrategyFor` doc comment change the Rule 3a line (129) to:

```ts
 * 3a. Same-origin /api/attachments/<id> and /api/trips/<id>/cover → network-first  (tickets, confirmations, the cover photo offline)
```

Replace Rule 3a in the body (lines 153–157) with:

```ts
  // Rule 3a: attachments (tickets, confirmations) and the trip cover are
  // cacheable network-first so they survive offline — the ONLY /api/*
  // exceptions (ADR 0043, amended 2026-10-01 for the cover).
  if (isAttachmentRoute(url) || isCoverRoute(url)) {
    return 'network-first';
  }
```

Run: `npm test -- lib/offline.test.ts`
Expected: PASS.

- [ ] **Step 4: Write the failing service-worker mirror test**

Append to `/work/public/sw.test.ts` (after the last existing describe):

```ts
// ---------------------------------------------------------------------------
// Offline-cache mirror. The fetch-strategy branches are not driven here (the
// pure mirror lib/offline.ts is), but the two things that MUST move together
// — the cover matcher and the cache version that purges the old policy — are
// pinned on the source text so a change to one without the other fails.
// ---------------------------------------------------------------------------

describe("offline cache mirror of lib/offline.ts", () => {
  it("matches the trip cover route like an attachment (ADR 0043, amended 2026-10-01)", () => {
    expect(SW_SOURCE).toContain("function isCoverRoute(url)");
    expect(SW_SOURCE).toContain("/^\\/api\\/trips\\/[^/]+\\/cover$/");
    expect(SW_SOURCE).toContain("if (isAttachmentRoute(url) || isCoverRoute(url)) return 'network-first';");
  });

  it("bumped the cache version so clients on the old policy purge it", () => {
    expect(SW_SOURCE).toContain("const CACHE_VERSION = 'trip-planner-v5';");
  });
});
```

Run: `npm test -- public/sw.test.ts -t "offline cache mirror"`
Expected: FAIL ×2 (no `isCoverRoute`, version still `v4`).

- [ ] **Step 5: Mirror in `public/sw.js`**

In `/work/public/sw.js`:

Replace the strategy summary lines 7–13 with:

```js
 * Strategy summary:
 *   - Non-GET (mutations / server actions)  → network-only
 *   - Cross-origin requests                  → network-only
 *   - Same-origin /api/attachments/*         → network-first (tickets, confirmations offline)
 *   - Same-origin /api/trips/<id>/cover      → network-first (the cover photo offline)
 *   - Same-origin /api/*                     → network-only  (auth + live data)
 *   - Same-origin /_next/static/*            → cache-first   (immutable hashed assets)
 *   - Everything else (navigations, pages)   → network-first (private per-user data)
```

Change line 23 to:

```js
const CACHE_VERSION = 'trip-planner-v5';
```

After `isAttachmentRoute` (ends line 64) add:

```js
/**
 * Returns true for the member-gated trip cover serve route
 * (`/api/trips/<id>/cover`, with or without its `?v=` cache-buster). Warmed
 * alongside attachments (ADR 0043, amended 2026-10-01).
 */
function isCoverRoute(url) {
  try {
    const { pathname } = new URL(url);
    return /^\/api\/trips\/[^/]+\/cover$/.test(pathname);
  } catch {
    return false;
  }
}
```

Replace Rule 3a (lines 89–91) with:

```js
  // Rule 3a: attachments (tickets) and the trip cover are cacheable
  // network-first — the ONLY /api/* exceptions (ADR 0043, amended
  // 2026-10-01). Cache purged on sign-out via CLEAR_CACHE.
  if (isAttachmentRoute(url) || isCoverRoute(url)) return 'network-first';
```

Run: `npm test -- public/sw.test.ts`
Expected: PASS (the push/notification tests are untouched).

- [ ] **Step 6: Write the failing trip-layout test**

In `/work/app/(app)/trips/[tripId]/layout.test.tsx`, replace line 97

```tsx
vi.mock("@/components/offline-warmer", () => ({ OfflineWarmer: () => null }));
```

with a marker that exposes its props:

```tsx
vi.mock("@/components/offline-warmer", () => ({
  OfflineWarmer: ({ paths }: { paths: string[] }) => (
    <div data-testid="offline-warmer" data-paths={paths.join(" ")} />
  ),
}));
```

Append a new describe at the end of the file:

```tsx
describe("TripLayout offline warm set (spec 2026-10-01 §F2)", () => {
  const warmedPaths = () => screen.getByTestId("offline-warmer").getAttribute("data-paths")!.split(" ");

  it("warms Today, Money and Calendar alongside the existing pages", async () => {
    await renderLayout();
    const paths = warmedPaths();
    expect(paths).toContain("/trips/trip-1/today");
    expect(paths).toContain("/trips/trip-1/budget");
    expect(paths).toContain("/trips/trip-1/calendar");
    expect(paths).toContain("/trips/trip-1/plan");
  });

  it("warms the cover photo at the exact URL the pages render when the trip has one", async () => {
    mockDb.trip.findUnique.mockResolvedValue({ ...BASE_TRIP, coverImageKey: "covers/trip-1/abc.webp" });
    await renderLayout();
    expect(warmedPaths()).toContain("/api/trips/trip-1/cover?v=covers%2Ftrip-1%2Fabc.webp");
  });

  it("warms no cover URL when the trip has no photo", async () => {
    await renderLayout();
    expect(warmedPaths().some((p) => p.includes("/cover"))).toBe(false);
  });
});
```

Run: `npm test -- "app/(app)/trips/[tripId]/layout.test.tsx" -t "offline warm set"`
Expected: FAIL on the first two (no `/today`, no cover URL). Note the quotes around the path — the directory names contain parentheses and brackets.

- [ ] **Step 7: Select the cover key and pass the URL from the layout**

In `/work/lib/trip-shell-reads.ts`, add to `TRIP_SHELL_SELECT` (after `forksEnabled: true,` on line 33):

```ts
  coverImageKey: true,
```

In `/work/app/(app)/trips/[tripId]/layout.tsx`, replace line 97

```tsx
  const offlinePaths = tripOfflinePaths(slug, trip.startDate, trip.endDate, warmAttachments);
```

with:

```tsx
  // Byte-identical to the <img src> Home and the Trips list render
  // (app/(app)/trips/[tripId]/page.tsx, lib/trips/trips-page-loader.ts): the
  // service worker cache is keyed by URL, so a different string would warm a
  // different entry. The id, not the slug — the cover route takes the id.
  const coverUrl = trip.coverImageKey
    ? `/api/trips/${tripId}/cover?v=${encodeURIComponent(trip.coverImageKey)}`
    : null;
  const offlinePaths = tripOfflinePaths(slug, trip.startDate, trip.endDate, warmAttachments, coverUrl);
```

Run: `npm test -- "app/(app)/trips/[tripId]/layout.test.tsx"`
Expected: PASS. (The journal/activity page tests mock `readTripShell` with their own partial objects and don't read `coverImageKey`, so they are unaffected; confirm with the full run in Step 8.)

- [ ] **Step 8: Run the wider suite**

Run: `npm test -- lib/offline.test.ts public/sw.test.ts "app/(app)/trips/[tripId]" components/offline-warmer.test.tsx`
Expected: PASS.

- [ ] **Step 9: Gates and commit**

Run: `npx tsc --noEmit && npm run lint`
Expected: both clean.

```
git add lib/offline.ts lib/offline.test.ts public/sw.js public/sw.test.ts lib/trip-shell-reads.ts "app/(app)/trips/[tripId]/layout.tsx" "app/(app)/trips/[tripId]/layout.test.tsx"
git commit -m "feat(offline): warm Today, Money, Calendar and the cover photo

tripOfflinePaths adds /today, /budget and /calendar and takes the
cover URL as a fifth argument; the trip layout builds it from the
newly selected coverImageKey, byte-identical to the <img src>. The
cover route joins the attachment carve-out (network-first) in
lib/offline.ts and its sw.js mirror; CACHE_VERSION bumps to v5 so
old clients purge the previous policy. The 10 MiB cap is the same
validateUpload bound every cover already passes on upload.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 17: "Saved for offline" — a status store the warmer drives, and the Settings row with "Save again"

**Files:**
- Create: `/work/lib/offline-status.ts`
- Create: `/work/lib/offline-status.test.ts`
- Modify: `/work/components/offline-warmer.tsx` (whole file)
- Modify: `/work/components/offline-warmer.test.tsx` (existing renders gain `tripId`; new tests)
- Create: `/work/components/trip/settings/saved-for-offline.tsx`
- Create: `/work/components/trip/settings/saved-for-offline.test.tsx`
- Modify: `/work/app/(app)/trips/[tripId]/layout.tsx` (line 183, `<OfflineWarmer paths={offlinePaths} />`)
- Modify: `/work/app/(app)/trips/[tripId]/layout.test.tsx` (the `OfflineWarmer` marker mock from Task 16)
- Modify: `/work/app/(app)/trips/[tripId]/settings/page.tsx` (import; new card after the Chapters card, lines 168–182)
- Modify: `/work/app/(app)/trips/[tripId]/settings/page.test.tsx` (new leaf mock; card-order test at 167–185; new describe)

**Interfaces:**
- Produces (`lib/offline-status.ts`, pure module state, no React):
  - `export type OfflineSaveState = "idle" | "saving" | "saved"`
  - `export interface OfflineStatus { state: OfflineSaveState; savedAt: number | null; requestId: number }`
  - `export function getStatus(tripId: string): OfflineStatus` — stable reference until it changes (safe for `useSyncExternalStore`); first read per trip seeds `savedAt`/`state` from `localStorage` key `teepee.offline.savedAt.<tripId>` (epoch ms as a string).
  - `export function getServerStatus(): OfflineStatus` — the constant idle snapshot for SSR.
  - `export function subscribe(listener: () => void): () => void`
  - `export function requestWarm(tripId: string): void` — bumps `requestId`; the warmer's effect re-runs.
  - `export function beginWarm(tripId: string): void`, `export function finishWarm(tripId: string, at?: number): void` (persists `savedAt`), `export function cancelWarm(tripId: string): void` (a warm stopped early falls back to `saved` if a timestamp exists, else `idle`).
  - `export function resetOfflineStatus(): void` — tests only; clears the in-memory map (not storage).
- Produces: `OfflineWarmer({ tripId, paths }: { tripId: string; paths: string[] })` — `tripId` is the Trip **id** (the store key; Settings also has the id), `paths` unchanged.
- Produces: `SavedForOffline({ tripId }: { tripId: string })` — client component; renders a `role="status"` line and a "Save again" button.
- Consumes: `relativeTime(date: Date, now?: Date): string` from `@/lib/relative-time`; `Button` (`loading`, `variant`, `size`) from `@/components/ui/button`.

Design notes for the implementer: the store mirrors `lib/feedback-trip-store.ts` (module `let`/`Map` + a `Set` of listeners + a server snapshot) and the storage guard mirrors `lib/feedback-queue.ts` (`try/catch` around every `localStorage` call — private mode throws). The warmer keeps its three early-returns (offline, no SW controller, cancelled); on those paths the status is left exactly as it was, which is how dev / no-SW shows "Not saved yet". `cancelled` is checked **before** `beginWarm` as well as per path, so a warmer unmounted before its idle callback fires never leaves "saving" behind.

- [ ] **Step 1: Write the failing store tests**

Create `/work/lib/offline-status.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  getStatus,
  getServerStatus,
  subscribe,
  requestWarm,
  beginWarm,
  finishWarm,
  cancelWarm,
  resetOfflineStatus,
} from "./offline-status";

beforeEach(() => {
  resetOfflineStatus();
  window.localStorage.clear();
});

describe("offline status store", () => {
  it("starts idle with no timestamp for a trip that was never warmed", () => {
    expect(getStatus("t1")).toEqual({ state: "idle", savedAt: null, requestId: 0 });
  });

  it("the server snapshot is always idle", () => {
    expect(getServerStatus()).toEqual({ state: "idle", savedAt: null, requestId: 0 });
  });

  it("returns the same object until something changes (useSyncExternalStore needs that)", () => {
    const a = getStatus("t1");
    expect(getStatus("t1")).toBe(a);
    beginWarm("t1");
    expect(getStatus("t1")).not.toBe(a);
  });

  it("walks idle → saving → saved and persists savedAt per trip", () => {
    beginWarm("t1");
    expect(getStatus("t1").state).toBe("saving");
    finishWarm("t1", 1_700_000_000_000);
    expect(getStatus("t1")).toMatchObject({ state: "saved", savedAt: 1_700_000_000_000 });
    expect(window.localStorage.getItem("teepee.offline.savedAt.t1")).toBe("1700000000000");
    expect(getStatus("t2").state).toBe("idle");
  });

  it("seeds a saved state from localStorage on first read after a reload", () => {
    window.localStorage.setItem("teepee.offline.savedAt.t1", "1700000000000");
    expect(getStatus("t1")).toMatchObject({ state: "saved", savedAt: 1_700_000_000_000 });
  });

  it("ignores a corrupt stored value", () => {
    window.localStorage.setItem("teepee.offline.savedAt.t1", "not a number");
    expect(getStatus("t1")).toMatchObject({ state: "idle", savedAt: null });
  });

  it("requestWarm bumps requestId and notifies subscribers", () => {
    const listener = vi.fn();
    const unsubscribe = subscribe(listener);
    requestWarm("t1");
    expect(getStatus("t1").requestId).toBe(1);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    requestWarm("t1");
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("cancelWarm falls back to saved when a timestamp exists, else idle", () => {
    beginWarm("t1");
    cancelWarm("t1");
    expect(getStatus("t1").state).toBe("idle");

    finishWarm("t1", 1_700_000_000_000);
    beginWarm("t1");
    cancelWarm("t1");
    expect(getStatus("t1")).toMatchObject({ state: "saved", savedAt: 1_700_000_000_000 });
  });

  it("cancelWarm is a no-op when nothing is in flight", () => {
    const before = getStatus("t1");
    cancelWarm("t1");
    expect(getStatus("t1")).toBe(before);
  });
});
```

Run: `npm test -- lib/offline-status.test.ts`
Expected: FAIL — `Cannot find module './offline-status'`.

- [ ] **Step 2: Create the store**

Create `/work/lib/offline-status.ts`:

```ts
/**
 * Whether the Trip on screen is Saved for offline (CONTEXT.md): the warmer
 * (components/offline-warmer.tsx) reports idle → saving → saved here, the
 * Settings row (components/trip/settings/saved-for-offline.tsx) reads it and
 * asks for a "Save again". The two live in different layouts, so a tiny
 * external store rather than context — the same shape as
 * lib/feedback-trip-store.ts.
 *
 * `savedAt` is kept in localStorage per Trip so the row still says "Saved
 * for offline · 2h ago" after a reload, when the in-memory state is gone but
 * the service worker cache is not.
 */

export type OfflineSaveState = "idle" | "saving" | "saved";

export interface OfflineStatus {
  state: OfflineSaveState;
  /** Epoch ms of the last completed warm; null when none has finished. */
  savedAt: number | null;
  /** Bumped by requestWarm(); the warmer re-runs when it changes. */
  requestId: number;
}

const STORAGE_PREFIX = "teepee.offline.savedAt.";
const IDLE: OfflineStatus = { state: "idle", savedAt: null, requestId: 0 };

const statuses = new Map<string, OfflineStatus>();
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

function readSavedAt(tripId: string): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + tripId);
    if (!raw) return null;
    const at = Number(raw);
    return Number.isFinite(at) ? at : null;
  } catch {
    return null;
  }
}

function writeSavedAt(tripId: string, at: number) {
  try {
    window.localStorage.setItem(STORAGE_PREFIX + tripId, String(at));
  } catch {
    // Storage full or blocked (private mode): the in-memory state still
    // updates, so the row is right until the next reload.
  }
}

function update(tripId: string, patch: Partial<OfflineStatus>) {
  statuses.set(tripId, { ...getStatus(tripId), ...patch });
  notify();
}

export function getStatus(tripId: string): OfflineStatus {
  const known = statuses.get(tripId);
  if (known) return known;
  const savedAt = readSavedAt(tripId);
  const initial: OfflineStatus = savedAt === null ? IDLE : { ...IDLE, state: "saved", savedAt };
  statuses.set(tripId, initial);
  return initial;
}

/** Nothing is known before hydration — keeps useSyncExternalStore SSR-safe. */
export function getServerStatus(): OfflineStatus {
  return IDLE;
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** "Save again": the warmer subscribed to this Trip re-runs its warm. */
export function requestWarm(tripId: string): void {
  update(tripId, { requestId: getStatus(tripId).requestId + 1 });
}

export function beginWarm(tripId: string): void {
  update(tripId, { state: "saving" });
}

export function finishWarm(tripId: string, at: number = Date.now()): void {
  writeSavedAt(tripId, at);
  update(tripId, { state: "saved", savedAt: at });
}

/** A warm that stopped early (left the Trip, went offline) falls back to what was last known. */
export function cancelWarm(tripId: string): void {
  const current = getStatus(tripId);
  if (current.state !== "saving") return;
  update(tripId, { state: current.savedAt === null ? "idle" : "saved" });
}

/** Tests only: forget every Trip's in-memory state (storage is left alone). */
export function resetOfflineStatus(): void {
  statuses.clear();
}
```

Run: `npm test -- lib/offline-status.test.ts`
Expected: PASS ×9.

- [ ] **Step 3: Write the failing warmer tests**

In `/work/components/offline-warmer.test.tsx`:

Change line 3 and add the store import:

```tsx
import { OfflineWarmer } from "./offline-warmer";
import { getStatus, requestWarm, resetOfflineStatus } from "@/lib/offline-status";
```

In `beforeEach` (lines 56–60) add two lines so it reads:

```tsx
  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    restoreIdleCb = stubIdleCallbackSync();
    resetOfflineStatus();
    window.localStorage.clear();
  });
```

Give every existing `<OfflineWarmer paths={…} />` a `tripId="t1"` prop (four renders at lines 70, 76, 88, 97), e.g. `render(<OfflineWarmer tripId="t1" paths={["/a", "/b"]} />);`.

Then append inside the `describe("OfflineWarmer", …)` block:

```tsx
  it("reports saving while the fetches run and saved with a timestamp when they finish", async () => {
    stubNavigator({ onLine: true, hasController: true });
    let release!: () => void;
    fetchMock.mockImplementationOnce(() => new Promise<Response>((r) => { release = () => r(new Response(null, { status: 200 })); }));

    render(<OfflineWarmer tripId="t1" paths={["/a", "/b"]} />);

    await vi.waitFor(() => expect(getStatus("t1").state).toBe("saving"));
    release();
    await vi.waitFor(() => expect(getStatus("t1").state).toBe("saved"));
    expect(getStatus("t1").savedAt).toEqual(expect.any(Number));
    expect(window.localStorage.getItem("teepee.offline.savedAt.t1")).not.toBeNull();
  });

  it("leaves the status idle when there is no SW controller (dev): Not saved yet", async () => {
    stubNavigator({ onLine: true, hasController: false });
    render(<OfflineWarmer tripId="t1" paths={["/a"]} />);
    await new Promise((r) => setTimeout(r, 0));
    expect(getStatus("t1")).toMatchObject({ state: "idle", savedAt: null });
  });

  it("re-runs every fetch when requestWarm() is called for its trip (Save again)", async () => {
    stubNavigator({ onLine: true, hasController: true });
    render(<OfflineWarmer tripId="t1" paths={["/a", "/b"]} />);
    await vi.waitFor(() => expect(getStatus("t1").state).toBe("saved"));
    expect(fetchMock).toHaveBeenCalledTimes(2);

    act(() => requestWarm("t1"));

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
    await vi.waitFor(() => expect(getStatus("t1").state).toBe("saved"));
  });

  it("a warm cut short by unmount does not leave the status stuck on saving", async () => {
    stubNavigator({ onLine: true, hasController: true });
    fetchMock.mockImplementation(() => new Promise<Response>(() => {})); // never resolves
    const { unmount } = render(<OfflineWarmer tripId="t1" paths={["/a", "/b"]} />);
    await vi.waitFor(() => expect(getStatus("t1").state).toBe("saving"));

    unmount();

    expect(getStatus("t1").state).toBe("idle");
  });
```

Add `act` to the Testing Library import on line 2: `import { render, act } from "@testing-library/react";`.

Run: `npm test -- components/offline-warmer.test.tsx`
Expected: FAIL — TypeScript/runtime: `tripId` is not a prop yet; the four new tests fail (status never leaves idle; fetch count stays 2).

- [ ] **Step 4: Rewrite the warmer**

Replace the whole of `/work/components/offline-warmer.tsx` with:

```tsx
"use client";

import { useEffect, useSyncExternalStore } from "react";
import { beginWarm, cancelWarm, finishWarm, getStatus, subscribe } from "@/lib/offline-status";

/**
 * Background-warms the SW cache with a trip's key pages so they're available
 * offline later — the Trip becomes Saved for offline (CONTEXT.md). Fire-and-
 * forget; never throws; renders nothing. The network-first SW caches each
 * successful GET as an offline fallback.
 *
 * Progress goes to lib/offline-status.ts so the Trip's Settings row can show
 * it; "Save again" there bumps `requestId`, which re-runs this effect.
 */
export function OfflineWarmer({ tripId, paths }: { tripId: string; paths: string[] }) {
  const requestId = useSyncExternalStore(subscribe, () => getStatus(tripId).requestId, () => 0);

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.onLine) return;
    // Only warm when a SW is actually controlling the page (prod); otherwise
    // these fetches do nothing useful — and the status stays "Not saved yet".
    if (!("serviceWorker" in navigator) || !navigator.serviceWorker.controller) return;

    let cancelled = false;
    const warm = async () => {
      if (cancelled) return;
      beginWarm(tripId);
      for (const path of paths) {
        if (cancelled) return;
        try {
          await fetch(path, { cache: "no-store" });
        } catch {
          // ignore — best-effort warming
        }
      }
      if (!cancelled) finishWarm(tripId);
    };
    // Defer to idle so it never competes with the page the user is viewing.
    const ric = (window as unknown as { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback;
    if (ric) ric(() => void warm());
    else setTimeout(() => void warm(), 1500);

    return () => {
      cancelled = true;
      cancelWarm(tripId);
    };
  }, [tripId, paths, requestId]);

  return null;
}
```

Run: `npm test -- components/offline-warmer.test.tsx`
Expected: PASS ×8.

- [ ] **Step 5: Pass `tripId` from the layout**

In `/work/app/(app)/trips/[tripId]/layout.tsx` change line 183 to:

```tsx
              <OfflineWarmer tripId={tripId} paths={offlinePaths} />
```

In `/work/app/(app)/trips/[tripId]/layout.test.tsx`, extend the marker mock from Task 16 to:

```tsx
vi.mock("@/components/offline-warmer", () => ({
  OfflineWarmer: ({ tripId, paths }: { tripId: string; paths: string[] }) => (
    <div data-testid="offline-warmer" data-trip-id={tripId} data-paths={paths.join(" ")} />
  ),
}));
```

and add to the "TripLayout offline warm set" describe:

```tsx
  it("gives the warmer the trip id so Saved for offline is tracked per trip", async () => {
    await renderLayout();
    expect(screen.getByTestId("offline-warmer").getAttribute("data-trip-id")).toBe("trip-1");
  });
```

Run: `npm test -- "app/(app)/trips/[tripId]/layout.test.tsx"`
Expected: PASS.

- [ ] **Step 6: Write the failing `SavedForOffline` component tests**

Create `/work/components/trip/settings/saved-for-offline.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SavedForOffline } from "./saved-for-offline";
import { OfflineWarmer } from "@/components/offline-warmer";
import { beginWarm, finishWarm, getStatus, resetOfflineStatus } from "@/lib/offline-status";

// Same stubs as components/offline-warmer.test.tsx: the "Save again" test
// mounts the real warmer beside the row to prove the click re-runs the warm.
function stubNavigator({ onLine, hasController }: { onLine: boolean; hasController: boolean }) {
  Object.defineProperty(navigator, "onLine", { configurable: true, get: () => onLine });
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: hasController ? { controller: { postMessage: vi.fn() } } : { controller: null },
  });
}

function stubIdleCallbackSync() {
  const win = window as unknown as Record<string, unknown>;
  const original = win.requestIdleCallback;
  win.requestIdleCallback = (cb: () => void) => {
    cb();
    return 0;
  };
  return () => {
    if (original === undefined) delete win.requestIdleCallback;
    else win.requestIdleCallback = original;
  };
}

describe("SavedForOffline", () => {
  let restoreIdleCb: () => void;

  beforeEach(() => {
    resetOfflineStatus();
    window.localStorage.clear();
    restoreIdleCb = stubIdleCallbackSync();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    restoreIdleCb();
  });

  it("says Not saved yet when the warm never ran (no SW, dev)", () => {
    render(<SavedForOffline tripId="t1" />);
    expect(screen.getByRole("status")).toHaveTextContent("Not saved yet");
    expect(screen.getByRole("button", { name: "Save again" })).toBeEnabled();
  });

  it("says Saving… with the button busy while a warm runs", () => {
    beginWarm("t1");
    render(<SavedForOffline tripId="t1" />);
    expect(screen.getByRole("status")).toHaveTextContent("Saving…");
    const button = screen.getByRole("button", { name: "Save again" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
  });

  it("says Saved for offline · <relative time> from the stored timestamp", () => {
    window.localStorage.setItem("teepee.offline.savedAt.t1", String(Date.now() - 5 * 60_000));
    render(<SavedForOffline tripId="t1" />);
    expect(screen.getByRole("status")).toHaveTextContent("Saved for offline · 5m ago");
    expect(screen.getByRole("button", { name: "Save again" })).toBeEnabled();
  });

  it("follows the store: a finished warm flips Not saved yet to Saved for offline · just now", () => {
    render(<SavedForOffline tripId="t1" />);
    expect(screen.getByRole("status")).toHaveTextContent("Not saved yet");
    act(() => finishWarm("t1", Date.now()));
    expect(screen.getByRole("status")).toHaveTextContent("Saved for offline · just now");
  });

  it("Save again re-runs the warm: every path is fetched again and the row passes through Saving…", async () => {
    const user = userEvent.setup();
    stubNavigator({ onLine: true, hasController: true });
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    render(
      <>
        <OfflineWarmer tripId="t1" paths={["/a", "/b"]} />
        <SavedForOffline tripId="t1" />
      </>,
    );
    await vi.waitFor(() => expect(getStatus("t1").state).toBe("saved"));
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await user.click(screen.getByRole("button", { name: "Save again" }));

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
    await vi.waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Saved for offline · just now"));
  });
});
```

Run: `npm test -- components/trip/settings/saved-for-offline.test.tsx`
Expected: FAIL — `Cannot find module './saved-for-offline'`.

- [ ] **Step 7: Create the component**

Create `/work/components/trip/settings/saved-for-offline.tsx`:

```tsx
"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { relativeTime } from "@/lib/relative-time";
import { getServerStatus, getStatus, requestWarm, subscribe } from "@/lib/offline-status";

/**
 * The Settings row for Saved for offline (CONTEXT.md): what the warmer last
 * did for this Trip, and a "Save again" that runs it once more after more
 * planning. Reads lib/offline-status.ts; the warmer in the trip layout does
 * the work.
 */
export function SavedForOffline({ tripId }: { tripId: string }) {
  const status = React.useSyncExternalStore(subscribe, () => getStatus(tripId), getServerStatus);

  // "5m ago" has to keep pace without any store change: re-render each minute
  // while there is a timestamp to describe.
  const [, tick] = React.useReducer((n: number) => n + 1, 0);
  React.useEffect(() => {
    if (status.state !== "saved") return;
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, [status.state]);

  const saving = status.state === "saving";
  const label = saving
    ? "Saving…"
    : status.state === "saved" && status.savedAt !== null
      ? `Saved for offline · ${relativeTime(new Date(status.savedAt))}`
      : "Not saved yet";

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p role="status" className="text-sm font-medium text-foreground">
        {label}
      </p>
      <Button type="button" variant="secondary" size="sm" loading={saving} onClick={() => requestWarm(tripId)}>
        Save again
      </Button>
    </div>
  );
}
```

Run: `npm test -- components/trip/settings/saved-for-offline.test.tsx`
Expected: PASS ×5. (The kit `Button` keeps its label in the accessible name while `loading` — `components/ui/button.tsx:65-71` — so `getByRole("button", { name: "Save again" })` resolves in the Saving… test, and `disabled` falls back to `loading` on line 85.)

- [ ] **Step 8: Write the failing Settings page tests**

In `/work/app/(app)/trips/[tripId]/settings/page.test.tsx`:

Add a leaf mock after the `chapters-switch` mock (ends line 61):

```tsx
vi.mock("@/components/trip/settings/saved-for-offline", () => ({
  SavedForOffline: ({ tripId }: { tripId: string }) => <div data-testid="saved-for-offline" data-trip-id={tripId} />,
}));
```

In the test "keeps the original one-column card order in the DOM for phones (I-4)" (lines 167–185) change the expected list to:

```tsx
    expect(titles).toEqual([
      "Trip details",
      "Chapters",
      "Offline",
      "Travellers",
      "Digest",
      "Calendar feed",
      "Driving estimates",
      "Danger zone",
    ]);
```

Append a new describe at the end of the file:

```tsx
describe("SettingsPage Offline card (spec 2026-10-01 §F3)", () => {
  it("mounts the Saved for offline row with the trip id, under Chapters in the left column", async () => {
    mockDb.trip.findUnique.mockResolvedValue({ ...BASE_TRIP, chaptersEnabled: false });

    await renderSettings();

    const row = screen.getByTestId("saved-for-offline");
    expect(row.getAttribute("data-trip-id")).toBe("trip-1");
    const card = screen.getByRole("heading", { level: 3, name: "Offline" }).closest("[data-slot='settings-slot']")!;
    expect(card.className).toContain("lg:col-start-1");
    expect(card).toContainElement(row);
    expect(screen.getByText(/read them without a connection/).className).toContain("max-w-reading");
  });
});
```

Run: `npm test -- "app/(app)/trips/[tripId]/settings/page.test.tsx"`
Expected: FAIL — no "Offline" heading; the order test fails on the missing entry.

- [ ] **Step 9: Add the Offline card to the Settings page**

In `/work/app/(app)/trips/[tripId]/settings/page.tsx`:

Add the import after line 27 (`import { ChaptersSwitch } …`):

```tsx
import { SavedForOffline } from "@/components/trip/settings/saved-for-offline";
```

Directly after the Chapters card's closing `</Card>` (line 182), still inside the first `data-slot="settings-slot"` group, insert:

```tsx
          {/* ── Offline — the Trip you last opened is Saved for offline on its
              own (ADR 0016); this row says whether that finished and lets you
              run it again after more planning. ── */}
          <Card>
            <CardHeader className="p-5 pb-0">
              <CardTitle className="font-display text-base font-bold tracking-tight">Offline</CardTitle>
            </CardHeader>
            <CardContent className="p-5 pt-3">
              <p className="text-xs text-muted-foreground max-w-reading">
                Opening this trip saves its pages, photo and files on this device so you can
                read them without a connection. Plan changes still need one.
              </p>
              <div className="mt-3">
                <SavedForOffline tripId={tripId} />
              </div>
            </CardContent>
          </Card>
```

Update the doc comment on lines 37–39 so the DOM-order sentence reads: `Details, Chapters, Offline, Travellers, Sharing, Digest, Calendar feed, Driving estimates, Danger zone.`

Run: `npm test -- "app/(app)/trips/[tripId]/settings/page.test.tsx"`
Expected: PASS.

- [ ] **Step 10: Run everything this task touched**

Run: `npm test -- lib/offline-status.test.ts components/offline-warmer.test.tsx components/trip/settings/saved-for-offline.test.tsx "app/(app)/trips/[tripId]"`
Expected: PASS.

- [ ] **Step 11: Gates and commit**

Run: `npx tsc --noEmit && npm run lint`
Expected: both clean.

```
git add lib/offline-status.ts lib/offline-status.test.ts components/offline-warmer.tsx components/offline-warmer.test.tsx components/trip/settings/saved-for-offline.tsx components/trip/settings/saved-for-offline.test.tsx "app/(app)/trips/[tripId]/layout.tsx" "app/(app)/trips/[tripId]/layout.test.tsx" "app/(app)/trips/[tripId]/settings/page.tsx" "app/(app)/trips/[tripId]/settings/page.test.tsx"
git commit -m "feat(offline): Saved for offline row on Settings with Save again

lib/offline-status.ts is a small external store (idle | saving |
saved, savedAt persisted per trip in localStorage). OfflineWarmer
reports into it and re-runs when requestWarm() bumps requestId; the
new SavedForOffline row on the trip Settings page shows \"Saved for
offline · <relative time>\" / \"Saving…\" / \"Not saved yet\" with a
Save again button.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

- [ ] **Step R (Review Focus 4): "Save again" while offline does nothing and says so by staying put**

Append inside `describe("SavedForOffline", …)` in `/work/components/trip/settings/saved-for-offline.test.tsx`:

```tsx
  it("Save again while offline runs no fetch and leaves the status as it was", async () => {
    stubNavigator({ onLine: false, hasController: true });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(
      <>
        <OfflineWarmer tripId="t1" paths={["/trips/t1"]} />
        <SavedForOffline tripId="t1" />
      </>,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Not saved yet");
    await userEvent.click(screen.getByRole("button", { name: "Save again" }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("Not saved yet");
    expect(getStatus("t1").state).not.toBe("saving");
  });
```

Run: `npm test -- components/trip/settings/saved-for-offline.test.tsx`
Expected: PASS. If the state is left at `saving`, the warmer's early return (offline / no controller) must not call `beginWarm` — move `beginWarm` after those checks.

- [ ] **Step S: pin the Settings row's strings in the help guide's drift guard**

The guide (Task 12) quotes "Saved for offline" and "Save again"; `GUIDE_UI_STRINGS` in `/work/lib/help-guide.ts` is the list the drift test (`lib/help-guide.test.ts`, "every GUIDE_UI_STRINGS entry exists in components/ or app/") checks against real source. Now that `components/trip/settings/saved-for-offline.tsx` renders both, add to the array, under a new comment line `// Offline (Settings)`:

```ts
  "Saved for offline",
  "Save again",
```

Run: `npm test -- lib/help-guide.test.ts components/trip/help-guide.test.tsx`
Expected: PASS.

```bash
npx tsc --noEmit && npm run lint
git add lib/help-guide.ts components/trip/settings/saved-for-offline.test.tsx
git commit -m "test(offline): Save again while offline stays put; help drift guard pins the Settings row strings

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 18: Docs — ADR 0016 and 0043 amendments, the offline audit

**Files:**
- Modify: `/work/docs/adr/0016-offline-read-only-auto-warm.md` (append an amendment section)
- Modify: `/work/docs/adr/0043-attachments-warm-offline-through-the-authenticated-serve-route.md` (status line 4; append an amendment section)
- Create: `/work/docs/audits/2026-10-01-offline-audit.md`

**Interfaces:** none (prose). Format reference: ADR 0043's existing `## Amendment — 2026-09-21: …` section; audit reference `/work/docs/audits/2026-09-25-layout-recheck.md` (title with date, "Spec:" line, `## Result`, then findings).

- [ ] **Step 1: Amend ADR 0016**

Append to the end of `/work/docs/adr/0016-offline-read-only-auto-warm.md`:

```markdown

## Amendment — 2026-10-01: the banner plus one shared offline message at the point of failure

The Consequences above say v1 signals a failed offline edit "via the banner
alone" and defers per-action "can't edit offline" toasts. The offline audit
of 2026-10-01 (`docs/audits/2026-10-01-offline-audit.md`) found the banner
was not enough on its own — not because per-action copy was missing, but
because the failure a Traveller actually saw at the point of the edit never
named the connection ("Something went wrong — nothing was changed. Try
again."), and two Plan handlers did not catch a rejected action at all: one
left an optimistic change on screen, the other threw into the Plan error
boundary for an action that changed nothing.

What changes:

- **One shared message.** `failureMessage(fallback)` in
  `components/ui/failure-message.ts` returns "You're offline. Plan changes
  need a connection." when `navigator.onLine === false` at the moment of the
  failure, otherwise the caller's own generic wording. `useServerAction`
  (`components/ui/use-server-action.ts`) and the Plan editor's
  rejected-action toast (`toastRejected()` in
  `components/trip/itinerary-manager.tsx`) both use it. The offline copy is
  one string in one place; no mutation site carries its own.
- **The two Plan handlers fail like their siblings.** `handleAssign` wraps
  `assignStopToChapter` in try/catch, reverts the optimistic chapter move
  and toasts; `handleSuggestChapters` catches inside its transition and
  toasts instead of reaching `plan/error.tsx`.
- **Saved for offline is visible.** The Trip you last opened is still warmed
  automatically; the Trip's Settings page now says whether that finished
  ("Saved for offline · 2h ago" / "Saving…" / "Not saved yet") with a "Save
  again" retry (`lib/offline-status.ts`,
  `components/trip/settings/saved-for-offline.tsx`). The warm set grows to
  Today, Money, Calendar and the cover photo (ADR 0043, amended the same
  day).

What does not change: **per-action toasts — distinct copy per mutation site
— are still not pursued**, for the reason given above (every mutation site
would need touching for little extra signal; the shared message gives the
one fact that matters). Offline editing and a mutation queue remain out of
scope; a "Download for offline" button remains rejected; cache clearing on
session expiry stays a follow-up (ARCH-TEN-12).
```

- [ ] **Step 2: Amend ADR 0043**

In `/work/docs/adr/0043-attachments-warm-offline-through-the-authenticated-serve-route.md` change line 4 to:

```markdown
Accepted (2026-09-14). Narrows ADR 0016. Amended 2026-09-21 and 2026-10-01 (see below).
```

Append to the end of the file:

```markdown

## Amendment — 2026-10-01: the trip cover is warmed too

The Considered Options above rejected `/api/trips/:tripId/cover` from the
carve-out as cosmetic, "deliberately left out; revisit if it becomes an
actual complaint". The 2026-10-01 offline audit
(`docs/audits/2026-10-01-offline-audit.md`) reversed that on inspection
rather than on a complaint: the Home tile's polaroid and the Trips list both
render the cover from that route through `next/image` with a passthrough
loader (`components/trip/home/desktop/countdown-polaroid.tsx`,
`components/trips/cover-photo-image.tsx`), so offline the first screen a
Traveller sees shows a broken photo — and the fix is one more URL in the
warm set and one more matcher in the same rule.

- `lib/offline.ts` adds `isCoverRoute` (`/api/trips/<id>/cover`, query
  string ignored) and Rule 3a returns network-first for it alongside
  `isAttachmentRoute`. `public/sw.js` mirrors it; `CACHE_VERSION` bumps to
  `trip-planner-v5`.
- `tripOfflinePaths` takes a fifth argument, `coverUrl: string | null`. The
  trip layout (`app/(app)/trips/[tripId]/layout.tsx`) passes the same
  `/api/trips/<id>/cover?v=<coverImageKey>` string the pages render, so the
  cache key is the `<img src>` byte for byte. The `?v=` cache-buster means a
  replaced photo is a new entry; the old one lives until the next sign-out
  purge, as a deleted attachment's bytes already do.
- **Size.** The Decision's 10 MiB guard still applies, enforced earlier: a
  cover passes `validateUpload` on upload (`server/actions/cover.ts`), whose
  `MAX_BYTES` is the cap `MAX_WARM_ATTACHMENT_BYTES` mirrors, and the browser
  compresses to about 1 MB first (`lib/image-compress.ts`). The Trip row
  stores no cover size, so the warmer relies on that invariant rather than
  re-checking at warm time.
- **Presigned redirects.** In production the cover route answers 302 to a
  presigned storage URL (the attachment route does the same). The service
  worker follows the redirect inside `networkFirst` and caches the final
  bytes under the request URL. This is a production-only path (ADR 0016's
  note); the audit records the verification steps.
```

- [ ] **Step 3: Write the audit**

Create `/work/docs/audits/2026-10-01-offline-audit.md` with this full content:

```markdown
# Offline audit — 2026-10-01

Spec: `docs/specs/2026-10-01-landing-shuffle-help-offline.md` §F. Decisions:
ADR 0016 (amended 2026-10-01), ADR 0043 (amended 2026-10-01). Glossary:
CONTEXT.md **Saved for offline**.

Method: code read of the whole offline path — `public/sw.js`,
`lib/offline.ts`, `components/offline-warmer.tsx`,
`components/offline-banner.tsx`, `components/ui/use-online-status.ts`,
`components/pwa-register.tsx`, `components/ui/use-server-action.ts`, every
handler in `components/trip/itinerary-manager.tsx`, the trip layout and the
cover/attachment serve routes — plus the existing unit tests. The service
worker is production-only, so nothing here was observed in `next dev`; the
browser verification steps are listed under Deferred.

## Result

**Read-only offline works as ADR 0016 promises for the pages it warms. Three
gaps in failure handling, one gap in coverage, and no way to tell whether a
Trip had been warmed. All fixed on this branch except the two deferred items
below.**

## What works

- **Registration and policy.** `PwaRegister` registers `/sw.js` in
  production only and asks for `navigator.storage.persist()`. The worker is
  network-first for every same-origin page and RSC request (fresh when
  online, cache only as an offline fallback — never a stale private page),
  cache-first for `/_next/static/*`, network-only for `/api/*` and anything
  non-GET or cross-origin, with the attachment route carved out as
  network-first (ADR 0043). `lib/offline.ts` is the pure source of truth;
  `sw.js` mirrors it and `lib/offline.test.ts` covers every rule.
- **Auto-warm.** The trip layout mounts `OfflineWarmer` with
  `tripOfflinePaths(...)`: Home, Plan, Summary, Checklists, Files, Help,
  What's new, up to 60 day pages, and every attachment at or under 10 MiB.
  It runs only when online and only when a service worker controls the page,
  deferred to idle, one `fetch(path, { cache: "no-store" })` per path, never
  throws.
- **The banner.** `OfflineBanner` (`role="status"`) sits app-wide on
  `useOnlineStatus` and already says plan changes need a connection and that
  feedback sends later.
- **Feedback notes offline.** `lib/feedback-queue.ts` queues a note in
  localStorage and sends it when the connection returns (ADR 0041) — the one
  write that is honestly promised offline.
- **Rejected actions mostly handled.** `useServerAction` catches a rejected
  action and reports a `_form` error. Ten of the Plan editor's handlers wrap
  their action in try/catch and toast "Something went wrong — nothing was
  changed. Try again.".
- **Sign-out purge.** `components/ui/sign-out-button.tsx` posts `CLEAR_CACHE`
  and the worker deletes every cache.

## Gaps found

1. **`handleAssign` did not catch** (`itinerary-manager.tsx` ~1045). It set
   the optimistic `chapterId`, awaited `assignStopToChapter`, and handled only
   a `{ success: false }` result. A thrown action — the connection is gone —
   left the stop drawn under a chapter it never joined and rejected unhandled
   from the click.
2. **`handleSuggestChapters` threw into the error boundary** (~1071). The
   await sat inside `startSuggestTransition` with try/finally only, so a
   rejection propagated out of the transition to
   `app/(app)/trips/[tripId]/plan/error.tsx`, replacing the Plan page with
   the recovery panel for an action that changed nothing.
3. **The failure never said why.** Both generic strings ("Something went
   wrong — nothing was changed. Try again." in the Plan editor; "Something
   went wrong. Check your connection and try again." in `useServerAction`)
   were shown unchanged with `navigator.onLine === false`. The banner was the
   only hint, and it is at the top of the page, not where the Traveller is
   looking. ADR 0016 recorded this as a choice ("the banner alone") and
   deferred per-action toasts; the choice was right about per-action copy
   and wrong about the point of failure.
4. **Coverage missed the road views.** Today (`/today`), Money (`/budget`)
   and Calendar (`/calendar`) were not in the warm set — the three pages most
   likely to be opened with no signal — and the cover photo was deliberately
   excluded (ADR 0043), so Home's polaroid and the Trips list showed a broken
   image offline. The cover is served through `next/image` with a passthrough
   loader, so its `<img src>` is the raw `/api/trips/<id>/cover?v=<key>` URL
   and nothing else needs to change for a cached entry to be hit.
5. **Nothing said whether the warm had happened.** The warm is silent by
   design (no button, no toast); in `next dev`, or in any browser where the
   worker is not yet controlling the page, it never runs, and there was no
   way to tell the two apart. Nor was there a way to refresh the cache after
   more planning short of a cold load of the trip.
6. **Verification is production-only.** Nothing offline is observable under
   `next dev` (ADR 0016). Not a defect, but it means every change below was
   verified by unit tests and the production-build steps under Deferred, not
   by a dev-server click-through.

## What this branch changes

- **Task 14 — graceful failure.** `handleAssign` gains try/catch + revert +
  toast; `handleSuggestChapters` catches inside the transition and toasts,
  releasing its in-flight guard. Tests:
  `components/trip/itinerary-manager.test.tsx` "rejected chapter actions
  fail like their siblings".
- **Task 15 — one shared offline message.** `components/ui/failure-message.ts`
  exports `failureMessage(fallback)` → "You're offline. Plan changes need a
  connection." when offline at the moment of failure, else the caller's
  wording. Used by `useServerAction` and by the Plan editor's single
  `toastRejected()` (all eleven rejected-action sites now go through it).
  Tests: `components/ui/failure-message.test.ts`,
  `components/ui/use-server-action.test.tsx`, the Plan editor's "while
  offline" test. ADR 0016 amended.
- **Task 16 — wider warm.** `tripOfflinePaths` adds `/today`, `/budget`,
  `/calendar` and a fifth `coverUrl` argument; the trip layout selects
  `coverImageKey` and passes the exact page URL. `isCoverRoute` joins the
  attachment carve-out in `lib/offline.ts` and `sw.js`; `CACHE_VERSION`
  → `trip-planner-v5`. Tests: `lib/offline.test.ts`, `public/sw.test.ts`
  (mirror pins), `app/(app)/trips/[tripId]/layout.test.tsx`. ADR 0043
  amended.
- **Task 17 — Saved for offline.** `lib/offline-status.ts` (idle | saving |
  saved, `savedAt` per trip in `localStorage` under
  `teepee.offline.savedAt.<tripId>`, `requestWarm()`); `OfflineWarmer`
  reports into it and re-runs on request; `SavedForOffline` on the trip
  Settings page shows "Saved for offline · <relative time>" / "Saving…" /
  "Not saved yet" with "Save again". Tests: `lib/offline-status.test.ts`,
  `components/offline-warmer.test.tsx`,
  `components/trip/settings/saved-for-offline.test.tsx`,
  `app/(app)/trips/[tripId]/settings/page.test.tsx`.
- **Docs.** This audit; ADR 0016 and ADR 0043 amendments; glossary entry
  already added (CONTEXT.md **Saved for offline**); the How-to guide's
  "While you're away" paragraph is updated in Part 3 of the same branch.

## Deferred

1. **Production-only service-worker verification.** The worker is not
   registered under `next dev`, so the end-to-end check has to run against a
   production build served locally — and never with `.env.production.local`
   (that file points at the production database):

   ```
   npm run build
   # with a non-production env file (e.g. .env or .env.local pointing at the
   # local Docker Postgres), then:
   npm run start
   ```

   In Chrome: open a trip (the warm runs at idle; Settings → Offline should
   flip from "Saving…" to "Saved for offline · just now"), DevTools →
   Application → Service Workers → tick Offline, then open Today, Money and
   Calendar (served from cache), open Home (the cover shows), try an edit in
   Plan (the toast says "You're offline. Plan changes need a connection."),
   and press "Save again" while online to watch the row cycle. Also confirm
   the cover's 302 → presigned storage URL is followed and cached under the
   request URL (Application → Cache Storage → `trip-planner-v5`); if the
   storage bucket does not answer the CORS preflight for that fetch, the
   cover will not warm and this needs a bucket CORS rule — attachments share
   the same path, so they would show the same symptom.
2. **ARCH-TEN-12 — cache purge only on explicit sign-out.** `CLEAR_CACHE` is
   sent by the sign-out button alone (`components/ui/sign-out-button.tsx:16`).
   An expired JWT session, a cleared cookie, or a second Traveller signing in
   on the same browser profile leaves the previous user's cached pages,
   attachments and — now — cover in place, served only when genuinely
   offline. The sitrep's fix sketch (send `CLEAR_CACHE` on sign-in as well,
   or key the cache on the user id) stands; out of scope for this branch
   per the spec.
```

- [ ] **Step 4: Check the prose renders and nothing else references the old wording**

Run: `grep -n "banner alone\|deliberately left out" docs/adr/0016-offline-read-only-auto-warm.md docs/adr/0043-attachments-warm-offline-through-the-authenticated-serve-route.md`
Expected: both phrases still appear **only** in the original sections (they are the text the amendments quote), each followed later in the file by its `## Amendment — 2026-10-01` section.

Run: `npm test -- lib/offline.test.ts public/sw.test.ts`
Expected: PASS (nothing in this task touches code; this is the guard that the docs describe the shipped version).

- [ ] **Step 5: Commit**

```
git add docs/adr/0016-offline-read-only-auto-warm.md docs/adr/0043-attachments-warm-offline-through-the-authenticated-serve-route.md docs/audits/2026-10-01-offline-audit.md
git commit -m "docs(offline): 2026-10-01 audit; amend ADR 0016 (shared offline message) and ADR 0043 (cover warmed)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Part 5 — interfaces produced

- `components/ui/failure-message.ts`: `OFFLINE_MESSAGE` (= "You're offline. Plan changes need a connection."); `failureMessage(fallback: string): string`.
- `components/trip/itinerary-manager.tsx`: module-level `toastRejected(): void` (not exported; the single rejected-action toast path).
- `lib/offline.ts`: `tripOfflinePaths(tripRef, startDate, endDate, attachments = [], coverUrl: string | null = null): string[]` (ten fixed pages incl. `/today`, `/budget`, `/calendar`); `isCoverRoute(url: string): boolean`; Rule 3a network-first for attachments **or** cover.
- `public/sw.js`: `CACHE_VERSION = 'trip-planner-v5'`; `isCoverRoute(url)`.
- `lib/trip-shell-reads.ts`: `TRIP_SHELL_SELECT.coverImageKey: true` → `TripShell.coverImageKey: string | null`.
- `lib/offline-status.ts`: `OfflineSaveState`, `OfflineStatus { state, savedAt, requestId }`, `getStatus(tripId)`, `getServerStatus()`, `subscribe(listener)`, `requestWarm(tripId)`, `beginWarm(tripId)`, `finishWarm(tripId, at?)`, `cancelWarm(tripId)`, `resetOfflineStatus()`; storage key `teepee.offline.savedAt.<tripId>`.
- `components/offline-warmer.tsx`: `OfflineWarmer({ tripId: string; paths: string[] })` (new required `tripId`).
- `components/trip/settings/saved-for-offline.tsx`: `SavedForOffline({ tripId: string })` — `role="status"` text + "Save again" button.
- Settings page DOM order (tests elsewhere that assert it must include "Offline" after "Chapters").

---

### Task 19: Tester wording — Landing buttons, panel modes, share CTA (spec §G copy table)

**Files:**
- Modify: `/work/app/landing/sign-in-panel.tsx` (doc comment lines 8–14; `COPY` lines 27–44; button label line 117; legal span line 121)
- Modify: `/work/app/landing/signin-buttons.tsx` (comment line 9 only)
- Modify: `/work/app/share/[token]/share-cta.tsx` (comment lines 8–10; body copy line 52; button label line 72)
- Modify: `/work/app/share/[token]/share-top-bar.tsx` (comment lines 6–7 only)
- Test: `/work/app/landing/sign-in-panel.test.tsx` (lines 28–34, 41–57, 65, 74, 96, 100)
- Test: `/work/app/landing/landing.test.tsx` (lines 61–66, 84, 89, 113–117)
- Test: `/work/app/page.test.tsx` (lines 56, 59, 109)
- Test: `/work/app/share/[token]/share-chrome.test.tsx` (lines 10, 19–22, 34, 47, 50)
- Test (title only): `/work/app/share/[token]/page.test.tsx` line 349, `/work/app/landing/sign-in-controls.test.tsx` line 41

Do not touch `CONTEXT.md` (glossary already updated), `app/privacy/page.tsx` or `app/terms/page.tsx` (legal wording keeps "invite-only"). If the §A task that adds `align?: "start" | "center"` to `LandingActions` has already landed, keep its structure — only the quoted strings below change.

**Interfaces:**
- Consumes: `SignInPanelProvider({ controls, initialMode, children })` and `LandingActions({ size })` from `/work/app/landing/sign-in-panel.tsx`; `ShareCta({ stage, stopCount, hrefs })` from `/work/app/share/[token]/share-cta.tsx`. Signatures unchanged.
- Produces: no new exports. New visible strings: button **"Become a tester"** (Landing and Share CTA), legal line **"Teepee is in testing"**, request-mode title **"Want to test it?"**, denied-mode title **"Teepee is in testing."**.

- [ ] **Step 1: Update the panel test to the new copy**

In `/work/app/landing/sign-in-panel.test.tsx` make these exact replacements:

Line 28–34 (first test) becomes:
```tsx
  it("renders Sign in and Become a tester buttons and the Legal line; no dialog until clicked", () => {
    setup();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Become a tester" })).toBeInTheDocument();
    expect(screen.getByText("Teepee is in testing")).toBeInTheDocument();
    const legal = screen.getByRole("navigation", { name: "Legal" });
    expect(within(legal).queryByText("Teepee is in testing")).not.toBeInTheDocument();
```
Line 41–45 (sign-in mode test) — title and line:
```tsx
  it("Sign in opens 'Come on in' with the testing line and the passed controls, in light mode", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    const dialog = screen.getByRole("dialog", { name: "Come on in" });
    expect(within(dialog).getByText("Teepee is in testing. Sign in with the Google account you were invited with.")).toBeInTheDocument();
```
Line 49–53 (request mode test):
```tsx
  it("Become a tester opens 'Want to test it?' with the request line; Close closes it", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Become a tester" }));
    const dialog = screen.getByRole("dialog", { name: "Want to test it?" });
    expect(within(dialog).getByText("Teepee is in testing and the door is by invitation. Sign in with Google and we'll pass your name to the admin. Nothing else to fill in.")).toBeInTheDocument();
```
Line 65: `expect(screen.getByText("Want to test it?")).toBeInTheDocument();`

Line 74: `const dialog = screen.getByRole("dialog", { name: "Teepee is in testing." });`

Line 96: `const trigger = screen.getByRole("button", { name: "Become a tester" });`

Line 100: `const dialog = screen.getByRole("dialog", { name: "Want to test it?" });`

Add one new test at the end of the `describe` (before its closing `});` on line 105) that pins the product statement is gone from the Landing's own copy:
```tsx
  it("never says invite-only as a product statement (spec 2026-10-01 §G)", async () => {
    setup();
    expect(document.body.textContent).not.toMatch(/invite-only/i);
    await userEvent.click(screen.getByRole("button", { name: "Become a tester" }));
    expect(document.body.textContent).not.toMatch(/invite-only/i);
  });
```

- [ ] **Step 2: Update the Landing tree test**

In `/work/app/landing/landing.test.tsx`:

Lines 61–66 become:
```tsx
  it("each tree has Sign in + Become a tester under the hero; no Start a trip / Sign up / Log in (C2, C3)", () => {
    render(<Landing />);
    for (const tree of [desktop(), phone()]) {
      expect(within(tree).getByRole("button", { name: "Sign in" })).toBeInTheDocument();
      expect(within(tree).getByRole("button", { name: "Become a tester" })).toBeInTheDocument();
      expect(within(tree).getByText("Teepee is in testing")).toBeInTheDocument();
```
Line 84: `expect(screen.getByRole("dialog", { name: "Teepee is in testing." })).toBeInTheDocument();`

Line 89: `const req = within(phone()).getByRole("button", { name: "Become a tester" });`

Lines 113–117:
```tsx
  it("wires a real Become a tester click through to the Sign in panel", async () => {
    render(<Landing />);
    const req = within(phone()).getByRole("button", { name: "Become a tester" });
    await userEvent.click(req);
    const dialog = screen.getByRole("dialog", { name: "Want to test it?" });
```

- [ ] **Step 3: Update the root page test and the share tests**

`/work/app/page.test.tsx`:
- Line 56: `expect(screen.getByRole("dialog", { name: "Want to test it?" })).toBeInTheDocument();`
- Line 59: `expect(screen.getByRole("dialog", { name: "Teepee is in testing." })).toBeInTheDocument();`
- Line 109: `expect(screen.getByRole("dialog", { name: "Teepee is in testing." })).toBeInTheDocument();`

`/work/app/share/[token]/share-chrome.test.tsx`:
- Line 10: `it("links both pills to Become a tester and says it's a shared trip on desktop", () => {`
- Lines 19–22:
```tsx
  it.each(["before", "during"] as const)("%s: in-testing copy and Become a tester", (stage) => {
    render(<ShareCta stage={stage} stopCount={6} hrefs={hrefs} />);
    expect(screen.getByText(/It's in testing for now\. Ask to be a tester\./)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Become a tester" })).toHaveAttribute("href", hrefs.requestAccess);
```
- Line 34: `["before", 6, "Become a tester"],`
- Line 47: `it("after with no stops falls back to the Become a tester card", () => {`
- Line 50: `expect(screen.getByRole("link", { name: "Become a tester" })).toBeInTheDocument();`

Title-only renames (no assertion quotes the string): `/work/app/share/[token]/page.test.tsx` line 349 → `it("the top bar's Plan your own trip goes to Become a tester with a hashed ref, never the token", async () => {`; `/work/app/landing/sign-in-controls.test.tsx` line 41 → `it("passes the Google button variant through for the panel's Want to test it? mode", () => {`.

- [ ] **Step 4: Run the tests to see them fail**

Run: `npm test -- app/landing/sign-in-panel.test.tsx app/landing/landing.test.tsx app/page.test.tsx "app/share/[token]/share-chrome.test.tsx"`
Expected: FAIL — `Unable to find an accessible element with the role "button" and name "Become a tester"`, `Unable to find role="dialog" and name "Want to test it?"`, `Unable to find an element with the text: Teepee is in testing`, and the share CTA regex miss.

- [ ] **Step 5: Change the panel copy**

In `/work/app/landing/sign-in-panel.tsx`:

Replace the doc comment lines 8–14 with:
```tsx
/**
 * The Landing's way in (spec 2026-09-29 collage, C2/C3; wording spec
 * 2026-10-01 §G): "Sign in" and "Become a tester" under the hero open one
 * small panel — the shared Dialog, a bottom sheet on phones and a centred
 * dialog from sm. Both modes hold the same Google controls; a refused Google
 * sign-in already records an Access request (lib/auth.ts), so "Become a
 * tester" only changes the words around them.
 *
```
(keep the rest of the comment, lines 16–24, as is.)

Replace `COPY` (lines 27–44) with:
```tsx
const COPY: Record<Mode, { title: string; line: string }> = {
  "sign-in": {
    title: "Come on in",
    line: "Teepee is in testing. Sign in with the Google account you were invited with.",
  },
  request: {
    title: "Want to test it?",
    line: "Teepee is in testing and the door is by invitation. Sign in with Google and we'll pass your name to the admin. Nothing else to fill in.",
  },
  // One neutral message for everyone Auth.js refuses — a brand-new stranger,
  // someone waiting, dismissed or revoked. Telling a reader which bucket they
  // are in would make this panel an oracle about the Admin's decisions
  // (2026-09-26 final fix wave, I2). Keep the line verbatim; only the title
  // changed on 2026-10-01 (§G: "in testing" is the reason, the gate is unchanged).
  denied: {
    title: "Teepee is in testing.",
    line: "Your Google account isn't on the list. We've recorded the attempt for the admin — there's nothing else to do here. This page can't tell you where a request stands, and not every request is granted; if you're expecting access, ask whoever invited you.",
  },
};
```
Line 117: `Request access` → `Become a tester`.
Line 121: `<span>Teepee is invite-only</span>` → `<span>Teepee is in testing</span>`.

In `/work/app/landing/signin-buttons.tsx` line 9, change `its "Ask to join" mode` to `its "Want to test it?" mode`.

- [ ] **Step 6: Change the share copy**

In `/work/app/share/[token]/share-cta.tsx`:
- Lines 8–10 comment: replace `invite-only Request\n// access card` wording with `the same "Become a tester" card (Teepee is in testing — spec 2026-10-01 §G)`. Full replacement of lines 7–11:
```tsx
// ---------------------------------------------------------------------------
// Share page CTA card (SHARE.md §9, spec §E.2, ADR 0057). Before/during and
// an After with no stops to copy all land on the same "Become a tester" card
// (Teepee is in testing, spec 2026-10-01 §G); only an After with stops offers
// the Use this route copy.
// ---------------------------------------------------------------------------
```
- Line 52: `: "Teepee keeps the route, the days and the money in one place, for everyone who's going. It's in testing for now. Ask to be a tester."}`
- Line 72: `Request access` → `Become a tester`.

In `/work/app/share/[token]/share-top-bar.tsx` lines 6–7, change `opens the same invite-only door: the landing Request access panel.` to `opens the same door (ADR 0057): the Landing's "Want to test it?" panel.`

- [ ] **Step 7: Run the tests**

Run: `npm test -- app/landing app/page.test.tsx "app/share/[token]" lib/share-ref.test.ts`
Expected: PASS.

Then: `grep -rn "Request access\|Ask to join\|invite-only" app components lib --include=*.ts --include=*.tsx` must print only `app/privacy/page.tsx`, `app/terms/page.tsx`, `lib/share-ref.ts:18` / `lib/share-ref.test.ts:13,16` (ADR 0057 "invite-only door" is a comment about the gate, not product copy) and nothing in `app/landing` or `app/share`.

- [ ] **Step 8: Gates and commit**

Run: `npx tsc --noEmit && npm run lint`
Expected: both clean.

```
git add app/landing/sign-in-panel.tsx app/landing/sign-in-panel.test.tsx app/landing/landing.test.tsx app/landing/signin-buttons.tsx app/landing/sign-in-controls.test.tsx app/page.test.tsx "app/share/[token]/share-cta.tsx" "app/share/[token]/share-top-bar.tsx" "app/share/[token]/share-chrome.test.tsx" "app/share/[token]/page.test.tsx"
git commit -m "copy(landing, share): Teepee is in testing; Become a tester replaces Request access

Spec 2026-10-01 §G: invite-only described the gate, not the reason. The
gate (ADR 0057) is unchanged; Privacy and Terms keep the legal wording.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 20: First-sign-in Welcome — `welcomeSeenAt`, `markWelcomeSeen()`, `WelcomeGate` + `WelcomeDialog` on Trips

**Files:**
- Modify: `/work/prisma/schema.prisma` (`model User`, after `whatsNewSeenAt DateTime?` at line 84)
- Create: `/work/prisma/migrations/20261001100000_user_welcome_seen_at/migration.sql`
- Create: `/work/server/actions/welcome.ts`
- Create: `/work/server/actions/welcome.test.ts`
- Create: `/work/components/welcome/welcome-dialog.tsx`
- Create: `/work/components/welcome/welcome-dialog.test.tsx`
- Create: `/work/components/welcome/welcome-gate.tsx`
- Create: `/work/components/welcome/welcome-gate.test.tsx`
- Modify: `/work/app/(app)/trips/page.tsx` (import after line 3; mount after line 38)
- Modify: `/work/app/(app)/trips/page.test.tsx` (new mock after line 7; assertions in the two layout tests)

**Interfaces:**
- Consumes: `requireUser()` from `/work/lib/guards.ts` line 29 (`cache(async () => session.user)`, redirects to `/` when signed out); `db.user.findUnique` / `db.user.update` from `/work/lib/db.ts`; `ok()` and `type ActionResult` from `/work/lib/action-result.ts` (ADR 0027 shape `{ success: true } | { success: false; errors }`); `Dialog, DialogContent, DialogTitle, DialogDescription, DialogFooter` from `/work/components/ui/dialog.tsx`; `Button` from `/work/components/ui/button.tsx`.
- Produces: `User.welcomeSeenAt: Date | null`; `markWelcomeSeen(): Promise<ActionResult>` (`"use server"`, no arguments); `WelcomeGate(): Promise<JSX.Element | null>` (async server component); `WelcomeDialog(): JSX.Element` (client, no props); `WELCOME_COPY = { title, body, button } as const`.

- [ ] **Step 1: Schema and migration**

In `/work/prisma/schema.prisma`, directly after line 84 (`whatsNewSeenAt DateTime?`) and before the blank line + `createdAt`, add:
```prisma

  /// When this Traveller closed the first-sign-in Welcome (spec 2026-10-01
  /// §G). NULL means they have not seen it, which is true of every account
  /// that existed before the column — they are meant to see it once too.
  welcomeSeenAt DateTime?
```

Create `/work/prisma/migrations/20261001100000_user_welcome_seen_at/migration.sql`:
```sql
-- First-sign-in Welcome (spec 2026-10-01 §G). Additive on both paths, like
-- whatsNewSeenAt (20260921120000): nullable, so the still-running old build
-- — which never writes it — cannot violate anything during the
-- migrate-then-build window, and its reads never select it.
--
-- Deliberately NOT backfilled. NULL means "has not closed the Welcome", and
-- every Traveller who exists before this column is meant to see it once.

-- AlterTable
ALTER TABLE "User" ADD COLUMN "welcomeSeenAt" TIMESTAMP(3);
```

Run: `npx prisma generate` (regenerates the client so `welcomeSeenAt` exists on `db.user.update`'s types — without this `tsc` fails in Step 3). If the local Docker Postgres is up: `npx prisma migrate deploy` (hand-written migration; never `migrate dev`, which would try to write its own).

- [ ] **Step 2: Failing test for the action**

Create `/work/server/actions/welcome.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  db: { user: { update: vi.fn() } },
}));
vi.mock("@/lib/guards", () => ({ requireUser: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { db } from "@/lib/db";
import { requireUser } from "@/lib/guards";
import { revalidatePath } from "next/cache";
import { markWelcomeSeen } from "./welcome";

const mockUpdate = db.user.update as unknown as ReturnType<typeof vi.fn>;
const mockRequireUser = requireUser as unknown as ReturnType<typeof vi.fn>;
const mockRevalidatePath = revalidatePath as unknown as ReturnType<typeof vi.fn>;

describe("markWelcomeSeen (spec 2026-10-01 §G)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireUser.mockResolvedValue({ id: "u1", email: "a@b.c" });
    mockUpdate.mockResolvedValue({});
  });

  it("stamps the signed-in Traveller's welcomeSeenAt and revalidates Trips", async () => {
    const before = Date.now();
    const result = await markWelcomeSeen();
    expect(result.success).toBe(true);
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    const arg = mockUpdate.mock.calls[0][0];
    expect(arg.where).toEqual({ id: "u1" });
    expect(arg.data.welcomeSeenAt).toBeInstanceOf(Date);
    expect((arg.data.welcomeSeenAt as Date).getTime()).toBeGreaterThanOrEqual(before);
    expect(mockRevalidatePath).toHaveBeenCalledWith("/trips");
  });

  it("takes no arguments: the row written is always the session's own", async () => {
    expect(markWelcomeSeen.length).toBe(0);
    await markWelcomeSeen();
    expect(mockUpdate.mock.calls[0][0].where).toEqual({ id: "u1" });
  });

  it("identifies the Traveller before it writes", async () => {
    const order: string[] = [];
    mockRequireUser.mockImplementation(async () => {
      order.push("auth");
      return { id: "u1", email: "a@b.c" };
    });
    mockUpdate.mockImplementation(async () => {
      order.push("write");
      return {};
    });
    await markWelcomeSeen();
    expect(order).toEqual(["auth", "write"]);
  });
});
```

Run: `npm test -- server/actions/welcome.test.ts`
Expected: FAIL — `Failed to resolve import "./welcome"`.

- [ ] **Step 3: Implement the action**

Create `/work/server/actions/welcome.ts`:
```ts
"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/guards";
import { ok, type ActionResult } from "@/lib/action-result";

/**
 * "I have seen the Welcome."
 *
 * Stamps `User.welcomeSeenAt` for the signed-in Traveller so the first-sign-in
 * Welcome (components/welcome) does not return. Takes no arguments on purpose:
 * there is no user id on the wire, so nothing for a caller to tamper with —
 * the row written is always the session's own (same shape as dismissWhatsNew).
 *
 * Offline this rejects and the Welcome shows again on the next online load.
 * That is the same accepted trade as What's new (ADR 0056): a second tap, not
 * lost work.
 */
export async function markWelcomeSeen(): Promise<ActionResult> {
  const user = await requireUser();

  await db.user.update({
    where: { id: user.id },
    data: { welcomeSeenAt: new Date() },
  });

  // Only the Trips page mounts the Welcome (spec §G), so one path suffices.
  revalidatePath("/trips");
  return ok();
}
```

Run: `npm test -- server/actions/welcome.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 4: Failing test for the dialog**

Create `/work/components/welcome/welcome-dialog.test.tsx`:
```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/server/actions/welcome", () => ({
  markWelcomeSeen: vi.fn(async () => ({ success: true })),
}));

import { markWelcomeSeen } from "@/server/actions/welcome";
import { WelcomeDialog, WELCOME_COPY } from "./welcome-dialog";

const BODY =
  "It's early days and I need as much feedback as I can get. The speech-bubble button in the bottom corner opens a Feedback note from any page. Big or small, I want to hear it all.";

describe("WelcomeDialog (spec 2026-10-01 §G)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("opens on mount with the verbatim title, body and one Got it button", () => {
    render(<WelcomeDialog />);
    const dialog = screen.getByRole("dialog", { name: "Welcome to Teepee." });
    expect(dialog).toHaveTextContent(BODY);
    expect(screen.getByRole("button", { name: "Got it" })).toBeInTheDocument();
    expect(WELCOME_COPY).toEqual({ title: "Welcome to Teepee.", body: BODY, button: "Got it" });
    // One action button; the kit's X is chrome, not a second action.
    const buttons = screen.getAllByRole("button").filter((b) => b.textContent !== "Close");
    expect(buttons).toHaveLength(1);
  });

  it("Got it closes it and marks the Welcome seen", async () => {
    render(<WelcomeDialog />);
    await userEvent.click(screen.getByRole("button", { name: "Got it" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(markWelcomeSeen).toHaveBeenCalledTimes(1);
  });

  it("the X marks it seen too", async () => {
    render(<WelcomeDialog />);
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(markWelcomeSeen).toHaveBeenCalledTimes(1);
  });

  it("Escape marks it seen too — no way to dismiss into never-seen", async () => {
    render(<WelcomeDialog />);
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(markWelcomeSeen).toHaveBeenCalledTimes(1);
  });

  it("stays closed when the write fails offline (it returns on the next load instead)", async () => {
    let rejectWrite!: (reason: Error) => void;
    (markWelcomeSeen as unknown as ReturnType<typeof vi.fn>).mockReturnValueOnce(
      new Promise((_resolve, reject) => {
        rejectWrite = reject;
      }),
    );
    render(<WelcomeDialog />);
    await userEvent.click(screen.getByRole("button", { name: "Got it" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await act(async () => {
      rejectWrite(new Error("offline"));
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
```

Run: `npm test -- components/welcome/welcome-dialog.test.tsx`
Expected: FAIL — `Failed to resolve import "./welcome-dialog"`.

- [ ] **Step 5: Implement the dialog**

Create `/work/components/welcome/welcome-dialog.tsx`:
```tsx
"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { markWelcomeSeen } from "@/server/actions/welcome";

/** Spec 2026-10-01 §G, verbatim. */
export const WELCOME_COPY = {
  title: "Welcome to Teepee.",
  body: "It's early days and I need as much feedback as I can get. The speech-bubble button in the bottom corner opens a Feedback note from any page. Big or small, I want to hear it all.",
  button: "Got it",
} as const;

/**
 * The first-sign-in Welcome. Mounted by WelcomeGate on the Trips page only,
 * and only while `User.welcomeSeenAt` is null. Opens on mount; closing by any
 * means — Got it, the X, Escape, a tap outside — marks it seen, so there is
 * no way to dismiss it into "never seen" and have it nag again.
 */
export function WelcomeDialog() {
  const [open, setOpen] = React.useState(true);
  // Radix reports every dismissal while `open` is still true (Escape then X
  // in the same beat), and Got it calls close() directly: stamp once.
  const closed = React.useRef(false);

  function close() {
    if (closed.current) return;
    closed.current = true;
    setOpen(false);
    // Hide first; the write is best-effort. Offline it rejects and the
    // Welcome shows again next load — a second tap, not lost work.
    markWelcomeSeen().catch(() => {});
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      <DialogContent>
        <DialogTitle className="pr-12 text-[26px]">{WELCOME_COPY.title}</DialogTitle>
        <DialogDescription className="text-[15px] font-medium leading-[1.5] text-foreground">
          {WELCOME_COPY.body}
        </DialogDescription>
        <DialogFooter>
          <Button type="button" size="lg" onClick={close}>
            {WELCOME_COPY.button}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

Run: `npm test -- components/welcome/welcome-dialog.test.tsx`
Expected: PASS (5 tests). If the "one action button" filter trips on the kit's `Close` span, note `DialogContent` renders `<span className="sr-only">Close</span>` inside its X (`/work/components/ui/dialog.tsx` line 155) — the filter on `textContent !== "Close"` is written for exactly that.

- [ ] **Step 6: Failing test for the gate**

Create `/work/components/welcome/welcome-gate.test.tsx`:
```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ db: { user: { findUnique: vi.fn() } } }));
vi.mock("@/lib/guards", () => ({ requireUser: vi.fn() }));
vi.mock("./welcome-dialog", () => ({
  WelcomeDialog: () => "welcome-dialog",
}));

import { db } from "@/lib/db";
import { requireUser } from "@/lib/guards";
import { WelcomeGate } from "./welcome-gate";

const mockFindUnique = db.user.findUnique as unknown as ReturnType<typeof vi.fn>;
const mockRequireUser = requireUser as unknown as ReturnType<typeof vi.fn>;

describe("WelcomeGate (spec 2026-10-01 §G)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireUser.mockResolvedValue({ id: "u1" });
  });

  it("renders the dialog while welcomeSeenAt is null — existing Travellers included", async () => {
    mockFindUnique.mockResolvedValue({ welcomeSeenAt: null });
    const el = await WelcomeGate();
    expect(el).not.toBeNull();
    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { id: "u1" },
      select: { welcomeSeenAt: true },
    });
  });

  it("renders nothing once seen", async () => {
    mockFindUnique.mockResolvedValue({ welcomeSeenAt: new Date("2026-10-01T00:00:00Z") });
    expect(await WelcomeGate()).toBeNull();
  });

  it("renders nothing rather than throwing when the user row is missing", async () => {
    mockFindUnique.mockResolvedValue(null);
    expect(await WelcomeGate()).toBeNull();
  });
});
```

Run: `npm test -- components/welcome/welcome-gate.test.tsx`
Expected: FAIL — `Failed to resolve import "./welcome-gate"`.

- [ ] **Step 7: Implement the gate**

Create `/work/components/welcome/welcome-gate.tsx`:
```tsx
import { db } from "@/lib/db";
import { requireUser } from "@/lib/guards";
import { WelcomeDialog } from "./welcome-dialog";

/**
 * Decides, on the server, whether this Traveller still owes a first-sign-in
 * Welcome (spec 2026-10-01 §G) — the same shape as WhatsNewBanner. Returns
 * null once `welcomeSeenAt` is set, and for a row that has gone missing,
 * where saying nothing beats failing the Trips page over a greeting.
 */
export async function WelcomeGate() {
  const user = await requireUser();
  const row = await db.user.findUnique({
    where: { id: user.id },
    select: { welcomeSeenAt: true },
  });
  if (!row || row.welcomeSeenAt) return null;
  return <WelcomeDialog />;
}
```

Run: `npm test -- components/welcome/welcome-gate.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 8: Mount on the Trips page, with its test**

In `/work/app/(app)/trips/page.test.tsx`, after line 7 (the `WhatsNewBanner` mock) add:
```tsx
vi.mock("@/components/welcome/welcome-gate", () => ({ WelcomeGate: () => <div data-testid="welcome-gate" /> }));
```
Add this assertion to the "first run" test (after line 33) and to the "populated" test (after line 44):
```tsx
    expect(screen.getByTestId("welcome-gate")).toBeInTheDocument();
```

Run: `npm test -- "app/(app)/trips/page.test.tsx"`
Expected: FAIL — `Unable to find an element by: [data-testid="welcome-gate"]` (twice).

In `/work/app/(app)/trips/page.tsx`:
- After line 3 (`import { WhatsNewBanner } ...`) add: `import { WelcomeGate } from "@/components/welcome/welcome-gate";`
- After line 38 (`<WhatsNewBanner className="mr-[18px] md:mr-10" />`) add: `<WelcomeGate />`

Run: `npm test -- "app/(app)/trips/page.test.tsx" components/welcome server/actions/welcome.test.ts`
Expected: PASS.

- [ ] **Step R (Review Focus 5): a tap outside the sheet marks it seen too**

Append inside `describe("WelcomeDialog (spec 2026-10-01 §G)", …)` in `/work/components/welcome/welcome-dialog.test.tsx`:

```tsx
  it("a tap outside the sheet marks it seen too", async () => {
    render(<WelcomeDialog />);
    // Radix attaches its outside-pointerdown listener on a macrotask after mount.
    await new Promise((r) => setTimeout(r, 0));
    fireEvent.pointerDown(document.body, { button: 0, pointerType: "touch" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(markWelcomeSeen).toHaveBeenCalledTimes(1);
  });
```

(add `fireEvent` to the `@testing-library/react` import.) Run: `npm test -- components/welcome/welcome-dialog.test.tsx`
Expected: PASS. If jsdom's synthetic pointerdown never reaches Radix's DismissableLayer, click the overlay instead: `fireEvent.click(document.querySelector('[data-state="open"].fixed.inset-0')!)` — and if neither path dismisses in jsdom, keep the test as the `onOpenChange(false)` contract: render, call the dialog's close through Escape, and assert `markWelcomeSeen` once (already covered), noting in the test why pointer-outside isn't driven in jsdom. Never add `onInteractOutside={(e) => e.preventDefault()}` to this dialog.

- [ ] **Step 9: Gates and commit**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean. (If `tsc` complains `welcomeSeenAt` does not exist on the Prisma update input, Step 1's `npx prisma generate` was skipped.)

```
git add prisma/schema.prisma prisma/migrations/20261001100000_user_welcome_seen_at/migration.sql server/actions/welcome.ts server/actions/welcome.test.ts components/welcome "app/(app)/trips/page.tsx" "app/(app)/trips/page.test.tsx"
git commit -m "feat(welcome): first-sign-in Welcome on Trips, marked seen on any close

User.welcomeSeenAt (nullable, not backfilled: existing Travellers see it
once too), markWelcomeSeen() with no arguments, WelcomeGate deciding on
the server like WhatsNewBanner. Spec 2026-10-01 §G.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 21: The Feedback launcher pulses once after the Welcome closes

**Files:**
- Create: `/work/lib/attention.ts`
- Create: `/work/lib/attention.test.ts`
- Modify: `/work/components/welcome/welcome-dialog.tsx` (import; one line in `close()`)
- Modify: `/work/components/welcome/welcome-dialog.test.tsx` (one new test)
- Modify: `/work/components/feedback/feedback-launcher.tsx` (imports lines 20–36; state after line 265; trigger `Button` lines 520–529)
- Modify: `/work/components/feedback/feedback-launcher.test.tsx` (imports lines 1–2 and 41; `afterEach` line 151–154; one new test)
- Modify: `/work/app/globals.css` (new keyframe + utility after line 538 `@utility tp-band-fill`)
- Create: `/work/app/globals.attention-motion.test.ts`

**Interfaces:**
- Consumes: `cn` from `@/lib/cn` (already imported in the launcher, line 20); `--ease-bounce` at `/work/app/globals.css` line 429.
- Produces: `/work/lib/attention.ts` — `type AttentionTarget = "feedback"`, `requestAttention(target: AttentionTarget): void`, `subscribeAttention(listener: (target: AttentionTarget) => void): () => void`. CSS: `@keyframes tp-attention`, `@utility tp-attention` (2 cycles of 360ms, `var(--ease-bounce)`), `animation: none` under reduced motion. Launcher: `ATTENTION_MS = 800` (module const; the class is removed on a timer, so reduced motion — where `animationend` never fires — settles too).

- [ ] **Step 1: Failing test for the event module**

Create `/work/lib/attention.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
import { requestAttention, subscribeAttention } from "./attention";

describe("attention (spec 2026-10-01 §G)", () => {
  it("delivers the target to every subscriber, and stops after unsubscribe", () => {
    const a = vi.fn();
    const b = vi.fn();
    const offA = subscribeAttention(a);
    subscribeAttention(b);
    requestAttention("feedback");
    expect(a).toHaveBeenCalledWith("feedback");
    expect(b).toHaveBeenCalledWith("feedback");
    offA();
    requestAttention("feedback");
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(2);
  });

  it("is fire-and-forget: a request with no subscriber does nothing", () => {
    expect(() => requestAttention("feedback")).not.toThrow();
  });
});
```

Run: `npm test -- lib/attention.test.ts`
Expected: FAIL — `Failed to resolve import "./attention"`.

- [ ] **Step 2: Implement the event module**

Create `/work/lib/attention.ts`:
```ts
"use client";

/**
 * "Look here." A one-shot nudge from one part of the UI to a control that
 * lives somewhere it cannot reach by props — the Welcome dialog on the Trips
 * page pointing at the Feedback launcher in the app shell (spec 2026-10-01
 * §G). Same shape as lib/feedback-trip-store.ts: a module-level listener set,
 * nothing stored, nothing replayed to late subscribers.
 */

export type AttentionTarget = "feedback";

type Listener = (target: AttentionTarget) => void;

const listeners = new Set<Listener>();

export function requestAttention(target: AttentionTarget): void {
  for (const listener of listeners) listener(target);
}

export function subscribeAttention(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
```

Run: `npm test -- lib/attention.test.ts`
Expected: PASS.

- [ ] **Step 3: Failing CSS test**

Create `/work/app/globals.attention-motion.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const css = readFileSync(path.join(process.cwd(), "app/globals.css"), "utf8");

describe("Feedback launcher attention pulse (spec 2026-10-01 §G)", () => {
  it("defines a two-beat scale pulse on the bounce ease", () => {
    expect(css).toMatch(/@keyframes tp-attention \{ 0%, 100% \{ transform: scale\(1\); \} 50% \{ transform: scale\(1\.12\); \} \}/);
    expect(css).toMatch(/@utility tp-attention \{ animation: tp-attention 360ms var\(--ease-bounce\) 2; \}/);
  });
  it("is nothing at all under reduced motion — a pointer, not information", () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\.tp-attention \{ animation: none !important; \}\s*\}/);
  });
});
```

Run: `npm test -- app/globals.attention-motion.test.ts`
Expected: FAIL on both (no `tp-attention` in the stylesheet).

- [ ] **Step 4: Add the CSS**

In `/work/app/globals.css`, directly after line 538 (`@utility tp-band-fill { animation: tp-band-fill var(--dur-base) var(--ease-pop) both; }`) and before the blank line + `/* Landing / Sign in sample cards` comment, insert:
```css
/* Feedback launcher nudge (spec 2026-10-01 §G): the Welcome's close points at
   the speech bubble. Two beats, then rest. Nothing under reduced motion — the
   base rule already collapses it, but this is a pointer, not information, so
   say so outright. */
@keyframes tp-attention { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.12); } }
@utility tp-attention { animation: tp-attention 360ms var(--ease-bounce) 2; }
@media (prefers-reduced-motion: reduce) {
  .tp-attention { animation: none !important; }
}
```

Run: `npm test -- app/globals.attention-motion.test.ts app/globals.landing-motion.test.ts app/globals.test.ts`
Expected: PASS.

- [ ] **Step 5: Failing launcher test**

In `/work/components/feedback/feedback-launcher.test.tsx`:
- Line 2: `import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";` → keep as is but ensure `act` is imported (it is, line 2).
- After line 41 (`import { FeedbackLauncher, DOCKED_FROM } ...`) add: `import { requestAttention } from "@/lib/attention";`
- In `afterEach` (lines 151–154) add `vi.useRealTimers();` as the first line of the callback.
- Add this test inside `describe("FeedbackLauncher", ...)`, directly after the first test (ends line 162):

```tsx
  it("pulses once when something asks for attention, then settles on its own (spec 2026-10-01 §G)", () => {
    vi.useFakeTimers();
    render(<FeedbackLauncher />);
    const button = screen.getByRole("button", { name: /leave feedback/i });
    expect(button.className).not.toMatch(/\btp-attention\b/);

    act(() => requestAttention("feedback"));
    expect(button.className).toMatch(/\btp-attention\b/);

    // Two 360ms beats; the class comes off on a timer rather than animationend
    // so it also settles under reduced motion, where the animation is `none`.
    act(() => {
      vi.advanceTimersByTime(800);
    });
    expect(button.className).not.toMatch(/\btp-attention\b/);
  });
```

Run: `npm test -- components/feedback/feedback-launcher.test.tsx`
Expected: FAIL — `expected 'fixed bottom-[...] ...' to match /\btp-attention\b/`.

- [ ] **Step 6: Implement the launcher pulse**

In `/work/components/feedback/feedback-launcher.tsx`:

After line 36 (the closing `} from "@/lib/feedback-trip-store";`) add:
```tsx
import { subscribeAttention } from "@/lib/attention";
```

After line 77 (`export const DOCKED_FROM = "(min-width: 768px)";`) add:
```tsx
/** Two beats of tp-attention (2 × 360ms, app/globals.css) plus a breath. */
const ATTENTION_MS = 800;
```

After line 265 (`const [hasOpened, setHasOpened] = React.useState(false);`) add:
```tsx
  // The Welcome dialog (components/welcome) asks the launcher to pulse once on
  // close, through lib/attention rather than props: it sits two layouts below
  // this shell-level component. Cleared on a timer, not animationend, so it
  // settles under reduced motion too (where the animation is `none`).
  const [attention, setAttention] = React.useState(false);
  React.useEffect(
    () =>
      subscribeAttention((target) => {
        if (target === "feedback") setAttention(true);
      }),
    [],
  );
  React.useEffect(() => {
    if (!attention) return;
    const id = window.setTimeout(() => setAttention(false), ATTENTION_MS);
    return () => window.clearTimeout(id);
  }, [attention]);
```

Replace the trigger `Button`'s `className` (line 525) with:
```tsx
          className={cn(
            "fixed bottom-[calc(var(--tp-tab-bar-h)+1.5rem+env(safe-area-inset-bottom))] right-6 z-40 size-11 rounded-full shadow-lg md:bottom-[calc(1rem+env(safe-area-inset-bottom))] md:right-4 print:hidden",
            attention && "tp-attention",
          )}
```
(`cn` is already imported at line 20.)

Run: `npm test -- components/feedback/feedback-launcher.test.tsx`
Expected: PASS (all existing tests plus the new one).

- [ ] **Step 7: Fire it from the Welcome, with its test**

In `/work/components/welcome/welcome-dialog.test.tsx` add, after the existing imports:
```tsx
import { subscribeAttention } from "@/lib/attention";
```
and this test inside the `describe`:
```tsx
  it("asks the Feedback launcher for attention when it closes", async () => {
    const seen: string[] = [];
    const off = subscribeAttention((t) => seen.push(t));
    try {
      render(<WelcomeDialog />);
      await userEvent.click(screen.getByRole("button", { name: "Got it" }));
      expect(seen).toEqual(["feedback"]);
    } finally {
      off();
    }
  });
```

Run: `npm test -- components/welcome/welcome-dialog.test.tsx`
Expected: FAIL — `expected [] to deeply equal [ 'feedback' ]`.

In `/work/components/welcome/welcome-dialog.tsx`:
- After `import { markWelcomeSeen } from "@/server/actions/welcome";` add: `import { requestAttention } from "@/lib/attention";`
- In `close()`, after `setOpen(false);` add:
```tsx
    // The body points at "the speech-bubble button in the bottom corner";
    // make it nod (components/feedback/feedback-launcher.tsx).
    requestAttention("feedback");
```

Run: `npm test -- components/welcome lib/attention.test.ts components/feedback/feedback-launcher.test.tsx app/globals.attention-motion.test.ts`
Expected: PASS.

- [ ] **Step 8: Gates and commit**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean.

```
git add lib/attention.ts lib/attention.test.ts components/welcome/welcome-dialog.tsx components/welcome/welcome-dialog.test.tsx components/feedback/feedback-launcher.tsx components/feedback/feedback-launcher.test.tsx app/globals.css app/globals.attention-motion.test.ts
git commit -m "feat(feedback): launcher pulses once after the Welcome closes

lib/attention is a one-shot event module (the dialog is two layouts below
the shell); tp-attention is two beats on --ease-bounce and none under
reduced motion. Spec 2026-10-01 §G.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Part 6 — interfaces produced

- `markWelcomeSeen(): Promise<ActionResult>` — `/work/server/actions/welcome.ts`, `"use server"`, no arguments, stamps `User.welcomeSeenAt = new Date()`, `revalidatePath("/trips")`, returns `ok()`.
- `User.welcomeSeenAt: DateTime?` — `/work/prisma/schema.prisma`; migration `20261001100000_user_welcome_seen_at`.
- `WelcomeGate(): Promise<JSX.Element | null>` — `/work/components/welcome/welcome-gate.tsx` (async server component; mount only on `app/(app)/trips/page.tsx`).
- `WelcomeDialog(): JSX.Element` and `WELCOME_COPY: { title; body; button }` — `/work/components/welcome/welcome-dialog.tsx` (client).
- `requestAttention(target: "feedback"): void`, `subscribeAttention(listener: (target: "feedback") => void): () => void`, `type AttentionTarget` — `/work/lib/attention.ts`.
- CSS: `@keyframes tp-attention`, `@utility tp-attention` (360ms × 2, `var(--ease-bounce)`), `.tp-attention { animation: none !important }` under `prefers-reduced-motion: reduce` — `/work/app/globals.css`.
- Copy strings other parts may quote: "Become a tester", "Teepee is in testing", "Want to test it?", "Teepee is in testing.", "It's in testing for now. Ask to be a tester." (the §B Google-button task and the §E deep-link task both render the panel; they must use these titles in any `getByRole("dialog", { name })`).
