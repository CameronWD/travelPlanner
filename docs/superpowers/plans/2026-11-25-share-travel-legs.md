# Shared view travel legs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On a shared link, a leg shows a sun icon tile, its duration and day marker, and a flight or train number, and the Home legs are listed.

**Architecture:** One pure, zod-free view-model builder for a shared leg, used for Stop-to-Stop legs and the two Home legs; the page's Transport select gains exactly one column; `LegLine` is restyled.

**Tech Stack:** Next.js 16 server components, Tailwind 4, vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-25-share-travel-legs.md`

## Global Constraints

- Branch `feat/share-travel-legs-2026-11-25`. Commit with explicit paths; never `git add -A`. Leave the untracked `AGENTS.md` alone.
- Never push, merge, or run `feedback:*`, `usage:report`, `db:seed*`, `prisma migrate *`, `prisma db *`, or anything that reads `.env.production.local`. Never `npm test` or `npm run build` in a task. Verify with `TZ=UTC npx vitest related --run <changed sources>`, `npx tsc --noEmit`, `npx eslint <changed files>` (zero warnings).
- The share page is public. Its Transport select gains `serviceNumber` and nothing else. `carrier`, `seat`, `terminal`, `gate`, `coach`, `platform`, `reference`, `notes` and anything about Costs must never be selected, passed to a component or rendered under `app/share/**`.
- The number is shown only for mode FLIGHT or TRAIN, and only when the link's `includeTransport` is on (the select already runs only then).
- `app/share/[token]/share-style-bans.test.ts`: no `shadow-soft`, `border-border/70`, `bg-card/40`, no raw hex colours in any file under `app/share/[token]`.
- Client pieces of the share page receive view models, never rows (see the comment on `DayByDay`).
- Next.js here differs from older versions: read the relevant guide in `node_modules/next/dist/docs/` before using a Next API you have not just seen used in this repo.
- Comments only where the why is not obvious. No features beyond the task.
- End every commit message with these two lines: `Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>` then `Claude-Session: https://claude.ai/code/session_01F2em1SLLMkG9JoxPxLPrF5`.

## Review Focus

1. Nothing private reaches the page: a Transport holding a seat, gate, carrier, reference and notes renders none of them, and the select has none of their keys.
2. A bus or ferry with a service number shows no number.
3. A link with transport off shows no legs at all, Home legs included.
4. A Home leg whose Trip has no Home timezone still renders (times fall back as the page's existing `zoneOfEnd` does), and a Trip with no Home legs renders nothing extra.
5. An overnight arrival shows `+1`; a leg with only a departure time shows no dangling arrow or duration.

---

### Task 1: The shared leg

**Files:**
- Create: `app/share/[token]/share-leg.ts`, `app/share/[token]/share-leg.test.ts`
- Modify: `app/share/[token]/page.tsx` (the Transport select ~182-200; the day-by-day leg building ~474-492), `app/share/[token]/day-by-day.tsx` (`DayByDayStop["legAfter"]`, `DayByDay` props, `LegLine`), their tests (`page.test.tsx` including the `FORBIDDEN` list ~268, `day-by-day.test.tsx`)
- Modify: `CONTEXT.md` (**Travel details** entry), `lib/release-notes.ts`, and the share design doc if it states what a leg shows (search `docs/` and `design_handoff/` for "SHARE.md")

**Interfaces — Produces** (`share-leg.ts`, no zod, no React):

```ts
import type { TransportMode } from "@/lib/enum-values";
export interface ShareLegInput { mode: TransportMode; depPlace: string | null; arrPlace: string | null; depAt: Date | null; arrAt: Date | null; serviceNumber: string | null }
export interface ShareLeg { mode: TransportMode; label: string; line: string }
/** `label` is given by the caller ("Train to Strasbourg", "Flight home"). */
export function buildShareLeg(t: ShareLegInput, zones: { dep: string; arr: string }, label: string): ShareLeg;
```

`line` is, joined with " · " and skipping empty parts: the departure's local day (`formatDayLabel`), the route, the duration, the number.
- Route: `"{depPlace} {depTime} → {arrPlace} {arrTime}{plus}"` from whichever of those exist, exactly as the page builds `dep`/`arr`/`route` today, with `plus` = `" +N"` / `" −N"` (U+2212) when the arrival's local date differs from the departure's by N days, and nothing when it does not or either time is missing.
- Duration: `formatDuration(minutes)` from `lib/transport` when both instants exist and the difference is positive; else omitted.
- Number: the trimmed `serviceNumber` when mode is FLIGHT or TRAIN and it is non-blank; else omitted.
Reuse `transportTimeDisplay` (`lib/time-display`) and `durationMinutes` / `formatDuration` (`lib/transport`) as `lib/plan/leg-label.ts` does, rather than new date maths.

**Behaviour in the page and component:**
- The Transport select gains `serviceNumber: true`.
- Stop-to-Stop legs are built with `buildShareLeg`, label `"{Mode label} to {next Stop name}"` as today.
- Home legs: the Transport with `depIsHome` whose `toStopId` is the first scheduled Stop becomes `homeOut` (label `"{Mode label} to {first Stop name}"`, departure zone from the page's `zoneOfEnd(null, true)`); the Transport with `arrIsHome` whose `fromStopId` is the last scheduled Stop becomes `homeBack` (label `"{Mode label} home"`). `DayByDay` gains optional props `homeOut?: ShareLeg | null` and `homeBack?: ShareLeg | null` and renders `<LegLine>` for them above the first Stop's `<li>` and below the last, inside the same list structure so spacing matches the other legs.
- `LegLine`: the icon sits in `<span aria-hidden className="flex size-7 shrink-0 items-center justify-center rounded-full bg-sun text-on-accent">` with the icon `size-4` inside (check how the Plan's marker in `components/plan/leg-pill.tsx` gets its ink colour, e.g. the `island` utility, and match it); label and line unchanged in style. Add `data-share-leg` on the row.
- `FORBIDDEN` in `page.test.tsx`: `serviceNumber` is allowed in the Transport select only; it stays forbidden in the Accommodation, Item, Stop, member and Trip selects. Every other key stays forbidden everywhere.
- CONTEXT.md **Travel details**: replace "Never shown on a shared link or in the **Calendar feed**." with "On a shared link only the flight or train number is shown, and only when the link includes transport; nothing else of them is, and none of them is in the **Calendar feed**."
- Release note at the top of `RELEASE_NOTES` (`publishedAt` from `date -u +%Y-%m-%dT%H:%M:00Z`, later than the newest note, not in the future, under the test's length cap): "Shared links show travel with its duration and flight or train number, and list the flights from and back home."

- [ ] **Step 1: Failing tests.**
  `share-leg.test.ts`:
  - a TRAIN Munich Hbf 2026-12-10T05:51Z → Strasbourg 09:40Z, both Europe/Berlin, number "ICE 9572": `line` is `"Thu 10 Dec · Munich Hbf 06:51 → Strasbourg 10:40 · 3h 49m · ICE 9572"` (use the repo's `formatDayLabel` output for the day; assert the whole string).
  - a FLIGHT Denpasar 2026-12-05T11:00Z (Asia/Makassar) → Munich 2026-12-06T05:45Z (Europe/Berlin), number "TG 440 / TG 924": contains `"19:00 → Munich (MUC) 06:45 +1 · "` and ends `"· TG 440 / TG 924"` (Review Focus 5).
  - a BUS with `serviceNumber: "198"`: `line` does not contain "198" (Review Focus 2); a FERRY likewise.
  - a leg with `depAt` only: no "→ … +", no duration (Review Focus 5); a leg with no times and no places: `line` is `""`.
  - a blank or whitespace number is omitted.
  `page.test.tsx`:
  - the Transport select contains `serviceNumber` and none of `carrier`, `seat`, `terminal`, `gate`, `coach`, `platform`, `reference`, `notes` (Review Focus 1); the other selects still contain none of the forbidden keys including `serviceNumber`.
  - with `includeTransport` off: no `[data-share-leg]` (Review Focus 3).
  - with a Home → first Stop flight and a last Stop → Home flight: two extra `[data-share-leg]` rows, the first before the first Stop and reading "Flight to {first Stop}", the last after the last Stop and reading "Flight home"; with `homeTimezone: null` they still render (Review Focus 4).
  - a train with number "ICE 9572" and a `seat` and `gate` on the mocked row (if the mock returns extra keys): the page text contains "ICE 9572" and not the seat or gate values.
  `day-by-day.test.tsx`: `LegLine` renders the sun tile and `data-share-leg`; `homeOut`/`homeBack` absent renders nothing extra.
- [ ] **Step 2:** Run the three test files: new tests FAIL.
- [ ] **Step 3:** Implement `share-leg.ts`, then the page, then the component, then the docs and the release note.
- [ ] **Step 4:** `TZ=UTC npx vitest related --run app/share/[token]/share-leg.ts "app/share/[token]/page.tsx" "app/share/[token]/day-by-day.tsx" lib/release-notes.ts` (quote paths with brackets), `npx tsc --noEmit`, `npx eslint` on changed files. Confirm `share-style-bans.test.ts` passes.
- [ ] **Step 5:** Commit: `feat(share): a shared link shows travel with its duration and number, and lists the Home legs`
