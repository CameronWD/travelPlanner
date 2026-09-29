# Landing and Sign in Kit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the signed-out Landing (`/`, desktop and phone) and the Sign in page (`/signin`) match the Playground-2 kit, with a springy staggered entrance on the sample cards and an honest, Google-only sign-in.

**Architecture:** Two small Server Components carry the shared parts (`SignInControls` for the working sign-in controls, `SampleCards` for the decorative card sets); a new `SignInScreen` replaces the Landing on `/signin` first, then `Landing` is rebuilt as a desktop tree and a phone tree hidden by breakpoint. Motion is CSS only: one keyframe plus a class driven by two custom properties (`--tp-tilt`, `--tp-i`), no JS.

**Tech Stack:** Next.js 16.3 App Router (Server Components; read `node_modules/next/dist/docs/01-app/` before touching `app/` routes), React 19, Tailwind v4 (note: `rotate-*` utilities set the `rotate` property, not `transform`, so the animated cards must not use them), shadcn-style primitives in `components/ui/` (`Card`, `Badge`, `Avatar`+`AvatarFallback`, `Button`, `Logo`), vitest + Testing Library (jsdom, colocated `*.test.tsx`, `TZ=UTC`).

**Spec:** `docs/specs/2026-09-29-landing-kit.md` (D1–D8, §1.1–§1.5). Kit sources: `design_handoff/playground-2/reference/ui_kits/teepee-desktop/DLanding.jsx`, `teepee-mobile/Landing.jsx`, `shared/admin.jsx` (`SignIn`, lines 106–117). Where the spec's numbers and the kit's differ, the kit's pixel values win (the spec says so in §1.2); this plan uses the kit's values throughout.

## Global Constraints

- Branch `feat/landing-kit-2026-09-29`. Never touch `main`. Never deploy. Never run `npm run feedback:pull` or `feedback:resolve`.
- Every commit ends with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` (no `Resolves-Feedback` trailers: no note is attached).
- Copy, verbatim: hero **"Plan it with your people."** (coral full stop); desktop body **"Stops, sleeps, trains and money in one place — shared with whoever's coming. Fork the plan when you disagree. Count sleeps, not days."**; phone body **"Stops, sleeps, trains and money in one place — shared with whoever's coming."**; CTA **"Start a trip"**; header **"Sign in"**; card title **"Come on in"**; invite line **"Teepee is invite-only — sign in with the Google account you were invited with."**; on-the-way line **"Email and Apple sign-in are on the way."**; sign-in body **"One trip, everyone on it. Stops, days, money and the Wishlist."**; sign-in button **"Continue with Google"**; invite hint **"Got an invite? Sign in with the email it was sent to and the trip will be waiting."** Sample-card copy exactly as the tables in Tasks 3 and 5.
- Never on these pages: "free for up to 6 people", "How it works", "No passwords", "maybe-list", "hotel", the word "stay" (the heading "Where you're staying" is gone from the card), an `<input>`, a `<form>`, a disabled placeholder control.
- Tokens only, never raw hex. Light mode forced on the Landing and Sign in (`data-theme="light"` + `light` class on the root element).
- Decorative card blocks are `aria-hidden="true"` and contain **no focusable element** (no `<button>`, `<a>`, `<input>`): use `Badge`, not `Chip` (the app's `Chip` renders a `<button>`).
- Motion: one entrance per page load, nothing loops, `--ease-bounce`, stagger 80ms, sign-in card/sheet last; hover lift only under `@media (hover: hover)`; everything settles immediately under `prefers-reduced-motion` (delay zeroed, not just duration).
- Tests: `npx vitest run <paths>` (quote paths with parentheses); the final task runs `npm test`, `npm run lint`, `npx tsc --noEmit`.

## Review Focus

1. **Reduced motion must not hide the cards for the stagger delay.** The global reduced-motion rule shortens durations but not delays; with `animation-fill-mode: backwards` a 400ms delay would leave the sign-in card invisible for 400ms. (Task 1 test: the CSS zeroes `animation-delay` for the entrance classes under `prefers-reduced-motion`.)
2. **Hover lift must work after the entrance.** A `both`/`forwards` fill would pin the keyframe's final transform over `:hover`. (Task 1 test: the entrance uses `backwards`, and the rest transform lives in the normal rule.)
3. **Two Landing trees are in the DOM (desktop + phone).** Exactly one may be displayed at any width and neither may double-announce. (Task 5 test: the desktop tree is `hidden lg:grid`, the phone tree `lg:hidden`, and both decorative blocks are `aria-hidden`.)
4. **Nothing in the decorative cards is focusable.** Tab from the "Sign in" link must land on "Start a trip", not on a fake chip. (Task 3 test: no `button`, `a`, `input` inside either card set.)
5. **No sign-in method configured (no Google credentials, dev login off)** must still render an explanatory note on all three surfaces, never an empty card. (Task 2 test.)

---

### Task 1: Entrance motion in globals.css

**Files:**
- Modify: `app/globals.css` (Motion section, after `@keyframes tp-pop { 40% { transform: scale(1.25); } }`)
- Create: `app/globals.landing-motion.test.ts`

**Interfaces:**
- Produces: CSS classes `.tp-card-in` (tilted card entrance; reads `--tp-tilt` in degrees and `--tp-i` stagger index) and `.tp-card-pop-in` (untilted card/sheet entrance; reads `--tp-i`). Tasks 3–5 set those two custom properties inline on each animated element and add the class.

- [ ] **Step 1: Write the failing CSS test**

Create `app/globals.landing-motion.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const css = readFileSync(path.join(process.cwd(), "app/globals.css"), "utf8");

describe("Landing entrance motion (spec 2026-09-29 §1.4)", () => {
  it("defines the tilted-card keyframe from an overshot tilt, and the class rests at --tp-tilt", () => {
    expect(css).toMatch(/@keyframes tp-card-in \{ from \{ opacity: 0; transform: translateY\(24px\) rotate\(calc\(var\(--tp-tilt\) \* 1\.8\)\); \} \}/);
    expect(css).toMatch(/\.tp-card-in \{[^}]*transform: rotate\(var\(--tp-tilt\)\);[^}]*\}/);
  });
  it("staggers by --tp-i at 80ms on --ease-bounce and fills backwards only, so :hover can move the card afterwards", () => {
    expect(css).toMatch(/\.tp-card-in \{[^}]*animation: tp-card-in 420ms var\(--ease-bounce\) backwards;[^}]*animation-delay: calc\(var\(--tp-i\) \* 80ms\);[^}]*\}/);
    expect(css).toMatch(/\.tp-card-pop-in \{[^}]*animation: tp-zoom-in 320ms var\(--ease-bounce\) backwards;[^}]*animation-delay: calc\(var\(--tp-i\) \* 80ms\);[^}]*\}/);
    expect(css).not.toMatch(/tp-card-in 420ms var\(--ease-bounce\) both/);
  });
  it("lifts and straightens a card on hover, only on hover-capable devices", () => {
    expect(css).toMatch(/@media \(hover: hover\) \{\s*\.tp-card-in:hover \{ transform: translateY\(-4px\) rotate\(calc\(var\(--tp-tilt\) \* 0\.8\)\); \}\s*\}/);
  });
  it("zeroes the stagger delay under prefers-reduced-motion (Review Focus 1)", () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\.tp-card-in, \.tp-card-pop-in \{ animation-delay: 0s !important; \}\s*\}/);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run app/globals.landing-motion.test.ts`
Expected: FAIL on every assertion (no such CSS yet).

- [ ] **Step 3: Add the CSS**

In `app/globals.css`, directly after the line `@keyframes tp-pop { 40% { transform: scale(1.25); } }`, add:

```css

/* Landing / Sign in sample cards (spec 2026-09-29 §1.4): a springy staggered
   entrance, once per load, nothing loops. Each card sets --tp-tilt (its rest
   rotation) and --tp-i (its place in the stagger) inline. The rest transform
   lives here, not in the keyframe's `to`, and the fill is `backwards` only,
   so :hover below can move the card once it has landed. Tailwind's rotate-*
   utilities set the `rotate` property and would double up — never use them
   on these elements. */
@keyframes tp-card-in { from { opacity: 0; transform: translateY(24px) rotate(calc(var(--tp-tilt) * 1.8)); } }
.tp-card-in {
  --tp-tilt: 0deg;
  --tp-i: 0;
  transform: rotate(var(--tp-tilt));
  animation: tp-card-in 420ms var(--ease-bounce) backwards;
  animation-delay: calc(var(--tp-i) * 80ms);
  transition: transform var(--dur-fast) var(--ease-pop);
}
.tp-card-pop-in {
  --tp-i: 0;
  animation: tp-zoom-in 320ms var(--ease-bounce) backwards;
  animation-delay: calc(var(--tp-i) * 80ms);
}
@media (hover: hover) {
  .tp-card-in:hover { transform: translateY(-4px) rotate(calc(var(--tp-tilt) * 0.8)); }
}
/* The global reduced-motion rule (above, in @layer base) shortens durations
   but not delays; with a backwards fill a delayed card would sit invisible
   for its whole delay. Settle everything at once. */
@media (prefers-reduced-motion: reduce) {
  .tp-card-in, .tp-card-pop-in { animation-delay: 0s !important; }
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run app/globals.landing-motion.test.ts app/globals.test.ts app/globals-tokens.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/globals.css app/globals.landing-motion.test.ts
git commit -m "feat(landing): springy staggered entrance for the sample cards (CSS only)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: `SignInControls` — the honest sign-in contents, shared by all three surfaces

**Files:**
- Create: `app/landing/sign-in-controls.tsx`
- Create: `app/landing/sign-in-controls.test.tsx`
- Modify: `app/signin/signin-buttons.tsx` (`GoogleSignInButton` gains `variant` and `className` props)

**Interfaces:**
- Consumes: `GoogleSignInButton`, `DevSignInButton` from `app/signin/signin-buttons.tsx`.
- Produces (used by Tasks 4 and 5): `SignInControls({ google?: "outline" | "secondary"; googleClassName?: string })` — a Server Component rendering, top to bottom: the Google button (or the "No sign-in method is configured…" note when neither Google nor dev login is configured); in development (`ALLOW_DEV_LOGIN === "true"`) a **dotted** "or" divider and the two dev buttons; and the muted line "Email and Apple sign-in are on the way." It reads `process.env.ALLOW_DEV_LOGIN`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` at render. `GoogleSignInButton({ variant = "outline", className })`.

- [ ] **Step 1: Write the failing tests**

Create `app/landing/sign-in-controls.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { SignInControls } from "./sign-in-controls";

vi.mock("next-auth/react", () => ({ signIn: vi.fn() }));

const env = { ...process.env };
beforeEach(() => { delete process.env.ALLOW_DEV_LOGIN; delete process.env.AUTH_GOOGLE_ID; delete process.env.AUTH_GOOGLE_SECRET; });
afterEach(() => { process.env = { ...env }; });

describe("SignInControls (spec 2026-09-29 D4)", () => {
  it("with Google configured: the Google button, no dev logins, and the on-the-way line", () => {
    process.env.AUTH_GOOGLE_ID = "id"; process.env.AUTH_GOOGLE_SECRET = "s";
    render(<SignInControls />);
    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Continue as/ })).not.toBeInTheDocument();
    expect(screen.getByText("Email and Apple sign-in are on the way.")).toBeInTheDocument();
    expect(screen.queryByText(/^or$/)).not.toBeInTheDocument();
  });
  it("in development: a dotted 'or' divider and the You / Partner dev logins under Google", () => {
    process.env.AUTH_GOOGLE_ID = "id"; process.env.AUTH_GOOGLE_SECRET = "s"; process.env.ALLOW_DEV_LOGIN = "true";
    render(<SignInControls />);
    const or = screen.getByText("or");
    expect(or.parentElement!.querySelector("span.border-dotted")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Continue as You" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue as Partner" })).toBeInTheDocument();
  });
  it("with nothing configured: an explanatory note, never an empty block (Review Focus 5)", () => {
    render(<SignInControls />);
    expect(screen.getByText(/No sign-in method is configured yet/)).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
  it("never renders an input, a form, or a disabled placeholder control", () => {
    process.env.AUTH_GOOGLE_ID = "id"; process.env.AUTH_GOOGLE_SECRET = "s"; process.env.ALLOW_DEV_LOGIN = "true";
    const { container } = render(<SignInControls />);
    expect(container.querySelector("input, form, [disabled]")).toBeNull();
    expect(container.textContent).not.toMatch(/No passwords|Apple sign in$|free for up to/i);
  });
  it("passes the Google button variant through for the Sign in screen", () => {
    process.env.AUTH_GOOGLE_ID = "id"; process.env.AUTH_GOOGLE_SECRET = "s";
    render(<SignInControls google="secondary" googleClassName="lg:self-start" />);
    const g = screen.getByRole("button", { name: "Continue with Google" });
    expect(g.className).toContain("bg-card");
    expect(g.className).toContain("lg:self-start");
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run app/landing/sign-in-controls.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Extend `GoogleSignInButton` and create `SignInControls`**

In `app/signin/signin-buttons.tsx` replace `GoogleSignInButton` with:

```tsx
/** "Continue with Google" — fine to render even when Google isn't configured
 * locally; it just won't complete the flow without credentials. The Landing
 * card uses the outline look; the Sign in screen uses the kit's secondary
 * button (spec 2026-09-29 §1.3). */
export function GoogleSignInButton({
  variant = "outline",
  className,
}: {
  variant?: "outline" | "secondary";
  className?: string;
}) {
  return (
    <Button
      variant={variant}
      size="lg"
      className={cn("w-full", className)}
      onClick={() => signIn("google", { callbackUrl: "/trips" })}
    >
      Continue with Google
    </Button>
  );
}
```

and add `import { cn } from "@/lib/cn";` to the file's imports.

Create `app/landing/sign-in-controls.tsx`:

```tsx
import { GoogleSignInButton, DevSignInButton } from "@/app/signin/signin-buttons";

/**
 * The working sign-in controls, shared by the Landing's "Come on in" card, the
 * phone sheet and the Sign in screen (spec 2026-09-29 D4). Honest by design:
 * Google (the only real method), dev logins in development, and one line
 * saying what is on the way — no email field, no Apple button, no disabled
 * placeholders. The surrounding copy (invite line, access-denied text) is
 * each surface's own.
 */
export function SignInControls({
  google = "outline",
  googleClassName,
}: {
  google?: "outline" | "secondary";
  googleClassName?: string;
}) {
  const devLogin = process.env.ALLOW_DEV_LOGIN === "true";
  const googleConfigured = Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);

  return (
    <div className="flex flex-col gap-3">
      {googleConfigured && <GoogleSignInButton variant={google} className={googleClassName} />}

      {!googleConfigured && !devLogin && (
        <p className="text-center text-sm text-muted-foreground">
          No sign-in method is configured yet. Add Google OAuth credentials (or enable dev login in development) to continue.
        </p>
      )}

      {devLogin && (
        <>
          <div className="my-1.5 flex items-center gap-2 text-[13px] font-medium text-muted-foreground">
            <span className="flex-1 border-t-2 border-dotted border-border-soft" />
            or
            <span className="flex-1 border-t-2 border-dotted border-border-soft" />
          </div>
          <DevSignInButton email="you@example.com" label="You" />
          <DevSignInButton email="partner@example.com" label="Partner" />
        </>
      )}

      <p className="text-center text-[13px] font-medium text-muted-foreground">
        Email and Apple sign-in are on the way.
      </p>
    </div>
  );
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run app/landing/sign-in-controls.test.tsx app/landing/landing.test.tsx app/signin/page.test.tsx && npx tsc --noEmit`
Expected: PASS (the existing Landing still renders the old inline controls; nothing else changed).

- [ ] **Step 5: Commit**

```bash
git add app/landing/sign-in-controls.tsx app/landing/sign-in-controls.test.tsx app/signin/signin-buttons.tsx
git commit -m "feat(landing): SignInControls — Google, dev logins, and the 'on the way' line

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: `SampleCards` — the desktop and phone card sets

**Files:**
- Create: `app/landing/sample-cards.tsx`
- Create: `app/landing/sample-cards.test.tsx`

**Interfaces:**
- Consumes: `.tp-card-in` (Task 1); `Card`, `Badge`, `Avatar`, `AvatarFallback` from `components/ui/`.
- Produces: `DesktopSampleCards()` and `PhoneSampleCards()` — Server Components returning the `aria-hidden` positioned box each (`data-testid="sample-cards-desktop"` / `"sample-cards-phone"`); and the helper `entrance(tilt: number, i: number): React.CSSProperties` returning `{ "--tp-tilt": \`${tilt}deg\`, "--tp-i": i }` (typed via a cast). Task 4 reuses `entrance`.

Kit values (DLanding.jsx line 18–23; Landing.jsx line 17–22):

| Set | Card | Copy | Box | Tilt | Stagger |
|---|---|---|---|---|---|
| Desktop | coral, shadow 4, radius xl, p-5 | Badge caps "Planning"; "Japan in Autumn" 30px; "26" 76px; "sleeps / to go" 22px | `left-0 bottom-10 w-[300px]` | −5° | 0 |
| Desktop | lilac, shadow 2, p-4 | label "Kyoto · 4 nights"; "Zz Machiya near Gion" 18px; Badge teal "paid ✓" | `left-[330px] bottom-[90px] w-[250px]` | 3° | 1 |
| Desktop | Badge sun, size l, shadow-hard-2 | "→ Shinkansen · Odawara 11:12" | `left-[360px] bottom-[30px]` | −7° | 2 |
| Desktop | teal, p-3.5 | Avatars JM (sun) + AL (lilac) 26px; "Jess forked" / "“Slow Kyoto”" | `left-[620px] bottom-[70px] w-[150px]` | 6° | 3 |
| Phone | coral, shadow 3, radius xl, p-4 | Badge caps "Planning"; "Japan in Autumn" 20px; "26" 56px; "sleeps / to go" 15px | `left-0 top-0 w-[210px]` | −4° | 0 |
| Phone | lilac, p-3 | Badge white "Zz Machiya Gion ✓"; "Kyoto · 4 nights" | `right-0 top-24 w-[140px]` | 5° | 1 |
| Phone | Badge sun, shadow-hard-1 | "→ Shinkansen · 11:12" | `left-[120px] top-[150px]` | −8° | 2 |
| Phone | Badge teal, shadow-hard-1 | "let's go" | `right-5 top-[170px]` | 6° | 3 |

- [ ] **Step 1: Write the failing tests**

Create `app/landing/sample-cards.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { DesktopSampleCards, PhoneSampleCards, entrance } from "./sample-cards";

describe("SampleCards (spec 2026-09-29 §1.1, §1.2, D3)", () => {
  it("entrance() yields the two custom properties the CSS reads", () => {
    expect(entrance(-5, 2)).toEqual({ "--tp-tilt": "-5deg", "--tp-i": 2 });
  });
  it("desktop: four kit cards with the kit copy, each animated with its tilt and stagger index", () => {
    render(<DesktopSampleCards />);
    const box = screen.getByTestId("sample-cards-desktop");
    expect(box).toHaveAttribute("aria-hidden", "true");
    expect(box).toHaveTextContent("Planning");
    expect(box).toHaveTextContent("Japan in Autumn");
    expect(box).toHaveTextContent("26");
    expect(box).toHaveTextContent("Kyoto · 4 nights");
    expect(box).toHaveTextContent("Zz Machiya near Gion");
    expect(box).toHaveTextContent("paid ✓");
    expect(box).toHaveTextContent("→ Shinkansen · Odawara 11:12");
    expect(box).toHaveTextContent("JM");
    expect(box).toHaveTextContent("AL");
    expect(box).toHaveTextContent(/Jess forked/);
    const animated = Array.from(box.querySelectorAll(".tp-card-in")) as HTMLElement[];
    expect(animated).toHaveLength(4);
    expect(animated.map((el) => el.style.getPropertyValue("--tp-tilt"))).toEqual(["-5deg", "3deg", "-7deg", "6deg"]);
    expect(animated.map((el) => el.style.getPropertyValue("--tp-i"))).toEqual(["0", "1", "2", "3"]);
    for (const el of animated) expect(el.className).not.toMatch(/(^|\s)-?rotate-/);
  });
  it("desktop: the teal card is not hidden below xl any more", () => {
    render(<DesktopSampleCards />);
    const teal = screen.getByText(/Jess forked/).closest(".tp-card-in") as HTMLElement;
    expect(teal.className).not.toContain("hidden");
    expect(teal.className).not.toContain("xl:block");
  });
  it("phone: the mobile kit's four pieces, including the teal 'let's go' chip", () => {
    render(<PhoneSampleCards />);
    const box = screen.getByTestId("sample-cards-phone");
    expect(box).toHaveAttribute("aria-hidden", "true");
    expect(box).toHaveTextContent("Zz Machiya Gion ✓");
    expect(box).toHaveTextContent("Kyoto · 4 nights");
    expect(box).toHaveTextContent("→ Shinkansen · 11:12");
    expect(box).toHaveTextContent("let's go");
    const animated = Array.from(box.querySelectorAll(".tp-card-in")) as HTMLElement[];
    expect(animated.map((el) => el.style.getPropertyValue("--tp-tilt"))).toEqual(["-4deg", "5deg", "-8deg", "6deg"]);
  });
  it("nothing in either set is focusable (Review Focus 4) and no forbidden words appear", () => {
    const { container } = render(<><DesktopSampleCards /><PhoneSampleCards /></>);
    expect(container.querySelector("button, a, input, [tabindex]")).toBeNull();
    expect(container.textContent).not.toMatch(/\bhotel\b|\bstay\b|staying|free for up to/i);
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run app/landing/sample-cards.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the component**

Create `app/landing/sample-cards.tsx`:

```tsx
import type { CSSProperties } from "react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

/**
 * The tilted sample cards on the Landing (spec 2026-09-29 §1.1 desktop,
 * §1.2 phone), straight from the kit's DLanding.jsx / Landing.jsx.
 * Decoration only: aria-hidden, and nothing inside is focusable — chips are
 * <Badge> (a span), never <Chip> (a button). Each piece carries the entrance
 * class with its rest tilt and stagger index (§1.4); Tailwind rotate-*
 * utilities are deliberately absent (they would double the rotation).
 */
export function entrance(tilt: number, i: number): CSSProperties {
  return { "--tp-tilt": `${tilt}deg`, "--tp-i": i } as CSSProperties;
}

function Initials({ initials, tone }: { initials: string; tone: "sun" | "lilac" }) {
  return (
    <Avatar className="size-[26px]">
      <AvatarFallback className={tone === "sun" ? "bg-sun text-[10px]" : "bg-lilac text-[10px]"}>{initials}</AvatarFallback>
    </Avatar>
  );
}

export function DesktopSampleCards() {
  return (
    <div aria-hidden="true" data-testid="sample-cards-desktop" className="absolute inset-x-12 -bottom-[30px] h-[260px]">
      <Card tone="coral" shadow={4} radius="xl" className="tp-card-in absolute bottom-10 left-0 w-[300px] p-5" style={entrance(-5, 0)}>
        <Badge caps>Planning</Badge>
        <p className="mt-3 font-display text-[30px] font-extrabold leading-[1.05] tracking-[-0.03em]">Japan in Autumn</p>
        <div className="flex items-baseline gap-2">
          <span className="font-display text-[76px] font-extrabold leading-[0.9] tracking-[-0.05em]">26</span>
          <span className="font-display text-[22px] font-extrabold leading-[1.2]">sleeps<br />to go</span>
        </div>
      </Card>
      <Card tone="lilac" shadow={2} className="tp-card-in absolute bottom-[90px] left-[330px] w-[250px] p-4" style={entrance(3, 1)}>
        <p className="text-[11px] font-bold leading-[1.2]">Kyoto · 4 nights</p>
        <p className="mt-1.5 font-display text-lg font-extrabold leading-[1.2]">Zz Machiya near Gion</p>
        <Badge variant="teal" className="mt-2.5">paid ✓</Badge>
      </Card>
      <Badge variant="sun" className="tp-card-in absolute bottom-[30px] left-[360px] px-3.5 py-2 text-xs shadow-hard-2" style={entrance(-7, 2)}>
        → Shinkansen · Odawara 11:12
      </Badge>
      <Card tone="teal" className="tp-card-in absolute bottom-[70px] left-[620px] w-[150px] p-3.5" style={entrance(6, 3)}>
        <div className="flex gap-1.5">
          <Initials initials="JM" tone="sun" />
          <Initials initials="AL" tone="lilac" />
        </div>
        <p className="mt-2 text-[13px] font-medium leading-snug">Jess forked<br />&ldquo;Slow Kyoto&rdquo;</p>
      </Card>
    </div>
  );
}

export function PhoneSampleCards() {
  return (
    <div aria-hidden="true" data-testid="sample-cards-phone" className="relative mt-[22px] h-[210px]">
      <Card tone="coral" shadow={3} radius="xl" className="tp-card-in absolute left-0 top-0 w-[210px] p-4" style={entrance(-4, 0)}>
        <Badge caps>Planning</Badge>
        <p className="mt-2.5 font-display text-[20px] font-extrabold leading-[1.2]">Japan in Autumn</p>
        <div className="flex items-baseline gap-1.5">
          <span className="font-display text-[56px] font-extrabold leading-[0.9] tracking-[-0.05em]">26</span>
          <span className="font-display text-[15px] font-extrabold leading-[1.2]">sleeps<br />to go</span>
        </div>
      </Card>
      <Card tone="lilac" className="tp-card-in absolute right-0 top-24 w-[140px] p-3" style={entrance(5, 1)}>
        <Badge>Zz Machiya Gion ✓</Badge>
        <p className="mt-2 text-[13px] font-medium">Kyoto · 4 nights</p>
      </Card>
      <Badge variant="sun" className="tp-card-in absolute left-[120px] top-[150px] px-2.5 py-1 text-[11px] shadow-hard-1" style={entrance(-8, 2)}>
        → Shinkansen · 11:12
      </Badge>
      <Badge variant="teal" className="tp-card-in absolute right-5 top-[170px] px-2.5 py-1 text-[11px] shadow-hard-1" style={entrance(6, 3)}>
        let&apos;s go
      </Badge>
    </div>
  );
}
```

`Avatar` is a Client Component (`"use client"` via Radix); importing it from a Server Component is fine.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run app/landing/sample-cards.test.tsx && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/landing/sample-cards.tsx app/landing/sample-cards.test.tsx
git commit -m "feat(landing): the kit's sample cards, desktop and phone sets, with the entrance motion

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: The Sign in screen

**Files:**
- Create: `app/signin/sign-in-screen.tsx`
- Create: `app/signin/sign-in-screen.test.tsx`
- Modify: `app/signin/page.tsx`
- Modify: `app/signin/page.test.tsx`

**Interfaces:**
- Consumes: `SignInControls` (Task 2), `entrance` (Task 3), `Card`, `Badge`, `Logo`, `Button`.
- Produces: `SignInScreen({ accessDenied }: { accessDenied: boolean })` Server Component.

Kit (`admin.jsx` 106–117): grid `1fr 1fr` from lg, min height 560; left padding 56 / 24, `flex flex-col justify-center gap-[18px]`: `Logo 32` (26 on phone); h1 64px (44 on phone) line-height 0.92 with the full stop in `text-coral`; body `--type-body-l` max-width 380; secondary large "Continue with Google" self-start on desktop, stretch on phone; muted hint. Right (lg only): `bg-sun` panel `border-l-2`, `grid place-items-center p-10`, coral Card shadow 5 radius xl p-7 w-[360px] rotate −3°: Badge white caps "19 sleeps"; h1-size "Japan in Autumn" (`mt-[22px]`, 40px); `mt-1.5` "12 – 24 Oct · 4 stops".

- [ ] **Step 1: Write the failing screen tests**

Create `app/signin/sign-in-screen.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { SignInScreen } from "./sign-in-screen";

vi.mock("next-auth/react", () => ({ signIn: vi.fn() }));
const env = { ...process.env };
beforeEach(() => { process.env.AUTH_GOOGLE_ID = "id"; process.env.AUTH_GOOGLE_SECRET = "s"; delete process.env.ALLOW_DEV_LOGIN; });
afterEach(() => { process.env = { ...env }; });

describe("SignInScreen (spec 2026-09-29 §1.3, D7)", () => {
  it("is the kit's sign-in: heading, body with 'the Wishlist', secondary Google button, invite hint", () => {
    render(<SignInScreen accessDenied={false} />);
    expect(screen.getByRole("heading", { level: 1, name: /Plan it with your people/ })).toBeInTheDocument();
    expect(screen.getByText("One trip, everyone on it. Stops, days, money and the Wishlist.")).toBeInTheDocument();
    const g = screen.getByRole("button", { name: "Continue with Google" });
    expect(g.className).toContain("bg-card");
    expect(g.className).toContain("lg:self-start");
    expect(screen.getByText("Got an invite? Sign in with the email it was sent to and the trip will be waiting.")).toBeInTheDocument();
    expect(screen.getByText("Email and Apple sign-in are on the way.")).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/maybe-list|No passwords|Come on in/i);
  });
  it("shows the sun panel with the tilted '19 sleeps' card, animated", () => {
    render(<SignInScreen accessDenied={false} />);
    const card = screen.getByText("12 – 24 Oct · 4 stops").closest(".tp-card-in") as HTMLElement;
    expect(card.style.getPropertyValue("--tp-tilt")).toBe("-3deg");
    expect(card).toHaveTextContent("19 sleeps");
    expect(card).toHaveTextContent("Japan in Autumn");
    expect(card.parentElement!.className).toContain("bg-sun");
    expect(card.parentElement).toHaveAttribute("aria-hidden", "true");
  });
  it("access denied replaces the invite hint with the neutral explanation, once", () => {
    render(<SignInScreen accessDenied />);
    expect(screen.getByText(/recorded the attempt for the admin/)).toBeInTheDocument();
    expect(screen.queryByText(/Got an invite\?/)).not.toBeInTheDocument();
    expect(screen.getAllByText(/invite-only/i)).toHaveLength(1);
    expect(document.body.textContent).not.toMatch(/once you(’|')?re approved/i);
    expect(document.body.textContent).toMatch(/not every request is granted/i);
  });
  it("forces light mode and keeps the Legal nav", () => {
    const { container } = render(<SignInScreen accessDenied={false} />);
    const root = container.firstElementChild as HTMLElement;
    expect(root).toHaveAttribute("data-theme", "light");
    expect(root.className).toContain("light");
    expect(screen.getByRole("navigation", { name: "Legal" })).toContainElement(screen.getByRole("link", { name: "Privacy" }));
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run app/signin/sign-in-screen.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the screen and wire the page**

Create `app/signin/sign-in-screen.tsx`:

```tsx
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Logo } from "@/components/ui/logo";
import { SignInControls } from "@/app/landing/sign-in-controls";
import { entrance } from "@/app/landing/sample-cards";

/**
 * The Sign in page (spec 2026-09-29 §1.3), from the kit's SignIn screen:
 * Google-only and invite-aware. "Start a trip" and the Landing's "Sign in"
 * land here. Light mode forced, like the Landing.
 *
 * The access-denied copy is shown to everyone Auth.js refuses and has no idea
 * which of them is reading it: a brand-new stranger, someone already waiting,
 * someone dismissed, or someone revoked. It stays one neutral message —
 * telling a reader which bucket they are in would turn this page into an
 * oracle about the Admin's decisions (2026-09-26 final fix wave, I2).
 */
export function SignInScreen({ accessDenied }: { accessDenied: boolean }) {
  return (
    <main data-theme="light" className="light grid min-h-dvh flex-1 grid-cols-1 bg-background text-foreground lg:grid-cols-2">
      <section className="flex flex-col justify-center gap-[18px] px-6 py-8 lg:p-14">
        <Logo size={32} className="hidden lg:inline-flex" />
        <Logo size={26} className="lg:hidden" />
        <h1 className="font-display text-[44px] font-extrabold leading-[0.92] tracking-[-0.05em] lg:text-[64px]">
          Plan it with your people<span className="text-coral">.</span>
        </h1>
        <p className="max-w-[380px] text-[15px] font-semibold leading-[1.4]">
          One trip, everyone on it. Stops, days, money and the Wishlist.
        </p>

        {accessDenied ? (
          <div className="max-w-[420px]">
            <p className="font-display text-base font-extrabold">Teepee is invite-only.</p>
            <p className="mt-1 text-[13px] font-medium text-muted-foreground">
              Your Google account isn&apos;t on the list. We&apos;ve recorded the attempt for the admin — there&apos;s nothing else to do here. This page can&apos;t tell you where a request stands, and not every request is granted; if you&apos;re expecting access, ask whoever invited you.
            </p>
          </div>
        ) : null}

        <div className="max-w-[420px]">
          <SignInControls google="secondary" googleClassName="lg:w-auto lg:self-start" />
        </div>

        {accessDenied ? null : (
          <p className="max-w-[380px] text-[13px] font-medium text-muted-foreground">
            Got an invite? Sign in with the email it was sent to and the trip will be waiting.
          </p>
        )}

        <nav aria-label="Legal" className="flex items-center gap-4 text-xs font-semibold text-muted-foreground">
          <Link href="/privacy" className="tap-target underline underline-offset-2">Privacy</Link>
          <Link href="/terms" className="tap-target underline underline-offset-2">Terms</Link>
        </nav>
      </section>

      <section aria-hidden="true" className="hidden border-l-2 border-border bg-sun p-10 lg:grid lg:place-items-center">
        <Card tone="coral" shadow={5} radius="xl" className="tp-card-in w-[360px] p-7" style={entrance(-3, 0)}>
          <Badge caps>19 sleeps</Badge>
          <p className="mt-[22px] font-display text-[40px] font-extrabold leading-[1] tracking-[-0.04em]">Japan in Autumn</p>
          <p className="mt-1.5 text-[15px] font-semibold">12 – 24 Oct · 4 stops</p>
        </Card>
      </section>
    </main>
  );
}
```

`SignInControls`'s wrapper is `flex flex-col`, so `lg:self-start` on the Google button (plus `lg:w-auto` to undo `w-full`) gives the kit's self-start on desktop and stretch on phone.

Replace `app/signin/page.tsx` with:

```tsx
import { SignInScreen } from "./sign-in-screen";

export const metadata = {
  title: "Sign in",
};

/**
 * /signin is the kit's Sign in screen (spec 2026-09-29 §1.3), with the
 * access-denied copy in place of the invite hint when Auth.js refused the
 * account (?error=AccessDenied). Auth.js is configured with pages.signIn and
 * pages.error both set to "/signin" (lib/auth.ts).
 */
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[] }>;
}) {
  const { error } = await searchParams;
  const accessDenied = Array.isArray(error)
    ? error.includes("AccessDenied")
    : error === "AccessDenied";

  return <SignInScreen accessDenied={accessDenied} />;
}
```

- [ ] **Step 4: Update the page tests**

In `app/signin/page.test.tsx`:
- Replace the test `"reuses the landing, with the explanation inside the 'Come on in' card"` with:
  ```tsx
  it("renders the kit's Sign in screen, with the explanation beside the heading", async () => {
    const page = await SignInPage({ searchParams: Promise.resolve({ error: "AccessDenied" }) });
    render(page);
    expect(screen.getByRole("heading", { level: 1, name: /Plan it with your people/ })).toBeInTheDocument();
    expect(screen.getByText("One trip, everyone on it. Stops, days, money and the Wishlist.")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Come on in" })).not.toBeInTheDocument();
    expect(screen.getByText(/recorded the attempt for the admin/i)).toBeInTheDocument();
  });
  ```
- In the test `"footer links are padded, spaced tap targets"`, the nav no longer centres; keep the `tap-target` and `gap-4` assertions and the `/^PrivacyTerms$/` text assertion unchanged (they still hold).
- All other tests stay as they are.

- [ ] **Step 5: Run the sign-in tests and type-check**

Run: `npx vitest run app/signin app/landing app/page.test.tsx && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/signin/sign-in-screen.tsx app/signin/sign-in-screen.test.tsx app/signin/page.tsx app/signin/page.test.tsx
git commit -m "feat(signin): the kit's Sign in screen — Google-only, invite-aware, with the '19 sleeps' card

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: The Landing — desktop and phone trees

**Files:**
- Modify: `app/landing/landing.tsx` (rewrite)
- Modify: `app/landing/landing.test.tsx` (rewrite)
- Modify: `app/page.test.tsx:33` (`getByRole` → first of `getAllByRole`)

**Interfaces:**
- Consumes: `SignInControls` (Task 2), `DesktopSampleCards`, `PhoneSampleCards` (Task 3), `.tp-card-pop-in` (Task 1). `app/signin/page.tsx` already renders `SignInScreen` (Task 4) and no longer imports the Landing.
- Produces: `Landing()` with **no props**. The access-denied case now lives on the Sign in screen (Task 4), which no longer imports the Landing, so dropping the prop breaks nothing.

Layout, desktop tree (`data-slot="landing-desktop"`, `hidden lg:grid lg:min-h-dvh lg:grid-cols-[1fr_440px]`):
- left `section`: `relative flex flex-col overflow-hidden px-12 py-8 pb-[300px]`; header row `flex items-center justify-between` with `Logo size={30}` and `Button asChild variant="secondary" size="sm"` → `<Link href="/signin">Sign in</Link>`; h1 `mt-16 max-w-[640px] font-display text-[88px] font-extrabold leading-[0.92] tracking-[-0.05em]`; body `mt-[22px] max-w-[480px] text-[19px] font-semibold leading-[1.45]`; CTA `mt-7` `Button asChild size="lg"` → `<Link href="/signin">Start a trip</Link>`; then `<DesktopSampleCards />`.
- right `section`: `flex flex-col justify-center gap-4 border-l-2 border-border bg-sun p-10`; `Card role="region" aria-labelledby="come-on-in" shadow={4} radius="xl" className="tp-card-pop-in p-7" style={{ "--tp-i": 5 }}`; `CardTitle id="come-on-in" className="text-[30px]"` "Come on in"; `CardDescription className="mt-1.5"` invite line; `<div className="mt-6"><SignInControls /></div>`; the Legal nav (unchanged markup) under the card.

Phone tree (`data-slot="landing-phone"`, `flex min-h-dvh flex-col lg:hidden`):
- header `px-6 pt-3.5 flex items-center justify-between`: `Logo size={26}`, the same "Sign in" button.
- hero `px-6 pt-7`: h1 `font-display text-[50px] font-extrabold leading-[0.95] tracking-[-0.05em]`; body `mt-3.5 max-w-[300px] text-[15px] font-semibold leading-[1.4]` (phone copy); `<PhoneSampleCards />`.
- sheet `mt-auto rounded-t-2xl border-t-2 border-border bg-card px-6 pt-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] tp-card-pop-in` with `style={{ "--tp-i": 5 }}`, `role="region" aria-labelledby="come-on-in-sheet"`: `h2 id="come-on-in-sheet"` "Come on in" 24px; invite line; `<SignInControls />`; the Legal nav (`aria-label="Legal"` — both trees have one; the phone tree's nav gets `aria-label="Legal"` too, which is fine because only one tree is displayed).

- [ ] **Step 1: Rewrite the Landing tests**

Replace `app/landing/landing.test.tsx` with:

```tsx
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { Landing } from "./landing";

vi.mock("next-auth/react", () => ({ signIn: vi.fn() }));

const desktop = () => document.querySelector('[data-slot="landing-desktop"]') as HTMLElement;
const phone = () => document.querySelector('[data-slot="landing-phone"]') as HTMLElement;

describe("Landing (spec 2026-09-29)", () => {
  it("renders a desktop tree and a phone tree, one displayed per breakpoint (Review Focus 3)", () => {
    render(<Landing />);
    expect(desktop().className).toMatch(/(^|\s)hidden(\s|$)/);
    expect(desktop().className).toContain("lg:grid");
    expect(phone().className).toContain("lg:hidden");
    expect(within(desktop()).getByTestId("sample-cards-desktop")).toHaveAttribute("aria-hidden", "true");
    expect(within(phone()).getByTestId("sample-cards-phone")).toHaveAttribute("aria-hidden", "true");
  });
  it("leads with the kit's hero heading in both trees, with the kit body copy", () => {
    render(<Landing />);
    expect(within(desktop()).getByRole("heading", { level: 1, name: /Plan it with your people/ })).toBeInTheDocument();
    expect(within(phone()).getByRole("heading", { level: 1, name: /Plan it with your people/ })).toBeInTheDocument();
    expect(within(desktop()).getByText(/Stops, sleeps, trains and money in one place — shared with whoever's coming\. Fork the plan when you disagree\. Count sleeps, not days\./)).toBeInTheDocument();
    expect(within(phone()).getByText("Stops, sleeps, trains and money in one place — shared with whoever's coming.")).toBeInTheDocument();
  });
  it("header has a 'Sign in' link and the hero a 'Start a trip' link, both to /signin; no 'How it works', no chip (D2, D5)", () => {
    render(<Landing />);
    for (const tree of [desktop(), phone()]) {
      expect(within(tree).getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/signin");
    }
    expect(within(desktop()).getByRole("link", { name: "Start a trip" })).toHaveAttribute("href", "/signin");
    expect(document.body.textContent).not.toMatch(/How it works|free for up to/i);
  });
  it("the 'Come on in' card sits on a sun panel with the invite line and the honest controls; the phone sheet carries the same", () => {
    render(<Landing />);
    const card = within(desktop()).getByRole("region", { name: "Come on in" });
    expect(card.parentElement!.className).toContain("bg-sun");
    expect(card.parentElement!.className).not.toContain("bg-teal");
    expect(card.className).toContain("tp-card-pop-in");
    expect(within(card).getByText("Teepee is invite-only — sign in with the Google account you were invited with.")).toBeInTheDocument();
    expect(within(card).getByText("Email and Apple sign-in are on the way.")).toBeInTheDocument();
    const sheet = within(phone()).getByRole("region", { name: "Come on in" });
    expect(sheet.className).toContain("mt-auto");
    expect(within(sheet).getByText("Email and Apple sign-in are on the way.")).toBeInTheDocument();
  });
  it("has no invite form, no email field, no 'No passwords' line", () => {
    const { container } = render(<Landing />);
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(container.querySelector("form")).toBeNull();
    expect(container.textContent).not.toMatch(/No passwords|^Invite/i);
  });
  it("forces light mode on its root", () => {
    const { container } = render(<Landing />);
    const root = container.firstElementChild as HTMLElement;
    expect(root).toHaveAttribute("data-theme", "light");
    expect(root.className).toContain("light");
    const css = readFileSync(join(__dirname, "..", "globals.css"), "utf8");
    expect(css).toMatch(/\[data-theme="light"\],\s*:root\s*\{\s*--background: 40 100% 98%;/);
  });
  it("uses the kit's lilac-card copy and never 'hotel' or 'stay'", () => {
    const { container } = render(<Landing />);
    expect(within(desktop()).getByText("Zz Machiya near Gion")).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/\bhotel\b|\bstay\b|staying/i);
  });
  it("keeps the Legal links as padded tap targets under the card", () => {
    render(<Landing />);
    const privacy = within(desktop()).getByRole("link", { name: "Privacy" });
    expect(privacy.className).toContain("tap-target");
    expect(privacy.closest("nav")).toHaveAccessibleName("Legal");
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run app/landing/landing.test.tsx`
Expected: FAIL — no `data-slot` trees.

- [ ] **Step 3: Rewrite the Landing**

Replace `app/landing/landing.tsx` with:

```tsx
import Link from "next/link";
import type { CSSProperties } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Logo } from "@/components/ui/logo";
import { SignInControls } from "./sign-in-controls";
import { DesktopSampleCards, PhoneSampleCards } from "./sample-cards";

/**
 * The Landing (CONTEXT.md "Landing"; spec 2026-09-29): the signed-out page at
 * "/". Two trees from the kit, one displayed per breakpoint — the desktop
 * DLanding (hero left, "Come on in" card on a sun panel right) from lg, and
 * the mobile Landing (hero, small card set, sign-in sheet) below it.
 *
 * Always light: the dark palette is keyed on `.dark` on <html>, and
 * globals.css re-declares the light tokens under [data-theme="light"], so
 * this subtree ignores the theme toggle.
 *
 * Honest sign-in (D4): only controls that work, plus one line saying what is
 * on the way. Access-denied copy lives on the Sign in screen, not here.
 */
const INVITE_LINE = "Teepee is invite-only — sign in with the Google account you were invited with.";
const LAST: CSSProperties = { "--tp-i": 5 } as CSSProperties;

function SignInLink({ size }: { size: "sm" | "md" }) {
  return (
    <Button asChild variant="secondary" size={size}>
      <Link href="/signin">Sign in</Link>
    </Button>
  );
}

function LegalNav({ onAccent }: { onAccent: boolean }) {
  return (
    <nav aria-label="Legal" className={`flex items-center justify-center gap-4 text-xs font-semibold ${onAccent ? "text-on-accent" : "text-muted-foreground"}`}>
      <Link href="/privacy" className="tap-target underline underline-offset-2">Privacy</Link>
      <Link href="/terms" className="tap-target underline underline-offset-2">Terms</Link>
    </nav>
  );
}

export function Landing() {
  return (
    <main data-theme="light" className="light flex flex-1 flex-col bg-background text-foreground">
      {/* ── Desktop (kit DLanding.jsx), from lg ── */}
      <div data-slot="landing-desktop" className="hidden lg:grid lg:min-h-dvh lg:grid-cols-[1fr_440px]">
        <section className="relative flex flex-col overflow-hidden px-12 py-8 pb-[300px]">
          <div className="flex items-center justify-between">
            <Logo size={30} />
            <SignInLink size="sm" />
          </div>
          <h1 className="mt-16 max-w-[640px] font-display text-[88px] font-extrabold leading-[0.92] tracking-[-0.05em]">
            Plan it with your people<span className="text-coral">.</span>
          </h1>
          <p className="mt-[22px] max-w-[480px] text-[19px] font-semibold leading-[1.45]">
            Stops, sleeps, trains and money in one place — shared with whoever&apos;s coming. Fork the plan when you disagree. Count sleeps, not days.
          </p>
          <div className="mt-7">
            <Button asChild size="lg">
              <Link href="/signin">Start a trip</Link>
            </Button>
          </div>
          <DesktopSampleCards />
        </section>

        <section className="flex flex-col justify-center gap-4 border-l-2 border-border bg-sun p-10">
          <Card role="region" aria-labelledby="come-on-in" shadow={4} radius="xl" className="tp-card-pop-in p-7" style={LAST}>
            <CardTitle id="come-on-in" className="text-[30px]">Come on in</CardTitle>
            <CardDescription className="mt-1.5">{INVITE_LINE}</CardDescription>
            <div className="mt-6">
              <SignInControls />
            </div>
          </Card>
          <LegalNav onAccent />
        </section>
      </div>

      {/* ── Phone (kit Landing.jsx), below lg ── */}
      <div data-slot="landing-phone" className="flex min-h-dvh flex-col lg:hidden">
        <div className="flex items-center justify-between px-6 pt-3.5">
          <Logo size={26} />
          <SignInLink size="sm" />
        </div>
        <div className="px-6 pt-7">
          <h1 className="font-display text-[50px] font-extrabold leading-[0.95] tracking-[-0.05em]">
            Plan it with your people<span className="text-coral">.</span>
          </h1>
          <p className="mt-3.5 max-w-[300px] text-[15px] font-semibold leading-[1.4]">
            Stops, sleeps, trains and money in one place — shared with whoever&apos;s coming.
          </p>
          <PhoneSampleCards />
        </div>
        <section
          role="region"
          aria-labelledby="come-on-in-sheet"
          className="tp-card-pop-in mt-auto flex flex-col gap-3 rounded-t-2xl border-t-2 border-border bg-card px-6 pt-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]"
          style={LAST}
        >
          <h2 id="come-on-in-sheet" className="font-display text-2xl font-extrabold leading-tight tracking-[-0.03em]">Come on in</h2>
          <p className="text-[13px] font-medium text-muted-foreground">{INVITE_LINE}</p>
          <SignInControls />
          <LegalNav onAccent={false} />
        </section>
      </div>
    </main>
  );
}
```

In `app/page.test.tsx` line 33, change `screen.getByRole("heading", { level: 1, name: /Plan it with your people/ })` to `screen.getAllByRole("heading", { level: 1, name: /Plan it with your people/ })[0]`.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run app/landing app/page.test.tsx app/signin && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/landing/landing.tsx app/landing/landing.test.tsx app/page.test.tsx
git commit -m "feat(landing): the Landing follows the kit — sun panel, kit cards, phone layout with a sign-in sheet

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Whole-suite verification and follow-ups

**Files:**
- Modify: `docs/open-follow-ups.md` (append)

- [ ] **Step 1: Run everything**

Run: `npm test && npm run lint && npx tsc --noEmit`
Expected: all green (7 pre-existing lint warnings are known; a transient `@radix-ui/react-focus-scope` jsdom "Unhandled Errors" banner has been seen once per run in unrelated dialog tests and clears on rerun; rerun once if it appears).

- [ ] **Step 2: Sweep for forbidden copy**

Run: `grep -rnE --exclude='*.test.*' "free for up to|How it works|No passwords|maybe-list|Where you're staying" app/landing app/signin app/page.tsx; echo "exit $?"`
Expected: no matches, `exit 1`.

- [ ] **Step 3: Record the manual checks**

Append to `docs/open-follow-ups.md`:

```markdown
## 2026-09-29 · Landing and Sign in follow the kit (spec 2026-09-29-landing-kit)

- **LK-01 · Manual pass on beta.** Signed out, `/` at 1280×800 (the kit canvas), 1440×900, 390 and 360
  wide; `/signin` at the same. The entrance plays once and nothing moves afterwards; with "Reduce
  motion" on, every card is visible at once (no delayed pop); hover lifts a desktop card; Tab from
  "Sign in" lands on "Start a trip", never on a card. Not possible in the sandbox (no browser).
- **LK-02 · Magic-link and Apple sign-in.** The card says they are on the way. When either lands,
  `app/landing/sign-in-controls.tsx` is the one place to add the control and drop the line.
```

- [ ] **Step 4: Commit**

```bash
git add docs/open-follow-ups.md
git commit -m "docs: follow-ups from the Landing kit branch

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```
