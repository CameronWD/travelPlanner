# Follow-ups from the audit-backlog build

Findings surfaced during the `fix/audit-backlog` build (branch of 30 commits closing
`docs/things-to-fix.md`). Each was reviewed, judged real, and explicitly triaged
**ships-as-follow-up** by the final whole-branch review — recorded here so they are
not lost when the build's scratch workspace is deleted.

## Worth doing soon

- **Thread `forkId` through the standalone `CostEditor` → `createCost`**
  (`components/trip/cost-editor.tsx:266`; rendered on transport/accommodation/item
  cards on the fork-aware Plan page). Adding an extra cost to a fork entity today
  files it on the **real plan** with an `ownerId` pointing at a fork-owned entity.
  Pre-existing, but P1-2 made it visible. The `OtherCostEditor` instance was
  mitigated by hiding it on forks (`budget/page.tsx`); this one was not — same root
  cause, fix both by threading the active fork id.
- **`?plan=a&plan=b` (repeated param) 500s** on `plan/page.tsx` and
  `budget/page.tsx`: Next hands `string[]` against `plan?: string`, and the Prisma
  `findFirst({ where: { id: [...] } })` throws. Crafted-URL only, auth-guarded
  first, but a systemic one-line normalise (`Array.isArray(plan) ? plan[0] : plan`)
  closes it in both places.
- **`assertForkingAllowed` gates on UTC `todayISO()` while the layout's
  `showForkSwitcher` is now zone-aware** (`server/actions/forks.ts:68,730` vs
  `layout.tsx`). Narrow west-of-UTC window where the switcher renders but
  create/promote cleanly rejects. Fails closed; align the action on the same
  trip-reference-timezone helper when convenient.
- **The three inline `paidAt` string fields** (`lib/validations/transport.ts`,
  `item.ts`, `accommodation.ts`) kept the shape-only date regex after P3-2 fixed
  `paidAtStringSchema` — and `new Date("2026-02-30")` silently rolls to 2 Mar
  rather than failing. Reachable only by hand-crafted action payloads. Apply the
  same `isRealCalendarDate` refine and share `MAX_AMOUNT_MINOR` (still hardcoded
  as `2_147_483_647` in those files).
- **`docs/HANDOFF.md` "Current setup" section** (one heading below the fixed
  overview table) still describes SQLite / `provider = "sqlite"` as what the code
  does; actual schema is `postgresql`. Same drift P3-1 fixed, one section down.

## Nice to have

- Scope the located-wishlist query in `phase-travelling.tsx:171-179` to
  `forkId: null` (belt-and-braces — fork-created wishlist-shaped rows aren't
  producible today) and assert `calls[1]` in its test.
- Fold `createTransport`/`updateTransport`'s duplicated tz-conversion block into a
  shared helper that also returns `validateStopBelongsToTrip`'s rows (saves the
  double stop fetch).
- `currentTripTimezone` builds an `Intl.DateTimeFormat` per stop — memoise
  per-zone formatters if the trips list grows.
- Four of the six new catch-block comments in `itinerary-manager.tsx` were
  copy-pasted from `handleFirmUp` and mention markers/callers those handlers don't
  have; the toast copy "nothing was changed" overclaims what a client can know
  after a rejected action. Reword both.
- Visual eyeball (needs DB, with `docs/mobile-pwa-checklist.md`): the paid-confirm
  popover's static currency span styling; the fork Budget's banner/note spacing;
  the two whole-trip firm-up labels ("Firm up all stops" banner vs "Firm up the
  whole trip" button — one handler, two labels, cosmetic).
- Small dead code: `checklistRows` built but unrendered on a fork
  (`budget/page.tsx`); unreachable `todayISO()` fallback arg on the trips page;
  `phase-sketching.tsx` comment cites the dated-views rule (say "Home always shows
  the real plan"); `variant-banner.tsx` docstring predates fork-aware Budget.
- Test gaps flagged by reviewers: `nav-more-menu` has no direct test;
  mobile-tab-bar doesn't assert `?plan=` reaches rendered Links; `aria-busy` on
  checklist rows unasserted; no DST transition-day case for
  `zonedWallTimeToInstant` (probed correct by hand); dialog-reuse re-seed and
  inverted cross-zone warning untested in the transport dialog.

## Still owed (needs prod DB / running app — from things-to-fix statuses)

- P0-3 migration rehearsal on a Neon snapshot branch, then the real deploy per
  `docs/DEPLOY.md` §4b.
- P0-1 manual verify: typed transport time survives card + reopened dialog + ICS.
- P2-8(a): count legacy paid-without-date rows in prod (the Budget notice now
  surfaces them to users regardless).
- P3-5: re-shoot `.verify/` screenshots against the post-D3 UI.
