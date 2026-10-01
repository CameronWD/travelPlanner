# Share light-only, Sign-in links via Resend, Welcome layering — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the Welcome dialog painting under the Travels map card's overlays, lock every Share link page to light mode until its dark pass is done, and add a second way in beside Google — a one-use Sign-in link emailed through Resend, admitted by the same ADR 0057 door.

**Architecture:** Three independent parts on one branch. (1) Stacking-context containment: the map cards get `isolate` so their internal `z-[500]` overlays stop leaking above the dialog layer's `z-50`. (2) The share page copies the Landing's forced-light marker (`data-theme="light"` + `light` class), and `RouteMap` gains a `theme` override prop because it picks tiles from the theme hook, not CSS. (3) Auth.js's built-in Resend provider is registered beside Google only when `AUTH_RESEND_KEY` and `AUTH_RESEND_FROM` are set; the `signIn` callback becomes provider-aware (the verified-profile check is Google-only; the link is the proof for the email provider) and still runs before any mail is sent; the Landing's Sign in panel gains an email field with neutral copy for every address.

**Tech Stack:** Next.js (App Router, read `node_modules/next/dist/docs/` before touching routes), React 19, Tailwind v4, Auth.js `next-auth@5.0.0-beta.32` + `@auth/prisma-adapter`, Prisma, Vitest + Testing Library (jsdom), Leaflet (mocked in tests via `@/test/leaflet-mock`).

**Spec:** `docs/specs/2026-10-01-share-light-email-signin-welcome-layering.md` — read it first; the plan argues from it.

## Global Constraints

- Branch `feat/share-light-only-and-email-signin-2026-10-01`. Never commit to `main`; never deploy; never run `npm run feedback:pull`/`resolve`/`accept` (they touch production).
- Every task ends green: `npm test` (vitest, `TZ=UTC`), `npx tsc --noEmit`, `npm run lint`. Run `npm run build` once at the end of the plan (Task 8 step 7).
- Commit messages end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_01UhCw1TgvPBhudwQrp5tiTh` (the attribution lines given to the session).
- Env var names, exact: `AUTH_RESEND_KEY`, `AUTH_RESEND_FROM`. Provider id, exact: `"resend"` (Auth.js's own). Sending domain for the docs: `teepee.camxanhq.com`; from-address example: `Teepee <signin@teepee.camxanhq.com>`.
- Copy, exact: sent state "If that address is on the list, a link is on its way. Check your inbox."; closing line "Apple sign-in is on the way."; email subject "Sign in to Teepee"; expired-link title "That link didn't work"; expired-link line "Sign-in links work once and expire after a day. Ask for a new one below."
- The Sign in panel never reveals whether an address is on the list: the sent state is identical for an accepted and a refused address (AccessDenied).
- No new npm dependency. Resend is called through `fetch` from the provider's `sendVerificationRequest`, as `@auth/core/providers/resend.js` does.
- Terminology from `CONTEXT.md`: **Sign-in link** (not "magic link" in user-facing copy or new comments), Traveller, Access request, Landing, Share link.
- `next dev` re-adds a block to `/work/CLAUDE.md`; never commit that change.

## Review Focus

Spec-implied inputs no task's tests would otherwise exercise, most likely to bite first; each has its pinning test added to the owning task below.

1. **An address typed with capitals or surrounding spaces** ("  Cam@Example.COM ") must be admitted if "cam@example.com" is allowlisted and must create one account, not two — Task 5 pins that the callback's predicates receive the lowercased, trimmed address for the `resend` provider.
2. **A refused address must produce no email and no token**, not just a refused session — Task 5 pins that for provider `resend` with an unlisted address the callback returns `false` (Auth.js's `sendToken` sends only after a truthy return) and records an Access request with `name: null, image: null`.
3. **The email provider shows up without Google** (Google creds absent, Resend present): the panel must show the field alone, with no dangling "or" divider and no "No sign-in method is configured" note — Task 7 pins it.
4. **A reused or expired link** lands on `/?error=Verification`; the Landing must open the panel with the expired-link copy instead of silently showing the hero — Task 6 pins it (and that `AccessDenied` still wins when both are somehow present).
5. **The share map must stay light when the visitor's theme flips while the page is open** (the theme hook re-renders the map): the `theme="light"` override must win on the flip, not only on first build — Task 2 pins that `setUrl` is never called with the dark tile URL.

---

### Task 1: Welcome dialog paints above the map cards (spec §C)

**Files:**
- Modify: `components/trips/travels-map-card.tsx:80-84` (the `card` class list)
- Modify: `components/plan/plan-mini-map.tsx:38` (the tile wrapper `div`)
- Modify: `app/globals.css:17-30` (the Leaflet stacking-context comment)
- Test: `components/trips/travels-map-card.test.tsx`, `components/plan/plan-mini-map.test.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing other tasks rely on.

**Why:** `components/ui/dialog.tsx:49,125` put the overlay and content at `z-50`. `app/globals.css` isolates `.leaflet-container`, but the Travels card's own overlays (`travels-map-card.tsx:94,134,153,160,165`) and the Plan mini-map's (`plan-mini-map.tsx:41,47`) use `z-[500]` *outside* that container, and their wrappers have no stacking context, so 500 beats 50 at the page root. `isolate` on the wrapper keeps the 500s inside the card.

- [ ] **Step 1: Write the failing tests**

Append to `components/trips/travels-map-card.test.tsx` inside `describe("TravelsMapCard", …)`:

```tsx
  it("isolates its stacking context so its z-[500] overlays stay under a z-50 dialog (spec 2026-10-01 §C)", () => {
    const { unmount } = render(<TravelsMapCard trips={trips} variant="desktop" />);
    const desktopCard = screen.getByText("Your travels").closest("section")!;
    expect(desktopCard.className).toMatch(/(^|\s)isolate(\s|$)/);
    expect(desktopCard.className).toMatch(/(^|\s)relative(\s|$)/);
    unmount();
    render(<TravelsMapCard trips={trips} variant="mobile" />);
    const mobileCard = screen.getByRole("link", { name: /Globe/ });
    expect(mobileCard.className).toMatch(/(^|\s)isolate(\s|$)/);
  });
```

Append to `components/plan/plan-mini-map.test.tsx` inside `describe("PlanMiniMap", …)`:

```tsx
  it("isolates the tile's stacking context so the Open map button stays under dialogs (spec 2026-10-01 §C)", () => {
    const { container } = renderMiniMap();
    const tile = container.querySelector("div.relative")!;
    expect(tile.className).toMatch(/(^|\s)isolate(\s|$)/);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- components/trips/travels-map-card.test.tsx components/plan/plan-mini-map.test.tsx`
Expected: the two new tests FAIL on the `isolate` assertion; all others pass.

- [ ] **Step 3: Add `isolate` to both wrappers**

In `components/trips/travels-map-card.tsx` change the `card` class list:

```tsx
  const card = cn(
    // `isolate`: the chips, Globe pill and attribution below sit at z-[500]
    // to clear Leaflet's panes; without a stacking context on the card that
    // 500 leaks into the page root and paints over the z-50 dialog layer
    // (the Welcome dialog on /trips — spec 2026-10-01 §C).
    "relative isolate overflow-hidden border-2 border-border bg-map-fill",
    mobile ? "h-[190px] rounded-[22px] shadow-hard-2" : "h-full min-h-0 rounded-[24px] shadow-hard-3",
    className,
  );
```

In `components/plan/plan-mini-map.tsx` change the tile wrapper:

```tsx
      {/* `isolate`: the z-[500] overlays below must not leak above the z-50 dialog layer (spec 2026-10-01 §C). */}
      <div className="relative isolate h-[210px] overflow-hidden rounded-[22px] border-2 border-border shadow-hard-4">
```

- [ ] **Step 4: Extend the globals.css comment**

In `app/globals.css`, replace the sentence `Applies to all maps (globe, wishlist, route, day) via Leaflet's shared .leaflet-container class.` with:

```
   Applies to all maps (globe, wishlist, route, day) via Leaflet's shared
   .leaflet-container class. It does NOT cover overlays a card draws
   *outside* the container to sit above the map (chips, pills, attribution
   at z-[500]): any wrapper that holds such overlays must carry `isolate`
   itself — components/trips/travels-map-card.tsx and
   components/plan/plan-mini-map.tsx do (spec 2026-10-01 §C).
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -- components/trips/travels-map-card.test.tsx components/plan/plan-mini-map.test.tsx`
Expected: PASS.

- [ ] **Step 6: Lint, typecheck, commit**

Run: `npm run lint && npx tsc --noEmit`
Expected: exit 0.

```bash
git add components/trips/travels-map-card.tsx components/trips/travels-map-card.test.tsx components/plan/plan-mini-map.tsx components/plan/plan-mini-map.test.tsx app/globals.css
git commit -m "fix(maps): isolate map card stacking so z-[500] overlays stay under dialogs

The Travels card's chips, Globe pill and attribution (and the Plan mini-map's
Open map button) sit at z-[500] to clear Leaflet's panes; with no stacking
context on the card that leaked above the z-50 Welcome dialog (spec 2026-10-01 §C).

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UhCw1TgvPBhudwQrp5tiTh"
```

---

### Task 2: `RouteMap` accepts a `theme` override (spec §A)

**Files:**
- Modify: `components/trip/route-map.tsx:48-75` (props), `:255-256` (theme read)
- Test: `components/trip/route-map.test.tsx`

**Interfaces:**
- Produces: `RouteMapProps.theme?: "light" | "dark"` — when given, wins over `useTheme()` for tiles, pins and legs, on first build and on every later flip. `RouteMapLoader` (`components/trip/route-map-loader.tsx`) is generic over `RouteMapProps`, so it passes the new prop through with no change. Task 3 passes `theme="light"`.

- [ ] **Step 1: Write the failing tests**

Add to `components/trip/route-map.test.tsx` inside `describe("RouteMap theme handling", …)`:

```tsx
  it("a theme=\"light\" override builds with the light tiles even in dark mode (spec 2026-10-01 §A)", async () => {
    hoisted.theme = "dark";
    render(<RouteMap stops={STOPS} theme="light" />);
    await waitFor(() => expect(hoisted.leaflet!.maps).toHaveLength(1));
    expect(hoisted.leaflet!.tileLayers[0].url).toBe(cartoTiles(false).url);
  });

  it("a theme=\"light\" override holds when the app theme flips while mounted (Review Focus 5)", async () => {
    const { rerender } = render(<RouteMap stops={STOPS} theme="light" />);
    await waitFor(() => expect(hoisted.leaflet!.maps).toHaveLength(1));
    hoisted.theme = "dark";
    rerender(<RouteMap stops={STOPS} theme="light" />);
    // Give the setUrl effect a tick to run if it were going to.
    await new Promise((r) => setTimeout(r, 0));
    expect(hoisted.leaflet!.tileLayers[0].setUrl).not.toHaveBeenCalledWith(cartoTiles(true).url);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- components/trip/route-map.test.tsx`
Expected: the first new test FAILS (dark URL built); the second FAILS or passes incidentally — the first is the gate.

- [ ] **Step 3: Add the prop and use it**

In `components/trip/route-map.tsx`, add to `RouteMapProps` (after `frameClassName`'s doc/field):

```ts
  /**
   * Pin the map to one theme regardless of the app's. The Share page is
   * light-only until its dark pass is done (spec 2026-10-01 §A); without
   * this the page's CSS goes light but the tiles and pins — chosen here
   * from useTheme(), not from CSS — would still render dark.
   */
  theme?: "light" | "dark";
```

Change the function signature to destructure `theme` and the theme read:

```ts
export function RouteMap({ stops, height = 360, home = null, showReturn = false, aspect, onStopClick, progress, frameClassName, theme }: RouteMapProps) {
```

```ts
  const { theme: appTheme } = useTheme();
  const isDark = (theme ?? appTheme) === "dark";
```

Nothing else changes: every tile/pin/leg colour already derives from `isDark`, and the setUrl effect depends on `isDark`, so a pinned theme never flips.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- components/trip/route-map.test.tsx`
Expected: PASS, including the existing theme-flip tests.

- [ ] **Step 5: Lint, typecheck, commit**

Run: `npm run lint && npx tsc --noEmit`

```bash
git add components/trip/route-map.tsx components/trip/route-map.test.tsx
git commit -m "feat(route-map): theme prop pins tiles and pins to one theme

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UhCw1TgvPBhudwQrp5tiTh"
```

---

### Task 3: Share link pages are light-only (spec §A)

**Files:**
- Modify: `app/share/[token]/page.tsx:1-2` (imports), `:54-59` (exports), `:512-518` (RouteMap call), `:545` (root div)
- Modify: `app/share/[token]/not-found.tsx:15`
- Test: `app/share/[token]/page.test.tsx`, `app/share/[token]/not-found.test.tsx`

**Interfaces:**
- Consumes: `RouteMapProps.theme` from Task 2.

**Background:** The Landing's pattern is `app/landing/landing.tsx:37` — `<main data-theme="light" className="light …">`. `app/globals.css:15` defines the `dark:` variant to exclude `[data-theme="light"]` subtrees, and `:93` re-declares the light tokens under `[data-theme="light"]`. The share page has no layout of its own and no portalled dialogs (grep for `DialogContent|PopoverContent|Portal` under `app/share/[token]/*.tsx` finds none — state this in the task output). `app/layout.tsx:26-32` keys the viewport `themeColor` on `prefers-color-scheme`; a page may export its own `viewport` object (`node_modules/next/dist/docs/01-app/03-api-reference/04-functions/generate-viewport.md`: "export a `viewport` object from a `layout.jsx` or `page.jsx` file"; a `metadata` object and a `viewport` object may coexist — only `viewport` + `generateViewport` in one segment is forbidden). `not-found.tsx` cannot export viewport; it keeps the root's, which is an accepted gap.

- [ ] **Step 1: Write the failing tests**

In `app/share/[token]/page.test.tsx`, add a new `describe` at the end of the file (reuse the file's `renderPage()` helper and `beforeEach` mocks):

```tsx
describe("Share page is light-only (spec 2026-10-01 §A)", () => {
  it("forces light on its root the way the Landing does", async () => {
    const { container } = await renderPage();
    const root = container.firstElementChild as HTMLElement;
    expect(root).toHaveAttribute("data-theme", "light");
    expect(root.className).toMatch(/(^|\s)light(\s|$)/);
  });
  it("pins the route map to the light tiles", async () => {
    await renderPage();
    const props = JSON.parse(screen.getByTestId("route-map").getAttribute("data-props")!);
    expect(props.theme).toBe("light");
  });
  it("pins the phone address-bar colour to the light ground", async () => {
    const mod = await import("./page");
    expect(mod.viewport).toEqual({ themeColor: "#FFFBF3" });
  });
});
```

If `renderPage()` in the fixture renders a stage with no map section, use the file's `renderStage(...)` helper with a stage whose sections include `"map"` (read `lib/share-view.ts` `shareSections` to pick one — "before" includes it) for the second test.

In `app/share/[token]/not-found.test.tsx` add:

```tsx
  it("forces light mode on its root (spec 2026-10-01 §A)", () => {
    const { container } = render(<ShareNotFound />);
    const root = container.firstElementChild as HTMLElement;
    expect(root).toHaveAttribute("data-theme", "light");
    expect(root.className).toMatch(/(^|\s)light(\s|$)/);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- 'app/share/[token]/page.test.tsx' 'app/share/[token]/not-found.test.tsx'`
Expected: the four new tests FAIL.

- [ ] **Step 3: Implement**

`app/share/[token]/page.tsx`:

Change the `Metadata` import line to `import type { Metadata, Viewport } from "next";` and add after the `metadata` export:

```ts
// Light-only until the share page has had its own dark pass (spec 2026-10-01
// §A): the root below forces the light tokens, the map is pinned light, and
// this keeps a dark-mode phone's address bar from showing a dark strip over
// a light page (the root layout keys themeColor on prefers-color-scheme).
export const viewport: Viewport = { themeColor: "#FFFBF3" };
```

Change the RouteMap call to add `theme="light"`:

```tsx
            <RouteMap
              stops={mapStops}
              home={homeMapPoint(trip)}
              showReturn={trip.roundTrip ?? false}
              progress={stage === "during" ? { stage, currentStopId } : { stage }}
              frameClassName={cn("rounded-3xl shadow-hard-4 lg:h-[400px]", stage === "during" ? "h-[180px]" : "h-[200px]")}
              theme="light"
            />
```

Change the root:

```tsx
    // Always light (spec 2026-10-01 §A): same marker as the Landing —
    // globals.css re-declares the light tokens under [data-theme="light"]
    // and excludes the subtree from the `dark:` variant.
    <div data-theme="light" className="light min-h-screen bg-background">
```

`app/share/[token]/not-found.tsx`:

```tsx
    <div data-theme="light" className="light flex min-h-screen flex-col bg-background">
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- 'app/share/[token]/'`
Expected: PASS (including `share-style-bans.test.ts`, `share-motion.test.ts`, `share-chrome.test.tsx`).

- [ ] **Step 5: Lint, typecheck, commit**

Run: `npm run lint && npx tsc --noEmit`

```bash
git add 'app/share/[token]/page.tsx' 'app/share/[token]/page.test.tsx' 'app/share/[token]/not-found.tsx' 'app/share/[token]/not-found.test.tsx'
git commit -m "feat(share): light-only share pages until the dark pass is done

Root carries the Landing's forced-light marker, the route map is pinned
light via its new theme prop, and the page sets a light themeColor
(spec 2026-10-01 §A).

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UhCw1TgvPBhudwQrp5tiTh"
```

---

### Task 4: The Sign-in link email renderer (spec §B4)

**Files:**
- Create: `lib/sign-in-email.ts`
- Test: `lib/sign-in-email.test.ts`

**Interfaces:**
- Produces: `renderSignInEmail({ url }: { url: string }): { subject: string; html: string; text: string }` — pure, no I/O. Task 5 calls it from the provider's `sendVerificationRequest`.

- [ ] **Step 1: Write the failing test**

`lib/sign-in-email.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { renderSignInEmail } from "./sign-in-email";

const URL = "https://teepee.camxanhq.com/api/auth/callback/resend?callbackUrl=%2Ftrips&token=abc&email=cam%40example.com";

describe("renderSignInEmail (spec 2026-10-01 §B4)", () => {
  it("subject names Teepee, not the host", () => {
    expect(renderSignInEmail({ url: URL }).subject).toBe("Sign in to Teepee");
  });
  it("carries the link in both parts — as a button and as raw text in the HTML, and bare in the text part", () => {
    const { html, text } = renderSignInEmail({ url: URL });
    const escaped = URL.replace(/&/g, "&amp;");
    expect(html).toContain(`href="${escaped}"`);
    expect(html).toContain(`>${escaped}<`);
    expect(text).toContain(URL);
  });
  it("says the link works once and expires in 24 hours, and can be ignored", () => {
    const { html, text } = renderSignInEmail({ url: URL });
    for (const part of [html, text]) {
      expect(part).toMatch(/works once/);
      expect(part).toMatch(/24 hours/);
      expect(part).toMatch(/ignore this email/);
    }
  });
  it("escapes HTML in the url and never calls it a magic link", () => {
    const { html, text } = renderSignInEmail({ url: 'https://x.test/?a=1&b="<x>' });
    expect(html).not.toContain('"<x>');
    expect(html).toContain("&quot;&lt;x&gt;");
    expect(`${html}${text}`).not.toMatch(/magic/i);
  });
  it("has no images", () => {
    expect(renderSignInEmail({ url: URL }).html).not.toMatch(/<img/i);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- lib/sign-in-email.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`lib/sign-in-email.ts`:

```ts
/**
 * The Sign-in link email (spec 2026-10-01 §B4; CONTEXT.md "Sign-in link").
 * Minimal and branded: one line, one button, the raw link for clients that
 * strip buttons, and the once/24-hours/ignore footer. Pure — the send
 * happens in lib/auth.ts's provider. Cam restyles this later; keep it
 * table-free and image-free so it reads everywhere.
 */
const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

export function renderSignInEmail({ url }: { url: string }): { subject: string; html: string; text: string } {
  const href = escapeHtml(url);
  const subject = "Sign in to Teepee";
  const footer = "This link works once and expires in 24 hours. If you didn't ask for it, you can ignore this email.";
  const text = [
    "Here's your sign-in link for Teepee.",
    "",
    url,
    "",
    footer,
  ].join("\n");
  const html = `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:32px 16px;background:#FFFBF3;color:#211F1B;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <div style="max-width:480px;margin:0 auto;">
      <p style="margin:0 0 16px;font-size:22px;font-weight:800;">Teepee</p>
      <p style="margin:0 0 20px;font-size:16px;line-height:1.5;">Here's your sign-in link for Teepee.</p>
      <p style="margin:0 0 24px;">
        <a href="${href}" style="display:inline-block;padding:14px 22px;border:2px solid #211F1B;border-radius:12px;background:#211F1B;color:#FFFBF3;font-size:16px;font-weight:700;text-decoration:none;">Sign in</a>
      </p>
      <p style="margin:0 0 8px;font-size:13px;line-height:1.5;color:#5c5852;">If the button doesn't work, copy this link into your browser:</p>
      <p style="margin:0 0 24px;font-size:13px;line-height:1.5;word-break:break-all;"><a href="${href}" style="color:#211F1B;">${href}</a></p>
      <p style="margin:0;font-size:13px;line-height:1.5;color:#5c5852;">${escapeHtml(footer)}</p>
    </div>
  </body>
</html>`;
  return { subject, html, text };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- lib/sign-in-email.test.ts`
Expected: PASS.

- [ ] **Step 5: Lint, typecheck, commit**

Run: `npm run lint && npx tsc --noEmit`

```bash
git add lib/sign-in-email.ts lib/sign-in-email.test.ts
git commit -m "feat(auth): minimal branded Sign-in link email renderer

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UhCw1TgvPBhudwQrp5tiTh"
```

---

### Task 5: Resend provider behind the one door (spec §B1, §B2)

**Files:**
- Modify: `lib/auth.ts:1-10` (imports), `:26-33` (Google), after `:33` (Resend), `:87-142` (callback)
- Modify: `lib/auth.test.ts` (gate tests)
- Create: `lib/auth-sign-in-link.test.ts` (provider registration tests, same pattern as `lib/auth-dev-login.test.ts`)

**Interfaces:**
- Consumes: `renderSignInEmail` from Task 4.
- Produces: provider id `"resend"` registered iff `AUTH_RESEND_KEY && AUTH_RESEND_FROM`; Google gets `allowDangerousEmailAccountLinking: true`. Task 7's client calls `signIn("resend", { email, callbackUrl, redirect: false })`.

**How Auth.js drives this (verified in `node_modules/@auth/core/lib/actions/signin/send-token.js`):** on the POST, it lowercases/trims the address (`defaultNormalizer`), looks up or stubs a user, then calls `callbacks.signIn({ user, account: { provider: "resend", type: "email", providerAccountId: email, userId }, email: { verificationRequest: true } })` — **no `profile`**. Only a truthy return proceeds to mint the token and call `sendVerificationRequest`; a falsy return throws `AccessDenied` (→ `pages.error` = `/?error=AccessDenied`). On the link click (`lib/actions/callback/index.js`, `provider.type === "email"`) it verifies the token (a reused/expired one throws `Verification` → `/?error=Verification`) and calls `callbacks.signIn` again, still with no profile.

- [ ] **Step 1: Write the failing gate tests**

Append to `lib/auth.test.ts` inside `describe("signIn callback", …)`:

```ts
  // ── Sign-in link (provider "resend"), spec 2026-10-01 §B2 ──
  // Auth.js's sendToken calls this callback BEFORE minting a token or sending
  // mail, with no `profile` (send-token.js). The link is the proof of
  // ownership, so the Google-only verified-profile check must not apply.
  it("admits an allowlisted address for the resend provider with no profile (the link is the proof)", async () => {
    process.env.ALLOWED_EMAILS = "cam@example.com";
    await expect(
      signInCallback({
        user: { id: "u1", email: "cam@example.com", emailVerified: null },
        account: { provider: "resend", type: "email", providerAccountId: "cam@example.com" },
        email: { verificationRequest: true },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any),
    ).resolves.toBe(true);
    expect(recordAccessRequestMock).not.toHaveBeenCalled();
  });

  it("refuses an unlisted address for the resend provider BEFORE any mail — and records the Access request without a name or avatar (Review Focus 2)", async () => {
    process.env.ALLOWED_EMAILS = "";
    allowedEmailFindUniqueMock.mockResolvedValue(null);
    inviteFindFirstMock.mockResolvedValue(null);
    await expect(
      signInCallback({
        user: { id: "u1", email: "stranger@example.com", emailVerified: null },
        account: { provider: "resend", type: "email", providerAccountId: "stranger@example.com" },
        email: { verificationRequest: true },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any),
    ).resolves.toBe(false);
    expect(recordAccessRequestMock).toHaveBeenCalledWith({ email: "stranger@example.com", name: null, image: null });
  });

  it("passes the resend address to the predicates lowercased and trimmed (Review Focus 1)", async () => {
    process.env.ALLOWED_EMAILS = "cam@example.com";
    await expect(
      signInCallback({
        user: { id: "u1", email: "  Cam@Example.COM ", emailVerified: null },
        account: { provider: "resend", type: "email", providerAccountId: "cam@example.com" },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any),
    ).resolves.toBe(true);
  });

  it("still refuses a Google sign-in whose profile email is not verified (the Google-only check stays)", async () => {
    process.env.ALLOWED_EMAILS = "cam@example.com";
    await expect(
      signInCallback({
        user: { email: "cam@example.com" },
        account: { provider: "google" },
        profile: { email_verified: false },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any),
    ).resolves.toBe(false);
  });
```

Check first whether a test equivalent to the last one already exists in the file (`grep -n "email_verified: false" lib/auth.test.ts`); if it does, skip adding it.

Create `lib/auth-sign-in-link.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@auth/prisma-adapter", () => ({ PrismaAdapter: () => ({}) }));
vi.mock("@/lib/invites", () => ({ acceptPendingInvitesForUser: vi.fn() }));
// See lib/auth-dev-login.test.ts for why NextAuth itself is mocked.
vi.mock("next-auth", () => ({ default: vi.fn(() => ({})) }));

type Provider = { id?: string; options?: Record<string, unknown> & { id?: string }; from?: string };

async function loadProviders(env: Record<string, string | undefined>): Promise<Provider[]> {
  vi.resetModules();
  const prev = { ...process.env };
  for (const k of ["AUTH_RESEND_KEY", "AUTH_RESEND_FROM", "AUTH_GOOGLE_ID", "AUTH_GOOGLE_SECRET"]) delete process.env[k];
  Object.assign(process.env, env);
  try {
    const mod = await import("@/lib/auth");
    return mod.authConfig.providers.filter((p): p is Provider => typeof p !== "function") as Provider[];
  } finally {
    process.env = prev;
  }
}
const idOf = (p: Provider) => p.options?.id ?? p.id;

describe("Sign-in link provider registration (spec 2026-10-01 §B1)", () => {
  afterEach(() => vi.resetModules());

  it("registers resend only when BOTH AUTH_RESEND_KEY and AUTH_RESEND_FROM are set", async () => {
    expect((await loadProviders({ AUTH_RESEND_KEY: "re_x", AUTH_RESEND_FROM: "Teepee <signin@teepee.camxanhq.com>" })).map(idOf)).toContain("resend");
    expect((await loadProviders({ AUTH_RESEND_KEY: "re_x" })).map(idOf)).not.toContain("resend");
    expect((await loadProviders({ AUTH_RESEND_FROM: "Teepee <signin@teepee.camxanhq.com>" })).map(idOf)).not.toContain("resend");
    expect((await loadProviders({})).map(idOf)).not.toContain("resend");
  });

  it("sends from AUTH_RESEND_FROM with our own subject and body, through Resend's HTTP API", async () => {
    const providers = await loadProviders({ AUTH_RESEND_KEY: "re_x", AUTH_RESEND_FROM: "Teepee <signin@teepee.camxanhq.com>" });
    const resend = providers.find((p) => idOf(p) === "resend")!;
    expect(resend.options?.from).toBe("Teepee <signin@teepee.camxanhq.com>");
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => "" });
    vi.stubGlobal("fetch", fetchMock);
    try {
      const send = resend.options!.sendVerificationRequest as (p: Record<string, unknown>) => Promise<void>;
      await send({
        identifier: "cam@example.com",
        url: "https://teepee.camxanhq.com/api/auth/callback/resend?token=t&email=cam%40example.com",
        provider: { apiKey: "re_x", from: "Teepee <signin@teepee.camxanhq.com>" },
      });
    } finally {
      vi.unstubAllGlobals();
    }
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.headers.Authorization).toBe("Bearer re_x");
    const body = JSON.parse(init.body);
    expect(body.from).toBe("Teepee <signin@teepee.camxanhq.com>");
    expect(body.to).toBe("cam@example.com");
    expect(body.subject).toBe("Sign in to Teepee");
    expect(body.html).toContain("Sign in");
    expect(body.text).toContain("https://teepee.camxanhq.com/api/auth/callback/resend");
  });

  it("throws when Resend refuses, so Auth.js reports EmailSignin instead of claiming a send", async () => {
    const providers = await loadProviders({ AUTH_RESEND_KEY: "re_x", AUTH_RESEND_FROM: "Teepee <signin@teepee.camxanhq.com>" });
    const resend = providers.find((p) => idOf(p) === "resend")!;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 403, text: async () => '{"message":"domain not verified"}' }));
    try {
      const send = resend.options!.sendVerificationRequest as (p: Record<string, unknown>) => Promise<void>;
      await expect(send({ identifier: "cam@example.com", url: "https://x/cb", provider: { apiKey: "re_x", from: "f" } })).rejects.toThrow(/Resend/);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("Google allows linking onto a link-first account by email (spec §B2)", async () => {
    const providers = await loadProviders({ AUTH_GOOGLE_ID: "id", AUTH_GOOGLE_SECRET: "s" });
    const google = providers.find((p) => idOf(p) === "google")!;
    expect(google.options?.allowDangerousEmailAccountLinking).toBe(true);
  });
});
```

Note on shape: the installed `@auth/core` provider factories return `{ id, ..., options: config }` — our overrides (`from`, `sendVerificationRequest`, `allowDangerousEmailAccountLinking`) live under `.options` until `NextAuth()` normalises them, and `NextAuth()` is mocked here. That is why the tests read `.options`. If `resend.options.from` comes back undefined, read the factory in `node_modules/@auth/core/providers/resend.js` and adjust the assertion to where the override actually lands; do not weaken it to "defined".

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- lib/auth.test.ts lib/auth-sign-in-link.test.ts`
Expected: the resend gate tests FAIL (callback returns false because `profile` is undefined); the registration tests FAIL (no resend provider; Google has no linking flag).

- [ ] **Step 3: Implement in `lib/auth.ts`**

Imports (add):

```ts
import Resend from "next-auth/providers/resend";
import { renderSignInEmail } from "@/lib/sign-in-email";
```

Google block becomes:

```ts
if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) {
  providers.push(
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
      // A Traveller who first came in by Sign-in link and later presses the
      // Google button must land in the same account, not on Auth.js's
      // "account not linked" error. Auth.js calls this dangerous because a
      // provider that doesn't verify emails could hijack an account by
      // address; the gate below refuses any Google profile whose email is
      // not verified, so here it is safe (spec 2026-10-01 §B2, ADR 0057).
      allowDangerousEmailAccountLinking: true,
    }),
  );
}

// Sign-in link (CONTEXT.md; spec 2026-10-01 §B1): Auth.js's Resend provider,
// registered only when both the key and the from-address are set — the same
// shape as Google's gate above, so a deploy without them simply has no email
// field. The from-address must be on a domain verified at Resend
// (docs/DEPLOY.md §3b). sendVerificationRequest is ours so the mail says
// "Teepee", not the host; it is the only place this app sends email.
if (process.env.AUTH_RESEND_KEY && process.env.AUTH_RESEND_FROM) {
  providers.push(
    Resend({
      apiKey: process.env.AUTH_RESEND_KEY,
      from: process.env.AUTH_RESEND_FROM,
      async sendVerificationRequest({ identifier, url, provider }) {
        const { subject, html, text } = renderSignInEmail({ url });
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${provider.apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from: provider.from, to: identifier, subject, html, text }),
        });
        if (!res.ok) throw new Error(`Resend error ${res.status}: ${await res.text()}`);
      },
    }),
  );
}
```

Callback: replace lines 98-105 (`const email = user.email;` through the `email_verified` check) with:

```ts
      // Every write path must lowercase (ADR 0057 §"email normalisation").
      // Auth.js's email flow already normalises the address (send-token.js
      // defaultNormalizer); Google's profile email is lowercase in practice.
      // Normalise here anyway so the predicates below never see a variant.
      const email = user.email?.trim().toLowerCase();
      if (!email) return false;

      if (account?.provider === "resend") {
        // Sign-in link (spec 2026-10-01 §B2). Auth.js runs this callback
        // BEFORE it mints a token or sends mail, with no `profile`: a
        // refusal here means no email is ever sent. The link itself — only
        // ever delivered to this address — is the proof of ownership, so
        // the Google-only verified-profile check below does not apply.
      } else if (profile?.email_verified !== true) {
        // Fail-closed by construction: every OTHER provider — today Google,
        // but any future OAuth one too — must present a verified email
        // rather than being trusted by default. Auth.js's own guidance for
        // this callback is to enforce verification rather than assume it.
        return false;
      }
```

Leave the rest of the callback as is (`isAllowedEmail(email)`, the Invite clause, `recordAccessRequest({ email, name: profile?.name ?? null, image: profile?.picture ?? null })` — with no profile those are `null`, which is what the test asserts).

Update the file's header doc comment list to add: `*   - Resend (Sign-in link) only when AUTH_RESEND_KEY + AUTH_RESEND_FROM are set.`

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- lib/auth.test.ts lib/auth-sign-in-link.test.ts lib/auth-dev-login.test.ts`
Expected: PASS. If `next-auth/providers/resend` fails to resolve under vitest, check `vitest.config.*` aliases for how `next-auth/providers/google` resolves and mirror it; do not mock the provider away.

- [ ] **Step 5: Lint, typecheck, commit**

Run: `npm run lint && npx tsc --noEmit`

```bash
git add lib/auth.ts lib/auth.test.ts lib/auth-sign-in-link.test.ts
git commit -m "feat(auth): Sign-in link via Auth.js Resend provider behind the ADR 0057 door

Resend registers only with AUTH_RESEND_KEY + AUTH_RESEND_FROM. The signIn
callback is provider-aware: the verified-profile check is Google-only; the
email provider is admitted by the same allowlist-or-Trip-Invite predicates,
which run before any mail is sent. Google allows email account linking so a
link-first Traveller can use the Google button (spec 2026-10-01 §B1-B2).

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UhCw1TgvPBhudwQrp5tiTh"
```

---

### Task 6: The Landing handles a spent or expired link (spec §B3, Review Focus 4)

**Files:**
- Modify: `app/landing/access-denied.ts` (add `isLinkExpired`)
- Modify: `app/landing/sign-in-panel.tsx:26-46` (new mode + copy), `:50-61` (no change in logic)
- Modify: `app/landing/landing.tsx:28-40` (new prop)
- Modify: `app/page.tsx:46`
- Test: `app/landing/access-denied.test.ts`, `app/landing/sign-in-panel.test.tsx`, `app/landing/landing.test.tsx`

**Interfaces:**
- Produces: `Mode` gains `"link-expired"`; `Landing` gains `linkExpired?: boolean`; `isLinkExpired(error)` true iff the `error` query is `"Verification"` (Auth.js's name for a bad/used/expired email token, `@auth/core/errors`). Precedence on load: `denied` > `link-expired` > `initialPanel`.

- [ ] **Step 1: Write the failing tests**

`app/landing/access-denied.test.ts` — add (match the file's existing style):

```ts
import { isLinkExpired } from "./access-denied";

describe("isLinkExpired", () => {
  it("is true only for Auth.js's Verification error (a spent or expired Sign-in link)", () => {
    expect(isLinkExpired("Verification")).toBe(true);
    expect(isLinkExpired(["x", "Verification"])).toBe(true);
    expect(isLinkExpired("AccessDenied")).toBe(false);
    expect(isLinkExpired(undefined)).toBe(false);
  });
});
```

`app/landing/sign-in-panel.test.tsx` — add inside the describe:

```tsx
  it("initialMode 'link-expired' opens with the expired-link copy and the controls (spec 2026-10-01 §B3)", () => {
    render(
      <SignInPanelProvider initialMode="link-expired" controls={<button type="button">Continue with Google</button>}>
        <LandingActions size="lg" />
      </SignInPanelProvider>,
    );
    const dialog = screen.getByRole("dialog", { name: "That link didn't work" });
    expect(within(dialog).getByText("Sign-in links work once and expire after a day. Ask for a new one below.")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Continue with Google" })).toBeInTheDocument();
  });
```

`app/landing/landing.test.tsx` — add inside the describe:

```tsx
  it("linkExpired opens the panel in link-expired mode; accessDenied still wins when both are set (Review Focus 4)", () => {
    const { unmount } = render(<Landing linkExpired />);
    expect(screen.getByRole("dialog", { name: "That link didn't work" })).toBeInTheDocument();
    unmount();
    render(<Landing linkExpired accessDenied />);
    expect(screen.getByRole("dialog", { name: "Teepee is in testing." })).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- app/landing/access-denied.test.ts app/landing/sign-in-panel.test.tsx app/landing/landing.test.tsx`
Expected: FAIL (missing export, unknown mode, missing prop).

- [ ] **Step 3: Implement**

`app/landing/access-denied.ts` — append:

```ts
/** A Sign-in link that was already used, expired, or tampered with comes
 * back as `/?error=Verification` (Auth.js's `Verification` error from the
 * email callback). Open the panel so the Traveller can ask for a fresh one
 * instead of landing on a silent hero (spec 2026-10-01 §B3). */
export function isLinkExpired(error: string | string[] | undefined): boolean {
  return Array.isArray(error) ? error.includes("Verification") : error === "Verification";
}
```

`app/landing/sign-in-panel.tsx`:

```ts
type Mode = "sign-in" | "request" | "denied" | "link-expired";
```

Add to `COPY` after `denied`:

```ts
  // A spent or expired Sign-in link (`/?error=Verification`). Says nothing
  // about whether the address is on the list — the same controls let them
  // ask again (spec 2026-10-01 §B3).
  "link-expired": {
    title: "That link didn't work",
    line: "Sign-in links work once and expire after a day. Ask for a new one below.",
  },
```

Update the component doc comment's "A refused sign-in redirects…" paragraph to add one sentence: `A spent or expired Sign-in link comes back as "/?error=Verification" and opens the panel in "link-expired" mode the same way.`

`app/landing/landing.tsx`:

```tsx
export function Landing({
  accessDenied = false,
  linkExpired = false,
  initialPanel,
  callbackUrl,
}: {
  accessDenied?: boolean;
  /** `/?error=Verification`: a spent or expired Sign-in link (spec 2026-10-01 §B3). */
  linkExpired?: boolean;
  initialPanel?: "sign-in" | "request";
  callbackUrl?: string | null;
}) {
```

and

```tsx
        initialMode={accessDenied ? "denied" : linkExpired ? "link-expired" : initialPanel}
```

`app/page.tsx`:

```tsx
import { isAccessDenied, isLinkExpired } from "./landing/access-denied";
…
  return (
    <Landing
      accessDenied={isAccessDenied(error)}
      linkExpired={isLinkExpired(error)}
      initialPanel={panelFromParam(panel)}
      callbackUrl={next}
    />
  );
```

Also update the `app/page.tsx` doc comment: after the "A refused Google sign-in comes back here…" sentence add `A spent or expired Sign-in link comes back as "/?error=Verification" and opens it in link-expired mode.` And update `isAccessDenied`'s comment "every other error is ignored" to "every other error except Verification (below) is ignored".

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- app/landing app/page.test.tsx`
Expected: PASS (if `app/page.test.tsx` exists and asserts the Landing's props, update its expectation to include `linkExpired: false`).

- [ ] **Step 5: Lint, typecheck, commit**

Run: `npm run lint && npx tsc --noEmit`

```bash
git add app/landing/access-denied.ts app/landing/access-denied.test.ts app/landing/sign-in-panel.tsx app/landing/sign-in-panel.test.tsx app/landing/landing.tsx app/landing/landing.test.tsx app/page.tsx
git commit -m "feat(landing): a spent or expired Sign-in link opens the panel to ask again

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UhCw1TgvPBhudwQrp5tiTh"
```

---

### Task 7: The email field in the Sign in panel (spec §B3)

**Files:**
- Create: `app/landing/email-sign-in.tsx`
- Create: `app/landing/email-sign-in.test.tsx`
- Modify: `app/landing/sign-in-controls.tsx`
- Modify: `app/landing/sign-in-controls.test.tsx`, `app/landing/landing.test.tsx`
- Modify: `app/landing/sign-in-panel.tsx:28-36` (two copy lines)

**Interfaces:**
- Consumes: provider id `"resend"` (Task 5). `signIn` from `next-auth/react` with `redirect: false` returns `{ error?: string; ok: boolean; status: number; url: string | null }` (verified in `node_modules/next-auth/react.js`): a refused address comes back as `error: "AccessDenied"` (Auth.js's `pages.error` URL), a successful send as `error: undefined`, a Resend failure as `error: "EmailSignin"`, and a missing provider or offline network as a thrown error / a page redirect.
- Produces: `EmailSignInForm({ callbackUrl }: { callbackUrl: string })` client component.

**Copy rules:** the sent state is identical for `error: undefined` and `error: "AccessDenied"`. Any other error, or a throw, shows the generic failure line "Couldn't send the link just now. Try again in a minute." and keeps the address in the field.

- [ ] **Step 1: Write the failing component test**

`app/landing/email-sign-in.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EmailSignInForm } from "./email-sign-in";

const signInMock = vi.hoisted(() => vi.fn());
vi.mock("next-auth/react", () => ({ signIn: signInMock }));

const SENT = "If that address is on the list, a link is on its way. Check your inbox.";

beforeEach(() => signInMock.mockReset());

async function submit(email = "cam@example.com") {
  await userEvent.type(screen.getByRole("textbox", { name: "Email" }), email);
  await userEvent.click(screen.getByRole("button", { name: "Send me a link" }));
}

describe("EmailSignInForm (spec 2026-10-01 §B3)", () => {
  it("is a real form with a required email input and a submit button", () => {
    const { container } = render(<EmailSignInForm callbackUrl="/trips" />);
    const input = screen.getByRole("textbox", { name: "Email" });
    expect(input).toHaveAttribute("type", "email");
    expect(input).toBeRequired();
    expect(input).toHaveAttribute("autocomplete", "email");
    expect(container.querySelector("form")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Send me a link" })).toHaveAttribute("type", "submit");
  });

  it("asks Auth.js for a resend link without redirecting, carrying the callbackUrl", async () => {
    signInMock.mockResolvedValue({ error: undefined, ok: true, status: 200, url: "/api/auth/verify-request" });
    render(<EmailSignInForm callbackUrl="/trips/new?fromShare=tok" />);
    await submit("cam@example.com");
    expect(signInMock).toHaveBeenCalledWith("resend", { email: "cam@example.com", callbackUrl: "/trips/new?fromShare=tok", redirect: false });
  });

  it("shows the neutral sent copy after a successful send", async () => {
    signInMock.mockResolvedValue({ error: undefined, ok: true, status: 200, url: "/api/auth/verify-request" });
    render(<EmailSignInForm callbackUrl="/trips" />);
    await submit();
    expect(await screen.findByText(SENT)).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("shows the SAME neutral copy when the address was refused (never an oracle of who is on the list)", async () => {
    signInMock.mockResolvedValue({ error: "AccessDenied", ok: true, status: 200, url: null });
    render(<EmailSignInForm callbackUrl="/trips" />);
    await submit("stranger@example.com");
    expect(await screen.findByText(SENT)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/not on the list|isn't on the list|refused|denied/i);
  });

  it("'Use a different address' returns to an empty field", async () => {
    signInMock.mockResolvedValue({ error: undefined, ok: true, status: 200, url: "/x" });
    render(<EmailSignInForm callbackUrl="/trips" />);
    await submit();
    await userEvent.click(await screen.findByRole("button", { name: "Use a different address" }));
    expect(screen.getByRole("textbox", { name: "Email" })).toHaveValue("");
  });

  it("a configuration failure (Resend refused) shows the generic failure line and keeps the address", async () => {
    signInMock.mockResolvedValue({ error: "EmailSignin", ok: false, status: 500, url: null });
    render(<EmailSignInForm callbackUrl="/trips" />);
    await submit();
    expect(await screen.findByText("Couldn't send the link just now. Try again in a minute.")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Email" })).toHaveValue("cam@example.com");
    expect(screen.queryByText(SENT)).toBeNull();
  });

  it("a thrown signIn (offline) shows the generic failure line", async () => {
    signInMock.mockRejectedValue(new Error("Failed to fetch"));
    render(<EmailSignInForm callbackUrl="/trips" />);
    await submit();
    expect(await screen.findByText("Couldn't send the link just now. Try again in a minute.")).toBeInTheDocument();
  });

  it("disables the button while sending so a double tap sends one link", async () => {
    let resolve!: (v: unknown) => void;
    signInMock.mockReturnValue(new Promise((r) => (resolve = r)));
    render(<EmailSignInForm callbackUrl="/trips" />);
    await submit();
    await waitFor(() => expect(screen.getByRole("button", { name: /Sending/ })).toBeDisabled());
    resolve({ error: undefined, ok: true, status: 200, url: "/x" });
    expect(await screen.findByText(SENT)).toBeInTheDocument();
    expect(signInMock).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- app/landing/email-sign-in.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `app/landing/email-sign-in.tsx`**

Read `components/ui/button.tsx` for the `loading` prop (it sets `aria-busy` and `disabled`, and shows a spinner) and `components/ui/input.tsx` / `components/ui/label.tsx` before writing. If `Button`'s `loading` does not disable the button, pass `disabled` explicitly as below.

```tsx
"use client";

import { useId, useState, type FormEvent } from "react";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * The Sign-in link field (CONTEXT.md "Sign-in link"; spec 2026-10-01 §B3).
 * Posts the address to Auth.js's Resend provider without leaving the page.
 * The gate (lib/auth.ts signIn callback, ADR 0057) runs before any mail is
 * sent, and Auth.js reports a refusal as `error: "AccessDenied"` — which
 * this form shows EXACTLY like a success, so the panel never says who is on
 * the list. Only a configuration failure (Resend refused, offline) shows
 * the generic failure line.
 */
const SENT = "If that address is on the list, a link is on its way. Check your inbox.";
const FAILED = "Couldn't send the link just now. Try again in a minute.";

type Status = "idle" | "sending" | "sent" | "failed";

export function EmailSignInForm({ callbackUrl }: { callbackUrl: string }) {
  const id = useId();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (status === "sending") return;
    setStatus("sending");
    try {
      const res = await signIn("resend", { email, callbackUrl, redirect: false });
      // undefined error: the link went out. AccessDenied: the gate refused
      // it before any mail — same words, by design. Anything else is ours
      // to own (bad key, unverified domain, network).
      const neutral = !res || !res.error || res.error === "AccessDenied";
      setStatus(neutral ? "sent" : "failed");
    } catch {
      setStatus("failed");
    }
  }

  if (status === "sent") {
    return (
      <div className="flex flex-col gap-3" role="status">
        <p className="text-sm font-semibold leading-snug">{SENT}</p>
        <Button
          type="button"
          variant="secondary"
          size="md"
          className="w-full"
          onClick={() => {
            setEmail("");
            setStatus("idle");
          }}
        >
          Use a different address
        </Button>
      </div>
    );
  }

  const sending = status === "sending";
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2" noValidate={false}>
      <Label htmlFor={`${id}-email`}>Email</Label>
      <Input
        id={`${id}-email`}
        type="email"
        name="email"
        required
        autoComplete="email"
        inputMode="email"
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        invalid={status === "failed"}
        aria-describedby={status === "failed" ? `${id}-error` : undefined}
      />
      {status === "failed" && (
        <p id={`${id}-error`} className="text-[13px] font-medium text-destructive">
          {FAILED}
        </p>
      )}
      <Button type="submit" variant="outline" size="lg" className="w-full" loading={sending} disabled={sending}>
        {sending ? "Sending…" : "Send me a link"}
      </Button>
    </form>
  );
}
```

Check `Button`'s accessible name while `loading` (the spinner may add text); the test matches `/Sending/`. If `text-destructive` is not a token in `app/globals.css`, use the class the kit uses for field errors (grep `components/ui/field.tsx` for its error paragraph class) instead.

- [ ] **Step 4: Run the component test to verify it passes**

Run: `npm test -- app/landing/email-sign-in.test.tsx`
Expected: PASS.

- [ ] **Step 5: Write the failing controls/landing tests**

In `app/landing/sign-in-controls.test.tsx`:

1. In `beforeEach`, also `delete process.env.AUTH_RESEND_KEY; delete process.env.AUTH_RESEND_FROM;`.
2. Change the two `"Email and Apple sign-in are on the way."` expectations to `"Apple sign-in is on the way."`.
3. Rename the test `"never renders an input, a form, or a disabled placeholder control"` to `"without the Sign-in link configured: no input, no form, no disabled placeholder"` (body unchanged).
4. Add:

```tsx
  it("with the Sign-in link configured beside Google: Google, a dotted 'or', then the email form (spec 2026-10-01 §B3)", () => {
    process.env.AUTH_GOOGLE_ID = "id"; process.env.AUTH_GOOGLE_SECRET = "s";
    process.env.AUTH_RESEND_KEY = "re_x"; process.env.AUTH_RESEND_FROM = "Teepee <signin@teepee.camxanhq.com>";
    const { container } = render(<SignInControls callbackUrl="/trips/new?fromShare=tok" />);
    const google = screen.getByRole("button", { name: "Continue with Google" });
    const field = screen.getByRole("textbox", { name: "Email" });
    expect(google.compareDocumentPosition(field) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getAllByText("or")).toHaveLength(1);
    expect(container.querySelector("form")).not.toBeNull();
    expect(screen.getByText("Apple sign-in is on the way.")).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/Email and Apple/);
  });
  it("Sign-in link without Google: the email form alone, no 'or', no fallback note (Review Focus 3)", () => {
    process.env.AUTH_RESEND_KEY = "re_x"; process.env.AUTH_RESEND_FROM = "Teepee <signin@teepee.camxanhq.com>";
    render(<SignInControls />);
    expect(screen.getByRole("textbox", { name: "Email" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Continue with Google" })).toBeNull();
    expect(screen.queryByText("or")).toBeNull();
    expect(screen.queryByText(/No sign-in method is configured yet/)).toBeNull();
  });
  it("the Sign-in link needs BOTH env vars — the key alone shows nothing", () => {
    process.env.AUTH_GOOGLE_ID = "id"; process.env.AUTH_GOOGLE_SECRET = "s";
    process.env.AUTH_RESEND_KEY = "re_x";
    render(<SignInControls />);
    expect(screen.queryByRole("textbox")).toBeNull();
  });
  it("the email form submits to the resend provider carrying the callbackUrl", async () => {
    process.env.AUTH_RESEND_KEY = "re_x"; process.env.AUTH_RESEND_FROM = "Teepee <signin@teepee.camxanhq.com>";
    signInMock.mockResolvedValue({ error: undefined, ok: true, status: 200, url: "/x" });
    render(<SignInControls callbackUrl="/trips/new?fromShare=tok" />);
    await userEvent.type(screen.getByRole("textbox", { name: "Email" }), "cam@example.com");
    await userEvent.click(screen.getByRole("button", { name: "Send me a link" }));
    expect(signInMock).toHaveBeenCalledWith("resend", { email: "cam@example.com", callbackUrl: "/trips/new?fromShare=tok", redirect: false });
  });
  it("dev login + Google + Sign-in link: one 'or' between Google and the rest, dev buttons last", () => {
    process.env.AUTH_GOOGLE_ID = "id"; process.env.AUTH_GOOGLE_SECRET = "s"; process.env.ALLOW_DEV_LOGIN = "true";
    process.env.AUTH_RESEND_KEY = "re_x"; process.env.AUTH_RESEND_FROM = "f";
    render(<SignInControls />);
    expect(screen.getAllByText("or")).toHaveLength(1);
    const field = screen.getByRole("textbox", { name: "Email" });
    const dev = screen.getByRole("button", { name: "Continue as You" });
    expect(field.compareDocumentPosition(dev) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
```

In `app/landing/landing.test.tsx`: in `beforeEach` also `delete process.env.AUTH_RESEND_KEY; delete process.env.AUTH_RESEND_FROM;`; rename `"has no invite form, no email field, no 'No passwords' line"` to `"without the Sign-in link configured: no invite form, no email field, no 'No passwords' line"`; and add:

```tsx
  it("with the Sign-in link configured, the Sign in panel holds the email field in both modes (spec 2026-10-01 §B3)", async () => {
    process.env.AUTH_RESEND_KEY = "re_x"; process.env.AUTH_RESEND_FROM = "f";
    render(<Landing />);
    await userEvent.click(within(desktop()).getByRole("button", { name: "Sign in" }));
    expect(within(screen.getByRole("dialog")).getByRole("textbox", { name: "Email" })).toBeInTheDocument();
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Close" }));
    await userEvent.click(within(desktop()).getByRole("button", { name: "Become a tester" }));
    expect(within(screen.getByRole("dialog", { name: "Want to test it?" })).getByRole("textbox", { name: "Email" })).toBeInTheDocument();
  });
```

- [ ] **Step 6: Run to verify they fail**

Run: `npm test -- app/landing/sign-in-controls.test.tsx app/landing/landing.test.tsx`
Expected: the new and renamed-copy tests FAIL.

- [ ] **Step 7: Implement `app/landing/sign-in-controls.tsx`**

Replace the file body with:

```tsx
import { GoogleSignInButton, DevSignInButton } from "./signin-buttons";
import { EmailSignInForm } from "./email-sign-in";

/**
 * The working sign-in controls, shared by every mode of the Sign in panel —
 * the Landing's only sign-in surface (spec 2026-09-29 D4). Honest by
 * design: Google, the Sign-in link field when Resend is configured (spec
 * 2026-10-01 §B3), dev logins in development, and one line saying what is
 * still on the way — no disabled placeholders. The surrounding copy (invite
 * line, access-denied text) is each surface's own.
 *
 * Each method is gated on its own env — the same shape as lib/auth.ts, so a
 * deploy without the Resend vars shows no field and nothing else changes.
 */
function Divider() {
  return (
    <div className="my-1.5 flex items-center gap-2 text-[13px] font-medium text-muted-foreground">
      <span className="flex-1 border-t-2 border-dotted border-border-soft" />
      or
      <span className="flex-1 border-t-2 border-dotted border-border-soft" />
    </div>
  );
}

export function SignInControls({
  google = "outline",
  googleClassName,
  afterGoogle,
  callbackUrl,
}: {
  google?: "outline" | "secondary";
  googleClassName?: string;
  afterGoogle?: React.ReactNode;
  callbackUrl?: string;
}) {
  const devLogin = process.env.ALLOW_DEV_LOGIN === "true";
  const googleConfigured = Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);
  const emailConfigured = Boolean(process.env.AUTH_RESEND_KEY && process.env.AUTH_RESEND_FROM);
  const anyConfigured = googleConfigured || emailConfigured || devLogin;

  return (
    <div className="flex flex-col gap-3">
      {googleConfigured && <GoogleSignInButton variant={google} className={googleClassName} callbackUrl={callbackUrl} />}

      {!anyConfigured && (
        <p className="text-center text-sm text-muted-foreground">
          No sign-in method is configured yet. Add Google OAuth credentials or Resend sign-in link credentials (or enable dev login in development) to continue.
        </p>
      )}

      {afterGoogle}

      {/* One divider after Google, before whatever follows it. */}
      {googleConfigured && (emailConfigured || devLogin) && <Divider />}

      {emailConfigured && <EmailSignInForm callbackUrl={callbackUrl ?? "/trips"} />}

      {devLogin && (
        <>
          <DevSignInButton email="you@example.com" label="You" callbackUrl={callbackUrl} />
          <DevSignInButton email="partner@example.com" label="Partner" callbackUrl={callbackUrl} />
        </>
      )}

      <p className="text-center text-[13px] font-medium text-muted-foreground">
        Apple sign-in is on the way.
      </p>
    </div>
  );
}
```

Check the existing test `"in development: a dotted 'or' divider…"` still finds `screen.getByText("or")` with the parent containing `span.border-dotted` — the `Divider` keeps the same markup.

- [ ] **Step 8: Update the panel's mode copy** (`app/landing/sign-in-panel.tsx` `COPY`), since the Google-only wording is now wrong when the field shows. The copy must read correctly whether or not the field is configured, so it names the method generically:

```ts
  "sign-in": {
    title: "Come on in",
    line: "Teepee is in testing. Sign in with the account you were invited with.",
  },
  request: {
    title: "Want to test it?",
    line: "Teepee is in testing and the door is by invitation. Sign in and we'll pass your name to the admin. Nothing else to fill in.",
  },
```

Update the two matching expectations in `app/landing/sign-in-panel.test.tsx` (the strings at `it("Sign in opens 'Come on in'…")` and `it("Become a tester opens 'Want to test it?'…")`). Leave the `denied` line verbatim — it is pinned by a test and by the 2026-09-26 I2 decision ("Your Google account isn't on the list…" still reads true for the Google path; a refused *link* never reaches denied mode because the form shows the neutral sent state instead).

- [ ] **Step 9: Run the Landing suite to verify it passes**

Run: `npm test -- app/landing`
Expected: PASS.

- [ ] **Step 10: Lint, typecheck, full test run, commit**

Run: `npm run lint && npx tsc --noEmit && npm test`
Expected: all green.

```bash
git add app/landing/email-sign-in.tsx app/landing/email-sign-in.test.tsx app/landing/sign-in-controls.tsx app/landing/sign-in-controls.test.tsx app/landing/sign-in-panel.tsx app/landing/sign-in-panel.test.tsx app/landing/landing.test.tsx
git commit -m "feat(landing): Sign-in link field under Google with neutral sent copy

The field appears only when AUTH_RESEND_KEY + AUTH_RESEND_FROM are set, in
both panel modes. A refused address shows the same words as an accepted
one, so the panel never reveals who is on the list (spec 2026-10-01 §B3).

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UhCw1TgvPBhudwQrp5tiTh"
```

---

### Task 8: Docs, env, privacy page, ADR 0057 amendment, follow-ups, build (spec §A follow-up, §B5)

**Files:**
- Modify: `.env.example:13-23`
- Modify: `docs/DEPLOY.md` (new §3b; §4 env table; §6)
- Modify: `app/privacy/page.tsx:85-93, 158-161` and `app/privacy/page.test.tsx`
- Modify: `docs/adr/0057-one-door-sign-in-allowlist.md` (append amendment)
- Modify: `docs/open-follow-ups.md` (LK-02, LS-01, new section)
- Modify: `docs/specs/2026-10-01-share-light-email-signin-welcome-layering.md:3` (status)

- [ ] **Step 1: Write the failing privacy test**

In `app/privacy/page.test.tsx` add (match the file's existing render helper — see `it("renders the privacy page without a session")`):

```tsx
  it("discloses the Sign-in link path: the typed address, one email, a token that expires in a day (spec 2026-10-01 §B5)", async () => {
    await renderPrivacy();
    expect(screen.getByText(/Sign-in link/)).toBeInTheDocument();
    expect(document.body.textContent).toMatch(/one email/i);
    expect(document.body.textContent).toMatch(/expires after a day|expires in 24 hours/i);
    expect(document.body.textContent).not.toMatch(/Google sign-in only/);
  });
```

(Use whatever the file's render helper is actually called; read the first test.)

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- app/privacy/page.test.tsx`
Expected: the new test FAILS on "Google sign-in only".

- [ ] **Step 3: Privacy page**

`app/privacy/page.tsx` lines 85-93 — replace the first `<li>` with:

```tsx
          <li>
            <span className="font-bold">
              Your sign-in details.
            </span>{" "}
            With Google sign-in, Teepee receives your name, email address and
            avatar image from Google, and stores the OAuth tokens Google
            issues for your session (the access token, refresh token, ID
            token, the granted scope, and a session token identifying your
            browser). With a Sign-in link, Teepee stores the email address
            you typed, sends one email to it through Resend, and keeps a
            one-use sign-in token that expires after a day; the account it
            creates holds only that address.
          </li>
```

Lines 158-161 — change `if you sign in with Google and your address is not on the invite list, sign-in is refused, and that refusal itself is recorded — your name, email, avatar, and how many times you've tried, exactly as Google's sign-in flow supplies them` to `if you sign in — with Google or by asking for a Sign-in link — and your address is not on the invite list, sign-in is refused (no link is sent), and that refusal itself is recorded — your email, how many times you've tried, and, from Google, your name and avatar`. Keep `&apos;` entities as the file does.

Also add Resend to the third-parties list where Google/Open-Meteo/Frankfurter are named (grep `Frankfurter` in the file): one `<li>` — `<span className="font-bold">Resend</span> — sends the Sign-in link email; it sees the address the email goes to and the link inside it.` Then extend the existing third-parties test (`it("names the third parties data is shared with")`) to expect `/Resend/`.

Run: `npm test -- app/privacy/page.test.tsx` — PASS.

- [ ] **Step 4: `.env.example` and `docs/DEPLOY.md`**

`.env.example` — after the Google block (line 15) add:

```
# Sign-in link via Resend (optional; the email field appears only when BOTH are set).
# AUTH_RESEND_FROM must be on a domain verified at resend.com (docs/DEPLOY.md §3b).
# AUTH_RESEND_KEY="re_xxxxxxxx"
# AUTH_RESEND_FROM="Teepee <signin@teepee.camxanhq.com>"
```

and after `ADMIN_EMAILS=""` add:

```
# Comma-separated sign-in allowlist (ADR 0057). Addresses here — plus the AllowedEmail table — may sign in.
ALLOWED_EMAILS=""
```

`docs/DEPLOY.md` — insert a new section between §3 (Google OAuth) and §4 (Vercel):

```markdown
## 3b. Resend (Sign-in links) — free, optional

The email field on the Landing appears only when both env vars below are set
(`lib/auth.ts`, spec 2026-10-01 §B1). Until then Google is the only door and
nothing else changes, so this can be done after the deploy.

1. Create an account at resend.com.
2. **Domains → Add domain:** `teepee.camxanhq.com` (a subdomain, so Teepee's
   mail reputation stays off the root domain). Resend shows DNS records
   (SPF/MX on `send.teepee…`, a DKIM TXT, optionally DMARC); add them where
   the domain's DNS lives. They sit on their own sub-labels and do not
   collide with the record that points the host at Vercel. Wait for
   "Verified".
3. **API Keys → Create:** sending access only; copy it once.
4. Vercel → Project → Settings → Environment Variables (Production):
   | Name | Value |
   |---|---|
   | `AUTH_RESEND_KEY` | the API key |
   | `AUTH_RESEND_FROM` | `Teepee <signin@teepee.camxanhq.com>` |
5. Redeploy (env changes need a new deployment). The Sign in panel now shows
   the email field. Test with an allowlisted address: the mail should arrive
   from `signin@teepee.camxanhq.com` with subject "Sign in to Teepee".

The sent copy is identical for an address that is and is not on the list; a
refused address gets no email and shows up as an Access request in Admin.
When Teepee moves to its own domain: verify that domain, change
`AUTH_RESEND_FROM`, redeploy — no code changes.
```

In the §4 env table add two rows after `AUTH_GOOGLE_SECRET`:

```
   | `AUTH_RESEND_KEY` | optional — from step 3b |
   | `AUTH_RESEND_FROM` | optional — `Teepee <signin@teepee.camxanhq.com>` (step 3b) |
```

In §6 "First sign-in", change step 3 to: `3. Your partner signs in with that email — Google, or a Sign-in link if §3b is set up — and is auto-added.`

Grep `docs/DEPLOY.md` and `docs/` for `no email provider`/`no mail` and update any sentence that is now false (the sitrep at `docs/architecture-sitrep-2026-09-22.md:1256` is a dated snapshot — leave it, it says what was true then).

- [ ] **Step 5: ADR 0057 amendment**

Append to `docs/adr/0057-one-door-sign-in-allowlist.md`:

```markdown
## Amendment — 2026-10-01 (`feat/share-light-only-and-email-signin-2026-10-01`, spec 2026-10-01 §B2)

**A second method, the same door.** Auth.js's Resend provider (id `resend`)
is registered beside Google when `AUTH_RESEND_KEY` and `AUTH_RESEND_FROM`
are set. Nothing about *who* may sign in changes; *how* gains the
**Sign-in link** (CONTEXT.md).

**The verified-profile check is Google-only.** The callback's
`profile?.email_verified !== true → false` was written as "every provider
must present a verified email". An email provider has no profile: Auth.js
runs this callback from `sendToken` with `{ user, account: { provider:
"resend", type: "email" }, email: { verificationRequest: true } }` and no
`profile`, so the unamended check refused every Sign-in link. The check now
applies to every provider **except** `resend`; for `resend` the link
itself — only ever delivered to that address — is the proof of ownership.
A future OAuth provider still inherits the verified-profile check.

**Refuse before send.** Because the callback runs *before* the token is
minted and the mail is sent, a refused address gets no token and no email,
and is recorded as an Access request (with no name or avatar, since there is
no profile) exactly as a refused Google sign-in is. The Landing's sent copy
is the same for an accepted and a refused address, so the field is not an
oracle of the allowlist (the same rule as the denied panel).

**Email account linking is on for Google.** `allowDangerousEmailAccountLinking:
true` lets a link-first Traveller later use the Google button and land in
the same account. The flag is "dangerous" only when a provider could assert
an unverified email; this gate refuses any Google profile whose email is not
verified, so here it is safe. Google-first-then-link needs nothing.

**A spent or expired link** comes back as `/?error=Verification` and opens
the Landing's panel in link-expired mode (`app/landing/access-denied.ts`).
```

- [ ] **Step 6: Follow-ups and spec status**

`docs/open-follow-ups.md`:

- LK-02: change to `- **LK-02 · Apple sign-in.** The panel says it is on the way. Email landed 2026-10-01 (spec 2026-10-01-share-light-email-signin-welcome-layering §B); `app/landing/sign-in-controls.tsx` is still the one place to add Apple and drop the line.`
- LS-01: prefix the bold title with `~~` … `~~` is not this file's style — instead append one sentence at the end of the LS-01 entry: `**Done 2026-10-01** on `feat/share-light-only-and-email-signin-2026-10-01` (spec 2026-10-01-share-light-email-signin-welcome-layering §B); the operator steps are `docs/DEPLOY.md` §3b.`
- Append a new section at the end of the file:

```markdown
## 2026-10-01 · Share light-only, Sign-in links, Welcome layering (spec 2026-10-01-share-light-email-signin-welcome-layering)

- **SL-01 · Dark pass on the Share page, then drop the light lock.** The dark
  share page did not look right, so `app/share/[token]/page.tsx` and
  `not-found.tsx` force light (`data-theme="light"` + `light`), the page sets
  a light `viewport.themeColor`, and the route map is pinned with
  `theme="light"` (§A). When the dark design is done: remove those four
  things and their tests (`page.test.tsx` "Share page is light-only",
  `not-found.test.tsx` "forces light mode"). `not-found` keeps the root's
  OS-keyed address-bar colour (not-found files cannot export viewport) — a
  dark phone shows a dark bar over a light not-found page; accepted for now.
- **SL-02 · Restyle the Sign-in link email.** `lib/sign-in-email.ts` is the
  minimal branded version (one line, one button, raw link, footer). Cam
  wants it to pop more; the design-kit `emails/magic-link` template in
  `design_handoff/` is the reference. Keep `renderSignInEmail`'s signature
  and tests.
- **SL-03 · First real send is on production.** No dev sender was built (Cam's
  call: only he uses it). After `docs/DEPLOY.md` §3b: request a link for an
  allowlisted address (mail from `signin@teepee.camxanhq.com`, lands on the
  callbackUrl), click the same link twice (second opens the panel in
  link-expired mode), try an unlisted address (no mail; an Access request in
  Admin), then sign a link-first account in with Google (same Traveller).
- **SL-04 · Rate limiting on the email endpoint.** Auth.js adds none. Sends
  are bounded by the gate (a refused address never triggers a send), so the
  exposure is an allowlisted address being spammed with links. Resend's free
  tier caps daily volume. Revisit if testers grow.
```

Spec file line 3: change `**Status:** agreed in the 2026-10-01 (second) interview, awaiting Cam's "go".` to `**Status:** built on the branch (plan docs/superpowers/plans/2026-10-01-share-light-email-signin-welcome-layering.md); awaiting merge and deploy.`

- [ ] **Step 7: Full verification and build**

Run: `npm run lint && npx tsc --noEmit && npm test && npm run build`
Expected: all exit 0. The build may rewrite the Next.js block in `/work/CLAUDE.md` — do not stage it (`git checkout -- CLAUDE.md` if it changed).

- [ ] **Step 8: Commit**

```bash
git add .env.example docs/DEPLOY.md app/privacy/page.tsx app/privacy/page.test.tsx docs/adr/0057-one-door-sign-in-allowlist.md docs/open-follow-ups.md docs/specs/2026-10-01-share-light-email-signin-welcome-layering.md
git commit -m "docs: Resend setup, privacy disclosure, ADR 0057 amendment, follow-ups for the Sign-in link and share light lock

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UhCw1TgvPBhudwQrp5tiTh"
```

---

## Self-review (done while writing)

- **Spec coverage.** §A → Tasks 2, 3 (+ SL-01 in Task 8). §B1 → Task 5 + Task 8 env/DEPLOY. §B2 → Task 5 + ADR amendment (Task 8). §B3 → Tasks 6, 7. §B4 → Task 4. §B5 → Task 8. §C → Task 1. Out-of-scope items are not planned.
- **Placeholders.** None: every code step carries its code; every test its assertions.
- **Type consistency.** `RouteMapProps.theme?: "light" | "dark"` (Task 2) is what Task 3 passes. `renderSignInEmail({ url })` → `{ subject, html, text }` (Task 4) is what Task 5 calls. `Mode` gains `"link-expired"` (Task 6) and `Landing.linkExpired` is wired in `app/page.tsx`. `EmailSignInForm({ callbackUrl: string })` (Task 7) is what `SignInControls` renders with `callbackUrl ?? "/trips"`. The client call shape `signIn("resend", { email, callbackUrl, redirect: false })` is identical in the component test and the controls test.
- **Review Focus → tests.** 1 → Task 5 "lowercased and trimmed". 2 → Task 5 "refuses … BEFORE any mail". 3 → Task 7 "Sign-in link without Google". 4 → Task 6 landing test. 5 → Task 2 "holds when the app theme flips".
