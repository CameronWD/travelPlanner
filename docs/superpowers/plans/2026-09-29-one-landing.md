# One Landing, fuller phone cards, clean section switches — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fold `/signin` into the Landing at `/` (access-denied reopens the Sign in panel), drop the header "Sign in", make the phone sample cards cover the whole card area, and make section switches fade out-then-in without painting over the phone bars.

**Architecture:** Auth.js, guards and sign-out all point at `/`; `/signin` becomes a `next.config` permanent redirect. The Landing reads `?error=AccessDenied` in `app/page.tsx` and opens `SignInPanelProvider` in a new `"denied"` mode. Phone cards are re-laid out in `PhoneSampleCards` and proven by a new screenshot audit. Section crossfade timings and bar layering change in `app/globals.css` and are proven by new phone checks in `npm run audit:nav`.

**Tech Stack:** Next.js (App Router, **read `node_modules/next/dist/docs/` before touching routing/config — this version differs from training data**), React canary `<ViewTransition>`, Auth.js v5, Tailwind v4, Vitest + Testing Library, Playwright (global, not a dependency — `NODE_PATH=/usr/local/lib/node_modules`, or the pattern in `scripts/lib/audit-browser.ts` `resolvePlaywright`).

**Spec:** `docs/specs/2026-09-29-one-landing.md`

## Global Constraints

- Work only on branch `feat/signin-matches-landing-2026-09-29`. Never commit to `main`, never deploy.
- Every commit message ends with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- Run tests with `npm test -- <path>` (it sets `TZ=UTC`). Run `npx tsc --noEmit` and `npm run lint` before each commit.
- Access-denied body copy is verbatim: `Your Google account isn't on the list. We've recorded the attempt for the admin — there's nothing else to do here. This page can't tell you where a request stands, and not every request is granted; if you're expecting access, ask whoever invited you.` Title: `Teepee is invite-only.`
- Only `error=AccessDenied` (string or any array element) triggers denied mode; every other `error` value is ignored.
- Landing stays light-mode forced; sample cards stay `aria-hidden` with nothing focusable; never the words "hotel"/"stay"/"staying".
- Phone card acceptance: at 360×640, 390×844, 430×932 — max empty band ≤ 60px in each half of the card area, ≥1 piece clipped by the bottom edge, coral fully inside the area.
- Crossfade: old out ≈100ms, new in ≈160ms starting after the old ends. Day slide rules and the reduced-motion block are untouched.
- A dev server for audits: `npx next dev -p 3100` (never `next start` — it loads production env). `ALLOW_DEV_LOGIN="true"` is set in `.env`. Playwright is installed globally: `NODE_PATH=/usr/local/lib/node_modules`.

## Review Focus

1. **Redirect loop for a stale session.** `app/(app)/layout.tsx` redirects when the session's user row is missing. With the target now `/`, and `/` bouncing any session to `/trips`, that becomes an infinite loop. Expectation: `/` only bounces to `/trips` when the user row exists; otherwise it shows the Landing. (Test in Task 1.)
2. **`/signin?error=AccessDenied` from an old link or a cached Auth.js redirect.** Expectation: it lands on `/?error=AccessDenied` with the denied panel open — the redirect keeps the query string. (Test in Task 1: the redirect rule has no `has`/query-stripping and `/signin` → `/`, which Next preserves; verified in the browser in Task 2.)
3. **`?error=AccessDenied&error=Other` (array param) and `?error=Configuration`.** Expectation: array containing AccessDenied → denied; any other value → normal Landing, no dialog. (Test in Task 2.)
4. **Refresh after closing the denied panel.** Expectation: `?error` is gone from the URL so it does not reopen, and other params (e.g. `callbackUrl`) survive. (Test in Task 2.)
5. **Audit sign-in bootstrap.** `ensureAuthenticated` used to look for `/signin`; signed-out `/trips` now lands on `/`, where the dev buttons are inside the panel. Expectation: it opens the panel, clicks "Continue as You", and the audits still sign in. (Test in Task 1.)

---

### Task 1: Fold `/signin` into `/`

**Files:**
- Modify: `lib/auth.ts:77`, `lib/auth.test.ts:50-57`
- Modify: `lib/guards.ts:32`
- Modify: `app/(app)/layout.tsx:63,74`, `app/(app)/layout.test.tsx:166-178`
- Modify: `components/ui/sign-out-button.tsx:25-33`, `components/ui/sign-out-button.test.tsx:22`
- Modify: `components/legal/legal-page.tsx:36-38` (href `/`, aria-label `Teepee home`), `app/privacy/page.test.tsx:23-26`, `app/terms/page.test.tsx:15-20`, comment in `app/privacy/page.tsx:12`
- Modify: `next.config.ts` (add `redirects()`), `next.config.test.ts`
- Modify: `app/page.tsx`, `app/page.test.tsx` (stale-session guard — Review Focus 1)
- Move: `app/signin/signin-buttons.tsx` → `app/landing/signin-buttons.tsx`; update import in `app/landing/sign-in-controls.tsx:1`
- Delete: `app/signin/page.tsx`, `app/signin/page.test.tsx`, `app/signin/sign-in-screen.tsx`, `app/signin/sign-in-screen.test.tsx` (the whole `app/signin/` directory)
- Modify: `scripts/lib/audit-browser.ts:115-145`, `scripts/lib/audit-browser.test.ts:32-60`, `scripts/layout-audit.ts:128,268,453`, `scripts/layout-audit/config.ts:128` (remove the signin route), `scripts/contrast-audit.ts:365` (remove the `/signin` entry)
- Check: `app/route-conventions.test.ts`, `app/page-widths.test.ts` and anything else `grep -rn "signin" app components lib scripts --include=*.ts --include=*.tsx` finds (ignore `/api/auth/signin`, and `lib/offline.test.ts` / `components/analytics.test.tsx`, which only use `/signin` as an example URL string — leave those).

**Interfaces:**
- Produces: `app/landing/signin-buttons.tsx` exporting `GoogleSignInButton`, `DevSignInButton` (unchanged signatures). `RootPage` still `export default async function RootPage()` in this task (Task 2 adds `searchParams`).
- Produces: `ensureAuthenticated(page, baseUrl, opts)` — same signature; now treats landing on pathname `/` as "signed out".

- [ ] **Step 1: Read the Next docs for redirects.** Read `node_modules/next/dist/docs/01-app/02-guides/redirecting.md` and the `redirects` section of `node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/`. Confirm that a `redirects()` entry `{ source: "/signin", destination: "/", permanent: true }` passes the query string through (it does in current Next; if the docs say otherwise for this version, follow the docs).

- [ ] **Step 2: Update the failing tests first.**

`lib/auth.test.ts`:
```ts
  it("routes BOTH signIn and error to the Landing at /", () => {
    expect(authConfig.pages).toEqual({ signIn: "/", error: "/" });
  });
```
(Update the comment above it: a refused Traveller lands on the Landing's denied panel, not Auth.js's unbranded 403.)

`app/(app)/layout.test.tsx` — rename `"redirects to /signin when no session"` to `"redirects to / when no session"` and expect `redirect` called with `"/"`. Do the same for any missing-traveller test in that file.

`components/ui/sign-out-button.test.tsx:22`:
```ts
    expect(signOutMock).toHaveBeenCalledWith({ callbackUrl: "/" });
```

`app/privacy/page.test.tsx`:
```ts
    expect(
      screen.getByRole("link", { name: "Teepee home" }),
    ).toHaveAttribute("href", "/");
```
`app/terms/page.test.tsx`: `getByRole("link", { name: "Teepee home" })` → `href` `"/"`.

`next.config.test.ts` — add:
```ts
  it("permanently redirects the retired /signin to the Landing", async () => {
    const rules = await config.redirects!();
    expect(rules).toContainEqual({ source: "/signin", destination: "/", permanent: true });
  });
```

`app/page.test.tsx` — mock the db and add the stale-session case (Review Focus 1):
```ts
const findUnique = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db", () => ({ db: { user: { findUnique } } }));
```
Check how `app/(app)/layout.tsx` imports `db` and mock that exact module path. Existing "sends a signed-in Traveller to /trips" test: `findUnique.mockResolvedValue({ id: "u1" })`. New test:
```ts
  it("shows the landing, not a redirect, when the session's user no longer exists (no /trips ↔ / loop)", async () => {
    authMock.mockResolvedValue({ user: { id: "gone", email: "a@b.c" } });
    findUnique.mockResolvedValue(null);
    render(await RootPage());
    expect(redirectMock).not.toHaveBeenCalled();
    expect(screen.getAllByRole("heading", { level: 1, name: /Plan it with your people/ })[0]).toBeInTheDocument();
  });
```

`scripts/lib/audit-browser.test.ts` — the fake page's `url` becomes `"http://localhost:3000/"`, and it gains `getByRole` returning a button whose `first().click()` pushes `"open"`. Expected order becomes `["goto", "check", "open", "click"]`. Add:
```ts
  it("does nothing once already past the Landing", async () => {
    const { page, events } = signinPage();
    page.url = () => "http://localhost:3000/trips";
    await ensureAuthenticated(page as never, "http://localhost:3000");
    expect(events).toEqual(["goto"]);
  });
```

- [ ] **Step 3: Run them and watch them fail.**
Run: `npm test -- lib/auth.test.ts "app/(app)/layout.test.tsx" components/ui/sign-out-button.test.tsx app/privacy app/terms next.config.test.ts app/page.test.tsx scripts/lib/audit-browser.test.ts`
Expected: failures on each changed expectation.

- [ ] **Step 4: Implement.**

`lib/auth.ts` — `pages: { signIn: "/", error: "/" },` and rewrite the comment: both keys point at the Landing; `AccessDenied` resolves against `pages.error`; the Landing ignores any error other than AccessDenied, so routing every error there is safe.

`lib/guards.ts` and `app/(app)/layout.tsx` — `redirect("/")` in all three places.

`components/ui/sign-out-button.tsx` — `signOut({ callbackUrl: "/" })`; update the two doc comments to say "the Landing".

`components/legal/legal-page.tsx`:
```tsx
          <Link
            href="/"
            aria-label="Teepee home"
            className="inline-flex min-h-11 items-center"
          >
```
`app/privacy/page.tsx:12` comment: "(same as the Landing)".

`next.config.ts` — inside `nextConfig`:
```ts
  // The Sign in page was folded into the Landing (spec 2026-09-29 one-landing).
  // Old bookmarks and Auth.js redirects cached in a browser still arrive here;
  // the query string (?error=AccessDenied) is passed through.
  async redirects() {
    return [{ source: "/signin", destination: "/", permanent: true }];
  },
```

`app/page.tsx`:
```tsx
export default async function RootPage() {
  const session = await auth();
  // Only a session whose user row still exists goes on to /trips: the (app)
  // layout sends a session with no row back here, so bouncing it again would loop.
  if (session?.user?.id && (await db.user.findUnique({ where: { id: session.user.id }, select: { id: true } }))) {
    redirect("/trips");
  }
  return <Landing />;
}
```
(import `db` from the same module `app/(app)/layout.tsx` uses.) Update the doc comment: `/` is also where every signed-out visitor is sent to sign in.

Move the buttons: `git mv app/signin/signin-buttons.tsx app/landing/signin-buttons.tsx`; in `app/landing/sign-in-controls.tsx` import from `./signin-buttons`. Then `git rm -r app/signin`. `LegalNav` in `app/landing/landing.tsx` loses its only other user; keep it exported only if still used, else remove the `export` and the `onAccent` prop if now unused (check with grep).

`scripts/lib/audit-browser.ts` `ensureAuthenticated`:
```ts
  await opts?.afterFirstLoad?.(page);
  // Signed out, /trips redirects to the Landing at "/", where the dev logins
  // sit inside the Sign in panel.
  if (new URL(page.url()).pathname !== "/") return;

  await page.getByRole("button", { name: "Sign in", exact: true }).first().click();
  const continueButton = page.getByText("Continue as You", { exact: true });
```
and change the error text to `...was found in the Landing's Sign in panel (ALLOW_DEV_LOGIN may be off)...`. Update the doc comment. Note the phone and desktop trees each render a "Sign in" button and CSS hides one; use `.filter({ visible: true }).first()` if Playwright's version supports it, else pick the first visible with `locator.all()` + `isVisible()`.

`scripts/layout-audit.ts:268,453` — replace `pathname.startsWith("/signin")` with `pathname === "/"`; fix the comment at 128. Remove the signin route from `scripts/layout-audit/config.ts:128` and `scripts/contrast-audit.ts:365` (and any test that counts those routes).

- [ ] **Step 5: Run the full suite and typecheck.**
Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: all pass. Fix any other test that referenced `app/signin` or the `/signin` route.

- [ ] **Step 6: Browser check.** With `npx next dev -p 3100` running, `curl -sI "http://localhost:3100/signin?error=AccessDenied"` shows `308` and `location: /?error=AccessDenied`.

- [ ] **Step 7: Commit.**
```bash
git add -A && git commit -m "feat(landing): fold /signin into the Landing at /

Auth.js pages, guards, sign-out and the legal logo link all point at /;
/signin is a permanent redirect that keeps its query. / only bounces to
/trips when the session's user row exists, so a stale session cannot loop.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Denied panel on the Landing; no header Sign in

**Files:**
- Modify: `app/landing/sign-in-panel.tsx`, `app/landing/sign-in-panel.test.tsx`
- Modify: `app/landing/landing.tsx`, `app/landing/landing.test.tsx`
- Modify: `app/page.tsx`, `app/page.test.tsx`
- Modify: `CONTEXT.md` only if the Landing entry's wording on "the way in" needs it (it already mentions no header button — check).

**Interfaces:**
- Consumes: Task 1's `RootPage` with the user-row check.
- Produces: `SignInPanelProvider({ controls, initialMode?, children })` where `initialMode?: "denied"`; `Landing({ accessDenied?: boolean })`; `RootPage({ searchParams }: { searchParams: Promise<{ error?: string | string[] }> })`; `export function isAccessDenied(error: string | string[] | undefined): boolean` in `app/landing/access-denied.ts`. `HeaderSignIn` is **removed**.

- [ ] **Step 1: Write the failing tests.**

New `app/landing/access-denied.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { isAccessDenied } from "./access-denied";

describe("isAccessDenied", () => {
  it.each([
    ["AccessDenied", true],
    [["Other", "AccessDenied"], true],
    ["Configuration", false],
    [["Configuration"], false],
    [undefined, false],
    ["", false],
  ] as const)("%j → %s", (input, expected) => {
    expect(isAccessDenied(input as string | string[] | undefined)).toBe(expected);
  });
});
```

`app/landing/sign-in-panel.test.tsx` — `setup()` no longer renders `HeaderSignIn`; the first test expects exactly one "Sign in" button; delete the "header Sign in opens the same panel" test; change `[1]` indexes to `getByRole`. Add:
```ts
const DENIED = "Your Google account isn't on the list. We've recorded the attempt for the admin — there's nothing else to do here. This page can't tell you where a request stands, and not every request is granted; if you're expecting access, ask whoever invited you.";

  it("initialMode 'denied' opens the panel on load with the neutral denied copy and the controls", () => {
    render(
      <SignInPanelProvider initialMode="denied" controls={<button type="button">Continue with Google</button>}>
        <LandingActions size="lg" />
      </SignInPanelProvider>,
    );
    const dialog = screen.getByRole("dialog", { name: "Teepee is invite-only." });
    expect(within(dialog).getByText(DENIED)).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Continue with Google" })).toBeInTheDocument();
  });

  it("closing the denied panel strips only ?error from the URL, so a refresh does not reopen it", async () => {
    window.history.replaceState(null, "", "/?error=AccessDenied&callbackUrl=%2Ftrips");
    render(
      <SignInPanelProvider initialMode="denied" controls={<span />}>
        <LandingActions size="lg" />
      </SignInPanelProvider>,
    );
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(window.location.search).toBe("?callbackUrl=%2Ftrips");
  });
```
Also update the "never imports the server-only controls" test — keep it.

`app/landing/landing.test.tsx` — the header test: each tree has exactly **one** "Sign in" button (under the hero) plus "Request access"; rename it accordingly. Add:
```ts
  it("the header is the logo alone — no Sign in button above the hero", () => {
    render(<Landing />);
    for (const tree of [desktop(), phone()]) {
      const h1 = within(tree).getByRole("heading", { level: 1 });
      const signIn = within(tree).getByRole("button", { name: "Sign in" });
      expect(h1.compareDocumentPosition(signIn) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });
  it("accessDenied opens the denied panel on load", () => {
    render(<Landing accessDenied />);
    expect(screen.getByRole("dialog", { name: "Teepee is invite-only." })).toBeInTheDocument();
  });
```

`app/page.test.tsx` — every `RootPage()` call becomes `RootPage({ searchParams: Promise.resolve({}) })`. Add:
```ts
  it("opens the denied panel for ?error=AccessDenied and ignores other errors", async () => {
    authMock.mockResolvedValue(null);
    const { unmount } = render(await RootPage({ searchParams: Promise.resolve({ error: "AccessDenied" }) }));
    expect(screen.getByRole("dialog", { name: "Teepee is invite-only." })).toBeInTheDocument();
    unmount();
    render(await RootPage({ searchParams: Promise.resolve({ error: "Configuration" }) }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Run them — expect failures.**
Run: `npm test -- app/landing app/page.test.tsx`

- [ ] **Step 3: Implement.**

`app/landing/access-denied.ts`:
```ts
/** Auth.js sends a refused Google account to `/?error=AccessDenied`
 * (lib/auth.ts pages.error). Only that value opens the denied panel; every
 * other error is ignored, as the retired /signin page did. */
export function isAccessDenied(error: string | string[] | undefined): boolean {
  return Array.isArray(error) ? error.includes("AccessDenied") : error === "AccessDenied";
}
```

`app/landing/sign-in-panel.tsx`:
- `type Mode = "sign-in" | "request" | "denied";`
- Add to `COPY`:
```ts
  // One neutral message for everyone Auth.js refuses — a brand-new stranger,
  // someone waiting, dismissed or revoked. Telling a reader which bucket they
  // are in would make this panel an oracle about the Admin's decisions
  // (2026-09-26 final fix wave, I2). Keep it verbatim.
  denied: {
    title: "Teepee is invite-only.",
    line: "Your Google account isn't on the list. We've recorded the attempt for the admin — there's nothing else to do here. This page can't tell you where a request stands, and not every request is granted; if you're expecting access, ask whoever invited you.",
  },
```
- Provider signature `{ controls, initialMode, children }: { controls: ReactNode; initialMode?: "denied"; children: ReactNode }`; `useState<Mode | null>(initialMode ?? null)` and `useState<Mode>(initialMode ?? "sign-in")`.
- In `onOpenChange`, when closing:
```ts
  const close = () => {
    setMode(null);
    // Arrived from a refused sign-in: drop ?error so a refresh doesn't reopen
    // the panel. Other params (callbackUrl) stay.
    const url = new URL(window.location.href);
    if (url.searchParams.has("error")) {
      url.searchParams.delete("error");
      window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    }
  };
```
(Pass `window.history.state` to keep Next's router state intact; check `node_modules/next/dist/docs/` for "history.replaceState" — Next supports native calls syncing with `useSearchParams`.)
- `onCloseAutoFocus`: when `opener.current` is null (opened on load), let focus fall to the "Sign in" button: keep `e.preventDefault()` and focus `opener.current ?? document.querySelector<HTMLElement>('[data-landing-sign-in]:not([hidden])')` — simplest robust version: if no opener, don't `preventDefault` at all.
- Delete `HeaderSignIn`. Update the file's doc comment ("Sign in" and "Request access" under the hero; a refused sign-in reopens the panel in denied mode).

`app/landing/landing.tsx`:
- Remove `HeaderSignIn` import and both `<HeaderSignIn />`; the header rows become just `<Logo size={30} />` / `<Logo size={26} />` (drop the `justify-between` wrapper if it only held the pair — keep the same vertical spacing, `pt-3.5` on phone).
- `export function Landing({ accessDenied = false }: { accessDenied?: boolean })` and `<SignInPanelProvider controls={<SignInControls />} initialMode={accessDenied ? "denied" : undefined}>`.
- Update the doc comment: the header is the logo alone; a refused sign-in opens the panel in denied mode.

`app/page.tsx`:
```tsx
export default async function RootPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[] }>;
}) {
  // ...Task 1's session/user-row check unchanged...
  const { error } = await searchParams;
  return <Landing accessDenied={isAccessDenied(error)} />;
}
```

- [ ] **Step 4: Run tests, typecheck, lint.**
Run: `npm test && npx tsc --noEmit && npm run lint` — all pass.

- [ ] **Step 5: Browser check.** Against `npx next dev -p 3100`, with Playwright at 390×844 and 1280×800: open `http://localhost:3100/signin?error=AccessDenied` → lands on `/?error=AccessDenied` with the "Teepee is invite-only." dialog open; press Escape → URL is `/`, reload → no dialog. Save screenshots to the scratchpad and look at them.

- [ ] **Step 6: Commit.**
```bash
git add -A && git commit -m "feat(landing): refused sign-in reopens the panel; header is the logo alone

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Phone cards cover the card area

**Files:**
- Modify: `app/landing/sample-cards.tsx` (`PhoneSampleCards` only — `CollageCards` untouched)
- Modify: `app/landing/sample-cards.test.tsx`
- Create: `scripts/landing-cards-audit/checks.ts`, `scripts/landing-cards-audit/checks.test.ts`, `scripts/landing-cards-audit.ts`
- Modify: `package.json` scripts: `"audit:landing-cards": "tsx scripts/landing-cards-audit.ts"`

**Interfaces:**
- Consumes: Task 2's Landing (no header button).
- Produces: `maxEmptyBand(area: Box, pieces: Box[], half: "left" | "right"): number` and `type Box = { x: number; y: number; width: number; height: number }` in `scripts/landing-cards-audit/checks.ts`.

- [ ] **Step 1: Write the pure check and its tests first.**

`scripts/landing-cards-audit/checks.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { maxEmptyBand } from "./checks";

const area = { x: 0, y: 100, width: 400, height: 500 };
describe("maxEmptyBand", () => {
  it("is the whole height when a half has nothing", () => {
    expect(maxEmptyBand(area, [], "left")).toBe(500);
  });
  it("only counts pieces that overlap the half", () => {
    const right = { x: 250, y: 100, width: 100, height: 500 };
    expect(maxEmptyBand(area, [right], "right")).toBe(0);
    expect(maxEmptyBand(area, [right], "left")).toBe(500);
  });
  it("measures gaps between pieces and at both edges, clipped to the area", () => {
    const a = { x: 10, y: 60, width: 100, height: 100 };   // 60–160 → clipped to 100–160
    const b = { x: 10, y: 300, width: 100, height: 400 };  // 300–700 → clipped to 300–600
    expect(maxEmptyBand(area, [a, b], "left")).toBe(140);   // 160→300
  });
  it("merges overlapping pieces", () => {
    const a = { x: 0, y: 100, width: 50, height: 300 };
    const b = { x: 0, y: 350, width: 50, height: 250 };
    expect(maxEmptyBand(area, [a, b], "left")).toBe(0);
  });
});
```

`scripts/landing-cards-audit/checks.ts`:
```ts
export type Box = { x: number; y: number; width: number; height: number };

/** Tallest vertical run inside `area` where no piece covers any part of the
 * given half (left = x < middle, right = x ≥ middle). Pieces are clipped to
 * the area; the top and bottom edges count as boundaries. */
export function maxEmptyBand(area: Box, pieces: Box[], half: "left" | "right"): number {
  const mid = area.x + area.width / 2;
  const [lo, hi] = half === "left" ? [area.x, mid] : [mid, area.x + area.width];
  const top = area.y;
  const bottom = area.y + area.height;
  const spans = pieces
    .filter((p) => p.x < hi && p.x + p.width > lo)
    .map((p) => [Math.max(top, p.y), Math.min(bottom, p.y + p.height)] as const)
    .filter(([a, b]) => b > a)
    .sort((a, b) => a[0] - b[0]);
  let cursor = top;
  let gap = 0;
  for (const [a, b] of spans) {
    gap = Math.max(gap, a - cursor);
    cursor = Math.max(cursor, b);
  }
  return Math.max(gap, bottom - cursor);
}
```
Run: `npm test -- scripts/landing-cards-audit` → PASS.

- [ ] **Step 2: Write the audit script** `scripts/landing-cards-audit.ts` (mirror the header/prerequisite comment style of `scripts/nav-audit.ts`; use `resolvePlaywright("audit:landing-cards")` from `./lib/audit-browser` and `assertLocalBaseUrl` from `./layout-audit/config`). For each viewport of `[[360,640],[390,844],[430,932]]`: new page with `reducedMotion: "reduce"`, goto `${BASE_URL}/`, wait 1500ms, then in `page.evaluate` read the bounding rect of `[data-testid="sample-cards-phone"]` (the area) and of each `[data-piece]` inside it (`getBoundingClientRect()` — includes rotation, which is what's visible). Check and print per viewport:
  - `maxEmptyBand(area, pieces, "left") <= 60` and same for `"right"`
  - some piece's bottom `> area.y + area.height` (clipped by the bottom edge)
  - the `[data-piece="countdown"]` rect is fully inside the area
  Save `${OUT_DIR}/landing-cards-${w}x${h}.png` (default OUT_DIR `.verify`). Exit 1 if any check fails. `BASE_URL` defaults to `http://localhost:3000`.

- [ ] **Step 3: Run the audit against the current layout — watch it fail.**
Run: `BASE_URL=http://localhost:3100 NODE_PATH=/usr/local/lib/node_modules npm run audit:landing-cards` (if Playwright is not global, install it once in the scratchpad and point NODE_PATH there).
Expected: FAIL — the left half has a band well over 60px at 390×844 and 430×932.

- [ ] **Step 4: Update the unit test for nine pieces.** In `app/landing/sample-cards.test.tsx`, the phone test becomes "renders nine clipped pieces including the stops strip…": `toHaveLength(9)` and `expect(root.textContent).toContain("Hakone")`. Run it → FAIL.

- [ ] **Step 5: Re-lay out `PhoneSampleCards`.** Keep every existing piece and its content, `tp-card-in` + `entrance(tilt, i, delay)` (irregular delays, first ≥ 250ms, no `rotate-*` classes), `aria-hidden` root, nothing focusable. Coral and the train chip keep their fixed top offsets (`top-3`, `top-[160px]`) and `z-20`/`z-10`. Add the stops strip (copy the desktop `stops` piece's markup at phone size: `text-[12px]`, `px-3 py-2`, `gap-1.5`). Re-place the rest so pieces alternate left/right all the way down, using height-relative `top-[N%]` / `top-[calc(100%-Npx)]` offsets. Starting point to iterate from:
  - right, beside coral: lilac `right-[-6px] top-4 w-[140px]`
  - right: weather `right-[-8px] top-[24%] w-[125px]`
  - across the middle: stops `left-[-14px] top-[38%]`
  - left: day `left-[-10px] top-[50%] w-[190px]`
  - right: wishlist `right-[-18px] top-[54%] w-[150px]`
  - left: go chip `left-[40px] top-[74%]`
  - right: money `right-[-20px] top-[calc(100%-110px)] w-[170px]`
  - bottom-left spill: a second pass is likely needed — if the left half still has a band > 60px near the bottom, move the day card or go chip lower, or re-add the teal "fork" piece from the desktop collage at `left-[-12px] top-[calc(100%-70px)]` (piece count then becomes 10 — update the test).
  Update the doc comment above `PhoneSampleCards` to describe the staggered spread.

- [ ] **Step 6: Iterate with the audit until it passes at all three sizes**, then **look at the three screenshots** (Read the PNGs) and fix anything that looks broken (a piece hidden entirely behind coral, text cut mid-word in the middle of the screen, coral overlapping the buttons). The audit passing is necessary, not sufficient.

- [ ] **Step 7: Tests, typecheck, lint.** `npm test && npx tsc --noEmit && npm run lint`.

- [ ] **Step 8: Commit** (include the three `.verify/landing-cards-*.png` only if `.verify` is tracked — check `git check-ignore .verify`).
```bash
git add -A && git commit -m "fix(landing): phone cards cover the whole card area

A staggered left/right spread with the stops strip as a ninth piece;
npm run audit:landing-cards proves no empty band over 60px in either half
at 360x640, 390x844 and 430x932.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Section switches fade out, then in, under the bars

**Files:**
- Modify: `app/globals.css:660-697` (crossfade timings; bar group layering)
- Modify: `app/globals.view-transition.test.ts`
- Modify: `scripts/nav-audit.ts` (new phone checks), `scripts/nav-audit/checks.ts` + its test (pure judges)
- Modify: `docs/adr/0063-sibling-navigation-holds-the-current-page.md` (consequence bullet, ~line 73)

**Interfaces:**
- Consumes: Task 1's `ensureAuthenticated` (Landing-aware).
- Produces: `crossfadeOverlapFrames(frames: { t: number; oldOpacity: number; newOpacity: number }[]): number[]` and `changedBarFrames(baseline: string, frames: { t: number; bar: string }[]): number[]` in `scripts/nav-audit/checks.ts` (return the `t` of each offending frame).

**Background (the diagnosis — why the 2026-09-28 fix did not hold):**
1. `::view-transition-old(.tp-crossfade)` (120ms) and `::view-transition-new(.tp-crossfade)` (180ms) both start at t=0, so for most of the switch both sections are visible on top of each other.
2. The browser orders `::view-transition-group`s by the order their names appear in the **old** state, then appends names that exist **only in the new** state. The entering section's name (React generates a fresh one per keyed `<ViewTransition>`) exists only in the new state, so its group is appended **after** `tp-tab-bar` / `tp-top-bar` and paints above them — including the part of the section that normally sits behind the fixed tab bar. The bars need an explicit `z-index` on their groups, not only a name.

- [ ] **Step 1: Reproduce in the browser first.** Before changing CSS, extend `scripts/nav-audit.ts` with a phone check (Steps 3–4), run it against `next dev -p 3100`, and confirm it FAILS on the current CSS for both reasons. If it does not fail for reason 2, stop and report back with the frames — the diagnosis is wrong and the fix must change.

- [ ] **Step 2: Pure judges + tests.** In `scripts/nav-audit/checks.test.ts`:
```ts
describe("crossfadeOverlapFrames", () => {
  it("flags frames where both old and new are visibly painted", () => {
    expect(crossfadeOverlapFrames([
      { t: 0, oldOpacity: 1, newOpacity: 0 },
      { t: 50, oldOpacity: 0.5, newOpacity: 0.3 },
      { t: 120, oldOpacity: 0, newOpacity: 0.4 },
    ])).toEqual([50]);
  });
  it("ignores near-zero opacities", () => {
    expect(crossfadeOverlapFrames([{ t: 10, oldOpacity: 0.01, newOpacity: 0.9 }])).toEqual([]);
  });
});
describe("changedBarFrames", () => {
  it("returns the frames whose tab-bar pixels differ from the settled page", () => {
    expect(changedBarFrames("A", [{ t: 0, bar: "A" }, { t: 40, bar: "B" }])).toEqual([40]);
  });
});
```
Implement in `scripts/nav-audit/checks.ts`:
```ts
const VISIBLE = 0.02;
export function crossfadeOverlapFrames(frames: { t: number; oldOpacity: number; newOpacity: number }[]): number[] {
  return frames.filter((f) => f.oldOpacity > VISIBLE && f.newOpacity > VISIBLE).map((f) => f.t);
}
export function changedBarFrames(baseline: string, frames: { t: number; bar: string }[]): number[] {
  return frames.filter((f) => f.bar !== baseline).map((f) => f.t);
}
```
Run: `npm test -- scripts/nav-audit` → PASS.

- [ ] **Step 3: The browser check in `scripts/nav-audit.ts`**, in the phone section (after the existing chrome-name check around line 249), on a trip's Plan page at 390×844:
  - Settle, then `baseline = (await page.locator("nav.tp-vt-tab-bar").screenshot()).toString("base64")`.
  - Slow every animation down 20×: `const cdp = await page.context().newCDPSession(page); await cdp.send("Animation.enable"); await cdp.send("Animation.setPlaybackRate", { playbackRate: 0.05 });`
  - Click the tab bar's "Money" link (mirror how the file clicks tab-bar links elsewhere; the Money section is `/budget`). Then for ~7s sample every 150ms:
    - opacities: `page.evaluate` that finds `document.getAnimations()` whose `effect.pseudoElement` starts with `::view-transition-old(` / `::view-transition-new(` and is not `root`/`tp-tab-bar`/`tp-top-bar`, reads `getComputedStyle(document.documentElement, pseudo).opacity` for each, and returns max old / max new opacity (0 when absent).
    - bar pixels: `page.screenshot({ clip: barRect })` base64 (use the tab bar's rect measured before the click; `locator.screenshot` of the live element does not show the transition overlay).
    - stop once no view-transition animations remain and the URL ends in `/budget`.
  - Reset playback rate to 1. Push two hard findings: `"Phone section switch: old and new sections never both visible"` (`crossfadeOverlapFrames(...)` empty) and `"Phone section switch: the tab bar is untouched in every frame"` (`changedBarFrames(...)` empty). On failure save the offending frames as PNGs to the audit's output dir and put their `t` values in `detail`.
  - A frame count of 0 view-transition samples is itself a failure ("no transition observed") — otherwise the check can pass vacuously.

- [ ] **Step 4: Run it — expect both new checks to FAIL on the current CSS.**
Run: `BASE_URL=http://localhost:3100 NODE_PATH=<playwright root> npm run audit:nav`

- [ ] **Step 5: Update the CSS test first.** In `app/globals.view-transition.test.ts` add:
```ts
  it("section crossfade is out-then-in: the new section waits for the old one to finish", () => {
    const old = css.match(/::view-transition-old\(\.tp-crossfade\)\s*\{\s*animation:\s*(\d+)ms/);
    const neu = css.match(/::view-transition-new\(\.tp-crossfade\)\s*\{\s*animation:\s*(\d+)ms\s+[\w-]+\s+(\d+)ms/);
    expect(old && neu).toBeTruthy();
    expect(Number(neu![2])).toBeGreaterThanOrEqual(Number(old![1]));
  });
  it("layers the phone bars' transition groups above every section group", () => {
    expect(css).toMatch(/::view-transition-group\(tp-tab-bar\),\s*::view-transition-group\(tp-top-bar\)\s*\{\s*z-index:\s*\d+;?\s*\}/);
  });
```
Run → FAIL.

- [ ] **Step 6: Change the CSS** in `app/globals.css`:
```css
::view-transition-old(.tp-crossfade) { animation: 100ms ease-in both tp-vt-fade reverse; }
::view-transition-new(.tp-crossfade) { animation: 160ms ease-out 100ms both tp-vt-fade; }
```
Update the comment above the route-motion block ("Section switches fade out, then in — never both at once"). Below the `.tp-vt-tab-bar` rules add:
```css
/* A name alone is not enough: groups are ordered by the old state's names,
   then names that exist only in the new state are appended — and the entering
   section's name is always new, so its group painted above the bars. An
   explicit z-index keeps both bars above every section group. */
::view-transition-group(tp-tab-bar), ::view-transition-group(tp-top-bar) { z-index: 100; }
```
Leave the day-forward/day-back rules and the reduced-motion block exactly as they are.

- [ ] **Step 7: Re-run the CSS tests and the nav audit.** `npm test -- app/globals.view-transition.test.ts` → PASS; `npm run audit:nav` → both new phone checks PASS, no existing check regresses. Look at a few sampled frames yourself. If the z-index does not take effect in Chromium, report back with frames rather than trying another approach silently.

- [ ] **Step 8: ADR line.** In `docs/adr/0063-...md`, extend the bar consequence bullet: the bars also need `z-index` on their `::view-transition-group`, because a name that exists only in the new state (every entering section) is appended after them; and section switches fade out then in (100ms, then 160ms) so the two sections are never on screen together (2026-09-29).

- [ ] **Step 9: Full suite, typecheck, lint; commit.**
```bash
npm test && npx tsc --noEmit && npm run lint
git add -A && git commit -m "fix(nav): section switches fade out then in, under the phone bars

The entering section's view-transition group is appended after the bars'
(its name only exists in the new state), so it painted over them; the bars'
groups now carry a z-index. The old section finishes fading before the new
one starts. audit:nav gains phone frame checks for both.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```
