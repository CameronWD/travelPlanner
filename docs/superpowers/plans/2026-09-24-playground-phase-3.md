# Playground Phase 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the 17 remaining Teepee screens to the Playground kit (strict visual, no new features) and ship the default OG image.

**Architecture:** Five sub-branches cut from the umbrella `feat/playground-phase-3` (itself cut from `beta`), each merged back into the umbrella when its gates pass. Screens are restyled by porting the kit's visual treatment onto our existing data/actions using `components/ui/*` primitives and token classes; the handoff's drop-in files are merged into ours (never pasted over them). Fidelity is proven by screenshots of our page against the kit's rendered screen.

**Tech Stack:** Next.js (this repo's version — read `node_modules/next/dist/docs/` before using any Next API), React Server Components, Tailwind v4 tokens (`app/globals.css`), `class-variance-authority`, lucide-react, Vitest + Testing Library (jsdom), Playwright (global install at `/usr/local/lib/node_modules`, used via `NODE_PATH`), `next/og` (Satori).

**Spec:** `docs/specs/2026-09-24-playground-phase-3.md`. Background rules/traps: `docs/follow-ups/2026-09-24-playground-phase-3-handover.md`. Read both.

## Global Constraints

- All work on the current sub-branch. **Never** commit to, merge into, rebase onto, or push `main` or `beta`. Never push anything. Never deploy.
- Never run `npm run feedback:pull` or `npm run feedback:resolve`.
- Strict visual match to the kit; **no new features** — anything the kit shows that we lack becomes an entry in `docs/follow-ups/2026-09-24-playground-phase-3-gaps.md`, not code. Things we have that the kit lacks: keep, styled with the nearest kit pattern.
- Copy: kit copy by default; ours wins where more accurate about behaviour — money is a **shared pot** (never splitting/per-person), and the not-found wording must **never reveal that a trip exists**.
- Emoji used as illustration → kit treatment (`ErrorPanel` art or lucide via `components/ui/icon.tsx`). Emoji in user content untouched.
- Tests pinned to old copy are updated in the same commit, visibly; never deleted or weakened to pass.
- Tailwind v4 token classes only. No inline `style={{}}` objects and no new hex, except the named exemptions: `app/globals.css`, `lib/map-palette.ts`, `lib/map-pins.ts`, `components/ui/logo.tsx`, `components/ui/progress-bar.tsx` (computed width), `app/global-error.tsx` (inline styles, **no raw hex**), `lib/og-card.tsx` (inline styles + hex pinned to tokens by test).
- Server Components stay Server Components (don't add `"use client"` to a file that doesn't have it; split a small client child instead).
- Motion via `tp-*` utilities or `motion` with `ease: [0.2, 0.8, 0.2, 1]`, honouring `useReducedMotion()`.
- 3px focus ring, ≥44px touch targets, `aria-current` on nav, accessible labels on icon-only buttons, body text ≥4.5:1 in both themes.
- Accent colours used as text on neutral surfaces use `-text` tokens (`text-hue-sky-text`, `text-coral-text`), never the fill token. Hue = identity, status = state (`--destructive`/`--success`/`--warning`).
- Do not change `lib/chapter-colours.ts` stored values (persisted in the DB).
- Keep `@source not "../design_handoff";` in `app/globals.css`.
- Hex comments in `globals.css` are rounded — never compute from them; convert the HSL triple.
- Grep with anchored patterns (`text-hue-leaf\b(?!-)`), not substrings.
- `next dev` rewrites a block in `CLAUDE.md`: never `git add CLAUDE.md`; stage files by name.
- Gates after every task: `npx tsc --noEmit && npm run lint && npm test && npm run build`. All must pass.
- Commit trailer on every commit: `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`

## Review Focus

- **Dark mode on every restyled surface** — a class that looks right in light (e.g. a fill used as text) collapses in dark; each screen task captures dark screenshots at all four widths and the sub-branch ends with `npm run audit:contrast` PASS.
- **Long/empty user data** — very long trip names, zero trips, zero wishlist items, no activity: kit screens show a happy path. Each screen task screenshots the seeded trip *and* checks the empty state renders with `EmptyState`/kit empty treatment (test pins the empty branch).
- **Wide screens (1440/1920)** — the kit is drawn at 1280; each screen task runs the wide-screen checklist (spec § Fidelity gate).
- **Behaviour lost when merging drop-ins** — handoff drop-ins were written against an older snapshot; every drop-in task diffs props/actions/guards and keeps ours (tests pin the preserved behaviour: admin guard, bell mark-all-read, not-found non-disclosure).
- **Keyboard/touch on restyled controls** — focus ring and 44px targets on every new button/link; each screen task's test asserts accessible names on icon-only buttons it touches.

---

## Shared procedure: Screen restyle (used by every task marked **[screen]**)

Every [screen] task follows these steps. The task lists the specifics (files, kit reference, copy, tests).

**Tooling (created in Task 1):** `$SHOTS = /tmp/claude-1000/-work/d1df79d0-8151-4bc8-94d7-c2d488315894/scratchpad/shots.cjs`. Screenshots go to `$SP/shots/<task>/` (`$SP` = the scratchpad dir). Needs the dev server on :3000 (`curl -s -o /dev/null localhost:3000 || (cd /work && npm run dev > $SP/dev.log 2>&1 &)`) and `/tmp/auth.json` (if missing or expired, run `NODE_PATH=/usr/local/lib/node_modules node $SP/login.cjs`). Fixtures: trip `cmueo582d00b0q1lo9lf5taru`, share token `014b029f-d13b-4e09-8648-5aef72f8c702`.

- [ ] **S1: Capture "before" + kit reference**
  ```bash
  NODE_PATH=/usr/local/lib/node_modules node $SHOTS app  --route "<route>" --out $SP/shots/<task>/before
  NODE_PATH=/usr/local/lib/node_modules node $SHOTS kit  --screen "<Kit chip label>" --out $SP/shots/<task>/kit
  ```
  Read the kit PNGs and the kit JSX named in the task. Note every visual element: surface (Card tone/shadow/radius), heading type, chips, icons, spacing, empty state.
- [ ] **S2: Write/adjust the failing test** — in the task's test file, pin the structural outcome of the restyle (kit copy on headings/empty states, primitive in use, accessible names), plus any preserved behaviour named in the task. Run `npx vitest run <file>`; expect FAIL on the new assertions.
- [ ] **S3: Restyle** — port the kit's visual treatment onto our existing component tree using `components/ui/*` primitives (`Card`, `Button`, `Chip`, `Badge`, `ListRow`, `EmptyState`, `StatCard`, `Segmented`, `Icon`, `ErrorPanel`, skeletons) and token classes. Keep all props, data fetching, server actions, guards and routes unchanged. Replace old-shape classes (`rounded-lg|xl border border-border`, 1px borders, raw palette like `stone-*`/`slate-*`) with the kit shape (2px `border-border`, hard shadow, kit radii). For anything the kit shows that we don't have → add a gaps-log entry (format below), don't build it.
- [ ] **S4: Run the test** — `npx vitest run <file>`; expect PASS.
- [ ] **S5: Capture "after" and compare**
  ```bash
  NODE_PATH=/usr/local/lib/node_modules node $SHOTS app --route "<route>" --out $SP/shots/<task>/after
  ```
  Compare `after/*-390-*` with `kit/*-mobile-*` and `after/*-1280-*` with `kit/*-desktop-*`, both themes. Every difference must be (a) a logged gap or (b) our-only content; otherwise fix it. Run the wide-screen checklist on `after/*-1440-*` and `*-1920-*`: nothing stretches edge to edge that shouldn't; text lines stay readable (≲80ch); grids/cards don't balloon or leave odd gaps; rail and content stay aligned; background fills the viewport. Put a short list of the screenshots and any residual differences in your report.
- [ ] **S6: Gates** — `npx tsc --noEmit && npm run lint && npm test && npm run build`.
- [ ] **S7: Commit** — stage files by name (never `CLAUDE.md`):
  ```bash
  git add <files> docs/follow-ups/2026-09-24-playground-phase-3-gaps.md
  git commit -m "feat(reskin): <screen> to the Playground kit

  Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
  ```

**Gaps-log entry format** (append under the task's sub-branch section):
```markdown
- **<Kit file> — <screen/element>.** Kit shows: <what>. We have: <what>. Not built because: <new feature | needs a data model | product decision>.
```

## Shared procedure: Close a sub-branch (end of each group)

- [ ] **C1:** `npm run audit:contrast` (dev server up, `/tmp/auth.json` valid, `NODE_PATH=/usr/local/lib/node_modules`). Must end `RESULT: PASS`. On an unrecognised exemption: fix the contrast or add a considered `EXPECTED_EXEMPTIONS` entry — never widen a selector. On a node-count regression: find out why; only then `ACCEPT_NODE_COUNT_BASELINE=1 npm run audit:contrast` and commit `docs/audits/contrast-node-counts.json` with the reason in the message.
- [ ] **C2:** `git checkout feat/playground-phase-3 && git merge --no-ff p3/<name> -m "Merge p3/<name>: <summary>"` (plus the Co-Authored-By trailer). Re-run the four gates on the umbrella.

---

## Group 0 — setup (on the umbrella `feat/playground-phase-3`)

### Task 1: Gaps log, design-ask update, screenshot tooling

**Files:**
- Create: `docs/follow-ups/2026-09-24-playground-phase-3-gaps.md`
- Modify: `docs/follow-ups/2026-09-23-playground-design-ask.md` (section D, append)
- Create (scratchpad, not repo): `$SP/shots.cjs`, `$SP/login.cjs` (login.cjs may already exist — overwrite with the version below)

**Interfaces:**
- Produces: `node $SHOTS app --route <path> --out <dir>` → writes `<dir>/app-<w>-<light|dark>.png` for w ∈ {390,1280,1440,1920}; `node $SHOTS kit --screen "<chip label>" --out <dir>` → writes `<dir>/kit-<mobile|desktop>-<light|dark>.png`. Optional `--wait "<selector>"` and `--min <n>` (wait until ≥n matches, for Leaflet: `--wait .leaflet-marker-icon --min 1`).

- [ ] **Step 1: Write the gaps log**

```markdown
# Playground phase 3 — gaps

What the kit shows that we chose **not** to build in phase 3, and why. Written for Cam to decide
from — not a to-do list. Spec: `docs/specs/2026-09-24-playground-phase-3.md`. Handoff *defects*
(things the designer got wrong) go in `2026-09-23-playground-design-ask.md` § D instead.

## Out of scope from the start

- **`emails/*.html` — magic-link, invite, trip-reminder, booking-confirmed.** Kit shows: four
  branded HTML emails. We have: no mail sender at all; sign-in is Google + dev login
  (`lib/auth.ts`), invites deliberately send nothing (`server/actions/invites.ts`, ADR 0017).
  Not built because: new feature (mail provider, senders, and for magic-link a new sign-in method).
- **`app/share/[token]/opengraph-image.tsx` + `share.jsx` `ShareOG`/`Unfurl` — per-trip unfurl
  card.** Kit shows: trip name, dates, stops as a link preview. We have: the share page is
  `robots: noindex`. Not built because: product decision (does a private share link unfurl?).
- **`teepee-desktop/DLanding.jsx`, `teepee-mobile/Landing.jsx` — marketing landing.** We have: `/`
  redirects. Not built because: new feature.
- **`teepee-mobile/Onboarding.jsx` / desktop onboarding.** We have: none. New feature.
- **`teepee-mobile/Invite.jsx` — invite flow with access levels.** We have: auto-accept on sign-in
  (ADR 0017). New feature / product decision.
- **`DShared.jsx`, `Shared.jsx` — "Your people" with a join link.** We have: none. New feature.
- **`shared/admin.jsx` `More` — mobile "More" hub.** We have: the phase 2 dock. New feature.
- **`teepee-tablet/`** — tablet layout. We have: responsive breakpoints only. Product decision.
- **`docs/notifications.md` — batching, email channels, "Mark paid" and "Time to leave" pushes.**
  We have: the digest push only. New feature.
- **Wide-screen layout** — kit is drawn at 1280×800 (incl. a 340px aside column). We cap content
  at `max-w-7xl`. Using extra width is a design decision the kit doesn't make.

## p3/boundaries

## p3/core

## p3/together

## p3/admin-kit

## p3/og-default
```

- [ ] **Step 2: Append to design-ask § D** — find the section-D heading in `docs/follow-ups/2026-09-23-playground-design-ask.md` (`grep -n "^## D" …`) and append at its end:

```markdown
### D-phase-3 (added 2026-09-24)

Handoff defects found while building phase 3 are appended here, one bullet each:
`- **<file>** — <what's wrong> — <what we did instead>.`
```

- [ ] **Step 3: Write `$SP/login.cjs`**

```js
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const c = await b.newContext(); const p = await c.newPage();
  await p.goto('http://localhost:3000/signin'); await p.click('text=Continue as You');
  await p.waitForURL(u => !u.pathname.startsWith('/signin'), { timeout: 60000 });
  await c.storageState({ path: '/tmp/auth.json' }); console.log('saved', p.url()); await b.close();
})();
```

- [ ] **Step 4: Write `$SP/shots.cjs`**

```js
// Usage: node shots.cjs app --route /trips --out DIR [--wait SEL --min N]
//        node shots.cjs kit --screen "Trips" --out DIR
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs'); const path = require('path');
const args = process.argv.slice(2); const mode = args[0];
const opt = (k, d) => { const i = args.indexOf('--' + k); return i > -1 ? args[i + 1] : d; };
const out = opt('out'); fs.mkdirSync(out, { recursive: true });
const KIT_ROOT = '/work/design_handoff/playground-2'; const KIT_PORT = 8765;

async function app(browser) {
  const route = opt('route'); const wait = opt('wait'); const min = Number(opt('min', '1'));
  for (const w of [390, 1280, 1440, 1920]) for (const theme of ['light', 'dark']) {
    const ctx = await browser.newContext({ storageState: '/tmp/auth.json', viewport: { width: w, height: 900 } });
    const p = await ctx.newPage();
    await p.goto('http://localhost:3000' + route, { waitUntil: 'networkidle' });
    if (p.url().includes('/signin')) throw new Error('auth expired: run login.cjs');
    if (wait) await p.waitForFunction(([s, n]) => document.querySelectorAll(s).length >= n, [wait, min], { timeout: 20000 });
    if (theme === 'dark') { await p.evaluate(() => document.documentElement.classList.add('dark')); await p.waitForTimeout(400); }
    await p.screenshot({ path: path.join(out, `app-${w}-${theme}.png`), fullPage: true });
    await ctx.close();
  }
}

async function kit(browser) {
  const screen = opt('screen');
  const srv = spawn('python3', ['-m', 'http.server', String(KIT_PORT), '-d', KIT_ROOT], { stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 800));
  try {
    for (const [form, dir, w, h] of [['mobile', 'teepee-mobile', 520, 1000], ['desktop', 'teepee-desktop', 1400, 1000]]) {
      for (const theme of ['light', 'dark']) {
        const p = await browser.newPage({ viewport: { width: w, height: h } });
        await p.goto(`http://localhost:${KIT_PORT}/reference/ui_kits/${dir}/index.html`);
        await p.getByText(screen, { exact: true }).first().click();
        if (theme === 'dark') await p.getByText('Dark', { exact: true }).first().click();
        await p.waitForTimeout(800);
        await p.screenshot({ path: path.join(out, `kit-${form}-${theme}.png`), fullPage: true });
        await p.close();
      }
    }
  } finally { srv.kill(); }
}

(async () => {
  const browser = await chromium.launch();
  try { await (mode === 'kit' ? kit(browser) : app(browser)); console.log('wrote', out); }
  finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
```

- [ ] **Step 5: Verify the tool** — start the dev server if needed, then:
```bash
NODE_PATH=/usr/local/lib/node_modules node $SP/shots.cjs app --route /trips --out $SP/shots/t1
NODE_PATH=/usr/local/lib/node_modules node $SP/shots.cjs kit --screen Trips --out $SP/shots/t1
ls $SP/shots/t1   # expect 8 app-*.png + 4 kit-*.png
```
Open one app and one kit PNG and confirm they show the trips list (and that the kit dark PNG is actually dark). If the kit page loads unpkg React from the network and that fails, report it — do not vendor React into the repo.

- [ ] **Step 6: Commit** (docs only; scratchpad files are not committed)
```bash
git add docs/follow-ups/2026-09-24-playground-phase-3-gaps.md docs/follow-ups/2026-09-23-playground-design-ask.md
git commit -m "docs: seed phase 3 gaps log and design-ask section

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

## Group 1 — `p3/boundaries`

Before Task 2: `git checkout feat/playground-phase-3 && git checkout -b p3/boundaries`.

**Drop-in rule for this group:** the handoff files under `design_handoff/playground-2/` were written against an older snapshot. For each: `diff` handoff vs ours, then **edit ours** to take the handoff's visual treatment and copy, keeping every one of our imports of data/actions, guards, props, doc comments that explain *why*, and behaviour. Never `cp` over.

### Task 2: The three not-found boundaries **[screen]**

**Files:**
- Modify: `app/(app)/not-found.tsx`, `app/(app)/trips/[tripId]/not-found.tsx`, `app/share/[token]/not-found.tsx`
- Reference: same paths under `design_handoff/playground-2/`; `components/ui/error-panel.tsx`
- Test: create `app/not-found-boundaries.test.tsx`

**Interfaces:** Consumes `ErrorPanel` (`kind="not-found"`, `title`, `description`, `actions`) from `components/ui/error-panel.tsx`, `Button asChild`.

Routes for S1/S5: `/trips/does-not-exist`, `/trips/cmueo582d00b0q1lo9lf5taru/nope`, `/share/00000000-0000-0000-0000-000000000000`. Kit screen: `States` (plus the drop-in JSX itself — there is no kit chip specifically for 404).

- [ ] **S2 test** (adapt import names to the actual default exports):

```tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import AppNotFound from "@/app/(app)/not-found";
import TripNotFound from "@/app/(app)/trips/[tripId]/not-found";
import ShareNotFound from "@/app/share/[token]/not-found";

describe("not-found boundaries", () => {
  it.each([
    ["app", AppNotFound],
    ["trip", TripNotFound],
    ["share", ShareNotFound],
  ])("%s renders an ErrorPanel with no emoji art", (_n, C) => {
    const { container } = render(<C />);
    expect(container.textContent).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(screen.getByRole("heading")).toBeInTheDocument();
  });

  it("app/trip not-found never reveals that a trip exists", () => {
    for (const C of [AppNotFound, TripNotFound]) {
      const { container, unmount } = render(<C />);
      expect(container.textContent).toMatch(/doesn.t exist, or you don.t have access/);
      unmount();
    }
  });

  it("app not-found links back to trips", () => {
    render(<AppNotFound />);
    expect(screen.getByRole("link", { name: /back to trips/i })).toHaveAttribute("href", "/trips");
  });
});
```
Keep the share not-found's link target as it is today (check before writing; it is unauthenticated). Then S3–S7.

### Task 3: `global-error` + ADR 0060 exemption **[screen]**

**Files:**
- Modify: `app/global-error.tsx`, `docs/adr/0060-playground-visual-system.md` (§ "Exemptions to the 'no new hex, no inline styles' rule")
- Reference: `design_handoff/playground-2/app/global-error.tsx`
- Test: create `app/global-error.test.tsx`

- [ ] **S2 test:**

```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { describe, it, expect, vi } from "vitest";
import GlobalError from "@/app/global-error";

describe("global-error", () => {
  it("renders a retry that calls reset", () => {
    const reset = vi.fn();
    render(<GlobalError error={Object.assign(new Error("x"), { digest: "d" })} reset={reset} />);
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(reset).toHaveBeenCalled();
  });

  it("has no raw hex and no emoji (colours come from its own CSS variables)", () => {
    const src = readFileSync("app/global-error.tsx", "utf8");
    expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(src).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});
```
(If our current retry label differs, use the handoff's label — kit copy wins — and update the regex.)

- [ ] **S3 specifics:** take the handoff's layout (wordmark from `components/ui/logo-paths`, tilted "!" tile, inline styles). Replace every hex literal with `hsl(var(--x))` where `--x` are CSS variables **declared inside this file** (a `<style>` block with `:root{…}` and `@media (prefers-color-scheme: dark){:root{…}}`), whose HSL triples are copied **exactly** from `app/globals.css` `:root` and `.dark` (`--background`, `--foreground`, `--muted-foreground`, `--coral`, `--on-accent`, `--card`). No hex anywhere in the file.
- [ ] **ADR edit:** replace the existing `app/global-error.tsx` bullet with:
```markdown
- `app/global-error.tsx` — inline styles are allowed. It replaces the entire document when the
  root layout itself fails, so `globals.css` never loads for it; every style has to travel with the
  markup. **No raw hex:** colours come from CSS variables the file declares locally, whose HSL
  triples are copied exactly from `globals.css` (light and dark). Restyled in phase 3 (2026-09-24).
```
Stage the ADR with the component in S7. `global-error` is not reachable by URL, and adding a crash route just to screenshot it is not allowed. Instead, for S1/S5, write a throwaway script in `$SP` that renders the component to static HTML (`react-dom/server` `renderToStaticMarkup`) into `$SP/global-error.html`, and screenshot that file with Playwright at 390 and 1280 (light, plus `emulateMedia({ colorScheme: 'dark' })`). Compare against the handoff drop-in rendered the same way.

### Task 4: Legal pages via `LegalPage` **[screen]**

**Files:**
- Create: `components/legal/legal-page.tsx` (from `design_handoff/playground-2/components/legal/legal-page.tsx`, adapted: no hex/inline style; Server Component)
- Modify: `app/terms/page.tsx`, `app/privacy/page.tsx`, `app/terms/page.test.tsx`, `app/privacy/page.test.tsx`

**Interfaces:** Produces `LegalPage({ title, updated, children })` — read the handoff file for the exact prop names and keep them.

Routes: `/terms`, `/privacy` (unauthenticated — shots tool works with auth too). Kit: no kit chip; the drop-in is the reference.

- [ ] **S2:** in both existing page tests add:
```tsx
it("uses the Playground legal layout", () => {
  const { container } = render(<Page />);
  expect(container.querySelector("[data-legal-page]")).not.toBeNull();
  expect(screen.getByRole("link", { name: /teepee/i })).toHaveAttribute("href", "/");
});
```
and have `LegalPage`'s root element carry `data-legal-page`. Keep all existing legal text verbatim — only the chrome changes. If the handoff's header link target differs from ours, keep ours and adjust the assertion.

### Task 5: Admin page **[screen]**

**Files:**
- Modify: `app/(app)/admin/page.tsx`, `app/(app)/admin/access-requests.tsx` (and any sibling admin component with old-shape classes)
- Reference: `design_handoff/playground-2/app/(app)/admin/page.tsx` (ours is 81 lines, handoff 54 — the difference is likely behaviour; keep ours)
- Test: extend the existing admin tests (`ls app/\(app\)/admin/*.test.tsx lib/admin*.test.ts`); if none renders the page, create `app/(app)/admin/access-requests.test.tsx`

Route: `/admin`. Kit: none — drop-in is the reference.

- [ ] **S2:** assert that each access request renders inside a `Card` (root has class `border-2`), that approve/deny buttons have accessible names including the requester, and — preserved behaviour — that the admin guard/redirect in `page.tsx` is unchanged (if an existing test covers the guard, it must still pass unmodified).

### Task 6: Notification bell **[screen]**

**Files:**
- Modify: `components/trip/notification-bell.tsx`
- Reference: `design_handoff/playground-2/components/trip/notification-bell.tsx` ("Restyle only — props, data and actions unchanged"), `design_handoff/playground-2/docs/notifications.md`
- Test: create or extend `components/trip/notification-bell.test.tsx`

**Interfaces:** Keep `NotificationBell({ tripId, unreadCount, recent }: Props)` exactly.

Route: `/trips/cmueo582d00b0q1lo9lf5taru` — after S1's default shots, also capture with the dropdown open (add a one-off `page.click('[aria-label*="otification"]')` in a copy of the app loop, or screenshot manually via a short script in `$SP`). Kit: `Activity` screen + the drop-in.

- [ ] **S2 test:**
```tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/server/actions/activity", () => ({ markAllRead: vi.fn() }));
import { NotificationBell } from "./notification-bell";

describe("NotificationBell", () => {
  it("labels the trigger with the unread count", () => {
    render(<NotificationBell tripId="t" unreadCount={3} recent={[]} />);
    expect(screen.getByRole("button", { name: /3 unread/i })).toBeInTheDocument();
  });
  it("shows no count badge when nothing is unread", () => {
    render(<NotificationBell tripId="t" unreadCount={0} recent={[]} />);
    expect(screen.queryByText("0")).toBeNull();
  });
});
```
Adjust the label regex to whatever accessible name the handoff uses, as long as it includes the count. Bell copy (headings, empty state, "Mark all read") follows `docs/notifications.md` for the activity types we actually have.

### Close `p3/boundaries` — run C1, C2.

---

## Group 2 — `p3/core`

Before Task 7: `git checkout feat/playground-phase-3 && git checkout -b p3/core`.

### Task 7: `Card` hue tones + weather card migration

**Files:**
- Modify: `components/ui/card.tsx:10-26`, `components/trip/weather-daylight-card.tsx:73`, `components/trip/weather-daylight-card.test.tsx:85,112`
- Test: create `components/ui/card.test.tsx`

**Interfaces:**
- Produces: `Card` `tone` additionally accepts `"hue-sky" | "hue-sun" | "hue-leaf" | "hue-lilac" | "hue-pink" | "hue-teal" | "hue-coral" | "hue-indigo" | "hue-stone"`. Each resolves to `island bg-hue-<h> text-on-accent`. Later tasks use `<Card tone="hue-leaf">`.

- [ ] **Step 1: Failing test** `components/ui/card.test.tsx`:
```tsx
import { render } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Card } from "./card";
import { HUES } from "@/lib/hues";

describe("Card hue tones", () => {
  it.each(HUES)("tone=hue-%s is an island on the solid hue with on-accent text", (h) => {
    const { container } = render(<Card tone={`hue-${h}` as const}>x</Card>);
    const cls = (container.firstChild as HTMLElement).className.split(/\s+/);
    expect(cls).toEqual(expect.arrayContaining(["island", `bg-hue-${h}`, "text-on-accent"]));
  });
  it("existing tones are unchanged", () => {
    const { container } = render(<Card tone="sun">x</Card>);
    expect((container.firstChild as HTMLElement).className).toContain("island bg-sun");
  });
});
```
- [ ] **Step 2:** `npx vitest run components/ui/card.test.tsx` → FAIL (type error / missing classes).
- [ ] **Step 3: Implement** — add to the `tone` variants in `card.tsx`, written out in full so Tailwind's scanner sees them:
```ts
      "hue-sky": "island bg-hue-sky text-on-accent",
      "hue-sun": "island bg-hue-sun text-on-accent",
      "hue-leaf": "island bg-hue-leaf text-on-accent",
      "hue-lilac": "island bg-hue-lilac text-on-accent",
      "hue-pink": "island bg-hue-pink text-on-accent",
      "hue-teal": "island bg-hue-teal text-on-accent",
      "hue-coral": "island bg-hue-coral text-on-accent",
      "hue-indigo": "island bg-hue-indigo text-on-accent",
      "hue-stone": "island bg-hue-stone text-on-accent",
```
and extend the doc comment: "`hue-*` tones fill with the categorical ramp (lib/hues.ts); text is `on-accent`, as on chips — not `onSoft`, which is for the 25% tint."
- [ ] **Step 4:** Migrate the weather card: its root becomes `<Card tone="hue-sky" shadow={…} className={cn("flex gap-3 p-4", compact && "p-3 text-sm")}>` (match its current shadow/radius so it renders identically — compare before/after screenshots of `/trips/cmueo582d00b0q1lo9lf5taru/day/2026-09-24` at 390 and 1280). Keep its explanatory comment, updated to name `tone="hue-sky"`. The existing test queries `.bg-hue-sky` — leave those queries (still valid) and add `expect(card).toHaveClass("island")`.
- [ ] **Step 5:** `npx vitest run components/ui/card.test.tsx components/trip/weather-daylight-card.test.tsx` → PASS; then the four gates.
- [ ] **Step 6: Commit**
```bash
git add components/ui/card.tsx components/ui/card.test.tsx components/trip/weather-daylight-card.tsx components/trip/weather-daylight-card.test.tsx
git commit -m "feat(ui): Card hue tones from the categorical ramp

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 8: Trips list **[screen]**

**Files:** Modify `app/(app)/trips/page.tsx`, `components/trip/trip-card.tsx`. Test: create/extend `components/trip/trip-card.test.tsx`.
**Kit:** `teepee-desktop/DTrips.jsx`, `teepee-mobile/Trips.jsx`; chip label `Trips`. Route `/trips`.
- [ ] **S2:** assert a trip card renders the trip name as a heading, is a single link to `/trips/<id>` with an accessible name containing the trip name, uses `Card` (`border-2`), and that a 60-character trip name renders without being dropped (`getByText(longName)`). Empty branch: if `trips/page.tsx` renders an empty state for zero trips, assert it uses `EmptyState` with the kit's copy.

### Task 9: New trip form **[screen]**

**Files:** Modify `app/(app)/trips/new/page.tsx`, `components/trip/new-trip-form.tsx` (find exact path: `grep -rl "new-trip-form" components app`). Test: extend its test or create `new-trip-form.test.tsx`.
**Kit:** `shared/forms.jsx` (new-trip form), chip `Forms`. Route `/trips/new`.
- [ ] **S2:** assert every input has an associated label (`getByLabelText` for each field the form already has), the submit button has the kit's label, and validation behaviour is unchanged (an existing validation test must pass unmodified). No new fields — any kit field we lack goes to the gaps log.

### Task 10: Trip home **[screen]**

**Files:** Modify `app/(app)/trips/[tripId]/page.tsx`, `components/trip/trip-cover.tsx`, `components/trip/reminders-card.tsx`. Test: create/extend `trip-cover.test.tsx`.
**Kit:** `teepee-desktop/DHome.jsx`, `teepee-mobile/Home.jsx`; chip `Home`. Route `/trips/cmueo582d00b0q1lo9lf5taru`.
- [ ] **S2:** assert the trip name is the page `h1`, dates render, and the cover uses a `Card`. Budget/money figures shown on home (if any) must use shared-pot wording — assert no text matches `/per person|each owes|split/i`.

### Task 10b: Trip home phase components **[screen]** (added by Ruling 8)

**Files:** Modify `components/trip/home/phase-sketching.tsx`, `phase-planning.tsx`, `phase-travelling.tsx`, `phase-past.tsx` (and any child component they render that still has the old shape: `rounded-2xl border border-border shadow-soft`, 1px borders, raw palette). Tests: extend the existing `components/trip/home/phase-*.test.tsx`.
**Kit:** `teepee-desktop/DHome.jsx`, `teepee-mobile/Home.jsx` (chip `Home`) for sketching/planning; `shared/onthego.jsx` (chips `Today`, `Summary`) for travelling/past. Read the kit JSX to find which state each phase corresponds to. Route `/trips/cmueo582d00b0q1lo9lf5taru` (the fixture renders `PhaseTravelling`). For the other phases, rely on component tests plus a static render (renderToStaticMarkup of the component with the test's fixture props, wrapped in a minimal page that loads the app's compiled CSS — or, simpler, screenshot the storybook-free way used in Task 3) — say in the report which phases got live shots and which didn't.
- [ ] **S2:** for each phase component: the module containers are `Card`s (`border-2`, hard shadow) or `Card tone="hue-*"` where the kit fills a hue; headings present in order; any money reads as a shared-pot total — assert no text matches `/per person|each owes|split/i`; icon-only buttons have accessible names; empty sub-states (e.g. no stops, no bookings) render the kit's empty treatment. Existing behaviour assertions in the phase tests must still pass (copy strings may change to kit copy visibly).
- Anything the kit's Home/Today/Summary shows that our phases don't have → gaps log under `## p3/core`.

### Task 11: Wishlist **[screen]**

**Files:** Modify `components/.../wishlist-board.tsx` (`grep -rl wishlist-board components`) and its page. Test: extend the existing wishlist test or create one beside the board.
**Kit:** `DWishlist.jsx`, `Wishlist.jsx`; chip `Wishlist`. Route `/trips/cmueo582d00b0q1lo9lf5taru/wishlist`. The board has a Map tab (Leaflet): for the map shots, click `Map` and use `--wait .leaflet-marker-icon --min 1`.
- [ ] **S2:** assert item cards render category via `CategoryPill`/hue chip (not raw palette), the empty board uses `EmptyState` with kit copy, and icon-only buttons (delete/move) have accessible names.

### Task 12: Calendar + day-nav **[screen]**

**Files:** Modify the calendar page/components (`app/(app)/trips/[tripId]/calendar/`, `grep -rl "calendar" components/trip | head`) and `components/.../day-nav.tsx:46` (`rounded-xl border border-border` → kit shape). Tests: extend existing calendar/day-nav tests.
**Kit:** `DDays.jsx`, `Days.jsx`; chip `Days`. Routes `/trips/cmueo582d00b0q1lo9lf5taru/calendar`, `/trips/cmueo582d00b0q1lo9lf5taru/day/2026-09-24`.
- [ ] **S2:** assert prev/next day controls have accessible names and the current day carries `aria-current="date"` (or keep whatever current-marker exists today and assert it); month grid stop bands still use `lib/stop-colours.ts` classes (don't change the derivation).

### Close `p3/core` — run C1, C2.

---

## Group 3 — `p3/together`

Before Task 13: `git checkout feat/playground-phase-3 && git checkout -b p3/together`.

### Task 13: Activity + journal **[screen]**

**Files:** `components/.../activity-feed.tsx`, `components/.../journal-entry-view.tsx` and their pages (`grep -rl "activity-feed\|journal-entry-view" app components`). Tests beside each.
**Kit:** `shared/together.jsx` (Activity), `shared/onthego.jsx` (Journal); chips `Activity`, `Journal`. Routes `/trips/cmueo582d00b0q1lo9lf5taru/activity`, `/trips/cmueo582d00b0q1lo9lf5taru/journal`.
- [ ] **S2:** activity rows render actor avatar + headline from `lib/activity.ts` `headline()` (unchanged) inside `ListRow`s; empty feed uses `EmptyState` with kit copy; journal entry title is a heading and photos (if any) have `alt`.

### Task 14: Checklists + files **[screen]**

**Files:** checklists and files page components (`app/(app)/trips/[tripId]/checklists`, `…/files`). Tests beside each.
**Kit:** `shared/together.jsx`; chips `Checklists`, `Files`. Routes `…/checklists`, `…/files`.
- [ ] **S2:** checklist items use the `Checkbox` primitive with labels (toggle behaviour unchanged — existing tests pass unmodified); files list rows have download links with accessible names including the file name; empty states use `EmptyState`.

### Task 15: Compare + print **[screen]**

**Files:** compare page components (`…/compare`), `app/(app)/trips/[tripId]/print/page.tsx` (the only raw-palette file: `grep -nE "\b(bg|text|border)-(stone|slate|zinc|gray|amber|sky|emerald|violet|rose|indigo)-[0-9]" …/print/page.tsx`). Tests beside each.
**Kit:** `shared/together.jsx`; chips `Compare`, `Print`. Routes `…/compare`, `…/print`.
- [ ] **S2 compare:** kit visual; comparison cells for money use shared-pot wording.
- [ ] **S2 print:** add a test that reads `print/page.tsx` source and asserts none of the raw palette classes remain (anchored regex above) and no `shadow-hard-` class is used. Print is a **light pass**: tokens + print-appropriate styling, no kit match required, no offset shadows.

### Task 16: Globe **[screen]**

**Files:** `components/globe/globe-view.tsx` (and siblings with old-shape classes). Tests: `components/globe/globe-view.test.tsx` (extend).
**Kit:** `shared/onthego.jsx` (Globe); chip `Globe`. Route `/globe` (confirm with `ls app/\(app\)`). Shots with `--wait .leaflet-marker-icon --min 1` — never trust `networkidle` for Leaflet.
- [ ] **S2:** panel chrome uses `Card`; marker pins untouched (`lib/map-pins.ts` owns them); the invite button keeps its accessible name.

### Close `p3/together` — run C1, C2.

---

## Group 4 — `p3/admin-kit`

Before Task 17: `git checkout feat/playground-phase-3 && git checkout -b p3/admin-kit`.

### Task 17: Account **[screen]**

**Files:** `app/(app)/account/page.tsx`, `components/account/*.tsx` (devices-panel, trip-digests-panel, dispatcher-health, device-sync). Tests: the existing `components/account/*.test.tsx` must pass; extend `devices-panel.test.tsx`.
**Kit:** `shared/admin.jsx` (Account); chip `Account`. Route `/account`. Devices/digests/dispatcher-health have **no kit reference**: style with the nearest kit pattern (`Card` + `ListRow` + `Switch`), and log nothing (they're ours).
- [ ] **S2:** each panel is a `Card` with a heading; toggles are `Switch` with labels.

### Task 18: Help (both routes) + what's-new **[screen]**

**Files:** `components/trip/help-guide.tsx:123`, `app/(app)/help/page.tsx`, `app/(app)/trips/[tripId]/help/page.tsx`, `app/(app)/whats-new/page.tsx:40`. Tests beside each (create `help-guide.test.tsx` if absent).
**Kit:** `shared/admin.jsx` (Help, What's new); chips `Help`, `What's new`. Routes `/help`, `/trips/cmueo582d00b0q1lo9lf5taru/help`, `/whats-new`.
- [ ] **S2:** help sections are headings in order; what's-new entries are grouped by date with a heading per release; content text unchanged unless the kit copy is the same content in the kit's voice.

### Task 19: Share page **[screen]**

**Files:** `app/share/[token]/page.tsx` (e.g. `:424` `rounded-xl border` → kit shape; `:516` `bg-hue-leaf` stays or moves to `Card tone="hue-leaf"`). Test: extend the share page test (`ls app/share/\[token\]/*.test.tsx`).
**Kit:** `shared/share.jsx` `SharePage`; chip `Public link`. Route `/share/014b029f-d13b-4e09-8648-5aef72f8c702` (unauthenticated view — also run the shots in a context **without** storageState: copy the `app` loop in `$SP` with `storageState` omitted).
- [ ] **S2:** the share page shows **no costs** (assert no currency amounts: `not.toMatch(/[$€£¥]\s?\d/)` on the rendered text), keeps `robots: noindex` in `metadata`, and the trip name is the `h1`.

### Close `p3/admin-kit` — run C1, C2.

---

## Group 5 — `p3/og-default`

Before Task 20: `git checkout feat/playground-phase-3 && git checkout -b p3/og-default`.

### Task 20: Default OG image + fonts + exemption

**Files:**
- Create: `lib/og-card.tsx` (adapted from `design_handoff/playground-2/lib/og-card.tsx` — **only** `OG_SIZE`, the colour map, `Wordmark`, `Mark`, `DefaultOgCard`, `ogFonts`; drop `ShareOgCard`/`OgTrip` — out of scope), `app/opengraph-image.tsx` (from the handoff), `app/fonts/BricolageGrotesque-ExtraBold.ttf`, `app/fonts/PlusJakartaSans-Bold.ttf`, `lib/og-card.test.ts`
- Modify: `docs/adr/0060-playground-visual-system.md` (exemptions list)

**Interfaces:** Produces `export const OG_COLOURS: Record<"paper"|"ink"|"muted"|"coral"|"sun"|"teal"|"lilac"|"card", string>` (rename the handoff's `C`), `DefaultOgCard(): ReactElement`, `ogFonts(): Promise<{name,data,weight,style}[]>`, `OG_SIZE`.

- [ ] **Step 1: Fetch fonts** (OFL):
```bash
mkdir -p app/fonts
curl -sL -o app/fonts/BricolageGrotesque-ExtraBold.ttf "$(curl -s 'https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@800' | grep -o 'https://[^)]*\.ttf' | head -1)"
curl -sL -o app/fonts/PlusJakartaSans-Bold.ttf "$(curl -s 'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@700' | grep -o 'https://[^)]*\.ttf' | head -1)"
file app/fonts/*.ttf   # expect "TrueType Font data"
```
- [ ] **Step 2: Failing test** `lib/og-card.test.ts`:
```ts
import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { OG_COLOURS } from "./og-card";

// Satori can't read CSS variables, so og-card carries hex. ADR 0060 exempts it on condition that
// every value equals the globals.css token computed from its HSL triple — NOT the rounded hex
// comment beside it (those disagree; computing from them once turned 4.499 into 4.618).
function hslToHex(triple: string): string {
  const [h, s, l] = triple.trim().split(/\s+/).map((v) => parseFloat(v));
  const sat = s / 100, lig = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sat * Math.min(lig, 1 - lig);
  const f = (n: number) => lig - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return "#" + [f(0), f(8), f(4)].map((x) => Math.round(x * 255).toString(16).padStart(2, "0")).join("").toUpperCase();
}
function rootToken(name: string): string {
  const css = readFileSync("app/globals.css", "utf8");
  const root = css.slice(css.indexOf(":root {"), css.indexOf("}", css.indexOf(":root {")));
  const m = root.match(new RegExp(`--${name}:\\s*([^;]+);`));
  if (!m) throw new Error(`token --${name} not found in :root`);
  return hslToHex(m[1]);
}

describe("OG_COLOURS mirror the light tokens", () => {
  it.each([
    ["paper", "background"], ["ink", "foreground"], ["muted", "muted-foreground"], ["card", "card"],
    ["coral", "coral"], ["sun", "sun"], ["teal", "teal"], ["lilac", "lilac"],
  ] as const)("%s === --%s", (key, token) => {
    expect(OG_COLOURS[key].toUpperCase()).toBe(rootToken(token));
  });
});
```
- [ ] **Step 3:** `npx vitest run lib/og-card.test.ts` → FAIL (module missing).
- [ ] **Step 4: Implement** — create `lib/og-card.tsx` from the handoff with the pieces listed above; set each `OG_COLOURS` value to the hex the test computes (run the test, read the expected values from the failure output, paste them in). Keep the handoff's doc comment, amended: "Sanctioned inline-style + hex file (ADR 0060); values pinned to globals.css HSL by og-card.test.ts." `ogFonts()` reads the two `.ttf`s from `app/fonts/` (follow the handoff's implementation; check `node_modules/next/dist/docs/` for the current `ImageResponse`/file-reading guidance). Create `app/opengraph-image.tsx` from the handoff.
- [ ] **Step 5:** `npx vitest run lib/og-card.test.ts` → PASS. Then start the dev server and fetch the image:
```bash
curl -s -o $SP/og.png -w "%{http_code} %{content_type}\n" localhost:3000/opengraph-image
```
Expect `200 image/png`; open `$SP/og.png` and compare against the handoff's design (wordmark + mark on paper, Bricolage heading). Confirm the root `<head>` now has `og:image` (`curl -s localhost:3000/signin | grep -o 'og:image[^>]*'`).
- [ ] **Step 6: ADR** — append to the exemptions list:
```markdown
- `lib/og-card.tsx` — inline style objects and hex. Satori (next/og) cannot read CSS variables or
  Tailwind classes. Every hex must equal the `globals.css` light token **computed from its HSL
  triple**, and `lib/og-card.test.ts` pins that equality so the two cannot drift. Fonts are static
  `.ttf` files in `app/fonts/` (Satori does not read `.woff2`). Added in phase 3 (2026-09-24);
  only the site-wide default card ships — the per-trip share card is a logged gap.
```
- [ ] **Step 7:** gates, then commit:
```bash
git add lib/og-card.tsx lib/og-card.test.ts app/opengraph-image.tsx app/fonts/BricolageGrotesque-ExtraBold.ttf app/fonts/PlusJakartaSans-Bold.ttf docs/adr/0060-playground-visual-system.md
git commit -m "feat(og): default Open Graph card

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Close `p3/og-default` — run C1, C2.

---

## Task 21: Umbrella wrap-up (controller, on `feat/playground-phase-3`)

- [ ] Four gates + `npm run audit:contrast` on the umbrella → all pass.
- [ ] Whole-branch review (`git diff beta...feat/playground-phase-3`) against the spec.
- [ ] Confirm `git rev-parse main` = `3002531`, and `git log beta..` shows only umbrella work.
- [ ] `pkill -f "next dev"`; `git checkout CLAUDE.md`.
- [ ] Report to Cam: what shipped, the gaps log, and ask for the go-ahead to merge the umbrella into `beta`. **Do not merge into `beta` or push.**
