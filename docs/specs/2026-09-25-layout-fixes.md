# Layout fixes (audit Stage 2) — spec

Agreed with Cam on 2026-09-25 (grill session). Stage 2 of `docs/specs/2026-09-24-layout-audit.md`:
build the ADR 0062 wide-screen shell, then fix **every** finding in
`docs/audits/2026-09-24-layout-audit.md` (all 54 — 15 Broken, 32 Ugly, 7 Polish).

## Branch rules

- All work on `fix/layout-audit-findings`, cut from `beta` at `56ea347`. Sub-branches may be cut from it.
- Never commit to, merge into, rebase onto or push `main`. Never merge into `beta` without Cam's
  explicit go-ahead. Never push. Never deploy.
- Never run `npm run feedback:resolve`. Subagents never run `npm run feedback:pull`.
- Don't commit `next dev`'s `CLAUDE.md` block.

## Source of truth for each finding

The Stage 1 screenshots and `findings.json` (`/tmp/layout-audit/stage1`) no longer exist. Each
finding's *what / where / suggested fix* survives in the triage page
(https://claude.ai/artifact/V7UV8YytY9tgv2XfVzsF92). The first task extracts it to
`docs/audits/2026-09-24-layout-findings.json` (text only, no images) so every later task can cite
it. The suggested fixes are leads; the decisions below win where they differ.

## 1. The shell (ADR 0062) — first, everything else builds on it

- Trip rail pinned to the left viewport edge, full height, sticky; top bar full width (logo above
  the rail).
- Content grows to **~1600px**, then centres in the space right of the rail. Non-trip pages
  (trips list, globe, account, help, admin, what's new) use the same widths with no rail; the globe
  map fills the content area.
- **Three shared widths** replace the ~25 ad-hoc `max-w-*` values on page containers:
  - **wide** — ~1600px; grids step 1 → 2 → 3 columns as width grows.
  - **reading** — 68ch, for prose. (Implemented as `38em`: `ch` is the "0" glyph, which let 68ch run ~92 real characters per line in this font — LA-051 ruling; see COMPONENTS.md "Page widths".)
  - **dialog** — the one dialog width.
  Component-internal caps (popovers, menus, chips) are not page widths and may stay.
- Phones and 768 keep today's layout apart from the fixes below.

Expected to close as a side effect (verify, don't assume): LA-018, 038 (with §4), 041, 045 (with
§4), 017, 034, 040, 046, 047.

## 2. Truncated text — one rule, applied everywhere

1. **Wrap by default.** Names, titles, addresses, cost names and labels wrap to as many lines as
   they need.
2. **Clamp to 2 lines only in dense grids/asides** where rows must stay even (Days wishlist aside,
   month-grid cells, Globe marker list). A clamped item must lead somewhere that shows the full text
   (its row link / edit view). Hover-only `title` doesn't count — it does nothing on a phone.
3. **Short fixed labels never clip.** Status badges, currency codes ("AUD"), fork names, segmented
   tabs get room to fit.
4. **Single-line ellipsis only where the same text is fully visible nearby** (e.g. the header trip
   switcher), with a `title`.

Recorded as a short convention in the Playground kit docs so new screens follow it.

Covers: LA-001, 004, 006, 009, 012, 016, 019, 020, 021, 025, 030, 033, 036, 039, 048, 052, and any
truncation found while fixing others.

## 3. Prose and form pages — readable column + companion column

At ≥1024px these pages fill the width with a second column rather than stretching text
(stretching would trade the island findings for LA-051's over-long lines):

| Page | ≥1024px |
|---|---|
| Privacy / Terms, Help | ~68ch text + sticky table of contents |
| What's new | ~68ch entries + sticky release list |
| Trip settings | sections as a 2-column card grid (Details, Sharing, Calendar feed, Danger zone); prose inside cards ≤68ch |
| New trip | 2-column form: details left, cover + dates right |
| Checklists | each list its own card in a 2–3 column grid |
| Print (on screen) | stays an A4-shaped column **on purpose**, centred in the wide shell, labelled "Print preview" |

Below 1024px: one column, as today. Covers LA-017, 026, 034, 040, 046, 047, 051, 055.

## 4. Empty asides — rearrange and pin, no new content

- **Plan (LA-038):** the aside holding the Plan overview card becomes **sticky**, staying in view
  while the itinerary scrolls.
- **Home / Today (LA-045, LA-029):** **Reminders** moves from its full-width row into the right
  column under Paid so far / quick actions, balancing the columns and ending the misaligned
  full-width card.

## 5. Tap targets — invisible hit areas

- A shared `tap-target` utility: a transparent `::before` expanding the hit area to ≥44×44 around
  the control. The control looks the same.
- Where neighbouring hit areas would overlap (<44px apart — header icon row, chips in a tight row),
  add spacing as well.
- The avatar stack becomes **one** 44px-tall button that opens the members list.
- Footer / legal links (LA-054): more line spacing plus a padded hit area.

Covers LA-037, 049, 050, 054.

## 6. Everything else

The remaining findings (Compare LA-002/003; Days LA-022/053; desktop dialogs LA-005; Money
LA-031/032; Plan LA-007/008/010/011/035; Public link LA-042/043; Trip settings LA-014/015; Feedback
LA-023; Globe LA-024; Help LA-027; Home LA-028; Today LA-044) are fixed individually, following
their suggested fix unless it conflicts with §1–5 or the constraints below. Shared-component fixes
are made once in the shared component (e.g. LA-005 in the dialog/form primitives, LA-011 in the
sticky dialog footer).

## Gates

- Per task: `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run build`.
- At the end:
  1. **Gate trips.** Before the final run, shift dates on the local dev database's audit trips
     through the local app's UI so every Phase has a trip (Blue Mountains leaves Final prep
     2026-09-26; Great Ocean Road ends 2026-09-27). Local data only; the harness's safety rule is
     unchanged (HTTP to `localhost` `next dev` only).
  2. A **fresh full** `npm run audit:layout` run (new out dir — don't merge into an old one) with
     **no new Broken findings**.
  3. **All 54 findings re-checked** by visual reviewers against the new captures. Each is either
     fixed or reported to Cam as not fixed, with the reason. None dropped silently.
  4. `npm run audit:contrast` → `RESULT: PASS`.
  5. A before/after page (same crop style as the triage page) for Cam to eyeball before anything
     goes near `beta`.

## Out of scope

New features (incl. the kit's selected-stop detail panel, Print's Include toggles, actionable
Flags); data-model changes; colour/contrast work; phase-3 gaps already logged; a dedicated tablet
layout.

## Standing constraints

Server Components stay Server Components; Tailwind v4 token classes only; no new hex outside the
named files (ADR 0060); keep `@source not "../design_handoff";`; 3px focus ring, 44px targets,
`aria-current`, labelled icon buttons; motion via `tp-*` / `motion` with
`ease: [0.2, 0.8, 0.2, 1]` and `useReducedMotion()`. Read the relevant guide in
`node_modules/next/dist/docs/` before writing Next.js code.
