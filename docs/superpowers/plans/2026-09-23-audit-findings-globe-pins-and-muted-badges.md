# Audit Findings — Map Pins and Muted Badges Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the two findings from the first contrast audit run against the rendered, authenticated app — 1504 text nodes across 15 routes in both themes, 34 failures.

**Architecture:** Both fixes target a cause rather than the call sites. The badge failures come from one token pair being marginal, so one token moves. The globe pin failures come from `lib/map-pins.ts`'s `pinHtml` having been shipped and never adopted, so the map adopts it — and `pinHtml`'s output contains no `●` at all, which removes the contrast reading and the screen-reader noise together.

**Tech Stack:** Next.js 16, React 19, Tailwind v4, Leaflet, Playwright (available at `/ms-playwright`, driven via `NODE_PATH=/usr/local/lib/node_modules`), Vitest.

## Global Constraints

- **Branch:** all work on `fix/audit-findings-globe-pins-and-muted-badges`, cut from `beta` at `e32847e`. **Never** commit, merge, rebase onto or push to `main`/`master`. **Never** merge into `beta` — stop and ask. **Never** deploy.
- Tailwind v4 classes only. No new hex outside `app/globals.css`, `lib/map-palette.ts` and `lib/map-pins.ts` — Leaflet needs literal colour strings.
- Keep Server Components as Server Components.
- **Measure, do not infer.** Every contrast figure in this plan was computed from *rendered* RGB, not from the hex comments in `globals.css` — those comments are rounded and disagree. Using them is how a failing 4.499 reads as a passing 4.618.
- **Gates after every task:** `npx tsc --noEmit`, `npm run lint`, `npm test`, then `npm run build`.

## How to render and measure

The app is inspectable from this container. Postgres runs on the host and `.env` points at `host.docker.internal:5432`; demo data is already seeded.

```bash
cd /work && (npm run dev > /tmp/dev.log 2>&1 &) && sleep 25
```

Drive it with `NODE_PATH=/usr/local/lib/node_modules node -e "const {chromium}=require('playwright'); ..."`. A saved session lives at `/tmp/auth.json`; if it has expired, sign in by clicking `text=Continue as You` on `/signin` and re-save via `ctx.storageState({path:'/tmp/auth.json'})`. The demo trip id is `cmueo582d00b0q1lo9lf5taru`.

The audit probe is at `/tmp/probe.txt` and the runner at `/tmp/audit2.js`. If `/tmp/probe.txt` is missing, note that it must not contain double-escaped regex (`\\(` instead of `\(`) — that silently matches nothing and reports zero nodes measured, which reads as "no failures".

**Stop the dev server when done** (`pkill -f "next dev"`), and `git checkout CLAUDE.md` — `next dev` regenerates a block in it.

---

### Task 1: Lift `--muted-foreground` in dark so muted-on-muted clears AA

**8** of the 34 failures are one pair: `text-muted-foreground` on `bg-muted`, dark theme, on small badge pills across the plan, calendar and elsewhere.

Measured from rendered RGB: `rgb(164,156,142)` on `rgb(56,53,46)` = **4.499:1**, against a 4.5 requirement. It fails by a thousandth — imperceptible, but systematically, on every such badge.

The token is also below the handoff's own claim. `design_handoff/playground-2/README.md` describes `--muted-foreground` as "5.5:1+"; at its current `38 11% 60%` it measures **5.257** on card. So this is a handoff defect as well as a local one, and the target is the lightness that makes the handoff's stated claim true.

| dark `--muted-foreground` | on `--muted` | on `--card` | on `--background` |
|---|---|---|---|
| `60%` (current) | 4.499 | 5.257 | 5.982 |
| `61%` | 4.614 | 5.390 | 6.134 |
| **`62%` (target)** | **4.780** | **5.584** | **6.355** |
| `63%` | 4.899 | 5.724 | 6.513 |

**Files:**
- Modify: `app/globals.css` — the `.dark` block's `--muted-foreground` only
- Modify: `docs/follow-ups/2026-09-23-playground-design-ask.md`

**Interfaces:**
- Consumes: nothing.
- Produces: a dark `--muted-foreground` that clears 4.5:1 on `--muted` and meets the handoff's "5.5:1+" claim on card. Every existing use gets more contrast, never less.

- [ ] **Step 1: Confirm the current value and the failure**

```bash
cd /work
grep -n -A1 "^\.dark" app/globals.css | grep "muted-foreground"
```

Expect `--muted-foreground: 38 11% 60%;`.

Verify the failure yourself from rendered RGB rather than the hex comment:

```bash
cd /work
node -e "
const h2r=(h,s,l)=>{s/=100;l/=100;const k=n=>(n+h/30)%12,a=s*Math.min(l,1-l),f=n=>l-a*Math.max(-1,Math.min(k(n)-3,Math.min(9-k(n),1)));return[Math.round(255*f(0)),Math.round(255*f(8)),Math.round(255*f(4))]};
const L=(r,g,b)=>{const f=v=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4)};return 0.2126*f(r)+0.7152*f(g)+0.0722*f(b)};
const C=(a,b)=>{const[x,y]=[L(...a),L(...b)].sort((p,q)=>q-p);return((x+0.05)/(y+0.05)).toFixed(3)};
console.log('60%:', C(h2r(38,11,60), h2r(40,9,20)));
console.log('62%:', C(h2r(38,11,62), h2r(40,9,20)));
"
```

Expect `4.499` and `4.780`.

- [ ] **Step 2: Change the one value**

In `app/globals.css`, inside the `.dark` block only, change `--muted-foreground` from `38 11% 60%` to `38 11% 62%`.

Update its trailing hex comment to the true rendered value for the new lightness — compute it, do not estimate. A stale comment here is exactly what caused this figure to be misread once already.

**Do not touch the light-mode value.** Light measures 4.707 on muted and already clears.

- [ ] **Step 3: Confirm nothing else moved**

```bash
cd /work
git diff app/globals.css
```

Expect a single changed declaration plus its comment. If anything else differs, revert and redo.

- [ ] **Step 4: Verify by rendering, across the whole app**

Start the dev server and re-run the full audit as described in "How to render and measure". Compare against the baseline: **1504 nodes, 34 failures**.

Expected after this change: the 8 `text-muted-foreground` on `bg-muted` failures are gone; the 26 globe pin failures remain (Task 2 owns those); no new failures anywhere.

**Wait on `.leaflet-marker-icon` before measuring `/globe`,** and confirm markers were present. Measuring on `networkidle` reads the page before Leaflet mounts and silently undercounts — that is what produced the wrong baseline this plan originally carried.

Record the new totals and the per-pattern breakdown in your report. **If any new failure appears, stop and report it** — raising a token should only ever increase contrast, so a new failure means something unexpected.

- [ ] **Step 5: Record the handoff defect**

Add an entry to section D of `docs/follow-ups/2026-09-23-playground-design-ask.md`, alongside the existing touch-target and toast entries: the handoff's `--muted-foreground` does not meet the "5.5:1+" its own README claims (5.257 on card at the shipped value), and muted-on-muted fails AA outright at 4.499. State that we raised it to 62% locally and that it should be fixed at source.

- [ ] **Step 6: Run the gates**

```bash
cd /work
npx tsc --noEmit && npm run lint && npm test && npm run build
```

- [ ] **Step 7: Commit**

```bash
cd /work
git add app/globals.css docs/follow-ups/2026-09-23-playground-design-ask.md
git commit -m "fix(a11y): lift dark --muted-foreground so muted-on-muted clears AA

Measured against rendered RGB, not the rounded hex comments: muted text on a
muted surface was 4.499:1 in dark mode, failing 4.5 by a thousandth on every
small badge pill across the plan, calendar and elsewhere -- 8 of the
34 failures the first full-app contrast audit found.

Raising the token to 62% lightness gives 4.780 on muted and 5.584 on card,
which also makes true the '5.5:1+' the handoff's own README claims for this
token and the shipped value did not meet. Logged as a handoff defect too.

One token rather than 30-odd call sites, and it can only increase contrast.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Adopt `pinHtml` on the globe map, then measure the other three

**26** failures are white `●` glyphs on coloured map pins (1.44–2.09:1) at `/globe`, across five distinct pin fills in both themes.

> **Corrected 2026-09-23.** This plan originally said "five failures" here and "roughly 29" for the badges. Both were wrong. The baseline audit measured `/globe` via `networkidle`, which fires before Leaflet's `next/dynamic({ssr:false})` markers mount — so it undercounted pins and overcounted the badges' share. Re-measured waiting on `.leaflet-marker-icon` with 13 markers confirmed present, the true split is **8 badge + 26 globe = 34**. Task 1 closed the 8. When you measure in Step 5 below, wait on the marker selector — this is the exact trap that produced the wrong figure.

The contrast number is not really the problem. `components/globe/globe-map.tsx` builds its pins as inline HTML strings with a hard-coded `●` and `#fff`, and **never adopted `pinHtml` from `lib/map-pins.ts`**, which Task 3 of phase 2 shipped. `pinHtml` has zero consumers anywhere. Its output is an ink-bordered sticker pin with a hard offset shadow whose inner content is a glyph or a label — there is no bullet in it at all, so adopting it removes both the contrast reading and the screen-reader noise.

The bullets are also not `aria-hidden`, so assistive technology announces one per marker.

**Four map components build their own pins and none use `pinHtml`:** `globe-map.tsx` (2 blocks), `route-map.tsx` (2), `day-map.tsx` (3), `wishlist-map.tsx` (1). **Only globe was measured as failing.** Do not assume the other three fail — measure them (Step 5) and convert only what the measurement justifies.

**Files:**
- Modify: `components/globe/globe-map.tsx`
- Possibly modify: `components/trip/wishlist-map.tsx`, `day-map.tsx`, `route-map.tsx` — only if Step 5 shows cause
- Modify: any test asserting the old pin markup

**Interfaces:**
- Consumes: `pinHtml({ variant, fill?, label?, glyph?, selected?, dark? })` and `pinSize(variant)` from `lib/map-pins.ts`. `PinVariant` is `"category" | "stop" | "home" | "now" | "wish" | "cluster"`. Also `pinHex(category, dark?)`.
- Produces: no new API.

- [ ] **Step 1: Read the helper before using it**

```bash
cd /work
sed -n '/export function pinSize/,/^}/p' lib/map-pins.ts
sed -n '/export function pinHtml/,/^}/p' lib/map-pins.ts
sed -n '/export function mapInk/,/^}/p' lib/map-palette.ts
```

Note what each variant produces, what `selected` does, and how `dark` changes the ink. Record in your report which variant you judge correct for a globe category marker and why.

- [ ] **Step 2: Convert `categoryIcon`**

`components/globe/globe-map.tsx` around line 33. Replace the inline `html` string with a `pinHtml` call, and take `iconSize`/`iconAnchor` from `pinSize(variant)` rather than the hard-coded 24 — otherwise the icon box and the rendered pin disagree and the marker sits off its coordinate.

`popupAnchor` must be recomputed from the new size too.

- [ ] **Step 3: Convert `selectedIcon`**

Same file, around line 43. This is `pinHtml` with `selected: true` — the helper already renders the lift and ring, so do not hand-roll a second highlight on top.

- [ ] **Step 4: Handle the theme**

`pinHtml` and `pinHex` both take a `dark` flag, and the current code passes neither. Determine how this component can know the active theme — check whether it already receives it, or whether `components/ui/theme-provider.tsx` exposes a hook it can use. If threading the theme through is genuinely out of proportion here, say so in your report and pass the light values explicitly rather than silently leaving `dark` defaulted.

- [ ] **Step 5: Measure the other three maps before touching them**

Render `/trips/{id}/wishlist`, `/trips/{id}/day/{date}` and `/trips/{id}/summary` (route map) in **both** themes, wait for Leaflet to finish drawing, and run the audit probe against each.

Leaflet mounts via `next/dynamic({ ssr: false })`, so `networkidle` may fire before pins exist — wait for a marker selector rather than a timeout, and confirm in your report that pins were actually present when you measured. A map that had not drawn yet reports zero failures and looks like a pass.

Convert only the maps the measurement shows failing. For any you convert, apply Steps 2–4 equivalently. For any you leave, state the measured ratios that justified leaving it.

- [ ] **Step 6: Verify the pins render correctly**

A contrast fix that breaks the map is not a fix. For each converted map, screenshot it in both themes and confirm: pins appear, sit on their correct coordinates, the selected state is visibly distinct, and clustering (if any) still works.

Also confirm no `●` remains:

```bash
cd /work
grep -rn "●" --include=*.tsx components | grep -v "\.test\."
```

- [ ] **Step 7: Run the gates**

```bash
cd /work
npx tsc --noEmit && npm run lint && npm test && npm run build
```

- [ ] **Step 8: Re-run the full audit**

Expect **zero** failures across all 15 routes in both themes. Record the final totals.

- [ ] **Step 9: Commit**

```bash
cd /work
git add -A
git commit -m "fix(maps): adopt the Playground pin on the globe map

lib/map-pins.ts shipped pinHtml in phase 2 and nothing ever used it -- all
four map components kept building their own inline pin HTML. The globe's
were a white bullet on a coloured circle, which the first full-app contrast
audit measured at 1.44-2.09:1, and which was not aria-hidden, so a screen
reader announced a bullet per marker.

pinHtml's output has no bullet in it at all: an ink-bordered sticker pin with
a hard offset shadow and either a glyph or a label. Adopting it closes the
contrast reading and the announcement noise together, and sizes now come from
pinSize() so the icon box matches what is drawn.

The other three maps were measured rather than assumed; see the report for
which were converted and the ratios that justified leaving any alone.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Done means

- Two commits on `fix/audit-findings-globe-pins-and-muted-badges`, branched from `beta`.
- All four gates pass.
- The full audit reports **zero failures** across 15 routes in both themes, with pins confirmed present when measured.
- No `●` remains as a map pin glyph.
- `main` untouched. `beta` not merged into. Nothing deployed.
- Report what shipped, then stop and ask before merging to `beta`.
