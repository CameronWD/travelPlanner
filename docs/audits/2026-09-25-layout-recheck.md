# Layout re-check — 2026-09-25 (Stage 2)

Spec: `docs/specs/2026-09-25-layout-fixes.md`. Plan: `docs/superpowers/plans/2026-09-25-layout-fixes.md`. Stage 1 findings: `docs/audits/2026-09-24-layout-findings.json`.

## Result

**52 of 54 findings fixed; 2 accepted with a ruling (LA-022, LA-044). No new Broken findings.**

| Run | Captures | Errors | small-target | clipped-text | spill | sideways-scroll | overlap | line-too-long |
|---|---|---|---|---|---|---|---|---|
| Stage 1 (2026-09-24) | 581 | 0 | 3530 | 668 | 73 | 10 | 166 | 72 |
| Stage 2 (after Tasks 1–14) | 576 | 0 | 3213 | 25 | 0 | 47 | 195 | 254 |
| Stage 3 (after Tasks 16–18) | 577 | 0 | 3055 | 25 | 0 | 0 | 196 | 15 |

- Stage 3 ran at `7e279dc`, the head before the final review fixes (`ede1d17..d5c73f7`). Those fixes were verified in the browser by their implementer.
- `npm run audit:contrast`: **RESULT: PASS**, 0 failures across 37 routes in light and dark, at `ede1d17`. The script now finds its trip by name instead of a stale id.
- The remaining overlap hits are mostly collector false positives. The collector compares full-width block boxes against text, and counts content that has scrolled out of view inside a dialog as overlapping. The small-target count still includes controls whose 44px hit area is the invisible `tap-target` pseudo-element.
- Coverage gaps: `make-it-fit` and `chapter-add`, the same as Stage 1. `save-template` now captures at every width.

## Findings

- `LA-001` **Fixed** — Country-list line under each plan's stop list is cut off, unreadable
- `LA-002` **Fixed** — Promote-fork dialog: warning paragraph overlaps the 'Changes vs current plan' heading
- `LA-003` **Fixed** — Trip-cost value overlaps the stops count at 768px on every plan card
- `LA-004` **Fixed** — Wishlist item names in the calendar aside are cut off with no way to read them
- `LA-005` **Fixed** — Dialogs on desktop clip the first field's label under its input
- `LA-006` **Fixed** — Cost names are truncated and can't be read in full
- `LA-007` **Fixed** — 'Group into chapters…' prompt is clipped off the left edge
- `LA-008` **Fixed** — "Add Stop" is pushed off-screen when a trip still has rough (undated) stops
- `LA-009` **Fixed** — Fork name truncated to '+ Switz…' with no way to read the full name
- `LA-010` **Fixed** — Last notification's timestamp is hidden behind the sticky 'See all activity' footer
- `LA-011` **Fixed** — Sticky footer hides the last field in several Plan overlay forms
- `LA-012` **Fixed** — Addresses and activity titles are cut off with no way to read them
- `LA-014` **Fixed** — Delete-trip and Duplicate-trip confirm sheets overflow the viewport at 360px
- `LA-015` **Fixed** — Share-link action row overflows the screen, clipping "Revoke"
- `LA-016` **Fixed** — Trip status badge text clipped at phone widths
- `LA-017` **Fixed** — Checklist card stays ~770px wide, ignoring available width
- `LA-018` **Fixed** — Compare grid caps at 2 columns, leaving the 3rd plan orphaned and the page mostly blank on wide screens
- `LA-019` **Fixed** — Fork card title "Switzerland" breaks mid-word at 768px
- `LA-020` **Fixed** — Promote-fork 'committed things' list truncates item labels with no way to read them
- `LA-021` **Fixed** — Agenda item titles clip to one line with an ellipsis instead of wrapping
- `LA-022` **Accepted** — Month-grid day cells too narrow for stop/country labels and item-count badge _(Accepted (ruling): city names clamp to two lines in the 768px month cell, and a single long word can split; the cell opens the day, which the truncation rule allows.)_
- `LA-023` **Fixed** — Feedback panel leaves a huge blank area below the compose box
- `LA-024` **Fixed** — Desktop dialog: intro text crowds straight into "CURRENT MEMBERS"
- `LA-025` **Fixed** — Marker list title/subtitle truncates unevenly across breakpoints
- `LA-026` **Fixed** — '60-second version' card leaves a large blank gap beside its text
- `LA-027` **Fixed** — Help topic-card grids misalign or leave an orphan card at 768–1024
- `LA-028` **Fixed** — Cover photo leaves a blank gap instead of filling its card
- `LA-029` **Fixed** — Reminders card ignores the two-column grid above it
- `LA-030` **Fixed** — "By category"/"By destination" labels truncate even short words
- `LA-031` **Fixed** — "Cost / day" stat card sits alone in its row
- `LA-032` **Fixed** — "Paid"/"Still to pay" figures wrap mid-number at 768
- `LA-033` **Fixed** — Currency code "AUD" clipped to look like "AUC" on phone widths
- `LA-034` **Fixed** — New trip form stuck in a ~586px island on wide screens
- `LA-035` **Fixed** — Bare "2" number field next to "Add a place…" has no visible label
- `LA-036` **Fixed** — Day-list, stay and to-do labels truncate to fragments _(Fixed (observed on Plan while reviewing LA-035/039).)_
- `LA-037` **Fixed** — Icon-only controls throughout Plan are under the 44px touch-target minimum
- `LA-038` **Fixed** — Right-hand aside on Plan is empty for the whole page below the stats card
- `LA-039` **Fixed** — Stop name clipped to "Rovaniemi (Lapl..." only at 1024px
- `LA-040` **Fixed** — Legal page text is capped at ~768px, a shrinking island on wide screens
- `LA-041` **Fixed** — Day-by-day list stays one full-width column, wasting space
- `LA-042` **Fixed** — Route mini-map is zoomed so far out that every stop overlaps into one blob
- `LA-043` **Fixed** — Trip name heading wraps to leave the year alone on its own line
- `LA-044` **Accepted** — Empty trip's cover shows a lone grey initial instead of the usual gradient _(Accepted (ruling): the empty trip now gets a per-trip hue gradient; the centred initial is the existing monogram design.)_
- `LA-045` **Fixed** — Two-column Home layout (shown via /today) leaves a large blank gap
- `LA-046` **Fixed** — Settings stays one narrow column at every desktop width
- `LA-047` **Fixed** — What's new stays a narrow ~720px card at every desktop width _(Fixed in d29bca0, after the Stage 3 capture; verified in code and at 1440 by the fix implementer.)_
- `LA-048` **Fixed** — Trip name clipped with ellipsis in digest list at 360px
- `LA-049` **Fixed** — Checkboxes, toggles, chips and row icons inside pages are under 44px on phones
- `LA-050` **Fixed** — Header icons, avatar stack and floating buttons are under 44px on phones
- `LA-051` **Fixed** — Some paragraphs run past ~80 characters a line on desktop (Help, Trip settings)
- `LA-052` **Fixed** — Segmented tab strip is short and its 3rd label clips at 360px
- `LA-053` **Fixed** — Day-count badge and travel-icon label spill past the day cell edge at 1024px
- `LA-054` **Fixed** — Footer and legal-page links are small, tightly spaced tap targets
- `LA-055` **Fixed** — Print page stays a fixed ~750px column at every desktop width

## Before merging to beta

- Try one long dialog on a real iPhone: overscroll it at the top and bottom, and focus the last field with the keyboard up. The headless audit can't reproduce elastic overscroll.
- The CARTO map tiles show "API KEY REQUIRED" locally because `.env.local` has no tile key. Check the deployed beta instead.
- Known leftovers are recorded as deferred minors in the controller ledger: a seven-figure budget amount would still overflow a 360px tile, the Checklists page shows tabs for a moment before switching to the desktop grid, and the dark-mode monogram cover hasn't had a contrast check.
