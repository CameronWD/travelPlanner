# Day view phone fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On a phone's Day view the weather card never vanishes after its placeholder, at most one day is lit in the strip, heading text never passes under the arrows, and the heading is never blank after a swipe.

**Architecture:** Three independent changes in three areas: the weather read and its card states; the date strip's classes; the heading track inside the carousel.

**Tech Stack:** Next.js 16, React 19, Tailwind 4, vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-25-day-carousel-phone-fixes.md`

## Global Constraints

- Branch `feat/share-legs-and-day-carousel-2026-11-25`. Commit with explicit paths; never `git add -A`. Other agents commit other files in this checkout at the same time. Leave the untracked `AGENTS.md` alone.
- Never push, merge, or run `feedback:*`, `usage:report`, `db:seed*`, `prisma migrate *`, `prisma db *`, or anything that reads `.env.production.local`. Never `npm test` or `npm run build` in a task. Verify with `TZ=UTC npx vitest related --run <changed sources>`, `npx tsc --noEmit`, `npx eslint <changed files>` (zero warnings). A `tsc` error in a file outside your task is another lane mid-edit: ignore it and say so.
- Do not call the weather service or any external API from a test or a task; tests mock `fetch`.
- No behaviour change at wide screens (`lg` and up) unless the task says so.
- ADR 0065 (Day view carousel) and ADR 0063 (loading states) stand; a task that needs to depart from one says so in its report rather than doing it quietly.
- Next.js here differs from older versions: read the relevant guide in `node_modules/next/dist/docs/` before using a Next API you have not just seen used in this repo.
- Comments only where the why is not obvious. No features beyond the task.
- End every commit message with these two lines: `Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>` then `Claude-Session: https://claude.ai/code/session_01F2em1SLLMkG9JoxPxLPrF5`.

## Review Focus

1. A day exactly 15 days out gets a forecast request; a day 16 out does not and shows the typical reading.
2. A forecast that responds OK but with null temperatures falls back to the typical reading, and never draws "— / —".
3. With both sources failing inside the window, the card is still drawn at its normal height; nothing below it moves when the placeholder is replaced.
4. During a run of quick day changes in the strip, no day other than the lit one carries a visible highlight or coloured background.
5. On a settle onto the neighbour where the day-in-view update commits after the settle update, the visible heading is never empty; and a settle back onto the same day restores the track to rest.

---

### Task 1: The weather card always resolves to a card

**Files:** `lib/weather.ts`, `lib/weather/theme.ts`, `lib/day-view-loader.ts` (`getDayWeatherView`), `components/trip/day/day-weather.tsx`, the weather card component (`components/**/WeatherCard.tsx`), tests beside each (`lib/weather.test.ts`, `lib/weather/theme.test.ts`, `components/trip/day/day-weather.test.tsx`), `docs/adr/0015-*.md` (amendment), `docs/specs/2026-09-27-day-view-weather-card.md` (the sentence about rendering no card).

Behaviour:
- Forecast is requested for `0 <= daysOut <= 15` only. Make the constant and the comparison agree with `forecastOpensOn` (`lib/day-view-model.ts`, which uses 15) and with the card's "15 days before" copy, so one number rules.
- If the forecast response is not OK, throws, or yields no maximum and no minimum temperature, read the typical-for-the-month value through the same path used beyond the window, and return it marked as typical.
- If there is still no reading and the day is inside the window, `getDayWeatherView` returns a view the card renders at its normal footprint: daylight (sunrise, sunset, length) when the code can compute or has it, and the text "No forecast right now" where the temperatures and condition would be. No "— / —", no fallback illustration implying a condition.
- `DayWeather` returns `null` only where there was never going to be a card (no coordinates for the day); in that case its Suspense fallback must not have shown a skeleton either. Read how the page decides to render the weather slot and its fallback, and make the two agree.
- The 60-second cache of a null stays for genuine double failures only.

- [ ] **Step 1: Failing tests** (mock `fetch`; fix "today" as the file's existing tests do):
  - `daysOut = 15`: the forecast URL is requested; `daysOut = 16`: it is not, and the typical read is used (Review Focus 1).
  - forecast non-OK at `daysOut = 10` → result is the typical reading, flagged typical.
  - forecast OK with null max and min at `daysOut = 15` → typical reading (Review Focus 2).
  - both fail at `daysOut = 5` → the view is the "no forecast" state, not null; the card renders "No forecast right now" and no temperature dashes (Review Focus 3).
  - a day with no coordinates → no card and no skeleton.
  - existing forecast and typical expectations unchanged.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** Docs: amend ADR 0015 and the weather-card spec so both say the card holds its place inside the window. **Step 5:** verify. **Step 6:** Commit: `fix(weather): the day's weather card never disappears after its placeholder`

---

### Task 2: One lit day in the strip

**Files:** `components/trip/day/day-strip.tsx`, `components/trip/day/day-strip.test.tsx`, `docs/audits/2026-11-23-shift-and-feedback-check.md` (one line where the fade is recorded).

Behaviour: the highlight layer and the chip's background fade only when becoming lit; when losing the highlight they change with no transition. Concretely the lit state carries the transition classes (`transition-opacity duration-200` on the layer, `transition-colors duration-200` on the chip) and the unlit state carries `transition-none`. Nothing else about the strip changes (scrolling, sizes, what "lit" means, the pending-navigation state).

- [ ] **Step 1: Failing tests:** the lit day's layer has `opacity-100` and `transition-opacity`; every other day's layer has `opacity-0` and `transition-none` and not `transition-opacity`; the lit chip has `transition-colors`, unlit chips do not; after changing the day in view twice in a row, exactly one day carries the lit classes (Review Focus 4). Update the existing assertion that every layer has `transition-opacity`.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** verify. **Step 5:** Commit: `fix(day): only the day becoming lit fades in the strip`

---

### Task 3: The heading track

**Files:** `components/trip/day/day-carousel.tsx` (`DayHeadingTrack`, `measureHeading`, `moveHeading`, `restHeading`, the settle handling ~680-780), `components/trip/day/day-chrome-registry.test.tsx` (the heading-track tests), `components/trip/day/day-carousel.test.tsx`, `docs/adr/0065-*.md` (amendment 2026-11-25).

Two changes in one component; do them in this order, each with its own tests, in one commit.

**A. A settled swipe never leaves the heading empty.**
- On a settle onto the neighbour (`settled && Math.round(p) !== 0`), do not clear the neighbour (`setToward(null)`); the render already discards it once the day in view changes (`neighbour = toward?.from === view ? … : null`).
- `DayHeadingTrack` reads the day in view through `useSyncExternalStore` on the same `subscribeDay` store `DayStrip` uses, instead of only the `view` prop, so the heading and the strip change in the same frame. Keep the prop as the server/first-render snapshot.
- A settle back onto the same day (`Math.round(p) === 0`) restores the track to rest exactly as today.
- A new drag starting before the previous settle has fully landed must leave the track consistent (no stale translate, no stale neighbour).

**B. Moving heading text is clipped between the arrows.**
- In `measureHeading`, measure once per gesture the arrows' inner edges relative to the heading area (left arrow's right edge, right arrow's left edge).
- In `moveHeading`, set a `clip-path` on each panel's `[data-slot=day-title-block]` so its painted area never extends past those edges: for a panel offset by `o` px, `inset(-1rem ${right}px 0 ${left}px)` where `left`/`right` are how far the panel's own box overhangs each arrow edge at that offset (0 when it does not). Writes only, no reads, per frame.
- `restHeading` clears the clip.
- The arrows themselves must not be clipped, and the existing area clip stays.

- [ ] **Step 1: Failing tests** (extend the heading-track block in `day-chrome-registry.test.tsx`, which already asserts transforms and clip-paths):
  - A: a settle onto the neighbour where the settle callback runs and commits BEFORE the day-in-view store changes: after that first commit the track still contains the neighbour's heading text; after the store changes, the track shows the new day's heading at rest (transform cleared) (Review Focus 5). A settle back to the same day: the track is at rest with the original heading.
  - A: the heading re-renders when the `subscribeDay` store changes without the `view` prop changing.
  - B: at half-way through a drag toward the next day, the day-in-view panel's title block has a `clip-path` with a non-zero right inset and the neighbour's has a non-zero left inset (mirror for a drag toward the previous day); at rest neither has a clip-path; the arrow elements never have one.
  - Existing heading-track and carousel tests pass unchanged, or changed only where they asserted the neighbour being dropped on settle.
- [ ] **Step 2:** FAIL. **Step 3:** Implement A, then B. **Step 4:** ADR 0065 "Amendment 2026-11-25": the heading is clipped to the space between the arrows while it travels; a settle onto the neighbour keeps the neighbour's heading drawn until the day in view has changed; the heading reads the day in view from the same store as the strip. **Step 5:** verify. **Step 6:** Commit: `fix(day): the heading is never blank after a swipe and never passes under the arrows`

---

## Order

All three side by side: no shared files.

## After the tasks (orchestrator)

1. Branch tier: `npm test`, `npm run build`, `npm run test:integration`.
2. Browser, local demo trip at 390 px: the strip during quick day changes; a day at 15 and 16 days out with the weather request blocked (both the fallback and the "No forecast right now" card); a slow drag to see the heading clip.
3. Beta for Cam's phone: the blank heading (fix 4) can only be confirmed there.
