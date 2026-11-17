# Playground reskin — handover into phase 3

Written 2026-09-24, at the end of the session that merged the contrast audit.
For a fresh session with no memory of any of this.

## First moves

1. `npm run feedback:pull`, read `docs/feedback/inbox.md`, and lead with what's
   open in it. Commit the regenerated inbox on your working branch **only if it
   changed**. Main session only — never a subagent, and never `feedback:resolve`.
2. Read this file's "The rules" and "Traps" sections. They are where the time
   went.
3. Cut a branch from `beta`. Confirm `git rev-parse main` is still `3002531`.
4. Run `grill-with-docs` to interview Cam and produce the phase 3 spec. **Write
   no code until he says "go for it."**
5. Baseline the audit before you change anything: start the dev server and run
   `npm run audit:contrast`. It passed clean at `878df27`, so anything it
   reports on a fresh checkout is either environmental or a regression — and
   you want to know which before you touch colour, not after.

## The rules, before anything else

These are not negotiable and they override any plan you write:

- **All work happens on `beta` or a branch cut from it.** Never commit, merge,
  rebase onto or push to `main`. `main` has sat at `3002531` through this
  entire reskin and must stay there until Cam says otherwise.
- **Never deploy, and never push.** Pushing `beta` triggers the Vercel preview
  deploy, which makes pushing a deploy by another name. Cam pushes. You can
  build and run locally as much as you like.
- **Never run `npm run feedback:resolve`** — it writes to the production
  database. `npm run feedback:pull` is read-only but still hits production; the
  main session runs it once at session start, subagents never do.
- Don't hand-edit `docs/feedback/inbox.md`. It is generated.

## Where things stand

`beta` is at the merge of `feat/contrast-audit-script`, pushed to
`origin/beta` on 2026-09-24. `main` is at `3002531` and has not moved through
the entire reskin. Five branches have landed on `beta`, in order:

1. **Phase 1** — tokens, fonts, primitives.
2. **Phase 2** — the nine-hue colour ramp, foundations, navigation.
3. **Logo + ADR corrections** — `components/ui/logo.tsx` put on screen in five
   places that were rendering a 🛖 emoji or a hand-rolled SVG.
4. **Audit findings** — globe pins and muted badges.
5. **The contrast audit** — `scripts/contrast-audit.ts`, plus the weather card
   restyle it surfaced.

**If the preview deploy looks stale, check `git rev-list --count origin/beta..beta`
before you check anything else.** A push that never happened cost this project
several hours once already, spent debugging a Vercel deploy that was faithfully
serving the last commit it had been given. Note that `git fetch` fails from
inside the container — there is no SSH config for the `github-personal` host
alias — so the local `origin/beta` ref only moves when a push runs against this
same working copy. Cam pushes; you never do.

ADRs `0060` (the visual system) and `0061` (the hue ramp and rail shell) record
the decisions. Read both before changing anything about colour.

## What phase 3 is

The reskin so far has been tokens, primitives and shell. Phase 3 is the long
tail: the individual screens, and everything that renders outside the app.

**Reference material** lives in `design_handoff/playground-2/`:

- `reference/ui_kits/teepee-desktop/` — 10 screens plus `Shell.jsx`
- `reference/ui_kits/teepee-mobile/` — 14 screens plus `Frame.jsx`
- `reference/ui_kits/teepee-tablet/` — `index.html` only
- `reference/ui_kits/shared/` — `kit.jsx`, `forms.jsx`, `states.jsx`,
  `admin.jsx`, `planedit.jsx`, `search.js`, `share.jsx`, `onthego.jsx`,
  `together.jsx`, `data.js`
- `emails/` — four HTML templates: `magic-link`, `invite`, `trip-reminder`,
  `booking-confirmed`
- `docs/notifications.md`
- `tokens.json`, `README.md`, `CLAUDE_CODE_PROMPT.md`

These are **reference, not code to copy in**. They are a separate React tree
with their own conventions. `app/globals.css` deliberately carries
`@source not "../design_handoff";` so Tailwind never scans them — if you remove
that line you will pull hundreds of unused classes into the build, and worse,
a compiled-CSS check will start proving things about the handoff's markup
rather than the app's. That mistake has already been made here once.

**Screens not yet restyled** (verify this list against the kits rather than
trusting it): the admin pages, the legal pages, the three not-found boundaries,
`app/global-error.tsx`, and the notification bell. The share OG image is also
outstanding.

**What Claude Design still owes** is written up in
`docs/follow-ups/2026-09-23-playground-design-ask.md` — sections A–E, plus five
recorded handoff defects. Read it before asking for anything new; some of it
may have arrived since.

## The contrast audit

`npm run audit:contrast`. It needs a dev server running and a headless
Chromium (`npx playwright install chromium`; one is already present in the
container at `/ms-playwright`, driven via `NODE_PATH=/usr/local/lib/node_modules`).
Playwright is deliberately **not** a dependency — it is a ~300MB install most
contributors will never need, so it is documented as a prerequisite the way
production credentials are for `feedback:pull`.

It walks every text node on every reachable route in both themes, composites
the effective background up the DOM through any alpha, and computes real WCAG
ratios against what actually rendered.

**`RESULT: PASS` means nothing went unexamined — not merely that nothing was
found.** That distinction is the whole design. The exit code is gated on
failures, unmeasured rows, zero-node routes, node-count regressions *and*
unrecognised exemptions. Four separate ways it could have reported a clean
sweep without having looked were found and closed in turn, which is why the
bar is set there.

If it reports an **unrecognised exemption**, the fix is to examine that element
and either fix its contrast or add a considered entry to `EXPECTED_EXEMPTIONS`.
Do not widen the selector to make it go away. The only current entries are
Leaflet's two disabled zoom controls, exempt by name under WCAG 1.4.3.

If it reports a **node-count regression**, a route probably rendered less than
it used to. Accept a new baseline only when you know why:
`ACCEPT_NODE_COUNT_BASELINE=1 npm run audit:contrast`. The baseline lives at
`docs/audits/contrast-node-counts.json`.

## Traps this project has actually fallen into

Every one of these cost real time. They are all the same shape: **a
verification that confirms something other than what it claims.**

- **The hex comments in `app/globals.css` are rounded and disagree with the
  tokens.** Computing a ratio from one turned a failing 4.499 into a passing
  4.618. Convert the HSL triple yourself, or measure the rendered output. This
  mistake has been made twice, including once by someone who had just corrected
  an ADR about it.
- **Leaflet renders after `networkidle`.** Maps mount via
  `next/dynamic({ssr:false})`. Measuring on `networkidle` reads the page before
  markers exist — it once undercounted pins by 21 and made a token fix look 3×
  more effective than it was. Wait on `.leaflet-marker-icon` and assert a count.
- **Substring greps produce false accusations.** `text-hue-leaf` matches inside
  the correctly-used `text-hue-leaf-text`; `text-warning` matches inside
  `text-warning-foreground`. Both nearly caused wrong "fixes". Anchor your
  patterns.
- **A guard that has never been observed to fail is not a guard.** Two defects
  here were checks that computed a result, printed it, and never touched the
  exit code. When you add a gate, provoke it and watch it fail before you trust
  it.
- **Don't assert a limit you haven't tested.** Two ADRs claimed a visual check
  was "impossible from a sandbox". A headless Chromium was available the whole
  time. Both have been corrected.

## Fixing causes, not call sites

The pattern that has worked repeatedly: one token or one shared helper, not
thirty call sites. `onSoft` was added to the hue ramp in `lib/hues.ts` rather
than to ~20 components; one token fixed 30 badges.

Two distinctions that matter:

- **Hue is identity, status is state.** A colour carrying state (failed, paid,
  overdue) belongs on `--destructive` / `--success` / `--warning`. A colour
  carrying identity (a category, a chapter) belongs on the hue ramp. Collapsing
  them makes the UI say something false. Note `--teal` and `--success` are
  currently byte-identical in both themes, which is exactly why the weather
  card uses `hue-sky` — teal would have read as a success state.
- **Accent colours used as text on neutral surfaces take the `-text` tokens**,
  never the fill token. A fill used as text is how `text-warning` ended up at
  1.40:1.

Also: `chapter.colour` is **persisted** (`prisma/schema.prisma:269`). The
stored values in `lib/chapter-colours.ts` are deliberately unchanged; only
labels and classes moved. `lib/hues.test.ts` pins this. Don't "tidy" them.

## Standing product constraints

- **Money is a shared pot.** No per-person splitting may be added. This has
  been restated several times.
- **Don't add features that aren't in the repo.** The reskin restyles what
  exists.
- Keep Server Components as Server Components.
- Motion goes through `tp-*` or `motion` with `ease: [0.2, 0.8, 0.2, 1]`, and
  must honour `useReducedMotion()`.
- 3px focus ring, 44px touch targets, `aria-current` on nav, accessible labels
  on icon-only buttons, body text ≥4.5:1 in both themes.
- Tailwind v4 classes only, from the handoff tokens. No inline style objects.
  No new hex outside `app/globals.css`, `lib/map-palette.ts`, `lib/map-pins.ts`
  and the three brand values in `components/ui/logo.tsx` (a named exemption —
  a brand mark must not theme-shift).

## Process

Cam's `CLAUDE.md` mandates it and it is not optional regardless of how small
the build looks:

1. `grill-with-docs` to interview and produce the spec. **Write no code until
   Cam says "go for it"** or similar.
2. `superpowers:writing-plans` to turn the agreed spec into ordered,
   independent tasks.
3. `superpowers:subagent-driven-development` to execute — one fresh subagent
   per task, with the spec-compliance and code-quality review loops.

Gates after every task: `npx tsc --noEmit`, `npm run lint`, `npm test`,
`npm run build`. Add `npm run audit:contrast` for anything that touches colour.

Record `Resolves-Feedback: <id>` as a commit trailer when a branch closes a
Feedback note. Do not resolve it — "landed" means deployed, not merged.

## Environment

Postgres runs on the host; `.env` points at `host.docker.internal:5432` and
demo data is seeded. Start the app with:

```bash
cd /work && (npm run dev > /tmp/dev.log 2>&1 &) && sleep 25
```

A saved Playwright session is at `/tmp/auth.json`; if it has expired, sign in
by clicking `text=Continue as You` on `/signin`.

Known fixtures: trip id `cmueo582d00b0q1lo9lf5taru`, share token
`014b029f-d13b-4e09-8648-5aef72f8c702`.

**When you finish: `pkill -f "next dev"` and `git checkout CLAUDE.md`** —
`next dev` regenerates a block in it and it will otherwise land in your diff.

## Known minor, deferred

`Card`'s `tone` prop (`coral|sun|teal|lilac|ink|white|paper`) does not cover
the hue ramp, so the weather card's accent fill is hand-assembled via
`className="island bg-hue-sky"` rather than through the component API. Not
wrong, but not reusable — worth folding into phase 3 if you touch `Card`.
