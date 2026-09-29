# Feedback batch — Day page, plan editor, trip links (2026-09-29)

Nine open Feedback notes (site: main), agreed in the 2026-09-29 grilling session.
Glossary: **Gap day** added to CONTEXT.md. Decisions: ADR 0032 amendment
(2026-09-29), ADR 0064.

Every commit that does a note's work carries a `Resolves-Feedback: <id>` trailer.
Never run `feedback:resolve`; never hand-edit `docs/feedback/inbox.md`.

## Day view

### D1 · Tonight card expands in place — `cmum7zzsl000004l2740vynm2`
- Tapping the Tonight card toggles an in-place expansion (no navigation).
- Expanded shows, each only when present: address (a link that opens the
  address in maps), confirmation number (with a copy-to-clipboard button),
  check-in time, check-out time, notes.
- Expanded view carries an "Edit in plan" link to the old target
  (`/trips/<trip>/plan#stop-<stopId>`).
- Accessible: the toggle is a button with `aria-expanded`.

### D2 · Desktop header and strip — `cmum825bd000004l7ju9uxfsy`
- Desktop (lg+): the date heading with its prev/next arrows is centred.
- Desktop strip: no longer pins the selected day 3rd from the left. On first
  render it starts at the first day; it scrolls only when the selected day would
  be out of view, and then just enough to show it with one day's margin either
  side. A trip whose days all fit never scrolls.
- Phone (< lg): unchanged.

### D3 · Stop line — `cmum83ffz000004jnnl2w95au`
- If the Trip has a Home base: a dot at the start of the line labelled with the
  Home base's **name** (never the word "Home"), styled like Stop dots; on a
  round trip, a matching dot at the end. The line runs Home base → Stops →
  Home base.
- **Gap days** (in the Trip's dates, covered by no Stop): the line continues as
  a dashed stretch with an icon for the covering Transport's mode and its route
  label ("Denpasar → Rome"); unlabelled dashed stretch if no Transport covers it.
- A Trip with no Home base renders as today apart from gap days.

### D4 · Day change motion — `cmum89gal000004l94l53w2oc`
- On day change the heading's changing text (date and its subtitle line)
  crossfades (~150ms), in step with the existing body slide.
- The arrows do not move.
- The strip's selected highlight glides to the new day instead of jumping.
- `prefers-reduced-motion: reduce` → instant swap, no fade, no glide.

### D5 · Day plan card sizing — `cmum89xjz000104l95rix7a3u`
- The Day plan card sizes to its content rather than stretching to the column.
- Empty day: a block with a touch of breathing room (≈ the height of 3–4 Items)
  holding a centred "Nothing planned" line and the add action.
- Busy days keep today's max-height and internal scroll.

### D6 · Journal card sizing — `cmum8a8la000204l98a4pdiar`
- The Journal card sizes to its content; empty → compact prompt with the write
  action.
- Both desktop columns are top-aligned; spare space falls below the cards.

## Plan editor

### P1 · Bookend transport prompts — `cmum86t22000104jnxggtl4mj`
Per ADR 0032 amendment:
- Outbound leg = a Transport arriving at the first Stop whose departure is not
  another Stop (home-flagged, free-text place, or unset). Return leg = a
  Transport departing the last Stop whose arrival is not another Stop. A
  home-flagged candidate wins over a non-flagged one.
- The bookend card shows the leg's real endpoint (e.g. "Brisbane").
- At most one add-transport prompt per bookend: none when the leg exists; the
  bookend prompt only (never also the generic "add transport here" slot) when
  it does not.
- The one rule lives in one place; Flags' missing-return check uses it.

### P2 · Add stop / Chapters placement — `cmum87uqs000004lf1l401538`
- Desktop (lg+): "Add stop" (primary) and the Chapters menu move into the
  sticky Plan overview aside, below the overview.
- Phone: unchanged (bottom of the plan). Empty plan: centred buttons unchanged.
- Add stop still appends at the end.

## Trip links — `cmum8awyr000304l9cokb7p7c` (last in the plan)
Per ADR 0064:
- Trip URL segment is a name slug: lowercase, accents stripped, non-alphanumeric
  runs → single `-`, trimmed, ≤ 60 chars, `trip` if empty.
- Unique app-wide; clash → `-2`, `-3`…; `new` reserved.
- Rename re-derives the slug. Every slug a Trip has had is kept and can never be
  taken by another Trip. Renaming back to an own old slug reuses it.
- An old slug or a bare cuid in the URL redirects (permanent) to the current
  slug, preserving the rest of the path and query.
- Slug → id resolved once at the route boundary; loaders, guards and actions
  keep ids. Non-members get the same not-found as today.
- All internal trip links go through one helper; a test fails on hand-built
  `/trips/${...}` links.
- Migration adds the slug (+ history) and backfills existing Trips.
- Share links (`/share/[token]`) and Calendar feeds unaffected.

## Out of scope
Phone floating Add-stop button; any other copy.
