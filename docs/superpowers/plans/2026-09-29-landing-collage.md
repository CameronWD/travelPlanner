# Landing collage + Sign in panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the Landing's way in under the hero as a "Sign in" / "Request access" pair that opens a small sheet/dialog, and fill the desktop right panel (on `/` and `/signin`) and the bottom of the phone screen with a collage of tilted sample cards that arrive at uneven times.

**Architecture:** `app/landing/landing.tsx` stays a Server Component; a new client `app/landing/sign-in-panel.tsx` owns the open/closed state and renders the existing `components/ui/dialog.tsx` (bottom sheet below `sm`, centred dialog from `sm`). The server-only `SignInControls` is passed into it as a prop. `app/landing/sample-cards.tsx` gains `CollageCards` (9 pieces) and a reworked `PhoneSampleCards` (6 pieces). Motion is CSS only: `--tp-delay` per card.

**Tech Stack:** Next.js (App Router — read `node_modules/next/dist/docs/` before touching routing/server-client boundaries), React 19, Tailwind v4, Radix Dialog, Vitest + Testing Library.

**Spec:** `docs/specs/2026-09-29-landing-collage.md` (read it; this plan argues from it). Prior spec for context: `docs/specs/2026-09-29-landing-kit.md`.

## Global Constraints

- Work on branch `feat/landing-signin-strip-2026-09-29`. Never commit to `main`. Never deploy.
- Button copy exactly **"Sign in"** and **"Request access"**. Never "Sign up", "Log in", "Login", "Start a trip".
- Panel headings exactly **"Come on in"** (sign-in) and **"Ask to join"** (request).
- Sign-in line: `Teepee is invite-only — sign in with the Google account you were invited with.`
- Request line: `Teepee is invite-only. Sign in with Google and we'll pass your name to the admin — there's nothing else to fill in.`
- Invite/legal line under the buttons: `Teepee is invite-only` · `Privacy` link (`/privacy`) · `Terms` link (`/terms`), inside `<nav aria-label="Legal">`, links keep `tap-target`.
- Decorative cards: inside one `aria-hidden="true"` wrapper; chips are `<Badge>` (a span), never `<Chip>` (a button); no focusable elements; no "stay"/"staying"/"hotel" anywhere on the page.
- Every card piece has class `tp-card-in` and inline `--tp-tilt`; never use Tailwind `rotate-*` on them.
- Light mode forced: `data-theme="light"` + `light` class on page roots **and** on the portalled `DialogContent`.
- `SignInControls` reads `process.env` and must never be imported into a `"use client"` file.
- Verification commands: `npm test -- <path>`, `npx tsc --noEmit`, `npm run lint`.

## Review Focus

1. **Server/client boundary** — `SignInControls` (env reads) rendered inside a client component: expected to still show Google/dev buttons correctly. Pinned in Task 2 (panel renders the `controls` prop; the client file does not import `sign-in-controls`).
2. **Dialog portals outside the light root** — a dark-theme visitor opening the panel must still see light colours. Pinned in Task 2 (`data-theme="light"` on dialog content).
3. **Short phones (360×640)** — no page scroll; buttons stay visible above the cards. Pinned in Task 4 (phone root `h-dvh overflow-hidden`, cards area `flex-1 min-h-0 overflow-hidden`), plus the screenshot pass in Task 6.
4. **Reduced motion** — with 1.4s of delays and a backwards fill, a card must not sit invisible. Pinned in Task 1 (the reduce rule zeroes `animation-delay` with `!important`, which beats inline `--tp-delay` because the delay is set on the property, not the variable).
5. **Narrow desktop (1024px)** — coral countdown fully in view in the collage. Pinned by the scale steps in Task 3 and checked in Task 6's screenshots.

---

### Task 1: Uneven entrance delays

**Files:**
- Modify: `app/globals.css` (the `.tp-card-in` / `.tp-card-pop-in` block, ~lines 529–551)
- Modify: `app/landing/sample-cards.tsx` (`entrance`)
- Test: `app/globals.landing-motion.test.ts`, create `app/landing/sample-cards.test.tsx`

**Interfaces:**
- Produces: `entrance(tilt: number, i: number, delayMs?: number): CSSProperties` — sets `--tp-tilt: "<tilt>deg"`, `--tp-i: i`, and when `delayMs` is given `--tp-delay: "<delayMs>ms"`.

- [ ] **Step 1: Update the motion test.** In `app/globals.landing-motion.test.ts`, replace the stagger test's two `animation-delay: calc(var\(--tp-i\) \* 80ms\)` expectations with `animation-delay: var\(--tp-delay, calc\(var\(--tp-i\) \* 80ms\)\);` for both `.tp-card-in` and `.tp-card-pop-in`. Keep every other test.
- [ ] **Step 2: Add `app/landing/sample-cards.test.tsx`:**

```tsx
import { describe, it, expect } from "vitest";
import { entrance } from "./sample-cards";

describe("entrance()", () => {
  it("sets tilt and index, and an explicit delay only when given", () => {
    const a = entrance(-5, 0) as Record<string, unknown>;
    expect(a["--tp-tilt"]).toBe("-5deg");
    expect(a["--tp-i"]).toBe(0);
    expect(a["--tp-delay"]).toBeUndefined();
    const b = entrance(3, 1, 520) as Record<string, unknown>;
    expect(b["--tp-delay"]).toBe("520ms");
  });
});
```

- [ ] **Step 3: Run** `npm test -- app/globals.landing-motion.test.ts app/landing/sample-cards.test.tsx` — expect FAIL.
- [ ] **Step 4: Implement.** In `globals.css` change both `animation-delay: calc(var(--tp-i) * 80ms);` lines to `animation-delay: var(--tp-delay, calc(var(--tp-i) * 80ms));` and extend the comment above the block with one line: cards may set `--tp-delay` for uneven arrival (spec 2026-09-29 collage C7). Leave the reduced-motion rule as is. In `sample-cards.tsx`:

```ts
export function entrance(tilt: number, i: number, delayMs?: number): CSSProperties {
  return {
    "--tp-tilt": `${tilt}deg`,
    "--tp-i": i,
    ...(delayMs === undefined ? {} : { "--tp-delay": `${delayMs}ms` }),
  } as CSSProperties;
}
```

- [ ] **Step 5: Run** the two test files — expect PASS. Then `npm test -- app/landing app/signin` — still PASS.
- [ ] **Step 6: Commit** `git add app/globals.css app/globals.landing-motion.test.ts app/landing/sample-cards.tsx app/landing/sample-cards.test.tsx && git commit -m "feat(motion): cards can set their own entrance delay"`

---

### Task 2: The Sign in panel

**Files:**
- Create: `app/landing/sign-in-panel.tsx` (`"use client"`)
- Test: create `app/landing/sign-in-panel.test.tsx`

**Interfaces:**
- Consumes: `Dialog, DialogContent, DialogTitle, DialogDescription` from `@/components/ui/dialog`; `Button` from `@/components/ui/button`.
- Produces:
  - `SignInPanelProvider({ controls, children }: { controls: React.ReactNode; children: React.ReactNode })` — holds `mode: "sign-in" | "request" | null` in context and renders the `Dialog` once.
  - `HeaderSignIn()` — `Button variant="secondary" size="sm"` "Sign in", opens `sign-in`.
  - `LandingActions({ size }: { size: "md" | "lg" })` — the two buttons + the Legal line. Buttons: "Sign in" (`variant="primary"`), "Request access" (`variant="secondary"`), both `type="button"`, in a `flex gap-3` row; on the phone (`size="md"`) each has `flex-1`.
  - Both must be rendered inside `SignInPanelProvider`.

- [ ] **Step 1: Write the failing test** `app/landing/sign-in-panel.test.tsx`:

```tsx
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SignInPanelProvider, HeaderSignIn, LandingActions } from "./sign-in-panel";

function setup() {
  return render(
    <SignInPanelProvider controls={<button type="button">Continue with Google</button>}>
      <HeaderSignIn />
      <LandingActions size="lg" />
    </SignInPanelProvider>,
  );
}

describe("Sign in panel (spec collage §1.1)", () => {
  it("renders Sign in and Request access buttons and the Legal line; no dialog until clicked", () => {
    setup();
    expect(screen.getAllByRole("button", { name: "Sign in" })).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Request access" })).toBeInTheDocument();
    const legal = screen.getByRole("navigation", { name: "Legal" });
    expect(legal).toHaveTextContent("Teepee is invite-only");
    expect(within(legal).getByRole("link", { name: "Privacy" })).toHaveAttribute("href", "/privacy");
    expect(within(legal).getByRole("link", { name: "Terms" })).toHaveAttribute("href", "/terms");
    expect(within(legal).getByRole("link", { name: "Privacy" }).className).toContain("tap-target");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/sign up|log ?in/i);
  });
  it("Sign in opens 'Come on in' with the invite line and the passed controls, in light mode", async () => {
    setup();
    await userEvent.click(screen.getAllByRole("button", { name: "Sign in" })[1]);
    const dialog = screen.getByRole("dialog", { name: "Come on in" });
    expect(within(dialog).getByText("Teepee is invite-only — sign in with the Google account you were invited with.")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Continue with Google" })).toBeInTheDocument();
    expect(dialog.closest('[data-theme="light"]')).not.toBeNull();
  });
  it("the header Sign in opens the same panel", async () => {
    setup();
    await userEvent.click(screen.getAllByRole("button", { name: "Sign in" })[0]);
    expect(screen.getByRole("dialog", { name: "Come on in" })).toBeInTheDocument();
  });
  it("Request access opens 'Ask to join' with the request line; Close closes it", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Request access" }));
    const dialog = screen.getByRole("dialog", { name: "Ask to join" });
    expect(within(dialog).getByText("Teepee is invite-only. Sign in with Google and we'll pass your name to the admin — there's nothing else to fill in.")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Continue with Google" })).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("never imports the server-only controls into the client file (Review Focus 1)", () => {
    const src = readFileSync(join(__dirname, "sign-in-panel.tsx"), "utf8");
    expect(src.startsWith('"use client"')).toBe(true);
    expect(src).not.toMatch(/sign-in-controls|process\.env/);
  });
});
```

(Check `@testing-library/user-event` is installed: `ls node_modules/@testing-library`. If not, use `fireEvent.click` from `@testing-library/react` instead and drop the `await`s. If the Dialog close animation keeps it mounted in jsdom, wrap the final assertion in `await waitFor(...)`.)

- [ ] **Step 2: Run** `npm test -- app/landing/sign-in-panel.test.tsx` — expect FAIL (module missing).
- [ ] **Step 3: Implement** `app/landing/sign-in-panel.tsx`:

```tsx
"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/cn";

/**
 * The Landing's way in (spec 2026-09-29 collage, C2/C3): "Sign in" and
 * "Request access" open one small panel — the shared Dialog, a bottom sheet
 * on phones and a centred dialog from sm. Both modes hold the same Google
 * controls; a refused Google sign-in already records an Access request
 * (lib/auth.ts), so "Request access" only changes the words around them.
 *
 * `controls` is the server-rendered SignInControls (it reads process.env),
 * passed in as a node — never import it here.
 */
type Mode = "sign-in" | "request";

const COPY: Record<Mode, { title: string; line: string }> = {
  "sign-in": {
    title: "Come on in",
    line: "Teepee is invite-only — sign in with the Google account you were invited with.",
  },
  request: {
    title: "Ask to join",
    line: "Teepee is invite-only. Sign in with Google and we'll pass your name to the admin — there's nothing else to fill in.",
  },
};

const OpenPanel = createContext<(mode: Mode) => void>(() => {});

export function SignInPanelProvider({ controls, children }: { controls: ReactNode; children: ReactNode }) {
  const [mode, setMode] = useState<Mode | null>(null);
  // Keep the last mode while the close animation plays, so the copy doesn't flip.
  const [shown, setShown] = useState<Mode>("sign-in");
  const open = (m: Mode) => { setShown(m); setMode(m); };

  return (
    <OpenPanel.Provider value={open}>
      {children}
      <Dialog open={mode !== null} onOpenChange={(o) => { if (!o) setMode(null); }}>
        {/* Portalled to <body>, outside the page's light root: force light here too. */}
        <DialogContent data-theme="light" className="light">
          <DialogTitle className="pr-12 font-display text-[26px] font-extrabold leading-tight tracking-[-0.03em]">{COPY[shown].title}</DialogTitle>
          <DialogDescription className="text-[13px] font-medium text-muted-foreground">{COPY[shown].line}</DialogDescription>
          <div className="mt-2">{controls}</div>
        </DialogContent>
      </Dialog>
    </OpenPanel.Provider>
  );
}

export function HeaderSignIn() {
  const open = useContext(OpenPanel);
  return (
    <Button type="button" variant="secondary" size="sm" onClick={() => open("sign-in")}>
      Sign in
    </Button>
  );
}

export function LandingActions({ size }: { size: "md" | "lg" }) {
  const open = useContext(OpenPanel);
  const grow = size === "md" ? "flex-1" : undefined;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-3">
        <Button type="button" size={size} className={grow} onClick={() => open("sign-in")}>Sign in</Button>
        <Button type="button" variant="secondary" size={size} className={grow} onClick={() => open("request")}>Request access</Button>
      </div>
      <nav aria-label="Legal" className={cn("flex flex-wrap items-center gap-x-1.5 text-[13px] font-medium text-muted-foreground")}>
        <span>Teepee is invite-only</span>
        <span aria-hidden="true">·</span>
        <Link href="/privacy" className="tap-target underline underline-offset-2">Privacy</Link>
        <span aria-hidden="true">·</span>
        <Link href="/terms" className="tap-target underline underline-offset-2">Terms</Link>
      </nav>
    </div>
  );
}
```

Check `DialogTitle`/`DialogDescription` default classes in `components/ui/dialog.tsx` and drop any of the classes above that duplicate them. If `tap-target` adds padding that breaks the one-line layout, keep it anyway (a11y) and let the row wrap.

- [ ] **Step 4: Run** the test — expect PASS. `npx tsc --noEmit` — clean.
- [ ] **Step 5: Commit** `git add app/landing/sign-in-panel.tsx app/landing/sign-in-panel.test.tsx && git commit -m "feat(landing): Sign in / Request access open a small sign-in panel"`

---

### Task 3: Collage and phone card sets

**Files:**
- Modify: `app/landing/sample-cards.tsx` (replace `DesktopSampleCards` with `CollageCards`; rework `PhoneSampleCards`)
- Test: `app/landing/sample-cards.test.tsx` (extend)

**Interfaces:**
- Consumes: `entrance(tilt, i, delayMs)` from Task 1.
- Produces: `CollageCards()` — root `div aria-hidden="true" data-testid="collage-cards"`, 9 pieces each with `data-piece`; `PhoneSampleCards()` — root `div aria-hidden="true" data-testid="sample-cards-phone"`, 6 pieces with `data-piece`. `DesktopSampleCards` is removed (Task 4 stops using it).

- [ ] **Step 1: Extend the test:**

```tsx
import { render } from "@testing-library/react";
import { CollageCards, PhoneSampleCards } from "./sample-cards";

function pieces(root: HTMLElement) {
  return Array.from(root.querySelectorAll<HTMLElement>("[data-piece]"));
}

describe("CollageCards (spec collage §1.3)", () => {
  it("renders nine decorative pieces, each tilted and animated, at uneven delays", () => {
    const { getByTestId } = render(<CollageCards />);
    const root = getByTestId("collage-cards");
    expect(root).toHaveAttribute("aria-hidden", "true");
    const ps = pieces(root);
    expect(ps).toHaveLength(9);
    for (const p of ps) {
      expect(p.className).toContain("tp-card-in");
      expect(p.style.getPropertyValue("--tp-tilt")).toMatch(/deg$/);
      expect(p.style.getPropertyValue("--tp-delay")).toMatch(/ms$/);
      expect(p.className).not.toMatch(/(^|\s)rotate-/);
    }
    const delays = ps.map((p) => parseInt(p.style.getPropertyValue("--tp-delay"), 10)).sort((a, b) => a - b);
    expect(delays[0]).toBeGreaterThanOrEqual(250);
    const steps = new Set(delays.slice(1).map((d, i) => d - delays[i]));
    expect(steps.size).toBeGreaterThan(2); // irregular, not a fixed beat
    expect(root.querySelector("button, a, input, [tabindex]")).toBeNull();
  });
  it("carries the agreed content and no stay/hotel wording", () => {
    const { getByTestId } = render(<CollageCards />);
    const t = getByTestId("collage-cards").textContent!;
    for (const s of ["Japan in Autumn", "26", "Zz Machiya near Gion", "Odawara 11:12", "Jess forked", "Tue 14 Oct", "Fushimi Inari", "21°", "¥2,400", "Jess owes you ¥1,200", "Wishlist", "Naoshima", "Tokyo", "Hakone", "Osaka"]) {
      expect(t).toContain(s);
    }
    expect(t).not.toMatch(/\bhotel\b|\bstay\b|staying/i);
  });
});

describe("PhoneSampleCards (spec collage §1.4)", () => {
  it("renders six clipped pieces including the day plan and money cards", () => {
    const { getByTestId } = render(<PhoneSampleCards />);
    const root = getByTestId("sample-cards-phone");
    expect(root).toHaveAttribute("aria-hidden", "true");
    expect(root.className).toMatch(/overflow-hidden/);
    expect(root.className).toMatch(/flex-1/);
    expect(root.className).toMatch(/min-h-0/);
    expect(pieces(root)).toHaveLength(6);
    expect(root.textContent).toContain("Fushimi Inari");
    expect(root.textContent).toContain("¥2,400");
    for (const p of pieces(root)) expect(p.style.getPropertyValue("--tp-delay")).toMatch(/ms$/);
  });
});
```

- [ ] **Step 2: Run** — FAIL (`CollageCards` not exported).
- [ ] **Step 3: Implement.** Keep `Initials` and `entrance`. Remove `DesktopSampleCards`. Add, reusing the existing four pieces' markup verbatim (coral, lilac, sun chip, teal) with `data-piece` added:

```tsx
/**
 * The desktop collage (spec 2026-09-29 collage §1.3): nine pieces scattered
 * over the sun panel, designed on a 560×720 canvas centred in the panel and
 * scaled per breakpoint. Pieces may run off the panel's edges (it clips) —
 * except the coral countdown, which stays whole near the middle. Delays are
 * deliberately uneven so the cards land like they were tossed, not dealt.
 */
export function CollageCards() {
  return (
    <div
      aria-hidden="true"
      data-testid="collage-cards"
      className="absolute left-1/2 top-1/2 h-[720px] w-[560px] -translate-x-1/2 -translate-y-1/2 scale-[.72] min-[1152px]:scale-[.86] min-[1280px]:scale-100 min-[1536px]:scale-110"
    >
      {/* 9 · stops strip — runs off the top */}
      <Card data-piece="stops" shadow={2} radius="xl" className="tp-card-in absolute -top-6 left-[60px] flex items-center gap-2 px-4 py-2.5 text-[13px] font-bold" style={entrance(-2, 8, 1370)}>
        {["Tokyo", "Hakone", "Kyoto", "Osaka"].map((s, i) => (
          <span key={s} className="flex items-center gap-2">
            {i > 0 && <span className="text-muted-foreground">→</span>}
            <span className="size-2 rounded-full bg-coral" />{s}
          </span>
        ))}
      </Card>
      {/* 5 · day plan */}
      <Card data-piece="day" shadow={3} radius="xl" className="tp-card-in absolute left-[-40px] top-[70px] w-[230px] p-4" style={entrance(-3, 4, 740)}>
        <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">Tue 14 Oct</p>
        <ul className="mt-2 flex flex-col gap-1.5 text-[13px] font-semibold">
          <li><span className="tabular-nums text-muted-foreground">09:00</span> Fushimi Inari</li>
          <li><span className="tabular-nums text-muted-foreground">12:30</span> Nishiki lunch</li>
          <li><span className="tabular-nums text-muted-foreground">19:00</span> Pontochō</li>
        </ul>
      </Card>
      {/* 6 · weather — runs off the right */}
      <Card data-piece="weather" tone="teal" shadow={2} radius="xl" className="tp-card-in absolute right-[-50px] top-[110px] w-[170px] p-4" style={entrance(5, 5, 1050)}>
        <p className="text-[11px] font-bold">Kyoto</p>
        <p className="font-display text-[40px] font-extrabold leading-none tracking-[-0.04em]">21° ☀</p>
        <p className="mt-1 text-[12px] font-medium">light jacket tonight</p>
      </Card>
      {/* 1 · coral countdown — always whole, near centre */}
      <Card data-piece="countdown" tone="coral" shadow={4} radius="xl" className="tp-card-in absolute left-[110px] top-[230px] w-[300px] p-5" style={entrance(-5, 0, 300)}>
        …existing coral content from DesktopSampleCards…
      </Card>
      {/* 2 · lilac stay */}
      <Card data-piece="lilac" tone="lilac" shadow={2} className="tp-card-in absolute right-[-10px] top-[330px] w-[230px] p-4" style={entrance(3, 1, 520)}>
        …existing lilac content…
      </Card>
      {/* 3 · sun chip */}
      <Badge data-piece="train" variant="sun" className="tp-card-in absolute left-[150px] top-[478px] px-3.5 py-2 text-xs shadow-hard-2" style={entrance(-7, 2, 610)}>
        → Shinkansen · Odawara 11:12
      </Badge>
      {/* 8 · wishlist */}
      <Card data-piece="wishlist" tone="lilac" shadow={2} radius="xl" className="tp-card-in absolute left-[-30px] top-[540px] w-[200px] p-4" style={entrance(4, 7, 960)}>
        <p className="text-[11px] font-bold uppercase tracking-[0.08em]">Wishlist</p>
        <p className="mt-1 font-display text-lg font-extrabold leading-tight">Naoshima art island</p>
        <Badge className="mt-2">♡ 2</Badge>
      </Card>
      {/* 4 · teal fork */}
      <Card data-piece="fork" tone="teal" className="tp-card-in absolute left-[250px] top-[540px] w-[150px] p-3.5" style={entrance(6, 3, 880)}>
        …existing teal content…
      </Card>
      {/* 7 · money — runs off the bottom */}
      <Card data-piece="money" shadow={3} radius="xl" className="tp-card-in absolute bottom-[-40px] right-[10px] w-[210px] p-4" style={entrance(-4, 6, 1180)}>
        <p className="text-[12px] font-bold">Ramen at Ichiran</p>
        <p className="font-display text-[32px] font-extrabold leading-none tracking-[-0.04em]">¥2,400</p>
        <Badge variant="sun" className="mt-2">Jess owes you ¥1,200</Badge>
      </Card>
    </div>
  );
}
```

Replace each "…existing … content…" with the exact inner JSX from the removed `DesktopSampleCards` pieces (coral: Badge "Planning", "Japan in Autumn" 30px, "26" 76px + "sleeps / to go"; lilac: "Kyoto · 4 nights", "Zz Machiya near Gion", teal Badge "paid ✓"; teal: two `Initials` + "Jess forked / “Slow Kyoto”"). If `Card` does not forward `data-*` props (it spreads `...props`, so it should), fine. Positions are a starting point: Task 6 tunes them from screenshots.

Rework `PhoneSampleCards`:

```tsx
/**
 * Phone card set (spec collage §1.4): fills the screen below the buttons and
 * is clipped there, so the lower pieces sit half off the bottom edge. The
 * coral countdown and the train chip stay whole at the top.
 */
export function PhoneSampleCards() {
  return (
    <div aria-hidden="true" data-testid="sample-cards-phone" className="relative -mx-6 mt-6 min-h-0 flex-1 overflow-hidden">
      <Card data-piece="countdown" tone="coral" shadow={3} radius="xl" className="tp-card-in absolute left-6 top-3 w-[210px] p-4" style={entrance(-4, 0, 300)}>
        …existing phone coral content…
      </Card>
      <Card data-piece="lilac" tone="lilac" className="tp-card-in absolute right-2 top-[70px] w-[140px] p-3" style={entrance(5, 1, 520)}>
        …existing phone lilac content…
      </Card>
      <Badge data-piece="train" variant="sun" className="tp-card-in absolute left-[140px] top-[160px] px-2.5 py-1 text-[11px] shadow-hard-1" style={entrance(-8, 2, 610)}>
        → Shinkansen · 11:12
      </Badge>
      <Card data-piece="day" shadow={2} radius="xl" className="tp-card-in absolute left-2 top-[210px] w-[190px] p-3.5" style={entrance(3, 3, 800)}>
        <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">Tue 14 Oct</p>
        <ul className="mt-1.5 flex flex-col gap-1 text-[12px] font-semibold">
          <li><span className="tabular-nums text-muted-foreground">09:00</span> Fushimi Inari</li>
          <li><span className="tabular-nums text-muted-foreground">12:30</span> Nishiki lunch</li>
          <li><span className="tabular-nums text-muted-foreground">19:00</span> Pontochō</li>
        </ul>
      </Card>
      <Badge data-piece="go" variant="teal" className="tp-card-in absolute right-8 top-[200px] px-2.5 py-1 text-[11px] shadow-hard-1" style={entrance(6, 4, 960)}>
        let&apos;s go
      </Badge>
      <Card data-piece="money" shadow={3} radius="xl" className="tp-card-in absolute right-[-20px] top-[260px] w-[170px] p-3.5" style={entrance(-5, 5, 1120)}>
        <p className="text-[11px] font-bold">Ramen at Ichiran</p>
        <p className="font-display text-[26px] font-extrabold leading-none tracking-[-0.04em]">¥2,400</p>
        <Badge variant="sun" className="mt-1.5 text-[10px]">Jess owes you ¥1,200</Badge>
      </Card>
    </div>
  );
}
```

- [ ] **Step 4: Run** `npm test -- app/landing/sample-cards.test.tsx` — PASS. (`landing.test.tsx` / `sign-in-screen.test.tsx` may now fail because `DesktopSampleCards` is gone; that is fixed in Tasks 4–5 — run `npx tsc --noEmit` and note the expected error in `landing.tsx` only.)
- [ ] **Step 5: Commit** `git add app/landing/sample-cards.tsx app/landing/sample-cards.test.tsx && git commit -m "feat(landing): nine-card collage and a fuller phone card set"`

---

### Task 4: Rebuild the Landing

**Files:**
- Modify: `app/landing/landing.tsx`
- Test: `app/landing/landing.test.tsx` (rewrite the affected cases)

**Interfaces:**
- Consumes: `SignInPanelProvider`, `HeaderSignIn`, `LandingActions` (Task 2); `CollageCards`, `PhoneSampleCards` (Task 3); `SignInControls` (existing, `./sign-in-controls`).
- Produces: `Landing()` (default server export unchanged). **`LegalNav` must stay exported** — `app/signin/sign-in-screen.tsx` imports it.

- [ ] **Step 1: Rewrite `landing.test.tsx`.** Keep: the two-trees test (but query `collage-cards` inside desktop instead of `sample-cards-desktop`), the hero/body test, the no-form test, the light-mode test, the no-stay/hotel test. Replace the "Sign in link / Start a trip", "Come on in card" and "Legal links under the card" tests with:

```tsx
it("each tree has a header Sign in button, then Sign in + Request access under the hero; no Start a trip / Sign up / Log in (C2, C3)", () => {
  render(<Landing />);
  for (const tree of [desktop(), phone()]) {
    expect(within(tree).getAllByRole("button", { name: "Sign in" })).toHaveLength(2);
    expect(within(tree).getByRole("button", { name: "Request access" })).toBeInTheDocument();
    expect(within(tree).getByRole("navigation", { name: "Legal" })).toHaveTextContent("Teepee is invite-only");
  }
  expect(document.body.textContent).not.toMatch(/Start a trip|sign up|log ?in|How it works|free for up to/i);
  expect(screen.queryByRole("link", { name: "Sign in" })).not.toBeInTheDocument();
});
it("the buttons follow the hero body in document order, and the phone cards follow the buttons (C5)", () => {
  render(<Landing />);
  const body = within(phone()).getByText("Stops, sleeps, trains and money in one place — shared with whoever's coming.");
  const req = within(phone()).getByRole("button", { name: "Request access" });
  const cards = within(phone()).getByTestId("sample-cards-phone");
  expect(body.compareDocumentPosition(req) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(req.compareDocumentPosition(cards) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});
it("the phone tree fills exactly one screen and never scrolls (Review Focus 3)", () => {
  render(<Landing />);
  expect(phone().className).toMatch(/h-dvh/);
  expect(phone().className).toMatch(/overflow-hidden/);
});
it("desktop: the collage sits on the clipped sun panel; no sign-in card or sample cards on the left (C4, C6)", () => {
  render(<Landing />);
  const collage = within(desktop()).getByTestId("collage-cards");
  const panel = collage.parentElement!;
  expect(panel.className).toContain("bg-sun");
  expect(panel.className).toContain("overflow-hidden");
  expect(desktop().className).toContain("lg:grid-cols-[1fr_0.8fr]");
  expect(within(desktop()).queryByRole("region", { name: "Come on in" })).not.toBeInTheDocument();
  expect(within(phone()).queryByRole("region", { name: "Come on in" })).not.toBeInTheDocument();
});
it("no dialog is open on load", () => {
  render(<Landing />);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
```

Add `beforeEach`/`afterEach` env handling if needed (copy from `app/signin/sign-in-screen.test.tsx`).

- [ ] **Step 2: Run** `npm test -- app/landing/landing.test.tsx` — FAIL.
- [ ] **Step 3: Implement** `landing.tsx`: keep the file header comment (update it to describe the new layout, spec 2026-09-29 collage), `LegalNav` export unchanged, and replace `Landing`:

```tsx
export function Landing() {
  return (
    <main data-theme="light" className="light flex flex-1 flex-col bg-background text-foreground">
      <SignInPanelProvider controls={<SignInControls />}>
        {/* ── Desktop, from lg: hero + way in left, collage right ── */}
        <div data-slot="landing-desktop" className="hidden lg:grid lg:min-h-dvh lg:grid-cols-[1fr_0.8fr]">
          <section className="flex flex-col px-12 py-8">
            <div className="flex items-center justify-between">
              <Logo size={30} />
              <HeaderSignIn />
            </div>
            <div className="flex flex-1 flex-col justify-center py-10">
              <h1 className="max-w-[640px] font-display text-[88px] font-extrabold leading-[0.92] tracking-[-0.05em]">
                Plan it with your people<span className="text-coral">.</span>
              </h1>
              <p className="mt-[22px] max-w-[480px] text-[19px] font-semibold leading-[1.45]">
                Stops, sleeps, trains and money in one place — shared with whoever&apos;s coming. Fork the plan when you disagree. Count sleeps, not days.
              </p>
              <div className="mt-7">
                <LandingActions size="lg" />
              </div>
            </div>
          </section>
          <section className="relative overflow-hidden border-l-2 border-border bg-sun">
            <CollageCards />
          </section>
        </div>

        {/* ── Phone, below lg: hero, way in, then cards to the bottom edge ── */}
        <div data-slot="landing-phone" className="flex h-dvh flex-col overflow-hidden px-6 lg:hidden">
          <div className="flex items-center justify-between pt-3.5">
            <Logo size={26} />
            <HeaderSignIn />
          </div>
          <h1 className="pt-7 font-display text-[50px] font-extrabold leading-[0.95] tracking-[-0.05em]">
            Plan it with your people<span className="text-coral">.</span>
          </h1>
          <p className="mt-3.5 max-w-[300px] text-[15px] font-semibold leading-[1.4]">
            Stops, sleeps, trains and money in one place — shared with whoever&apos;s coming.
          </p>
          <div className="mt-5">
            <LandingActions size="md" />
          </div>
          <PhoneSampleCards />
        </div>
      </SignInPanelProvider>
    </main>
  );
}
```

Remove now-unused imports (`Card`, `CardTitle`, `CardDescription`, `Button` if unused, `CSSProperties`, `LAST`, `INVITE_LINE`, `SignInLink`). Safe-area: add `pt-[env(safe-area-inset-top)]` to the phone root if the old one had it (check git history of the file: `git show HEAD:app/landing/landing.tsx`).

- [ ] **Step 4: Run** `npm test -- app/landing` — PASS; `npx tsc --noEmit` — clean except possibly `sign-in-screen.tsx` if it used removed exports (it uses `entrance` and `LegalNav`, both kept).
- [ ] **Step 5: Commit** `git add app/landing/landing.tsx app/landing/landing.test.tsx && git commit -m "feat(landing): way in under the hero, collage on the sun panel, cards to the phone's bottom edge"`

---

### Task 5: `/signin` gets the collage

**Files:**
- Modify: `app/signin/sign-in-screen.tsx`
- Test: `app/signin/sign-in-screen.test.tsx`

**Interfaces:**
- Consumes: `CollageCards` (Task 3).

- [ ] **Step 1: Replace the "sun panel with the tilted '19 sleeps' card" test** with:

```tsx
it("shows the collage on a clipped sun panel, hidden from assistive tech (C1)", () => {
  render(<SignInScreen accessDenied={false} />);
  const collage = screen.getByTestId("collage-cards");
  expect(collage.querySelectorAll("[data-piece]")).toHaveLength(9);
  const panel = collage.parentElement!;
  expect(panel.className).toContain("bg-sun");
  expect(panel.className).toContain("overflow-hidden");
  expect(panel).toHaveAttribute("aria-hidden", "true");
  expect(document.body.textContent).not.toMatch(/19 sleeps/);
});
```

- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.** In `sign-in-screen.tsx`: grid `lg:grid-cols-[1fr_0.8fr]` (instead of `lg:grid-cols-2`); right section becomes `<section aria-hidden="true" className="relative hidden overflow-hidden border-l-2 border-border bg-sun lg:block"><CollageCards /></section>`; drop the `Card`, `Badge`, `entrance` imports if now unused; import `CollageCards` from `@/app/landing/sample-cards`. Update the doc comment to mention the collage.
- [ ] **Step 4: Run** `npm test -- app/signin app/landing` — PASS. `npx tsc --noEmit` and `npm run lint` — clean.
- [ ] **Step 5: Commit** `git add app/signin && git commit -m "feat(signin): the collage replaces the lone coral card"`

---

### Task 6: Visual pass and tuning

**Files:**
- Modify (tuning only): `app/landing/sample-cards.tsx` positions/scales.

- [ ] **Step 1:** With `npx next dev -p 3939` running, screenshot with the Playwright CLI (`playwright screenshot --viewport-size=W,H --wait-for-timeout=2500 http://localhost:3939/<path> out.png`) into the scratchpad: `/` at 1024×768, 1280×800, 1440×900, 1920×1080, 390×844, 360×640; `/signin` at 1280×800.
- [ ] **Step 2:** Check: coral countdown fully visible in every desktop shot; collage looks full (no big empty yellow areas), several pieces cut off at edges; phone shows buttons above cards with no scrollbar and the lower cards cut off at the bottom; at 360×640 the coral card is still mostly visible. Adjust positions/scale steps in `sample-cards.tsx` and re-shoot until true.
- [ ] **Step 3:** Open the panel on phone and desktop via a small Playwright script (click "Request access", screenshot) to confirm the sheet/dialog renders in light mode with the "Ask to join" heading.
- [ ] **Step 4:** `npm test`, `npx tsc --noEmit`, `npm run lint` — all pass.
- [ ] **Step 5: Commit** `git commit -am "fix(landing): tune collage placement from screenshots"` (only if anything changed).
