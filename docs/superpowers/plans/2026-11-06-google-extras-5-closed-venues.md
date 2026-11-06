# Google extras — Branch 5: Closed venues Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Flag a scheduled Item whose venue has closed (for good, or temporarily when last checked), and badge Wishlist ideas the same way. Re-check the status of venue Items on upcoming Trips at most monthly, using the existing after-save refresh.

**Architecture:**
- **Data:** `Item.businessStatus` already exists, set on pick and by the backfill. This branch adds `Item.statusCheckedAt`.
- **Flags:** a pure Flag rule in `lib/flags.ts` beside Rule 17. The Flag loader must select the new fields.
- **Badge:** `ItemCardItem` gains `businessStatus`.
- **Re-check:** a server step, `refreshVenueStatuses(tripId)`, runs in the `after()` refresh that `revalidateTrip` already schedules for plan writes. It makes a Place Details call with field mask `id,businessStatus` (billed as Place Details **Pro**), counted by `dailyCap("venue-status")`.

**Tech Stack:** Next.js (repo version — read `node_modules/next/dist/docs/`), Prisma, TypeScript, Vitest.

**Spec:** `docs/specs/2026-11-06-google-extras.md` §E. Glossary: CONTEXT.md **Flag** (amended for closed venues).

## Global Constraints

- **Flag copy (exact):**
  - Closed for good: `"{name} has closed for good. Find a replacement."` Severity `warning`, id `item-closed-for-good-{id}`.
  - Closed temporarily: `"{name} was temporarily closed when last checked on {checkedLabel}. Check it reopens before {dateLabel}."` Severity `info`, id `item-closed-temporarily-{id}`.
  - `{checkedLabel}` is `formatDayLabel` of `statusCheckedAt`'s UTC date. When `statusCheckedAt` is null, use `"when last checked"` wording without a date: `"{name} was temporarily closed when last checked. Check it reopens before {dateLabel}."`
  - `{dateLabel}` is `formatDayLabel(item.date)`.
  - `{name}` uses the same `itemTitle(item) ?? "This thing to do"` as Rule 17.
- **Scope:** only scheduled Items (`date` set) get Flags. Wishlist ideas (no date) get a badge instead, never a Flag.
- **Wishlist badge copy:** `"Closed for good"` or `"Temporarily closed"`, using the same small badge style the ItemCard already uses for its other status pills (match an existing one).
- **Re-check rules:**
  - Only venue Items (`placeId` set) on Trips whose end date is today or later (upcoming or current).
  - Only those whose `statusCheckedAt` is null or older than 30 days.
  - At most 20 lookups per run, and each one takes `takeGoogleQuota("venue-status", dailyCap("venue-status"))`; stop at the first refusal.
  - A lookup that fails leaves the row untouched and doesn't throw.
  - A lookup that succeeds writes `businessStatus` (or null when Google omits it) and `statusCheckedAt = now`.
  - Picks and the backfill also set `statusCheckedAt = now` whenever they set `businessStatus`.
  - Past Trips are never re-checked.
- **Lookup:** `GET https://places.googleapis.com/v1/places/{placeId}`, with `X-Goog-FieldMask: id,businessStatus`, `languageCode=en`, and the server key.
- Verification tiers per `CLAUDE.md`. Zero comments unless the WHY is non-obvious. No JSDoc. Trailer exactly `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never stage `docs/feedback/inbox.md`, `AGENTS.md` or other untracked plan files.

## Review Focus

1. **A Surprise Item** whose venue closed must not reveal itself to a surprised viewer through a Flag. Flags already run over the masked plan, so confirm the new rule reads the same masked rows. Pinned in Task 1.
2. **The re-check never runs on a page view,** only after plan writes, and never on past Trips. Pinned in Task 2.
3. **No key, or over the cap,** means no calls and no errors. Pinned in Task 2.
4. **An Item copied into a Fork or a duplicated Trip** keeps `businessStatus` and `statusCheckedAt`. Pinned in Task 1 (the copy paths).
5. **Google returning no `businessStatus`** clears a stale `CLOSED_*` value, so the Flag goes away. Pinned in Task 2.

---

### Task 0 (controller)
- [ ] `git switch -c feat/google-extras-5-closed-venues` from `main`, then commit this plan.

### Task 1: Flags and badges from the stored status

**Files:**
- `prisma/schema.prisma` and migration `20261106160000_item_status_checked`: `Item.statusCheckedAt DateTime?`, additive.
- Copy paths, wherever `businessStatus` is copied today (`lib/duplicate-trip.ts`, `lib/fork-plan.ts`; grep for others), also copy `statusCheckedAt`.
- Places that set `businessStatus` from a pick or the backfill also set `statusCheckedAt: new Date()`: `server/actions/items.ts` create/update pick paths and `lib/backfill-places-apply.ts` (grep `businessStatus:`).
- `lib/flags.ts`:
  - `FlagItem` gains `businessStatus?: string | null` and `statusCheckedAt?: Date | string | null`.
  - New `export function flagClosedVenue(items: FlagItem[]): Flag[]` beside Rule 17, wired into the rule list the same way Rule 17 is.
  - The Flag loader (`lib/flags-loader.ts`) selects the two fields.
  - Check that Rule 17 and this rule both draw from the same masked item rows.
- `lib/plan-entity-views.ts`: `ItemCardItem` gains `businessStatus`, selected where ItemCards are built.
- The Wishlist ItemCard (`components/trip/item-card.tsx`) renders the badge.

- [ ] Write failing tests:
  - `lib/flags.test.ts`:
    - Closed-for-good scheduled Item gives the exact warning copy and id.
    - Temporarily closed with a check date gives the exact info copy with both labels.
    - Temporarily closed with no check date gives the dateless wording.
    - OPERATIONAL, a null status, or an unscheduled Item gives no Flag.
  - The flags-loader test selects the new fields.
  - ItemCard: each badge renders, and an OPERATIONAL card has none.
  - Copy tests in `duplicate-trip` and `fork-plan`.
  - Pick and backfill set `statusCheckedAt`.
- [ ] Run them and expect FAIL. Implement until they pass. Run the task-done verification.
- [ ] Commit: `feat(flags): closed venues flag and badge`.

### Task 2: Monthly re-check on upcoming Trips

**Files:**
- `lib/geocode.ts`: `export async function lookUpBusinessStatus(placeId: string): Promise<{ businessStatus: string | null } | null>`. Null on failure; otherwise `businessStatus` is null when absent. It uses the existing private `placeDetails` with mask `id,businessStatus`.
- Create `lib/venue-status/refresh.ts` (`server-only`): `refreshVenueStatuses(tripId: string, now = new Date()): Promise<{ checked: number; skippedQuota: boolean }>`.
  - Selects candidate Items per the re-check rules (the Trip's end date is today or later, in the Trip zone as the app already computes "today"; read how `lib/trip-phase.ts` does it).
  - Orders them so the oldest `statusCheckedAt` comes first, with nulls first.
  - Caps the run at 20 lookups.
- `lib/travel-times/schedule.ts` or `lib/revalidate.ts`: schedule `refreshVenueStatuses` in the same `after()` pass the Travel times refresh uses, for the same scopes. Lazy import, try/catch, no-op without a server key: copy how `scheduleTravelTimes` loads its refresh.

- [ ] Write failing tests:
  - `lib/venue-status/refresh.test.ts` (mock `db`, `takeGoogleQuota` and the lookup):
    - Only stale or unchecked venue Items on a current or upcoming Trip are looked up.
    - Past Trips are skipped.
    - At most 20 per run.
    - It stops at the first quota refusal (`skippedQuota: true`).
    - A failed lookup leaves the row untouched.
    - A success writes status and `statusCheckedAt`.
    - A missing status clears a stale `CLOSED_PERMANENTLY`.
  - `lib/geocode.test.ts`: `lookUpBusinessStatus` (mask, a null status, failure).
  - The schedule test: the step is scheduled with the Travel times step and is a no-op without a key.
- [ ] Run them and expect FAIL. Implement until they pass. Run the task-done verification.
- [ ] Commit: `feat(venues): re-check upcoming venues monthly after plan writes`.
