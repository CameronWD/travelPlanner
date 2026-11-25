# Shared view one route Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The shared page has one route list with Home cards at both ends and Stops that open independently.

**Architecture:** All within `app/share/[token]`: the day-by-day section becomes the route section; the separate route list renders only when there is no day-by-day; the open/closed state becomes a set.

**Tech Stack:** Next.js 16 server components with small client pieces, Tailwind 4, vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-25-share-one-route.md`

## Global Constraints

- Branch `feat/share-one-route-2026-11-25`. Commit with explicit paths; never `git add -A`. Leave the untracked `AGENTS.md` alone.
- Never push, merge, or run `feedback:*`, `usage:report`, `db:seed*`, `prisma migrate *`, `prisma db *`, or anything that reads `.env.production.local`. Never `npm test` or `npm run build` in a task. Verify with `TZ=UTC npx vitest related --run <changed sources>`, `npx tsc --noEmit`, `npx eslint <changed files>` (zero warnings).
- The page is public. No select gains a column. Never selected, passed to a client component or rendered: carrier, seat, terminal, gate, coach, platform, booking reference, notes, Costs, a Home end's place, the Home timezone's name. The Home base's NAME may be rendered only where this plan says, and only when the page already exposes it (the route map's Home point, `homeMapPoint(trip)`, is non-null).
- Every existing privacy test in `app/share/[token]/page.test.tsx` passes unchanged.
- `share-style-bans.test.ts`: no `shadow-soft`, `border-border/70`, `bg-card/40`, no raw hex under `app/share/[token]`.
- Client pieces receive view models, never rows.
- Next.js here differs from older versions: read the relevant guide in `node_modules/next/dist/docs/` before using a Next API you have not just seen used in this repo.
- Comments only where the why is not obvious. No features beyond the task.
- End every commit message with these two lines: `Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>` then `Claude-Session: https://claude.ai/code/session_01F2em1SLLMkG9JoxPxLPrF5`.

## Review Focus

1. A link with transport off shows no Home cards and no legs; a link with a Home leg but no Home name shows the leg and no Home card.
2. With accommodation, transport and daily plans all off, the page shows exactly today's route list and no openable cards.
3. Opening a second Stop leaves the first open; closing one leaves the others; the picker opens its target without closing others.
4. A Stop with no dates appears once, at the end, and cannot be opened.
5. The page never shows the same Stop in two lists.

---

### Task 1: One route

**Files:** `app/share/[token]/page.tsx`, `day-by-day.tsx`, `day-by-day-client.tsx` (the provider/open state, `StopBlock`, the picker and index), `share-route-list.tsx`, `stop-summary.ts`, their tests, `design_handoff/**/SHARE.md` (the sections for the route list and day by day), `lib/release-notes.ts`.

Behaviour:
- **Open state:** the provider holds a set of open Stop ids, seeded with `initialOpenId` when non-null. Toggling a Stop adds or removes only that id. The picker and index add their target (and scroll to it as today) without removing others. Accessible names and `aria-expanded` per card are unchanged.
- **Section:** the section's heading text becomes "The route" (keep the element ids and `data-share-section-inner` values that other code or tests anchor on unless they would now be misleading; if you rename one, update every reference). The picker and, on wide screens, the index stay.
- **Country:** `stopSummary` appends the Stop's country as the last " · "-joined part when the Stop has one (so with both switches off the line is just the country, as today). The open card shows the country where its sub-line is.
- **Stops with no dates:** the page passes them (name, country, nights or null) as `roughStops`; they render after the last scheduled Stop (and after the Home-back leg and Home card when present) as plain cards: name, country, "{n} nights" when known, and "Dates to come" (reuse the old list's wording and its `formatNights`). They have no Show control and no connector.
- **Home cards:** `DayByDay` gains `homeName?: string | null`. When `homeOut` is drawn and `homeName` is set, a dashed card (house icon, the name, "Home") renders above the outbound leg with the connector meeting its bottom edge; likewise below `homeBack`. Style it on the Plan's Home base bookend (`components/trip/itinerary-manager.tsx`, the Home bookend card: dashed border, house icon) using only classes allowed under the share style bans. `homeName` is `homeMapPoint(trip)?.name ?? null`.
- **Route list:** `ShareRouteList` renders only when the day-by-day section does not (`days` false in the page's section flags). When the day-by-day renders, the route list does not.
- **Order on the page:** header, Right now, map, the route, footer. Remove any now-dangling in-page links or headings that pointed at the old second section.
- Release note at the top of `RELEASE_NOTES` (`publishedAt` from `date -u +%Y-%m-%dT%H:%M:00Z`, later than the newest note, not in the future, under the cap): "Shared links have one route list, with Home at each end, and Stops that stay open when you open another."

- [ ] **Step 1: Failing tests:**
  - open state (client test): opening Stop 2 with Stop 1 open leaves both `aria-expanded="true"`; closing Stop 1 leaves Stop 2 open; the picker choosing Stop 3 opens it and leaves 1 and 2 as they were (Review Focus 3).
  - page: with day-by-day shown, there is exactly one heading "The route", no second list of Stops, and each Stop's name appears as a Stop card heading once (Review Focus 5); with all three switches off, the old route list renders and there are no `aria-expanded` Stop cards (Review Focus 2).
  - Home cards: with a Home-out leg, a Home-back leg and a Home name, two Home cards render, the first before the outbound leg and the last after the return leg, each containing the Home name and "Home"; with transport off none render (Review Focus 1); with a Home leg but `homeMapPoint` null, the leg renders and no Home card.
  - rough Stops: a Stop with no dates renders once after the scheduled Stops with "Dates to come" and no Show button (Review Focus 4).
  - `stopSummary`: country appended last; alone when both switches are off; absent when the Stop has none.
  - the existing privacy tests pass unchanged; add: the Home card's text contains no Home place and the page's props and HTML still contain no Home timezone name.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** update the SHARE.md sections to describe one route section, the Home cards, independent Stops and the all-off exception. **Step 5:** `TZ=UTC npx vitest run "app/share/[token]" lib/release-notes.test.ts lib/client-zod.guard.test.ts`, `vitest related --run` on changed sources, `npx tsc --noEmit`, `npx eslint` on changed files.
- [ ] **Step 6:** Commit: `feat(share): one route list with Home at each end, and Stops that open independently`
