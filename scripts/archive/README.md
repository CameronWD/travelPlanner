# Archived one-off scripts

Kept for reference only — **unmaintained**. Each ran once against production
and is not expected to run again. This folder is excluded from `tsc`
(`tsconfig.json`), ESLint (`eslint.config.mjs`), Vitest (`vitest.config.ts`)
and knip (`knip.json`), so imports of `lib/` here may go stale as `lib/`
moves; fix them before running one again.

| Script | What it did | Why |
|---|---|---|
| `backfill-geocode.ts` | Geocoded Items, Accommodation and Transport saved before coordinates were stored | ADR 0011 |
| `backfill-cover-aspect.ts` | Filled `Trip.coverAspect` for covers uploaded before it existed | spec F (cmuj4l1d9) |
| `backfill-cover-small.ts` (+ `backfill-cover-small-run.ts`, `cover-small-image.ts`) | Made ~480w WebP copies of covers uploaded before small copies existed | spec 2026-10-06 §H, PX-01 |
| `sweep-orphaned-costs.ts` | Cleared Cost rows orphaned before ADR 0039 | ADR 0039 |
| `move-lib-modules.ts` (+ `lib-moves.ts`, `lib-moves.test.ts`) | Codemod that moved the auth, share, feedback, map and money modules into `lib/<area>/` folders and re-pointed every import; ran once per area, in the repo, not against production | spec 2026-10-14 Q9 (card 3.O) |

Run one with `npx tsx --conditions=react-server scripts/archive/<name>.ts`;
each file's header gives its flags (`--dry-run` / `--execute`).
