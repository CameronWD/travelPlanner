# Contrast Audit Script and Full Sweep Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the ad-hoc contrast audit into a tool the repo owns, widen it from 15 routes to everything reachable, and fix what it finds — so phase 3 starts with a gate that can actually be trusted.

**Architecture:** One committed script at `scripts/contrast-audit.ts` drives a headless browser over every reachable route in both themes, walks each text node, composites the effective background up the DOM through any alpha, and computes real WCAG ratios against what rendered. Task 1 lands it and produces a failure list. Task 2 fixes the list.

**Tech Stack:** Next.js 16, Tailwind v4, Playwright (already present at `/ms-playwright` in this container; a documented prerequisite rather than a dependency), tsx, Vitest.

## Global Constraints

- **Branch:** all work on `feat/contrast-audit-script`, cut from `beta` at `9dd2beb`. **Never** commit, merge, rebase onto or push to `main`/`master`. **Never** merge into `beta` — stop and ask. **Never** deploy.
- **Do NOT add `playwright` to `package.json`.** It is a ~300MB install with browser binaries and most contributors will never run this. The script documents `npx playwright install chromium` as a prerequisite, the way `feedback:pull` documents needing production credentials.
- Tailwind v4 classes only. No new hex outside `app/globals.css`, `lib/map-palette.ts`, `lib/map-pins.ts`.
- **Measure from rendered output, never from the hex comments in `globals.css`.** Those comments are rounded and disagree — computing from one turned a failing 4.499 into a passing 4.618 earlier in this project.
- **Gates after every task:** `npx tsc --noEmit`, `npm run lint`, `npm test`, then `npm run build`.

## Environment

Postgres runs on the host; `.env` points at `host.docker.internal:5432`; demo data is seeded. Start the app with `cd /work && (npm run dev > /tmp/dev.log 2>&1 &) && sleep 25`.

Run Playwright via `NODE_PATH=/usr/local/lib/node_modules`. A saved session is at `/tmp/auth.json`; if expired, sign in by clicking `text=Continue as You` on `/signin`.

Known fixtures: trip id `cmueo582d00b0q1lo9lf5taru`; share token `014b029f-d13b-4e09-8648-5aef72f8c702`.

**Stop the dev server when done** (`pkill -f "next dev"`) and `git checkout CLAUDE.md` — `next dev` regenerates a block there.

## Two traps this project has already fallen into

Both belong in the script's own comments so the next person does not repeat them.

1. **Leaflet renders after `networkidle`.** Maps mount via `next/dynamic({ssr:false})`, so measuring on `networkidle` reads the page before markers exist. That undercounted pins by 21 and made a token fix look 3× more effective than it was. **Wait on `.leaflet-marker-icon` for map routes and assert a marker count.**
2. **A broken probe reports success.** If the colour regex is double-escaped (`\\(` where `\(` is meant) it matches nothing, measures zero nodes, and reports zero failures. **The script must fail loudly if a route yields zero text nodes**, rather than treating it as a pass.

## File Structure

**Created:** `scripts/contrast-audit.ts`
**Modified:** `package.json` (one npm script — no dependency), and whatever Task 2's failure list requires.

---

### Task 1: Land the script and produce the failure list

**Files:**
- Create: `scripts/contrast-audit.ts`
- Modify: `package.json` — add `"audit:contrast": "tsx scripts/contrast-audit.ts"` to `scripts`. **Do not touch `dependencies` or `devDependencies`.**

**Interfaces:**
- Produces: the committed script, and a complete failure list in the report that Task 2 consumes.

- [ ] **Step 1: Recover the working probe**

`/tmp/probe.txt` and `/tmp/audit2.js` hold the prototype. Read them and port the logic — do not rewrite from memory. The compositing walk (up the DOM, multiplying through alpha until an opaque background is found) is the part that makes this measure the real cascade rather than a guess.

- [ ] **Step 2: Write the route list**

28 page routes exist. Cover every one that can be reached:

*Public:* `/`, `/signin`, `/privacy`, `/terms`, `/share/014b029f-d13b-4e09-8648-5aef72f8c702`
*App:* `/trips`, `/trips/new`, `/account`, `/globe`, `/help`, `/whats-new`, `/admin`
*Trip:* `/trips/{id}` and its `plan`, `budget`, `calendar`, `wishlist`, `summary`, `today`, `checklists`, `files`, `journal`, `activity`, `settings`, `compare`, `print`, `help`
*Day:* `/trips/{id}/day/{date}` — derive a date inside the trip's range rather than hard-coding one
*Not-found:* a bad trip id (`/trips/does-not-exist`) and a bad app path, to reach `trips/[tripId]/not-found.tsx` and `(app)/not-found.tsx`

Mark which routes need authentication and which are public, and drive each with the right context.

- [ ] **Step 3: Handle the error boundaries honestly**

There are 23 `error.tsx` files plus `app/global-error.tsx`. **They cannot be reached by navigation** — they render only when a route throws.

Do not fake a pass for them. Two options; pick one and say which:
- Render `ErrorPanel` directly in a harness route or a test, covering all four `kind` values and both `layout` values, and audit that. This covers the substance, since every `error.tsx` composes it.
- Skip them and record clearly in the script's docblock and your report that error boundaries are unaudited and why.

The first is better if it can be done without adding a route that ships. Say what you chose.

- [ ] **Step 4: Make the script fail loudly**

Exit non-zero when any failure is found, so it can be a gate. Also exit non-zero if any route measures **zero text nodes** — that means the probe broke, not that the page is clean.

Print, per failure: route, theme, computed ratio, required ratio, font size and weight, the text, the resolved foreground and background colours, and the element's class string. That is what makes a failure fixable without re-running.

- [ ] **Step 5: Document the prerequisite**

A docblock at the top: what it measures, that it needs a dev server and `npx playwright install chromium`, how to point it at a different base URL, and both traps from above. Write it for someone who has never seen this project.

- [ ] **Step 6: Run the full sweep**

Start the dev server, run the script over every route in both themes, and record the totals plus each failure in full.

Sanity-check the node counts per route. A content-heavy page reporting a handful of nodes means it did not render — investigate rather than accepting it.

- [ ] **Step 7: Gates and commit**

```bash
cd /work
npx tsc --noEmit && npm run lint && npm test && npm run build
```

Confirm `package.json` gained only the one script line and no dependency.

```bash
cd /work
git add scripts/contrast-audit.ts package.json
git commit -m "feat(a11y): commit the contrast audit as a repo script

Walks every text node on every reachable route in both themes, composites the
effective background up the DOM through any alpha, and computes WCAG ratios
against what actually rendered -- not against what a token is named, which is
how a failing 4.499 read as a passing 4.618 earlier in this project.

Widened from the 15 routes the ad-hoc version covered to everything
reachable, including the public pages, admin, print, compare, the day view
and the not-found boundaries.

Needs a dev server and \`npx playwright install chromium\`; deliberately not a
dependency, since it is a ~300MB install most contributors will never run.

Exits non-zero on any failure, and also on any route measuring zero text
nodes -- a broken probe reports a clean sweep, which is worse than no sweep.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Fix what the sweep found

**Files:** determined by Task 1's failure list.

**Interfaces:**
- Consumes: the failure list in `task-1-report.md`.

- [ ] **Step 1: Read the list and group by cause**

Group failures by shared root cause rather than fixing site by site. This project has twice found that a dozen call sites shared one token or one composition — and fixing the cause is both smaller and durable.

Two already known, on `/trips/{id}/day/{date}`: a weather widget rendering white on near-white, and a control measuring 1.75:1.

- [ ] **Step 2: Fix causes, not symptoms**

For each group, decide whether the fix belongs in a token, a shared helper, or the call sites, and say why. Prefer the highest level that is correct — but do not raise a token to fix one outlier, because that moves every other use of it too.

**Distinguish hue from status.** A colour carrying *state* (failed, paid, overdue) belongs on `--destructive`/`--success`/`--warning`. A colour carrying *identity* (a category, a chapter) belongs on the hue ramp. Collapsing the two makes the UI say something false.

**Accent colours as text on neutral surfaces use the `-text` tokens**, never the fill token. A fill used as text is how `text-warning` ended up at 1.40:1.

- [ ] **Step 3: Measure every change**

Report before and after for each, in both themes, computed from rendered values. A fix that moves a ratio from 2.1 to 4.4 is still a failure.

Watch for the reverse case: raising a foreground for dark mode can *reduce* contrast in light mode if the same class serves both. Check both.

- [ ] **Step 4: Re-run the full sweep**

Expect zero failures and a non-zero node count on every route. If a fix introduces a new failure elsewhere, stop and report rather than chasing it.

- [ ] **Step 5: Gates and commit**

```bash
cd /work
npx tsc --noEmit && npm run lint && npm test && npm run build
```

Commit with a message naming the causes fixed and the ratios moved, not just the file count.

---

## Done means

- `scripts/contrast-audit.ts` committed, runnable via `npm run audit:contrast`, with no new dependency.
- Every reachable route audited in both themes; error boundaries either covered via `ErrorPanel` or explicitly recorded as unaudited.
- Zero failures, with a non-zero node count per route.
- All four gates pass.
- `main` untouched. `beta` not merged into. Nothing deployed.
- Report what shipped, then stop and ask before merging.
