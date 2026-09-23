# Playground Visual System — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adopt the Playground visual system's foundations — design tokens, fonts, PWA identity, brand name, and the `components/ui/*` primitive set — so the whole app re-skins through shared components, without touching routes, data, server actions or behaviour.

**Architecture:** Three layers, bottom-up. `app/globals.css` is swapped for the handoff version (verified a strict superset of the repo's existing `@theme inline` keys, so no utility loses its token and every existing call site re-skins for free). `app/layout.tsx` + `app/manifest.ts` + `public/` carry the font and PWA identity change. Then `components/ui/*` gains eight restyled primitives (export-compatible drop-ins), ten new primitives, and ten hand-restyled files. Navigation, screens, per-route loading/error, the OG image and emails are explicitly **out of scope** — they wait for design material that has not been delivered.

**Tech Stack:** Next.js 16, React 19, Tailwind v4 (CSS-first `@theme inline`), Radix UI, class-variance-authority, lucide-react, motion, Vitest + Testing Library.

## Global Constraints

Every task's requirements implicitly include this section.

- **Branch:** all work on `feat/playground-visual-system`, cut from `beta`. **Never** commit, merge, rebase onto or push to `main`/`master`. **Never** merge to `beta` — stop and ask. **Never** deploy anything.
- **Restyle, not rebuild.** Data, routes, server actions and behaviour stay exactly as they are. No new features.
- **Tailwind v4 classes only**, using tokens from `app/globals.css`. No new hex values.
- **Accent colour as text on neutral surfaces** must use `text-coral-text`, `text-teal-text`, `text-sun-text`, `text-lilac-text` — never `text-coral` etc. on a neutral background.
- **No inline style objects for visual values** (colour, spacing, shadow, border). Inline `style` is permitted **only** for genuinely computed values Tailwind cannot express — `ProgressBar`'s `width: v + "%"`, `Logo`'s `fontSize: size`. Each such instance is recorded in the ADR.
- **Blessed hex exemption:** `components/ui/logo.tsx` hard-codes `#1D1D1B`, `#EDE6D8`, `#FF6B4A` for the brand mark. A logo mark must not theme-shift. Keep them, keep the file's comment explaining why, record it in the ADR. Do not add hex anywhere else.
- **Server Components stay Server Components.** Only files already marked `"use client"`, or leaves that genuinely need state/handlers, are client. Never push `"use client"` up the tree.
- **Restyled `components/ui/*` files keep their exports and props.** When a test asserts on a class name, update the assertion — never the behaviour.
- **Motion:** CSS `tp-*` utilities, or `motion` with `ease: [0.2, 0.8, 0.2, 1]`. Honour `useReducedMotion()`. Animate transform and opacity only.
- **Accessibility:** 3px focus ring (now global, from `globals.css`), 44px touch targets, `aria-current` on nav, labels on icon-only buttons, body text ≥ 4.5:1 in both themes.
- **Money is a shared pot.** No per-person splitting exists and none may be added.
- **Feedback notes:** do NOT run `npm run feedback:resolve` (it writes production). There are 0 open notes, so no `Resolves-Feedback:` trailers are needed on this branch.
- **Gates after every task:** `npx tsc --noEmit`, `npm run lint`, `npm test`, then `npm run build`. All four must pass before the next task starts. Fix failures in the task that caused them.

## Out of Scope (deferred — do not build)

Blocked on material not delivered by Claude Design. Do not invent these.

- `components/ui/tab-bar.tsx`, `components/ui/dock.tsx`, and any change to `components/trip/mobile-tab-bar.tsx` or `components/trip/trip-nav.tsx` beyond what token inheritance does automatically.
- All per-screen restyling (step 5 of the original brief).
- Per-route `loading.tsx` / `error.tsx`, the ⌘K dialog (already exists), the `app/share/[token]` OG image.
- Email porting (`emails/*.html`) — needs `specs/notifications.html`.
- Re-tokenising the 7 category hues (`lib/categories.ts`, `lib/map-pins.ts`), the 8 chapter hues (`lib/chapter-colours.ts`), or any Leaflet colour. These stay on raw Tailwind/hex until a Playground ramp exists.

## File Structure

**Created:**
- `components/ui/chip.tsx` — clickable pill (`<button>`, `aria-pressed`). Client.
- `components/ui/count-badge.tsx` — decorative round count. Server.
- `components/ui/progress-bar.tsx` — `role="progressbar"`. Server.
- `components/ui/stat-card.tsx` — label → value → bar → sub. Server. Depends on restyled `Card` (`tone` prop) and `ProgressBar`.
- `components/ui/list-row.tsx` — tile + title + sub + trailing. Server by default; `as={Link}` to navigate.
- `components/ui/stepper.tsx` — −/value/+ group. Client.
- `components/ui/switch.tsx` — `role="switch"`. Client.
- `components/ui/checkbox.tsx` — native input styled as a 24px square. Client.
- `components/ui/logo.tsx` — tent mark + lowercase `teepee.` wordmark. Server.
- `components/ui/icon.tsx` — lucide wrapper (`Icon`) + `TentIcon`. Server.
- `docs/adr/0060-playground-visual-system.md`

**Modified:**
- `app/globals.css` — replaced wholesale, with `--tp-tab-bar-h` held at `4rem`.
- `app/layout.tsx` — Bricolage Grotesque, theme colours, icon metadata, title template.
- `app/layout.test.tsx` — font mock and `appleWebApp.title`.
- `app/manifest.ts` — name, colours, static icon set.
- `components/ui/{button,card,badge,input,segmented,dialog,empty-state,skeleton}.tsx` — replaced with handoff versions.
- `components/ui/button.test.tsx` — five class assertions.
- `components/ui/{avatar,toast,sheet,select,textarea,money-input,tabs,popover,dropdown-menu}.tsx` — hand-restyled.
- `components/offline-banner.tsx` — hand-restyled (kept, not replaced by the handoff file).
- ~25 files carrying the user-facing string `TEEPEE`.

**Deleted:**
- `app/icon.tsx`, `app/apple-icon.tsx` — superseded by static `public/icons/*`.
- `design_handoff/*.dc.html` (7 files), `design_handoff/image-slot.js`, `design_handoff/support.js`.

**Moved:**
- `design_handoff/handoff/` → `design_handoff/playground/`.

---

### Task 1: Housekeeping — land the handoff, clear the superseded direction

Nothing here changes application behaviour. It exists so every later task can reference a stable path, and so no future reader restyles against the dead Bold Modular kits.

**Files:**
- Move: `design_handoff/handoff/` → `design_handoff/playground/`
- Delete: `design_handoff/TEEPEE - Bold Modular App.dc.html`, `design_handoff/TEEPEE - Bold Modular Desktop 2.dc.html`, `design_handoff/TEEPEE - Bold Modular Desktop.dc.html`, `design_handoff/TEEPEE - Bold Modular More.dc.html`, `design_handoff/TEEPEE - Leaflet Maps.dc.html`, `design_handoff/TEEPEE - Overview.dc.html`, `design_handoff/Trip Home - Directions.dc.html`, `design_handoff/image-slot.js`, `design_handoff/support.js`
- Commit (already modified in working tree): `docs/feedback/inbox.md`

**Interfaces:**
- Consumes: nothing.
- Produces: the path `design_handoff/playground/` — every later task reads its source files from there (`design_handoff/playground/app/globals.css`, `design_handoff/playground/components/ui/*.tsx`, `design_handoff/playground/public/`).

- [ ] **Step 1: Confirm the starting state**

```bash
cd /work
git branch --show-current          # must print: feat/playground-visual-system
git status --short                 # expect: M docs/feedback/inbox.md, ?? design_handoff/handoff/
```

If the branch is wrong, STOP — do not continue on `beta` or `main`.

- [ ] **Step 2: Move the handoff into place**

```bash
cd /work
mv design_handoff/handoff design_handoff/playground
ls design_handoff/playground   # expect: CLAUDE_CODE_PROMPT.md README.md app components emails public tokens.json
```

- [ ] **Step 3: Delete the superseded Bold Modular kits**

These are an earlier, abandoned design direction (Space Grotesk, coral primary, 1rem radius, soft shadows). They contradict Playground and git history keeps them recoverable.

```bash
cd /work/design_handoff
rm -f *.dc.html image-slot.js support.js
ls                              # expect only: playground
```

- [ ] **Step 4: Verify nothing in the app referenced them**

```bash
cd /work
grep -rn "dc\.html\|image-slot\|design_handoff/handoff" --include=*.ts --include=*.tsx --include=*.json --include=*.mjs app components lib server scripts package.json || echo "OK: no references"
```

Expected: `OK: no references`. If anything matches, fix the reference before committing.

- [ ] **Step 5: Run the gates**

```bash
cd /work
npx tsc --noEmit && npm run lint && npm test && npm run build
```

Expected: all four pass. Nothing in this task touches compiled code, so a failure here means the branch was already broken — investigate before proceeding.

- [ ] **Step 6: Commit**

```bash
cd /work
git add -A design_handoff docs/feedback/inbox.md
git commit -m "chore(design): land the Playground handoff, drop the Bold Modular kits

Moves design_handoff/handoff/ to design_handoff/playground/ so the folder
matches the name the work is tracked under, and removes the seven Bold
Modular .dc.html kits plus their two support scripts. Those are an earlier
design direction — Space Grotesk, coral primary, 1rem radius, soft shadows —
superseded by Playground, and leaving them invites a future reader to restyle
against the wrong system.

Also commits the refreshed feedback inbox (0 open, 8 resolved; only the pull
date changed).

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Tokens — replace `app/globals.css`

The single highest-leverage change. Token *names* are unchanged, so every existing utility (`bg-primary`, `border-border`, `shadow-soft`, …) keeps working and re-skins automatically. The handoff file has been verified to be a **strict superset** of the repo's `@theme inline` keys — no existing token is dropped.

Expect a total palette inversion: `--primary` coral→ink, `--accent` teal→coral, `--border` soft beige→ink, `--radius` 1rem→1.25rem, `shadow-soft`/`shadow-soft-lg` soft→hard offset. This is correct. The app will look inconsistent afterwards because ~200 call sites still use raw Tailwind category colours — that is a documented, deferred gap, not a regression.

**Files:**
- Modify: `app/globals.css` (replace entire file, then re-apply one repo-only value)

**Interfaces:**
- Consumes: `design_handoff/playground/app/globals.css` (from Task 1).
- Produces: these tokens/utilities, relied on by Tasks 5–7 — colours `bg-coral` `bg-sun` `bg-teal` `bg-lilac` `text-coral-text` `text-sun-text` `text-teal-text` `text-lilac-text` `text-on-accent` `bg-canvas` `border-border-soft`; shadows `shadow-hard-1`…`shadow-hard-5` `shadow-cta` `shadow-pressed`; easings `ease-pop` `ease-bounce` `ease-exit`; durations `var(--dur-fast|base|slow|exit)`; utilities `island` `pressable`; animations `tp-fade-in` `tp-fade-in-sheet` `tp-fade-out` `tp-pop-in` `tp-pop-out` `tp-slide-up` `tp-slide-down` `tp-slide-in-right` `tp-slide-out-right` `tp-slide-in-left` `tp-slide-out-left` `tp-toast-in` `tp-toast-out` `tp-rise-in` `tp-pop` `tp-wiggle` `tp-pulse`; type helpers `.text-display` `.text-label`; and a **global** `:focus-visible` rule giving a 3px `outline` with 3px offset.

- [ ] **Step 1: Record the current token key surface, to prove nothing is lost**

```bash
cd /work
grep -oE "^\s*--color-[a-z-]+|^\s*--(radius|font|shadow|ease|dur)[a-z-]*" app/globals.css | tr -d ' ' | sort -u > /tmp/tokens-before.txt
wc -l /tmp/tokens-before.txt
```

- [ ] **Step 2: Replace the file**

```bash
cd /work
cp design_handoff/playground/app/globals.css app/globals.css
```

- [ ] **Step 3: Hold `--tp-tab-bar-h` at 4rem**

The handoff sets this to `4.75rem` to match its new `TabBar`, which is **out of scope for this phase**. Raising it now would only make the *existing* tab bar taller, and it is read by `components/ui/toast.tsx`, `components/feedback/feedback-launcher.tsx` and `app/(app)/trips/[tripId]/layout.tsx`, all of which would shift with it.

Edit `app/globals.css`. Find:

```css
:root {
  --tp-tab-bar-h: 4.75rem; /* TabBar: 10 + 44 + 22 px */
}
```

Replace with:

```css
/*
 * Height of the mobile trip tab bar (components/trip/mobile-tab-bar.tsx),
 * excluding the safe-area inset. Single source of truth for everything that
 * must clear the bar: the feedback FAB (components/feedback/feedback-launcher.tsx),
 * the toast viewport (components/ui/toast.tsx), and the trip layout's bottom
 * padding (app/(app)/trips/[tripId]/layout.tsx). Change it here and all four
 * move together.
 *
 * Playground's TabBar wants 4.75rem (10 + 44 + 22 px). Held at 4rem until that
 * component lands — see docs/adr/0060-playground-visual-system.md.
 */
:root {
  --tp-tab-bar-h: 4rem;
}
```

- [ ] **Step 4: Verify the token surface is a superset**

```bash
cd /work
grep -oE "^\s*--color-[a-z-]+|^\s*--(radius|font|shadow|ease|dur)[a-z-]*" app/globals.css | tr -d ' ' | sort -u > /tmp/tokens-after.txt
comm -23 /tmp/tokens-before.txt /tmp/tokens-after.txt
```

Expected: **empty output** — nothing the repo used has been dropped. If any line prints, that token is now missing and every utility using it is broken; add it back before continuing.

- [ ] **Step 5: Verify `.leaflet-container` survived**

The maps (globe, wishlist, route, day) depend on this rule.

```bash
cd /work
grep -A2 "^\.leaflet-container" app/globals.css
```

Expected: the rule is present with `isolation: isolate;`.

- [ ] **Step 6: Run the gates**

```bash
cd /work
npx tsc --noEmit && npm run lint && npm test && npm run build
```

Expected: all pass. `npm test` may surface class-name assertions — if it does, note which and fix them **as assertions**, never by changing component behaviour.

- [ ] **Step 7: Visual check, light and dark**

Start the dev server and look at `/trips` and one trip page in both themes.

```bash
cd /work
npm run dev
```

Confirm by eye: ink 2px borders on cards, hard offset shadows (no blur), paper `#FFFBF3` background in light, `#211F1B` in dark, body text legible in both. Stop the server when done.

- [ ] **Step 8: Commit**

```bash
cd /work
git add app/globals.css
git commit -m "feat(design): swap in the Playground design tokens

Replaces app/globals.css with the handoff version. Token names are unchanged,
so every existing utility keeps working and re-skins: --primary coral -> ink,
--accent teal -> coral, --border soft beige -> ink, --radius 1rem -> 1.25rem,
and shadow-soft/-lg now map to hard offset shadows. Adds the coral/sun/teal/
lilac fills with their *-text counterparts for accent text on neutral
surfaces, hard-shadow and easing scales, the island and pressable utilities,
the tp-* animations, and a global 3px :focus-visible ring.

Verified the new file is a strict superset of the previous @theme inline key
set, so no call site loses a token. Keeps .leaflet-container, and holds
--tp-tab-bar-h at 4rem: the handoff's 4.75rem belongs with the new TabBar,
which is not part of this phase.

The app will look inconsistent until the category and chapter hues are
re-tokenised -- they are still raw Tailwind, awaiting a Playground ramp.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Fonts and PWA identity

Swap the display font and the installable-app identity. The handoff `layout.tsx` has been verified to preserve the provider tree exactly: `ThemeProvider → MotionProvider → {children} / Toaster / PwaRegister / VercelAnalytics`.

**Files:**
- Modify: `app/layout.tsx`, `app/layout.test.tsx`, `app/manifest.ts`
- Create: `public/favicon.svg`, `public/favicon-16.png`, `public/favicon-32.png`, `public/apple-touch-icon.png`, `public/safari-pinned-tab.svg`, `public/icons/{icon-192,icon-512,icon-maskable-192,icon-maskable-512,push-badge-96}.png`
- Delete: `app/icon.tsx`, `app/apple-icon.tsx`

**Interfaces:**
- Consumes: `design_handoff/playground/app/layout.tsx`, `design_handoff/playground/app/manifest.ts`, `design_handoff/playground/public/` (Task 1); `--font-display` from Task 2.
- Produces: `--font-display` now resolves to Bricolage Grotesque; a metadata title template `"%s · Teepee"` that every page-level `title` string now appends to.

- [ ] **Step 1: Copy the static assets in**

```bash
cd /work
cp design_handoff/playground/public/favicon.svg design_handoff/playground/public/favicon-16.png design_handoff/playground/public/favicon-32.png design_handoff/playground/public/apple-touch-icon.png design_handoff/playground/public/safari-pinned-tab.svg public/
mkdir -p public/icons
cp design_handoff/playground/public/icons/*.png public/icons/
ls public/icons   # expect: icon-192.png icon-512.png icon-maskable-192.png icon-maskable-512.png push-badge-96.png
```

- [ ] **Step 2: Swap the layout and manifest**

```bash
cd /work
cp design_handoff/playground/app/layout.tsx app/layout.tsx
cp design_handoff/playground/app/manifest.ts app/manifest.ts
```

- [ ] **Step 3: Confirm the provider tree survived the swap**

```bash
cd /work
grep -n "ThemeProvider\|MotionProvider\|Toaster\|PwaRegister\|VercelAnalytics" app/layout.tsx
```

Expected: all five present, `ThemeProvider` wrapping `MotionProvider` wrapping `{children}`, `Toaster`, `PwaRegister`, `VercelAnalytics`. If any is missing, re-add it — the handoff file must not drop a provider.

- [ ] **Step 4: Delete the superseded dynamic icon routes**

`app/manifest.ts` now points at static `/icons/*.png` and `layout.tsx` declares `icons` explicitly, so these generated routes are dead.

```bash
cd /work
git rm app/icon.tsx app/apple-icon.tsx
grep -rn "/icon\b\|/apple-icon\b" --include=*.ts --include=*.tsx app components lib server | grep -v node_modules || echo "OK: no references"
```

Expected: `OK: no references`.

- [ ] **Step 5: Update the layout test**

`app/layout.test.tsx` mocks the old font and asserts the old brand name. Open it and make two edits.

Find:

```ts
  Space_Grotesk: () => ({ variable: "--font-display-google", className: "" }),
```

Replace with:

```ts
  Bricolage_Grotesque: () => ({ variable: "--font-display-google", className: "" }),
```

Find:

```ts
    expect(metadata.appleWebApp).toMatchObject({ capable: true, title: "TEEPEE" });
```

Replace with:

```ts
    expect(metadata.appleWebApp).toMatchObject({ capable: true, title: "Teepee" });
```

- [ ] **Step 6: Run the test to confirm it passes**

```bash
cd /work
npm test -- app/layout.test.tsx
```

Expected: PASS. If it fails on the font mock, check the exact export name the handoff layout imports from `next/font/google` (`Bricolage_Grotesque`) and match the mock to it.

- [ ] **Step 7: Run the gates**

```bash
cd /work
npx tsc --noEmit && npm run lint && npm test && npm run build
```

Expected: all pass. `npm run build` is the meaningful one here — it will fail if `Bricolage_Grotesque` is not a valid `next/font/google` export or if the `axes: ["opsz"]` option is rejected for this font.

- [ ] **Step 8: Commit**

```bash
cd /work
git add -A app public
git commit -m "feat(design): Bricolage Grotesque and the Playground PWA identity

Swaps the display font from Space Grotesk to Bricolage Grotesque (OFL,
variable wght 200-800 plus an opsz axis), keeping Plus Jakarta Sans for body.
The provider tree is unchanged: ThemeProvider > MotionProvider > children,
Toaster, PwaRegister, VercelAnalytics.

Brings in the new icon set as static files and points the manifest at them,
which retires the generated app/icon.tsx and app/apple-icon.tsx routes. Also
adds a '%s · Teepee' title template, so page-level titles no longer each
spell out the product name -- the sweep in the next commit relies on that.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Brand sweep — TEEPEE → Teepee

The handoff renames the product. Task 3 changed the metadata and manifest; this task makes the rest of the app agree, so it never shows two spellings on one screen.

**Scope discipline.** Change **user-facing strings only**: page titles, visible copy, `aria-label`s, push notification titles, admin-notification text. Do **not** change occurrences inside code comments or JSDoc — those are internal prose, the same category as `CONTEXT.md`, and rewriting ~40 of them buys nothing. `CONTEXT.md` itself is explicitly not rewritten (recorded as a follow-up in the ADR).

**Files:**
- Modify (user-facing strings): `app/(app)/layout.tsx`, `app/(app)/whats-new/page.tsx`, `app/(app)/globe/page.tsx`, `app/(app)/admin/allowed-emails.tsx`, `app/(app)/trips/page.tsx`, `app/(app)/trips/new/page.tsx`, `app/(app)/trips/[tripId]/print/page.tsx`, `app/(app)/trips/[tripId]/help/page.tsx`, `app/(app)/help/page.tsx`, `app/privacy/page.tsx`, `app/terms/page.tsx`, `app/signin/page.tsx`, `app/share/[token]/page.tsx`, `components/feedback/feedback-launcher.tsx`, `components/trip/settings/digest-panel.tsx`, `components/account/devices-panel.tsx`, `lib/digest.ts`, `lib/access-requests.ts`, `lib/auth.ts`, `lib/feedback-inbox.ts`
- Modify (tests asserting the old string, only if they fail): any `*.test.tsx` the suite flags

**Interfaces:**
- Consumes: the `"%s · Teepee"` title template from Task 3.
- Produces: a single user-facing spelling, `Teepee`. The lowercase `teepee.` wordmark is the logo's business and arrives in Task 6.

- [ ] **Step 1: List every occurrence and classify it**

```bash
cd /work
grep -rn "TEEPEE" --include=*.tsx --include=*.ts app components lib server | grep -v "\.test\."
```

Read each hit. Mark it **user-facing** if the string is rendered, is an `aria-label`, is a `title`/`description` in metadata, or is sent as notification text. Mark it **comment** if it sits inside `//`, `/* */` or a JSDoc block. Only the user-facing ones change.

- [ ] **Step 2: Simplify the page titles that the template now covers**

Several pages spell out the product name in their own `title`. The root layout's `"%s · Teepee"` template now appends it, so leaving them would render "Your trips · TEEPEE · Teepee".

In `app/(app)/trips/page.tsx`, find:

```ts
  return { title: "Your trips · TEEPEE" };
```

Replace with:

```ts
  return { title: "Your trips" };
```

Apply the same shape to each of these — strip the ` · TEEPEE` suffix and keep the leading phrase:

- `app/(app)/whats-new/page.tsx` — `"What's new · TEEPEE"` → `"What's new"`
- `app/(app)/globe/page.tsx` — `"Globe · TEEPEE"` → `"Globe"`
- `app/(app)/trips/new/page.tsx` — `"New trip · TEEPEE"` → `"New trip"`
- `app/privacy/page.tsx` — `"Privacy · TEEPEE"` → `"Privacy"`
- `app/terms/page.tsx` — `"Terms · TEEPEE"` → `"Terms"`
- `app/signin/page.tsx` — `"Sign in · TEEPEE"` → `"Sign in"`
- `app/share/[token]/page.tsx` — `"Shared Itinerary — TEEPEE"` → `"Shared itinerary"`
- `lib/digest.ts` line ~246 — the push title `"Test · TEEPEE"` → `"Test · Teepee"` (a push title is **not** covered by the metadata template, so it keeps the full name)

- [ ] **Step 3: Replace the remaining user-facing occurrences**

For every other user-facing hit from Step 1, replace the literal `TEEPEE` with `Teepee`. Examples, to fix the shape:

`app/(app)/layout.tsx`:

```tsx
            aria-label="Teepee — go to your trips"
```

```tsx
              Teepee
```

```tsx
                  <Link href="/help">How to use Teepee</Link>
```

`app/(app)/help/page.tsx` and `app/(app)/trips/[tripId]/help/page.tsx`:

```ts
  title: "How to use Teepee",
```

```ts
  description: "A short guide to planning a trip together in Teepee.",
```

Work through `app/privacy/page.tsx` (many visible occurrences), `app/terms/page.tsx`, `app/signin/page.tsx`, `app/share/[token]/page.tsx`, `app/(app)/trips/[tripId]/print/page.tsx`, `app/(app)/admin/allowed-emails.tsx`, `components/feedback/feedback-launcher.tsx` (two `aria-label`s), `components/trip/settings/digest-panel.tsx`, `components/account/devices-panel.tsx`, `lib/access-requests.ts`, `lib/auth.ts` the same way.

`lib/feedback-inbox.ts` line ~153 generates the header of `docs/feedback/inbox.md`. Change the string there too — the file regenerates on the next `feedback:pull`, so the committed printout will lag until then. That is expected.

- [ ] **Step 4: Confirm only comments remain**

```bash
cd /work
grep -rn "TEEPEE" --include=*.tsx --include=*.ts app components lib server | grep -v "\.test\."
```

Read every remaining line. Each must be inside a comment or JSDoc. If a rendered string still says `TEEPEE`, fix it now.

- [ ] **Step 5: Run the gates**

```bash
cd /work
npx tsc --noEmit && npm run lint && npm test && npm run build
```

Expected: tests may fail where they assert on the old copy (for example a `getByText(/TEEPEE/)`). Update those assertions to the new spelling — the copy change is the intent, so the assertion is what is stale.

- [ ] **Step 6: Commit**

```bash
cd /work
git add -A
git commit -m "feat(design): rename the product from TEEPEE to Teepee in user-facing copy

The Playground handoff sets the product name as 'Teepee' (and the wordmark as
lowercase 'teepee.'). This makes the rest of the app agree, so no screen shows
two spellings.

Page titles drop their hand-written ' · TEEPEE' suffix now that the root
layout appends '%s · Teepee' for them. Push and admin-notification titles keep
the full name, since no template applies to those.

Deliberately untouched: occurrences inside code comments and JSDoc, and
CONTEXT.md -- that is a domain glossary written in prose, and rewriting dozens
of paragraphs for casing buys nothing. Logged as a follow-up in ADR 0060.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Restyled primitives — the eight export-compatible drop-ins

Each of these eight has been verified to keep the repo's exact export surface. `Card` is the only one that differs, and only by *adding* `cardVariants`. Props are additive: `Button` gains `accent`/`dashed` variants and a `square` shape, `Card` gains `tone`/`shadow`/`radius`/`dashed`/`interactive`/`sticker`, `Badge` gains colour tones and `caps`, `Input` gains `inputSize`, `Segmented` gains `tone`, `EmptyState` gains `glyph`/`tone`.

Note that the new `Button` drops its local `focus-visible:ring-*` classes. That is correct: Task 2 installed a **global** `:focus-visible` rule giving a 3px outline with a 3px offset, so the ring is now inherited rather than per-component. This task therefore depends on Task 2 being in.

**Files:**
- Modify: `components/ui/button.tsx`, `card.tsx`, `badge.tsx`, `input.tsx`, `segmented.tsx`, `dialog.tsx`, `empty-state.tsx`, `skeleton.tsx`
- Modify: `components/ui/button.test.tsx`

**Interfaces:**
- Consumes: tokens and utilities from Task 2 (`pressable`, `island`, `shadow-cta`, `shadow-hard-*`, `ease-pop`, `var(--dur-fast)`, `border-border-soft`, `bg-coral`, `text-on-accent`).
- Produces, for Task 6: `Card` accepting `tone?: "white"|"paper"|"coral"|"sun"|"teal"|"lilac"|"ink"`, `shadow?: 0|1|2|3|4|5`, `radius?: "md"|"lg"|"xl"|"2xl"`, `dashed?: boolean`, `interactive?: boolean`, `sticker?: React.ReactNode` — `StatCard` depends on `tone`.

- [ ] **Step 1: Record the export surface, to prove it is preserved**

```bash
cd /work
for f in button card badge input segmented dialog empty-state skeleton; do
  echo "--- $f"; sed -n '/^export {/,/};/p' components/ui/$f.tsx | tr -d ' \n'; echo
done > /tmp/exports-before.txt
cat /tmp/exports-before.txt
```

- [ ] **Step 2: Copy the eight files in**

```bash
cd /work
for f in button card badge input segmented dialog empty-state skeleton; do
  cp design_handoff/playground/components/ui/$f.tsx components/ui/$f.tsx
done
```

- [ ] **Step 3: Verify every previous export still exists**

```bash
cd /work
for f in button card badge input segmented dialog empty-state skeleton; do
  echo "--- $f"; sed -n '/^export {/,/};/p' components/ui/$f.tsx | tr -d ' \n'; echo
done
```

Compare against `/tmp/exports-before.txt`. Every name present before must still be present. `card` is expected to gain `cardVariants`; nothing may be lost. If a name disappeared, re-add it before continuing.

- [ ] **Step 4: Run the button test to see it fail**

```bash
cd /work
npm test -- components/ui/button.test.tsx
```

Expected: FAIL on several class assertions, because the button's classes changed by design.

- [ ] **Step 5: Update the five stale class assertions**

Open `components/ui/button.test.tsx`. The border width, the `lg` height, the outline variant's background and the press-feedback mechanism all changed.

Find:

```ts
  it("applies the outline variant", () => {
    render(<Button variant="outline">Outline</Button>);
    const btn = screen.getByRole("button");
    expect(btn).toHaveClass("border-[1.5px]");
    expect(btn).toHaveClass("bg-background");
  });

  it("applies a 1.5px border to the outline variant", () => {
    render(<Button variant="outline">Outline</Button>);
    const btn = screen.getByRole("button");
    expect(btn).toHaveClass("border-[1.5px]");
  });
```

Replace with:

```ts
  it("applies the outline variant", () => {
    render(<Button variant="outline">Outline</Button>);
    const btn = screen.getByRole("button");
    expect(btn).toHaveClass("border-2");
    expect(btn).toHaveClass("bg-transparent");
  });

  it("applies a 2px border, the Playground outline weight", () => {
    render(<Button variant="outline">Outline</Button>);
    const btn = screen.getByRole("button");
    expect(btn).toHaveClass("border-2");
  });
```

Find:

```ts
    rerender(<Button size="lg">Large</Button>);
    expect(screen.getByRole("button")).toHaveClass("h-12");
```

Replace with:

```ts
    rerender(<Button size="lg">Large</Button>);
    expect(screen.getByRole("button")).toHaveClass("h-[52px]");
```

Find:

```ts
  it("includes press-feedback scale on the base, gated by motion-safe", () => {
    render(<Button>Press me</Button>);
    expect(screen.getByRole("button")).toHaveClass("motion-safe:active:scale-[0.98]");
  });
```

Replace with:

```ts
  it("carries the pressable utility, which owns hover-lift and press physics", () => {
    render(<Button>Press me</Button>);
    expect(screen.getByRole("button")).toHaveClass("pressable");
  });
```

The `bg-primary`, `bg-destructive`, `h-9` and `size-11` assertions still hold — leave them alone.

- [ ] **Step 6: Run the button test to verify it passes**

```bash
cd /work
npm test -- components/ui/button.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Run the full suite and fix any other class assertions**

```bash
cd /work
npm test
```

Three other `toHaveClass` assertions exist in the repo — two in `components/ui/money-input.test.tsx`, one in `components/ui/animated-list.test.tsx`. Neither component is replaced by this task, so they should still pass. If any test fails, read it: update the **assertion** to the new class, never the component's behaviour.

- [ ] **Step 8: Run the remaining gates**

```bash
cd /work
npx tsc --noEmit && npm run lint && npm run build
```

Expected: all pass. `tsc` is the one to watch — a consumer passing a prop the new variant table no longer accepts will surface here.

- [ ] **Step 9: Commit**

```bash
cd /work
git add components/ui
git commit -m "feat(ui): restyle the eight core primitives to Playground

Drops in the handoff versions of button, card, badge, input, segmented,
dialog, empty-state and skeleton. Every previous export is preserved -- Card
only adds cardVariants -- and the new props are additive: Button gains accent
and dashed variants plus a square shape, Card gains tone/shadow/radius/dashed/
interactive/sticker, Badge gains the colour tones and caps, Input gains
inputSize, Segmented gains tone, EmptyState gains glyph and tone.

Button no longer carries its own focus-visible ring classes: globals.css now
installs a global 3px :focus-visible outline, so the ring is inherited rather
than declared per component.

Updates five class assertions in button.test.tsx to match -- border-[1.5px] ->
border-2, the outline variant's bg-background -> bg-transparent, lg h-12 ->
h-[52px], and the motion-safe scale -> the pressable utility that replaced it.
Assertions changed; behaviour did not.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: New primitives — the ten additions

Ten new files. The handoff also ships `components/ui/offline-banner.tsx`; it is **deliberately not copied**. The repo's existing `components/offline-banner.tsx` is already mounted in `app/(app)/layout.tsx`, uses the shared `useOnlineStatus` hook, and its copy correctly reflects ADR 0016 (offline is read-only) and ADR 0041 (feedback notes queue). The handoff version reimplements the listener inline and takes a `queued` prop for a sync queue this app does not have. The existing one is hand-restyled in Task 7 instead.

`tab-bar.tsx` and `dock.tsx` are also not copied — navigation is out of scope for this phase.

**Files:**
- Create: `components/ui/chip.tsx`, `count-badge.tsx`, `progress-bar.tsx`, `stat-card.tsx`, `list-row.tsx`, `stepper.tsx`, `switch.tsx`, `checkbox.tsx`, `logo.tsx`, `icon.tsx`

**Interfaces:**
- Consumes: `Card` with its `tone` prop (Task 5); tokens from Task 2.
- Produces, for later phases: `Chip({tone,size,dashed,selected,...})`, `CountBadge({count,tone})`, `ProgressBar({value,label,fill,size})`, `StatCard({label,value,sub,tone,progress,big})`, `ListRow({tile,tileTone,title,sub,trailing,as,href})`, `Stepper({value,onChange,min,max,unit,label})`, `Switch({checked,onCheckedChange})`, `Checkbox({label,strike,...})`, `Logo({variant,size,onDark})`, `Icon({icon,size,strokeWidth})`, `TentIcon({size,strokeWidth})`.

- [ ] **Step 1: Copy the ten files in**

```bash
cd /work
for f in chip count-badge progress-bar stat-card list-row stepper switch checkbox logo icon; do
  cp design_handoff/playground/components/ui/$f.tsx components/ui/$f.tsx
done
ls components/ui/{chip,count-badge,progress-bar,stat-card,list-row,stepper,switch,checkbox,logo,icon}.tsx
```

- [ ] **Step 2: Confirm the three excluded files were NOT copied**

```bash
cd /work
ls components/ui/tab-bar.tsx components/ui/dock.tsx components/ui/offline-banner.tsx 2>&1 | grep -c "No such file"
```

Expected: `3`. If any exists, delete it — navigation is out of scope and the offline banner is handled in Task 7.

- [ ] **Step 3: Confirm the client/server split is right**

```bash
cd /work
head -1 components/ui/{chip,stepper,switch,checkbox}.tsx
head -1 components/ui/{count-badge,progress-bar,stat-card,list-row,logo,icon}.tsx
```

Expected: the first four each start with `"use client";` (they own handlers or state). The last six must **not** — they are Server Components. If a `"use client"` appears on one of the six, remove it.

- [ ] **Step 4: Write a smoke test for the two primitives with real logic**

`ProgressBar` clamps and rounds its value; `Chip` reflects `selected` as `aria-pressed`. Both are worth pinning. Create `components/ui/progress-bar.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProgressBar } from "@/components/ui/progress-bar";

describe("ProgressBar", () => {
  it("exposes the value on a progressbar role", () => {
    render(<ProgressBar value={59} label="Locked in" />);
    const bar = screen.getByRole("progressbar", { name: "Locked in" });
    expect(bar).toHaveAttribute("aria-valuenow", "59");
    expect(bar).toHaveAttribute("aria-valuemin", "0");
    expect(bar).toHaveAttribute("aria-valuemax", "100");
  });

  it("clamps out-of-range values rather than overflowing the track", () => {
    const { rerender } = render(<ProgressBar value={140} label="Over" />);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100");

    rerender(<ProgressBar value={-20} label="Under" />);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");
  });

  it("rounds fractional values", () => {
    render(<ProgressBar value={33.6} label="Part way" />);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "34");
  });
});
```

Create `components/ui/chip.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Chip } from "@/components/ui/chip";

describe("Chip", () => {
  it("renders a button that does not submit its form by default", () => {
    render(<Chip>Food</Chip>);
    expect(screen.getByRole("button", { name: "Food" })).toHaveAttribute("type", "button");
  });

  it("reflects selection as aria-pressed", () => {
    const { rerender } = render(<Chip selected={false}>Food</Chip>);
    expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "false");

    rerender(<Chip selected>Food</Chip>);
    expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "true");
  });

  it("leaves aria-pressed off when selection is not a concept", () => {
    render(<Chip>Add</Chip>);
    expect(screen.getByRole("button")).not.toHaveAttribute("aria-pressed");
  });

  it("calls onClick", async () => {
    const onClick = vi.fn();
    render(<Chip onClick={onClick}>Food</Chip>);
    await userEvent.click(screen.getByRole("button", { name: "Food" }));
    expect(onClick).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 5: Run the new tests**

```bash
cd /work
npm test -- components/ui/progress-bar.test.tsx components/ui/chip.test.tsx
```

Expected: PASS. If `userEvent` is not the import shape this repo uses, check a neighbouring test such as `components/ui/confirm-dialog.test.tsx` and match it.

- [ ] **Step 6: Run the gates**

```bash
cd /work
npx tsc --noEmit && npm run lint && npm test && npm run build
```

Expected: all pass. Watch `lint` — `logo.tsx` hard-codes three brand hex values on purpose; if a rule objects, keep the hex and confirm the file's comment explains why a logo mark must not theme-shift.

- [ ] **Step 7: Commit**

```bash
cd /work
git add components/ui
git commit -m "feat(ui): add the ten new Playground primitives

Chip (clickable pill, aria-pressed), CountBadge, ProgressBar, StatCard,
ListRow, Stepper, Switch, Checkbox, Logo and Icon/TentIcon. Chip, Stepper,
Switch and Checkbox are Client Components because they own handlers; the rest
stay on the server.

Covers the two with real logic: ProgressBar clamps and rounds into its aria
attributes, Chip only claims aria-pressed when selection is actually a concept.

Three handoff files are deliberately left out. tab-bar and dock are navigation,
which is not part of this phase. offline-banner would duplicate the one we
already mount -- and the handoff version reimplements the online listener
instead of using useOnlineStatus, and takes a queued prop for a sync queue this
app does not have: offline is read-only (ADR 0016) and only feedback notes
queue (ADR 0041). Ours is restyled in the next commit instead.

Logo keeps three literal hex values for the tent mark. A brand mark must read
the same in both themes, so it deliberately does not follow the tokens.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Hand-restyle the remaining UI surfaces

The handoff did not rewrite these, but their class changes are small and specified in `design_handoff/playground/README.md` under "Restyle by hand". Change classes only — never structure, props, exports or behaviour.

**Files:**
- Modify: `components/ui/avatar.tsx`, `toast.tsx`, `sheet.tsx`, `select.tsx`, `textarea.tsx`, `money-input.tsx`, `tabs.tsx`, `popover.tsx`, `dropdown-menu.tsx`
- Modify: `components/offline-banner.tsx`

**Interfaces:**
- Consumes: tokens from Task 2; the restyled `dialog.tsx` from Task 5 (its classes are the reference for `sheet.tsx`); the restyled `segmented.tsx` from Task 5 (the reference for `tabs.tsx`).
- Produces: no new API. Every export and prop stays exactly as it is.

- [ ] **Step 1: Read the reference classes**

```bash
cd /work
sed -n '/^Restyle by hand/,/^\*\*Server\/Client rule/p' design_handoff/playground/README.md
```

This is the authority for each file's target classes.

- [ ] **Step 2: Restyle `avatar.tsx`**

Target: `border-2 border-border`, an accent fill (`bg-coral` / `bg-sun` / `bg-teal` / `bg-lilac` as the existing tone logic dictates), and 800-weight initials (`font-extrabold`). Replace any 1px border with `border-2`, and any `font-medium`/`font-semibold` on the initials with `font-extrabold`. Keep the Radix structure and every prop.

- [ ] **Step 3: Restyle `toast.tsx`**

Target: `rounded-md border-2 border-border shadow-hard-2 bg-teal island`. Enter with `tp-toast-in`, exit with `tp-toast-out`.

Replace the existing enter/exit animation classes with the `tp-toast-in` / `tp-toast-out` utilities (Task 2 provides both). Leave the viewport's `var(--tp-tab-bar-h)` positioning arithmetic exactly as it is — it is load-bearing and the variable has not moved.

- [ ] **Step 4: Restyle `sheet.tsx`**

Target: the same classes as the restyled `dialog.tsx`. Read `components/ui/dialog.tsx` and mirror its overlay, content, border, radius, shadow and animation classes onto the equivalent sheet parts, keeping the sheet's own `side` positioning logic.

- [ ] **Step 5: Restyle `select.tsx`, `textarea.tsx` and `money-input.tsx`**

Target for each: `border-2 border-input rounded-md bg-card`, plus the focus lift the restyled `Input` uses. Read `components/ui/input.tsx` and copy its focus treatment across so the three controls match it.

- [ ] **Step 6: Restyle `tabs.tsx`**

Target: the Segmented look. Read `components/ui/segmented.tsx` and apply its track and active-item classes to the equivalent Radix Tabs parts. Keep the Tabs API.

- [ ] **Step 7: Restyle `popover.tsx` and `dropdown-menu.tsx`**

Target for both: `border-2 border-border rounded-md shadow-hard-3 bg-card`.

- [ ] **Step 8: Restyle `components/offline-banner.tsx`**

Class changes only. The copy, the `useOnlineStatus` call, `role="status"` and the `WifiOff` icon all stay — the copy is load-bearing, because it tells the Traveller that plan changes need a connection while feedback will still send (ADR 0016, ADR 0041).

Keep the semantic tokens. `bg-warning` already resolves to sun under Playground and `text-warning-foreground` to ink in both themes, so swapping them for `bg-sun`/`text-on-accent` would change nothing visually while losing the meaning. The real changes are the ink rule below the banner and the heavier weight.

Find:

```tsx
      className="sticky top-0 z-30 flex items-center justify-center gap-2 bg-warning px-4 py-1.5 text-center text-sm font-medium text-warning-foreground"
```

Replace with:

```tsx
      className="sticky top-0 z-30 flex items-center justify-center gap-2 border-b-2 border-border bg-warning px-4 py-1.5 text-center text-sm font-bold text-warning-foreground"
```

- [ ] **Step 9: Verify no behaviour changed**

```bash
cd /work
git diff --stat components/ui components/offline-banner.tsx
git diff components/ui components/offline-banner.tsx | grep -E "^[+-]" | grep -vE "^[+-]{3}" | grep -vE "className|class=|^\+\s*$|^-\s*$" | head -40
```

Read the output. Every line should be a class-string change. If a `+`/`-` pair touches a prop, an export, a hook call, a conditional or a handler, revert that part — this task is classes only.

- [ ] **Step 10: Run the gates**

```bash
cd /work
npx tsc --noEmit && npm run lint && npm test && npm run build
```

Expected: all pass. `components/ui/toast.test.tsx`, `sheet.test.tsx`, `tabs.test.tsx`, `popover.test.tsx`, `dropdown-menu.test.tsx`, `money-input.test.tsx` and `components/offline-banner.test.tsx` all exist — if any asserts on an old class, update the assertion.

- [ ] **Step 11: Commit**

```bash
cd /work
git add components/ui components/offline-banner.tsx
git commit -m "feat(ui): hand-restyle the remaining UI surfaces to Playground

Covers the nine components the handoff specified in prose rather than
rewriting -- avatar, toast, sheet, select, textarea, money-input, tabs,
popover, dropdown-menu -- plus the offline banner we kept in place of the
handoff's version.

Classes only: 2px ink outlines, hard offset shadows, the Segmented look on
Tabs, the Input focus lift on the three text controls, and tp-toast-in/out on
the toast. No prop, export, hook or handler moved. The toast viewport's
--tp-tab-bar-h arithmetic is untouched; it is load-bearing and the variable has
not moved.

The offline banner keeps its copy deliberately: it has to say that plan changes
need a connection while feedback still sends (ADR 0016, ADR 0041).

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Record the decision

Write the ADR the brief asks for. Its job is to stop a future reader wondering why the repo is half-Playground — the deferrals are the most valuable part of the document.

This task also restores two explanatory comments that earlier tasks lost, and commits the plan document itself. Both are documentation work, which is why they live here rather than in a fix round.

**Files:**
- Create: `docs/adr/0060-playground-visual-system.md`
- Modify: `app/globals.css` (restore two lost comments — Step 0)
- Add to git: `docs/superpowers/plans/2026-09-23-playground-visual-system-phase-1.md` (currently untracked)

**Interfaces:**
- Consumes: everything Tasks 1–7 did.
- Produces: the written record. No behaviour change.

- [ ] **Step 0: Restore two explanatory comments lost in Task 2**

Task 2 replaced `app/globals.css` wholesale. Two repo-only comments explaining *why* a rule exists did not survive the copy. The rules themselves are intact — only the reasoning was lost, which is exactly what gets silently broken by a later edit.

Recover the original text and re-apply it:

```bash
cd /work
git show 6294a92~1:app/globals.css | sed -n '/leaflet/,/^}/p'
git show 6294a92~1:app/globals.css | grep -B6 "tp-fade-in-sheet"
```

Read both comments, then add them back to the current `app/globals.css` above the rules they describe:

1. Above `.leaflet-container` — the comment explaining that `isolation: isolate` exists because Leaflet's z-index would otherwise leak above modal overlays, and that this covers all four map surfaces (globe, wishlist, route, day).
2. Above the `tp-fade-in-sheet` utility — the comment explaining it is deliberately paced to match `tp-slide-up`'s duration so a sheet's backdrop and panel arrive together.

Adapt the wording where the new file's structure differs, but keep the reasoning intact. Do not change any CSS rule, selector, or value — comments only.

- [ ] **Step 1: Confirm the ADR number is free**

```bash
cd /work
ls docs/adr | tail -3
```

Expected: the highest is `0059-errors-report-to-our-own-database.md`, so `0060` is next. If something else claimed it, use the next free number and adjust the filename.

- [ ] **Step 2: Read a neighbouring ADR for house style**

```bash
cd /work
cat docs/adr/0029-normalized-ui-conventions.md
```

Match its structure — Context, Decision, Consequences — and its register: plain prose that explains *why*, not a changelog.

- [ ] **Step 3: Write the ADR**

Create `docs/adr/0060-playground-visual-system.md`. It must cover:

**Context** — the app was on a warm coral-and-beige system with soft shadows and 1rem radii. Playground is a paper-and-ink system: `#FFFBF3` paper, ink `#1D1D1B` 2px outlines, hard offset shadows with no blur, coral demoted from primary to accent, 1.25rem radii, Bricolage Grotesque for display. The handoff arrived as tokens, a layout, a manifest, an icon set, 21 `components/ui` files and four email templates.

**Decision** — adopt it bottom-up, in phases. Phase 1 is tokens, fonts, PWA identity, brand name and primitives. Record specifically:
- Token *names* were kept, so the whole app re-skinned through shared components rather than through a per-file sweep. The new `globals.css` was verified to be a strict superset of the previous `@theme inline` key set.
- `--tp-tab-bar-h` held at `4rem`, not the handoff's `4.75rem`, because that value belongs with a `TabBar` this phase does not ship, and three other components position themselves from it.
- The product is `Teepee` in user-facing copy, `teepee.` in the wordmark. Code comments and `CONTEXT.md` were left saying `TEEPEE` — they are internal prose, and the churn buys nothing. **Follow-up.**
- The focus ring moved from per-component `focus-visible:ring-*` classes to a single global `:focus-visible` rule in `globals.css`.
- The repo's `components/offline-banner.tsx` was kept and restyled rather than replaced by the handoff's `ui/offline-banner.tsx`, which reimplements the online listener instead of using `useOnlineStatus` and takes a `queued` prop for a sync queue that does not exist — offline is read-only (ADR 0016) and only feedback notes queue (ADR 0041).
- The ⌘K dialog listed as "new" in the brief already existed (`components/command-palette*.tsx` over `server/actions/search`), so nothing was built.
- `tsconfig.json` excludes `design_handoff`. The handoff is reference material, not application code, and its own files import components that did not exist until Tasks 5 and 6 — without the exclude, `tsc` fails on material we never ship.

**The recurring hazard, and what it cost** — this is the most useful thing a future reader can take from this ADR. Copying a handoff file wholesale silently erases repo-specific fixes the handoff author never knew about. None of these were caught by the test suite; each was found by reading the old file against the new one. Four instances in phase 1:

- `public/sw.js` pointed push notifications at `/icon`, a route deleted with `app/icon.tsx`. Now `/icons/icon-192.png` and `/icons/push-badge-96.png`.
- `app/globals.css` lost the comments explaining why `.leaflet-container` needs `isolation: isolate` and why `tp-fade-in-sheet` is paced to `tp-slide-up`. Restored in this task.
- `components/ui/dialog.tsx` lost BOTH of its iOS elastic-overscroll covers — the footer's `after:` and the header's mirroring `before:`. The replacement kept the sticky positioning and negative margins that *create* the gap and dropped the opaque fill that covered it, so the bug was invisible everywhere except a real iPhone. Restored, with regression tests named for the reason they exist.

The lesson to carry into phase 2: diff every copied file against its predecessor and ask what each removed line was *for*. A class that looks decorative may be load-bearing, and the comment explaining it is often the first casualty.

**Exemptions to the "no new hex, no inline styles" rule**, each with its reason:
- `components/ui/logo.tsx` — three literal hex values for the tent mark. A brand mark must not theme-shift.
- `components/ui/progress-bar.tsx` — inline `style={{ width }}`; a computed percentage Tailwind cannot express.
- `components/ui/logo.tsx` — inline `style={{ fontSize: size }}`; a computed size prop.
- `app/global-error.tsx` — must stay fully inline-styled. It replaces the entire document when the root layout fails, so `globals.css` never loads. **Not restyled in this phase.**

**Deferred, and why** — each of these is blocked on design material that was not delivered, and inventing it would mean throwing the invention away:
- The screen kits (`ui_kits/teepee-mobile|tablet|desktop`, `ui_kits/shared/*.jsx`) and `specs/index.html`, `specs/motion.html`, `guidelines/*.card.html` are referenced by the handoff README but absent. All per-screen restyling waits.
- `specs/notifications.html` is absent, so the four email templates cannot be ported to the copy rules the brief names.
- `components/ui/tab-bar.tsx` and `dock.tsx`. The handoff versions are presentational; the repo's `MobileTabBar` and `TripNav` carry domain behaviour — the More sheet holding eight routes, `?plan=` fork threading (ADR 0020), and `isNavActive`'s exact-match-on-Home rule. Adopting Dock also means restructuring the trip layout into a left-rail shell, which the missing desktop kit would have answered.
- The 7 category hues (`lib/categories.ts`, `lib/map-pins.ts`) and 8 chapter hues (`lib/chapter-colours.ts`) remain on raw Tailwind and literal hex. Playground ships four accent hues; these need seven and eight, mutually distinguishable, and the hue carries meaning rather than decoration. **This is why the app looks inconsistent after phase 1** — roughly 200 call sites still render the old palette.
- Leaflet needs literal colour strings (`divIcon` markers are inline-styled HTML, polylines take a hex), so the map palette cannot follow the "no new hex" rule and awaits a blessed set.
- `ErrorPanel` is named in the handoff README's states row but was not shipped, so per-route `error.tsx` waits. Per-route `loading.tsx` waits on the skeleton compositions.
- The Open Graph image for `app/share/[token]`, and the outlined wordmark SVG (the handoff's own listed known gap).
- Screens with no Playground design at all: `/admin` and its three panels, `/privacy`, `/terms`, both `not-found` files, `app/global-error.tsx`, `trips/[tripId]/help`, the feedback FAB and the notification bell.

**Consequences** — say plainly that the app is mid-migration and looks it; that the beta preview shows a Playground shell around old-palette content; that the deferral list above is the definition of done for phase 2; and that this work lives on `beta` only and must never reach `main`.

- [ ] **Step 4: Check the ADR against what actually shipped**

```bash
cd /work
git log --oneline beta..HEAD
```

Read each commit subject. Every one must be represented in the ADR's Decision section. If a commit did something the ADR does not mention, add it.

- [ ] **Step 5: Run the gates**

```bash
cd /work
npx tsc --noEmit && npm run lint && npm test && npm run build
```

Expected: all pass — this task adds only a markdown file, so a failure means an earlier task left something broken.

- [ ] **Step 6: Commit**

```bash
cd /work
git add docs/adr/0060-playground-visual-system.md
git commit -m "docs(adr): record the Playground visual system and what it defers

ADR 0060. Covers why the token names were kept (so the app re-skinned through
shared components rather than a per-file sweep), why --tp-tab-bar-h is held at
4rem, why the offline banner and the command palette were left alone, and
where the no-hex/no-inline-style rule is deliberately broken and for what
reason.

Most of the value is the deferral list. Phase 1 stops at the primitives
because the screen kits, the notification copy spec, the category and chapter
colour ramps and the ErrorPanel were never delivered -- and the missing colour
ramps are precisely why the app looks half-migrated right now.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Done means

- Eight commits on `feat/playground-visual-system`, branched from `beta`.
- `npx tsc --noEmit`, `npm run lint`, `npm test` and `npm run build` all pass on the final commit.
- `/trips` and a trip page render correctly in both light and dark.
- `main` untouched. `beta` not merged into. Nothing deployed.
- Report back with what shipped, what was deferred, and anything that could not be matched — then **stop and ask** before merging to `beta`.
