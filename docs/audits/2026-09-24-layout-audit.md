# Layout audit — 2026-09-24 (Stage 1)

Spec: `docs/specs/2026-09-24-layout-audit.md`. Harness: `npm run audit:layout` (`scripts/layout-audit.ts`). Triage page (private, Cam): https://claude.ai/artifact/V7UV8YytY9tgv2XfVzsF92 — findings are marked Fix / Skip / Discuss there and read back to plan Stage 2.

## Run

- 581 captures, 0 errors, run 2026-09-25T01:01Z against local `next dev` on branch `feat/layout-audit` (harness at `baca4cd`). Screenshots live outside the repo (`/tmp/layout-audit/stage1`).
- Widths 360 · 375 · 390 · 430 · 768 · 1024 · 1280 · 1440 · 1920 · 2560, light; dark at 390 and 1440; phase screens on one trip per Phase (Sketching, Planning, Final prep, Travelling, Past); an empty trip; print at A4; 34 overlay recipes at 360 / 390 / 1440 (+ keyboard-up variants).
- Automatic checks: small-target 3530, clipped-text 668, spill 73, sideways-scroll 10, overlap 166, line-too-long 72. These were leads for the 27 visual reviewers, not findings in themselves.

## Findings

**53 findings — 15 Broken, 31 Ugly, 7 Polish** (LA-013 withdrawn, see below). Cross-screen duplicates are merged (e.g. one header tap-target finding covers every screen).

Patterns:

- **Truncated text you can’t read** is the most common Broken finding (Money, Days, Plan, Public link, Compare, fork switcher). One shared rule — wrap, or line-clamp plus a full-text title — would fix most of it.
- **Wide-screen islands** (Settings, Checklists, New trip, What’s new, Privacy, Compare): pages capped far narrower than their neighbours. ADR 0062’s shared page widths fix these as a side effect.
- **Fixed chrome covering content on phones**: sticky dialog footers hiding the last field, the notifications footer hiding the last timestamp.

### Compare

- `LA-001` **Broken** — Country-list line under each plan's stop list is cut off, unreadable _(at 360, 375, 390, 768px, dark)_
- `LA-002` **Broken** — Promote-fork dialog: warning paragraph overlaps the 'Changes vs current plan' heading _(at 360, 390, 1440px)_
- `LA-003` **Broken** — Trip-cost value overlaps the stops count at 768px on every plan card _(at 768px)_
- `LA-018` **Ugly** — Compare grid caps at 2 columns, leaving the 3rd plan orphaned and the page mostly blank on wide screens _(at 768, 1024, 1280, 1440, 1920, 2560px, dark)_
- `LA-019` **Ugly** — Fork card title "Switzerland" breaks mid-word at 768px _(at 768px)_
- `LA-020` **Ugly** — Promote-fork 'committed things' list truncates item labels with no way to read them _(at 360, 390px)_

### Days

- `LA-004` **Broken** — Wishlist item names in the calendar aside are cut off with no way to read them _(at 1024, 1280, 1440, 1920, 2560px, dark)_
- `LA-021` **Ugly** — Agenda item titles clip to one line with an ellipsis instead of wrapping _(at 360, 375, 390, 430px, dark)_
- `LA-022` **Ugly** — Month-grid day cells too narrow for stop/country labels and item-count badge _(at 768px)_
- `LA-053` **Polish** — Day-count badge and travel-icon label spill past the day cell edge at 1024px _(at 1024px)_

### Dialogs (desktop)

- `LA-005` **Broken** — Dialogs on desktop clip the first field's label under its input _(at 1440px)_

### Money

- `LA-006` **Broken** — Cost names are truncated and can't be read in full _(at 360, 375, 390, 430, 1024, 1280, 1440, 1920, 2560px, dark)_
- `LA-030` **Ugly** — "By category"/"By destination" labels truncate even short words _(at 360, 375, 390, 430px, dark)_
- `LA-031` **Ugly** — "Cost / day" stat card sits alone in its row _(at 360, 375, 390, 430, 768, 1024, 1280, 1440, 1920, 2560px, dark)_
- `LA-032` **Ugly** — "Paid"/"Still to pay" figures wrap mid-number at 768 _(at 768px)_
- `LA-033` **Ugly** — Currency code "AUD" clipped to look like "AUC" on phone widths _(at 360, 390px)_

### Plan

- `LA-007` **Broken** — 'Group into chapters…' prompt is clipped off the left edge _(at 360, 390px)_
- `LA-008` **Broken** — "Add Stop" is pushed off-screen when a trip still has rough (undated) stops _(at 375, 768px)_
- `LA-009` **Broken** — Fork name truncated to '+ Switz…' with no way to read the full name _(at 360, 390, 1440px)_
- `LA-010` **Broken** — Last notification's timestamp is hidden behind the sticky 'See all activity' footer _(at 360, 390, 1440px)_
- `LA-011` **Broken** — Sticky footer hides the last field in several Plan overlay forms _(at 360, 390px)_
- `LA-035` **Ugly** — Bare "2" number field next to "Add a place…" has no visible label _(at 360, 375, 390, 430, 768px, dark)_
- `LA-036` **Ugly** — Day-list, stay and to-do labels truncate to fragments _(at 360, 375, 390, 430, 768, 1024, 1280, 1440px, dark)_
- `LA-037` **Ugly** — Icon-only controls throughout Plan are under the 44px touch-target minimum _(at 360, 375, 390, 430px, dark)_
- `LA-038` **Ugly** — Right-hand aside on Plan is empty for the whole page below the stats card _(at 1024, 1280, 1440, 1920, 2560px, dark)_
- `LA-039` **Ugly** — Stop name clipped to "Rovaniemi (Lapl..." only at 1024px _(at 1024px)_

### Public link

- `LA-012` **Broken** — Addresses and activity titles are cut off with no way to read them _(at 360, 375, 390, 430px, dark)_
- `LA-041` **Ugly** — Day-by-day list stays one full-width column, wasting space _(at 1024, 1280, 1440, 1920, 2560px, dark)_
- `LA-042` **Ugly** — Route mini-map is zoomed so far out that every stop overlaps into one blob _(at 360, 375, 390, 430, 768px, dark)_
- `LA-043` **Ugly** — Trip name heading wraps to leave the year alone on its own line _(at 360, 375, 390px, dark)_

### Trip settings

- `LA-014` **Broken** — Delete-trip and Duplicate-trip confirm sheets overflow the viewport at 360px _(at 360px)_
- `LA-015` **Broken** — Share-link action row overflows the screen, clipping "Revoke" _(at 360, 375, 390, 430px, dark)_
- `LA-046` **Ugly** — Settings stays one narrow column at every desktop width _(at 1024, 1280, 1440, 1920, 2560px, dark)_

### Trips

- `LA-016` **Broken** — Trip status badge text clipped at phone widths _(at 360, 375, 390, 430px, dark)_

### Checklists

- `LA-017` **Ugly** — Checklist card stays ~770px wide, ignoring available width _(at 1280, 1440, 1920, 2560px, dark)_
- `LA-052` **Polish** — Segmented tab strip is short and its 3rd label clips at 360px _(at 360, 375, 390, 430px, dark)_

### Feedback

- `LA-023` **Ugly** — Feedback panel leaves a huge blank area below the compose box _(at 360, 390, 1440px)_

### Globe

- `LA-024` **Ugly** — Desktop dialog: intro text crowds straight into "CURRENT MEMBERS" _(at 1440px)_
- `LA-025` **Ugly** — Marker list title/subtitle truncates unevenly across breakpoints _(at 360, 375, 390, 1024px, dark)_

### Help

- `LA-026` **Ugly** — '60-second version' card leaves a large blank gap beside its text _(at 1024, 1280, 1440, 1920, 2560px, dark)_
- `LA-027` **Ugly** — Help topic-card grids misalign or leave an orphan card at 768–1024 _(at 768, 1024px)_

### Home

- `LA-028` **Ugly** — Cover photo leaves a blank gap instead of filling its card _(at 430, 1024, 1280, 1440, 1920, 2560px, dark)_
- `LA-029` **Ugly** — Reminders card ignores the two-column grid above it _(at 1024, 1280, 1440, 1920, 2560px, dark)_

### New trip

- `LA-034` **Ugly** — New trip form stuck in a ~586px island on wide screens _(at 768, 1024, 1280, 1440, 1920, 2560px, dark)_

### Privacy

- `LA-040` **Ugly** — Legal page text is capped at ~768px, a shrinking island on wide screens _(at 1024, 1280, 1440, 1920, 2560px, dark)_

### Today

- `LA-044` **Ugly** — Empty trip's cover shows a lone grey initial instead of the usual gradient _(at 375, 1440px)_
- `LA-045` **Ugly** — Two-column Home layout (shown via /today) leaves a large blank gap _(at 1024, 1280, 1440, 1920, 2560px, dark)_

### What's new

- `LA-047` **Ugly** — What's new stays a narrow ~720px card at every desktop width _(at 768, 1024, 1280, 1440, 1920, 2560px, dark)_

### Account

- `LA-048` **Polish** — Trip name clipped with ellipsis in digest list at 360px _(at 360px)_

### Across screens

- `LA-049` **Polish** — Checkboxes, toggles, chips and row icons inside pages are under 44px on phones _(at 360, 375, 390, 430px, dark)_
- `LA-050` **Polish** — Header icons, avatar stack and floating buttons are under 44px on phones _(at 360, 375, 390, 430, 768, 1024, 1280, 1440, 1920, 2560px, dark)_
- `LA-051` **Polish** — Some paragraphs run past ~80 characters a line on desktop (Help, Trip settings) _(at 768, 1024, 1280, 1440, 1920, 2560px, dark)_

### Sign in & legal pages

- `LA-054` **Polish** — Footer and legal-page links are small, tightly spaced tap targets _(at 360, 375, 390, 430, 768, 1024, 1280, 1440, 1920, 2560px, dark)_

## Left out

- `LA-013` Danger zone buttons “behind the tab bar”: withdrawn after re-verification. The buttons clear the tab bar by 70px; the failed tap was caused by LA-015’s overflow zooming the page out.
- Day map renders as a repeating "API KEY REQUIRED" watermark, not tiles — local env: no CARTO tile key in .env.local, so tiles carry an API KEY REQUIRED watermark.
- Map tiles covered by repeating "API KEY REQUIRED" watermark — local env: no CARTO tile key in .env.local.
- Flags render as plain read-only pills, not the kit's actionable "Worth a look" list — a feature, not layout: actionable flag fixes are new behaviour (out of scope).
- The shell issues ADR 0062 already decides (floating rail, blank side margins, content capped at ~1280px) were folded out by rule.

## Coverage gaps

- `make-it-fit`: the audit trip’s plan doesn’t overrun its hard end date, so the dialog never appears.
- `chapter-add`: chapters are off on the audit trip.
- `duplicate-trip` / `delete-trip` at 390: the harness's tap landed on the Danger zone heading because Settings overflows to 409px and the phone viewport zooms out (LA-015).

## Re-running

```bash
npm run dev   # local next dev on :3000 (never next start)
NODE_PATH=/usr/local/lib/node_modules LAYOUT_AUDIT_OUT=/tmp/layout-audit/<name> npm run audit:layout
# a subset: LAYOUT_AUDIT_ONLY="deep/plan/" … (merges into an existing out dir)
NODE_PATH=/usr/local/lib/node_modules npm run audit:layout:crops -- /tmp/layout-audit/<name>   # after reviewers write findings.json
```

Phases drift with the date (Blue Mountains leaves Final prep on 2026-09-26; Great Ocean Road ends 2026-09-27) — the harness reports a coverage gap rather than auditing the wrong phase.
