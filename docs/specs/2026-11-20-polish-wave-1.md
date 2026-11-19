# Polish, wave 1: broken things and bugs

Branch `chore/polish-pass`, cut from `main` at `a5d92bbe`. First of three branches that work
through `docs/audits/2026-11-20-polish-audit.md`; Cam marked every item of that audit "fix"
on 20 Nov 2026. Waves 2 (rough) and 3 (nits and carried-over items) follow on their own
branches, each cut from `main` after the previous one is merged and pushed.

Cam's standing instruction for all three: build, review, push to `main` when the reviewer and
the full suite are clean, start the next. Anything that needs his opinion goes on a list for
the end (`docs/audits/2026-11-20-polish-decisions.md`), built the recommended way meanwhile.
Target: all three live by Fri 27 Nov; no deploys from Mon 30 Nov.

Already on this branch and accepted by Cam: the repaired layout harness and the six overnight
fixes X1 to X6.

Ids below are the audit's.

## 1. Layout that hides what matters

- **P1, desktop Plan.** In a day's row for a thing to do, the title keeps its width and the
  note is what truncates. The title may still truncate when the row is too narrow for it
  alone, but never before the note has given up all of its room.
- **P2, phone Stop sheet.** The Stop's dates sit on their own line under its name, readable
  in full at 320 px wide. The nights stepper keeps its size and no longer touches the title.
- **L1, shared trip on a phone.** In the day-by-day list a Stop's name gets the row; the day
  count moves to a second line (or wraps under it) when both do not fit. Readable at 320 px.
- **M4 and M1, Money's Rates card.** A rate under 0.01 is shown the other way round (1 of the
  home currency in the foreign one, or whichever direction reads as a number above 0.01),
  with the pair labelled so the direction is plain. A rate figure never leaves its tile or
  breaks across lines between 320 and 2560 px: the figure shrinks to fit.

## 2. Numbers that disagree

- **B1.** Summary's and Print's budget category lists both show cost, and the column says so.
  Print no longer switches a row to paid.
- **B2.** On Summary, a Stop's amount is always its cost, with the per-night figure worked
  out from it. When something has been paid, the paid amount shows as a smaller second
  figure, labelled.

## 3. Words

- **B3.** Activity never repeats a noun ("updated the transport transport"). When a thing has
  no name of its own the sentence uses the noun once. Applies to every kind of thing the
  feed names, not only Transport.
- **B5.** Share your Globe only offers to invite someone while there is room and the viewer
  may invite. Otherwise the description says who the Globe is shared with.
- **B6.** The Globe list's group for markers with no country is called "No country".
- **B7.** A Review summary longer than the cap is cut at a word and ends with an ellipsis.
  Summaries already stored at exactly the cap length with no closing punctuation get an
  ellipsis when shown; stored text is not rewritten.
- **W1.** The three remaining kinds of warning that print a stored date (Transport leaving
  outside its Stop's dates, Transport arriving outside them, a return after the Hard end
  date) read as days wherever a Traveller sees them, as X4 did for the others. Stored text,
  the Claude connection and Reviews keep the stored form.

## 4. Behaviour

- **B4.** Plan's "Jump to" rail highlights the Stop that is at the top of the reading area
  among all Stops currently in it, and the last Stop when the page is scrolled to its end.
- **B8.** On the weather card the daylight length sits below the sun arc, clear of its dots.
- **B9.** The What's new banner on the Trips list does not move the cards when it arrives: it
  floats above the tab bar on a phone (and in the same corner region on desktop) instead of
  sitting in the page flow. Dismissing it works as before.

## Not in this wave

Everything else in the audit. The dark theme, headers, dialogs and spacing are wave 2.

## Decisions taken for Cam, to confirm at the end

B1 (cost on both), B2 (cost with paid secondary), B5 wording, B6 name, B7 old summaries,
B8 placement, B9 floating banner, M1/M4 inverted small rates, P2 dates on their own line.
