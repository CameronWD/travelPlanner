# Logo in the Header, and Two ADR Corrections — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put the `Logo` component on screen. It was built in phase 2 — outlined wordmark paths, no font dependency — but five places render the brand without it: one hand-rolled inline SVG and four 🛖 emoji. Also correct a factual error both Playground ADRs assert about what can be verified.

**Architecture:** Purely a substitution. `components/ui/logo.tsx` already exports `Logo({ variant, size, onDark, className })` with `lockup` (mark + wordmark), `mark` and `wordmark` variants, and is already in use by `components/ui/dock.tsx`. Nothing new is built; five call sites adopt it, and two documents are corrected.

**Tech Stack:** Next.js 16, React 19, Tailwind v4, Vitest + Testing Library.

## Global Constraints

- **Branch:** all work on `fix/logo-in-header-and-adr-corrections`, cut from `beta`. **Never** commit, merge, rebase onto or push to `main`/`master`. **Never** merge into `beta` — stop and ask. **Never** deploy.
- Tailwind v4 classes only. No new hex — `logo.tsx`'s three brand hex values are a named exemption recorded in ADR 0060 and must not be touched.
- Keep Server Components as Server Components. `Logo` is a Server Component; adopting it must not require `"use client"` anywhere.
- Accessibility: every brand mark keeps an accessible name, and decorative internals stay `aria-hidden`. Do not introduce a double announcement.
- **Gates after every task:** `npx tsc --noEmit`, `npm run lint`, `npm test`, then `npm run build`. All four must pass.
- When a test asserts markup that this change replaces, update the **assertion**, never the behaviour.

## Out of Scope

- Restoring `public/brand/*.svg`. Those are static assets for `<img>`, Open Graph and email use — phase 3 work. `Logo` draws inline paths and covers every site in this plan. They are in git history and restore in one command when the OG/email work needs them.
- Body typography (600 weight, 14px, 19.6px line-height). That is the handoff's own `@layer base` rule, and whether to loosen it for long prose is the user's call, not a defect.
- Any screen restyling, emails, or the OG image.

## File Structure

**Modified:**
- `app/(app)/layout.tsx` — replaces a hand-rolled inline `<svg data-testid="tent-icon">` plus text.
- `app/privacy/page.tsx:76`, `app/terms/page.tsx:22`, `app/share/[token]/page.tsx:296` — each replaces `<span aria-hidden="true">🛖</span>` plus the word "Teepee".
- `app/signin/page.tsx:63` — replaces a standalone `text-3xl` 🛖 with no adjacent wordmark.
- Any test asserting `data-testid="tent-icon"` or the emoji.
- `docs/adr/0060-playground-visual-system.md`, `docs/adr/0061-playground-hue-ramp-and-rail-shell.md`.

---

### Task 1: Put the Logo on screen

**Files:**
- Modify: `app/(app)/layout.tsx`, `app/privacy/page.tsx`, `app/terms/page.tsx`, `app/share/[token]/page.tsx`, `app/signin/page.tsx`
- Modify: whichever tests assert the markup being replaced

**Interfaces:**
- Consumes: `Logo` from `components/ui/logo.tsx` — `variant?: "lockup" | "mark" | "wordmark"`, `size?: number`, `onDark?: boolean`, `className?: string`. Every variant wraps itself in an element carrying `role="img"` and `aria-label="Teepee"`; the inner `<svg>` is `aria-hidden`.
- Produces: no new API.

- [ ] **Step 1: Read the component before using it**

```bash
cd /work
cat components/ui/logo.tsx
grep -n "Logo" components/ui/dock.tsx
```

`dock.tsx` is the existing consumer and shows the house pattern. Note what each variant renders and what it names itself, so you do not add a second accessible name on top.

- [ ] **Step 2: Find every site**

```bash
cd /work
grep -rn "🛖" --include=*.tsx app components
grep -rn "tent-icon" --include=*.tsx app components
```

Expect five source sites (one tent SVG, four emoji) plus any test references. Record the list in your report and tick each off as you go.

- [ ] **Step 3: Replace the `(app)` header**

`app/(app)/layout.tsx` renders a `<Link href="/trips">` containing a hand-rolled `<svg data-testid="tent-icon">` and the word "Teepee", with `aria-label="Teepee — go to your trips"` on the Link.

Replace the svg-and-text contents with `<Logo variant="lockup" />`.

**The accessible name needs care here.** The Link's own `aria-label` ("Teepee — go to your trips") is more useful than Logo's generic "Teepee", because it says where the link goes. But `Logo` labels itself, so nesting it inside a labelled Link gives two names for one control. Read how `dock.tsx` handles the same situation — its `Link` carries `aria-label="Teepee home"` around `<Logo variant="mark">` — and decide deliberately. Whatever you choose, verify by rendering that exactly one accessible name results, and say in your report what you chose and why.

- [ ] **Step 4: Replace the three lockup emoji**

`app/privacy/page.tsx:76`, `app/terms/page.tsx:22` and `app/share/[token]/page.tsx:296` each render `<span aria-hidden="true">🛖</span>` followed by the text "Teepee", inside a container with `font-display text-lg font-semibold`.

Replace the emoji **and** the adjacent "Teepee" text with `<Logo variant="lockup" />` — the lockup already contains the wordmark, so leaving the text would render it twice. Remove any now-redundant typography classes on the wrapper, and check the surrounding layout still sits correctly.

Note `share/[token]` is a public, unauthenticated page and its container is a `<span>`, not a `<Link>`.

- [ ] **Step 5: Replace the signin mark**

`app/signin/page.tsx:63` renders a standalone `text-3xl` 🛖 inside a `CardHeader`, with the wordmark supplied separately by `<CardTitle>Welcome to Teepee</CardTitle>` below it.

Use `<Logo variant="mark" size={...} />` here, not `lockup` — a lockup would duplicate the wordmark that the CardTitle already provides. Pick a `size` that matches the visual weight of the `text-3xl` it replaces and say what you chose.

- [ ] **Step 6: Update the affected tests**

```bash
cd /work
grep -rn "tent-icon\|🛖" --include=*.test.tsx app components
```

Update assertions to match the new markup. Do not weaken a test to make it pass — if a test asserted the brand was present, it should still assert that, against the new element.

- [ ] **Step 7: Verify the accessible names by rendering, not by reading**

This is the step that matters. A brand mark nested in a labelled link is the classic double-announcement bug.

```bash
cd /work
npm test -- app/\(app\)/layout.test.tsx app/privacy/page.test.tsx app/terms/page.test.tsx app/signin/page.test.tsx
```

Then, for each of the five sites, confirm by reading the rendered output that there is exactly one accessible name for the brand control, that the inner `<svg>` is still `aria-hidden`, and that no wordmark renders twice. Record the result per site.

- [ ] **Step 8: Run the gates**

```bash
cd /work
npx tsc --noEmit && npm run lint && npm test && npm run build
```

- [ ] **Step 9: Commit**

```bash
cd /work
git add -A
git commit -m "fix(brand): put the Logo component on screen

Phase 2 built Logo with an outlined wordmark so it renders correctly before
the display font loads, then used it in exactly one place -- the desktop rail,
which only appears inside a trip at md+. Everywhere else the brand was a
hand-rolled inline SVG (the app header) or a hut emoji (signin, privacy,
terms, and the public share page).

All five now use Logo. The signin card takes the mark alone, since its
CardTitle already supplies the wordmark.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Correct what the ADRs claim can be verified

Both Playground ADRs tell a future reader that a visual check was impossible. That is false, and it matters: it excuses a gap rather than describing one, in documents whose own thesis is that green gates are not evidence.

**Files:**
- Modify: `docs/adr/0060-playground-visual-system.md`, `docs/adr/0061-playground-hue-ramp-and-rail-shell.md`

**Interfaces:**
- Consumes: nothing. Documentation only — no code changes, no gate risk beyond the suite already passing.

- [ ] **Step 1: Find the claims**

```bash
cd /work
grep -n -i "sandbox\|impossible\|no display\|human eyes\|never performed" docs/adr/0060-playground-visual-system.md docs/adr/0061-playground-hue-ramp-and-rail-shell.md
```

- [ ] **Step 2: Establish what is actually true**

These are the facts, verified on 2026-09-23:

- A headless Chromium is available at `/ms-playwright`, with Playwright installed globally. Pages render and can be screenshotted and inspected from inside the container.
- `/signin`, `/privacy` and `/terms` were rendered in both themes and visually checked. Playground is confirmed working on them: paper `#FFFBF3`, 2px ink borders, hard offset shadows, Bricolage Grotesque headings (measured at 30px/700), pill buttons; dark mode inverts correctly.
- The focus ring was measured on a live focused element: `outline-width: 3px`, `outline-offset: 3px`, colour `rgb(29,29,27)`. The spec is met and the ring is inherited globally.
- A contrast audit was run against **rendered** elements — walking every text node, compositing the effective background up the DOM through any alpha, and computing WCAG ratios on the real colours. **164 text nodes across three routes and both themes: zero failures.**
- What genuinely cannot be reached in-container is anything requiring the database. Dev sign-in fails with `ECONNREFUSED 127.0.0.1:5432`; there is no Postgres and no Docker available to start one. So `/trips`, every trip route, and `/account` remain unseen — which is where the hue ramp, the rail and the route states all live.

- [ ] **Step 3: Rewrite the claim in ADR 0060**

Replace the "impossible from a sandbox" framing with the true one: rendering and inspection work; the database is the blocker for authenticated routes; the public pages **were** checked and pass. Keep the caveat's force — the screens that carry this work are still unverified — but stop attributing it to a limit that does not exist.

- [ ] **Step 4: Rewrite the claim in ADR 0061, and draw the lesson**

Same correction. Then add a short paragraph, because this is the most useful part for a future reader:

The ADR's own thesis is "contrast has to be measured, not inferred". The sandbox claim was the same error in a different register — a limit asserted rather than tested, which then justified skipping the one check that would have caught the defects the ADR is about. Record that the rendered-element contrast audit exists, that it found zero failures on the routes it could reach, and that pointing it at the authenticated screens is the single highest-value verification still available.

- [ ] **Step 5: Correct the `public/brand/*.svg` note**

Both ADRs record those four files as removed for being unreferenced. That was right, but the stated reason was incomplete: they were unreferenced because nothing had wired `Logo` into the header, not because the brand did not need them. Task 1 fixes the wiring using the component's inline paths; the static files remain unneeded until the Open Graph and email work in phase 3, and restore from git in one command. Say that.

- [ ] **Step 6: Run the gates**

```bash
cd /work
npx tsc --noEmit && npm run lint && npm test && npm run build
```

Expected: all pass. This task changes only markdown, so a failure means Task 1 left something broken.

- [ ] **Step 7: Commit**

```bash
cd /work
git add docs/adr
git commit -m "docs(adr): correct what these ADRs claim could be verified

Both said a visual pass was impossible from a sandbox. It was not. A headless
Chromium was available the whole time; /signin, /privacy and /terms render,
were inspected in both themes, and pass -- including a contrast audit against
rendered elements that measured 164 text nodes and found zero failures, and a
focus ring measured live at 3px with a 3px offset.

What is genuinely unreachable in-container is anything needing the database,
so the screens carrying the hue ramp and the rail are still unseen. That is a
narrower and more honest statement of the gap.

Worth recording because it is the same mistake these ADRs are about: a limit
asserted rather than measured, which then excused skipping the one check that
would have caught the defects they document.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Done means

- Two commits on `fix/logo-in-header-and-adr-corrections`, branched from `beta`.
- All four gates pass on the final commit.
- No 🛖 emoji and no hand-rolled tent SVG remain as brand marks; all five sites render `Logo`.
- Exactly one accessible name per brand control, verified by rendering.
- `main` untouched. `beta` not merged into. Nothing deployed.
- Report what shipped and stop before merging to `beta`.
