# Feedback note site — spec

Agreed with Cam on 2026-09-26 (grill session). Decisions are recorded in ADR 0040's
2026-09-26 amendment and the **Site** glossary entry in `CONTEXT.md`.

## Problem

The beta preview and the live site share the production database, so a Feedback note written
on beta lands in the same table and the same `docs/feedback/inbox.md` as notes about the live
site, with nothing to tell them apart.

## Branch rules

- Work on `feat/feedback-site-tag`, cut from `main` at `3002531`. Merge into `main` locally only
  on Cam's explicit go-ahead. **Cam does all pushing.** Never deploy. After `main` is deployed,
  merge `main` into `beta` locally, again on Cam's go-ahead.
- Never run `npm run feedback:resolve`. Subagents never run `npm run feedback:pull`.
- Don't commit `next dev`'s `CLAUDE.md` block. Stage `CLAUDE.md` edits by hunk, via `git apply --cached`.

## What changes

1. **Schema.** `FeedbackNote.site String?`. The column is nullable: existing rows stay null and
   count as `main`, with no backfill. A Prisma migration is added under `prisma/migrations/`.
   It runs on the next production deploy, via `vercel.json`.
2. **Server-side site.** Add a pure `feedbackSite(env)` helper in `lib/`:
   - `VERCEL_ENV=production` → `main`
   - `VERCEL_ENV=preview` → `VERCEL_GIT_COMMIT_REF`, or `preview` if that's empty
   - otherwise → `local`

   The create action (`server/actions/feedback.ts`) sets `site` from it. The browser never sends
   a site; any client-supplied value is ignored. That includes the offline queue flush
   (ADR 0041), which records the site of the server that receives the note.
3. **Inbox** (`lib/feedback-inbox.ts` + `scripts/feedback-pull.ts`):
   - Open notes are split into sections by site: Beta first, then Main, then any other preview
     by name. Null counts as Main.
   - Each section is grouped by area as today.
   - Resolved history stays one list, with a site label on each note.
   - The header line shows open counts per site.
   - The "Generated… do not edit" header is kept.
4. **Feedback panel** (`components/feedback/feedback-launcher.tsx`, `lib/feedback-view.ts`):
   - It shows all of the viewer's notes, as now. Admins see everyone's notes, as now.
   - A note written on a different site from the one being viewed gets a small site chip
     ("Beta", "Main", or the branch name).
   - The current site is passed from the server, using the same helper.
   - Notes from the current site are unlabelled.
5. **Resolve** (`scripts/feedback-resolve.ts`):
   - Prints each note's site as it resolves.
   - Accepts an optional `--site <name>` naming the site whose deploy is being resolved for. It
     warns, without blocking, when a note's site differs.
   - It stays the only writer and is never run by the agent.
6. **Docs.** Update `CLAUDE.md`'s "Closing a Feedback note" section so the post-deploy step is
   per site: resolve the trailers on that site's branch since its last deploy, and pass
   `--site`. The glossary and the ADR are already done.

## Tests / gates

- Unit tests for `feedbackSite` (all four branches), inbox rendering (sections, null → Main,
  per-site counts, resolved labels), the panel chip (shown only for other sites), and create
  ignoring a client `site`.
- `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run build` after every task.
- `npx prisma validate`; the migration applies cleanly to the local database
  (`npx prisma migrate dev` against `.env` / local only, never production).

## Out of scope

Separate databases for beta; filtering the panel by site; automating the post-deploy resolve;
backfilling existing notes.
