# Hide What-if plans

Cam, 2026-11-18: What-if plans (Forks) are unused and every new feature has to
answer "and in a What-if plan?". Hide the feature now; delete it properly after
the Christmas trip (separate branch, January). Agreed with Cam on 2026-11-18.

No data change, no migration, no deleted feature code. Existing Forks stay in
the database, unreachable.

## H1. One switch

`WHAT_IF_PLANS_HIDDEN = true`, exported from `lib/plan-scope.ts`. Everything
below reads it. Setting it to false restores today's behaviour exactly.

## H2. Nothing shows

- `resolvePlan` (`lib/plan-scope.ts`) returns the real plan whatever `?plan=`
  says, so the Plan, Money and Wishlist pages, the variant banner and the
  Wishlist "in this plan" affordance all fall back to the real plan.
- `showForkSwitcher` (`lib/trip-phase.ts`) returns false, removing the plan
  switcher from both header mounts.
- `app/(app)/trips/[tripId]/compare/page.tsx` redirects to the Plan before
  reading anything.
- The "What-if plans" switch is removed from Trip settings
  (`components/trip/settings/trip-details-form.tsx`).
- Help guide: the What-if section, its mentions elsewhere in the guide, the
  "compare" segment and the quoted labels are removed
  (`components/trip/help-guide.tsx`, `lib/help-guide.ts`), keeping the guide's
  drift tests honest. The What's new note about What-if plans
  (`lib/release-notes.ts`) and the landing page's What-if sample notes
  (`app/landing/sample-trips.ts`) are removed.
- Old Activity lines that mention a What-if plan keep their text.

## H3. Nothing works

- `requireForkAccess` and `requirePlanAccess` (`lib/guards.ts`) answer
  not-found for any Fork while hidden. That closes rename, discard, move, the
  promotion preview, promote, and every write that takes a `forkId`.
- `createFork` and `getComparison` (`server/actions/forks.ts`) refuse.
- `setForksEnabled` (`server/actions/trips.ts`) refuses to turn the setting on
  (turning it off still works).
- `requireRowAccess` answers not-found for a row that belongs to a Fork while
  hidden (this also closes the MCP `add_note` / `delete_note` gap, open.md
  CF-08).
- The travel-time refresh (`lib/travel-times/refresh.ts`) skips Forks.

## H4. Words

- MCP: `lib/mcp/server.ts` and the `update_trip` description
  (`lib/mcp/tools/trips-stops-write.ts`) stop mentioning What-if plans;
  `lib/mcp/vocab.test.ts` follows. `docs/connect-claude.md` likewise.
- `CONTEXT.md` Fork / Promote / Compare: one line each saying the feature is
  hidden since 2026-11-18 pending removal. ADR 0020 gets a dated note.
- `docs/open.md`: the "hide, then remove" item becomes "remove (hidden since
  2026-11-18)", listing what removal must cover: the `forkId` columns, the
  fork actions, Compare, the demo seed's "Italy First" Fork, Fork-owned
  attachments on Files and in the storage quota. CF-08 is closed.

## Not doing

Deleting code or columns; cleaning up existing Forks or their files; changing
the demo seed.
