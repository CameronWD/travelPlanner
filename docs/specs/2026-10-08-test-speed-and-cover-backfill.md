# Spec 2026-10-08 · Test speed, the small-cover backfill, and plain copy

Branch: `chore/feedback-inbox-2026-10-08` (renamed or continued for the build).
Three independent parts, built in order 1 → 2 → 3. No Feedback notes are closed by this batch.

## Part 1 · Test speed

**Problem.** The unit suite (682 files, 8,598 tests) takes ~186 s on 12 cores.
Tests are not part of the Vercel build; the cost is the build *pipeline*:
subagent-driven development runs the full suite (often with `next build`) after
every task and review — ~400 full-suite invocations across the last three
plans. Measured: jsdom environment setup is ~1,276 s cumulative (~106 s of wall
clock), paid by every file, including the 354 pure `.ts` tests.

### A · Verification tiers (CLAUDE.md)

`CLAUDE.md` gains a "Verification tiers" section, binding every plan and
subagent:

| When | Runs |
|---|---|
| Inner loop (red/green on a task) | `npx vitest run <the test file(s) being worked>` |
| Task done (implementer self-check, spec review, quality review) | `npx vitest related --run <changed source files>` + `npx tsc --noEmit` + `npx eslint <changed files>` |
| Once per branch, before the batch is reported finished | `npm test` + `npm run build` + `npm run test:integration` (when the local DB is up) |

`npm run build` and the full suite never run per task. Plans written by
`superpowers:writing-plans` use these commands in their verification steps. CI
is unchanged (full suite + build on every push to `main` / PR).

### B · Node environment for pure tests

- `vitest.config.ts` uses Vitest `projects`: a **node** project for
  `**/*.test.ts` and a **dom** project for `**/*.test.tsx`, both sharing
  aliases, plugins and excludes.
- `test/setup.ts` splits: DOM stubs (matchMedia, pointer capture, Image, …)
  go in a DOM-only setup; anything environment-neutral stays shared. The node
  project must not touch `window`.
- The 14 `.ts` files that need a DOM (measured: `lib/feedback-queue`,
  `lib/offline-status`, `lib/scroll-to`, `lib/share-url`, `lib/standalone`,
  `components/account/device-state`, `components/account/push-subscribe`,
  `components/plan/use-drag-dismiss`, `components/ui/scroll-edges`,
  `scripts/layout-audit/capture`, `scripts/layout-audit/collector`,
  `lib/new-trip/arrival`, `lib/plan/day-collapse`,
  `test/helpers/containing-block`) declare `// @vitest-environment jsdom`
  and get the DOM setup.
- `npm test`, `test:watch` and `vitest related` keep working unchanged.
- No test logic changes. Same pass count (8,598) before and after.
- Expected: ~186 s → ~120 s. Measure and record before/after.

### C · happy-dom trial (time-boxed, after B)

- Switch the dom project to `happy-dom`. A file that won't pass cheaply opts
  back with `// @vitest-environment jsdom` (keeping the DOM setup).
- **Keep** only if: the dom project is ≥30 % faster than its jsdom time
  (107 s measured on this machine); no product code changes; ≤15 test files
  edited, each small and mechanical (setup polyfills, a query, a timing
  tweak — never a rewrite, deletion or weakened assertion); ≤20 files opted
  back to jsdom.
- **Drop** otherwise: revert the trial and record the measured numbers (an ADR,
  or a `docs/open-follow-ups.md` entry) so it isn't retried blind.
- Either way the suite stays at 8,598 passing.

Slow individual files (`new-trip-flow` 22 s etc.) are out of scope — they run
in parallel and don't set the wall clock.

## Part 2 · Small cover copies (PX-01)

### D · New Trip sends a small copy

- The New Trip flow's cover upload also sends `fileSmall`, made with
  `compressCoverSmall` exactly as `components/trip/settings/cover-image-field.tsx`
  does.
- `createTrip` (`server/actions/trips.ts`) saves it under the same rules as
  `setTripCover`: WebP declared type, ≤512 KB, WebP magic bytes, best-effort
  (a failed small save never fails trip creation), stored at
  `coverSmallKeyFor(key)`, recorded in `coverSmallKey`. The validate-and-save
  logic is shared with `server/actions/cover.ts`, not copied.
- New Trip also records `coverAspect` for the uploaded cover (as
  `setTripCover` does).
- Quota accounting matches `setTripCover`'s (large + small bytes).

### E · Backfill script

- `scripts/backfill-cover-small.ts`, npm script
  `backfill:cover-small [-- --dry-run]`, shaped like
  `scripts/backfill-cover-aspect.ts` (operator-run only; never CI or a
  migration).
- `sharp` added as an explicit **devDependency**, pinned to the version
  `next` already installs (0.35.4).
- Selects Trips with `coverImageKey` set and `coverSmallKey` null. For each:
  read the cover from storage; skip GIFs (counted *skipped*); `.rotate()` for
  EXIF, resize to fit 480 px on the longest side without enlargement, WebP at
  the browser path's quality; **save the blob first, then set
  `coverSmallKey`** (a crash leaves at most an orphaned blob, never a dangling
  key). Where `coverAspect` is null, set it from the decoded dimensions.
- Idempotent: a re-run finds nothing left to do. `--dry-run` writes nothing.
  Prints scanned / made / skipped / failed.
- Unit tests with storage and db mocked; the resize helper tested on real
  small fixture images (JPEG with EXIF orientation, PNG, GIF).
- `docs/open-follow-ups.md`: PX-01 updated to say the script exists and
  awaits the operator's run. Cam runs it against production after deploy
  (dry run first); Claude never does.

## Part 3 · Copy that doesn't read as generated

A read-only sweep (2026-10-08) found the app mostly reads as human (release
notes, emails, most toasts, help section titles; no marketing words, emoji or
gradients) but with concentrated tells: Privacy/Terms, the sign-in denial line,
git words in plan variants, ~349 user-facing lines with em-dashes, three
narrator voices, mixed toast style, a Sparkles icon on What's new.

**Scope:** text a Traveller sees: rendered UI, toasts, dialogs, empty states,
help guide, release notes, Privacy, Terms, landing, emails, push and Digest
text. Not code comments, test names or operator scripts. Tests asserting exact
strings are updated to the new strings.

### F · House style (applies to every task in Part 3)

1. **No em-dashes** (`—`) in Traveller-facing text. Use a full stop, comma or
   colon. Sole exception: a string that is exactly `—`, the empty-value
   placeholder in tables and stat cells.
2. **No "not X, just Y" pivots and no self-justifying copy.** Say what is
   true, once. One point per message; anything more belongs in the help guide.
3. **Error toasts:** "Couldn't <verb> <thing>. Try again." Never "Failed to…",
   never "Please". Sentences end with a full stop. Success toasts stay short
   with no full stop ("Link copied").
4. **Case:** everyday nouns lowercase in running text: trip, stop, note,
   device, traveller, sign-in link, access request. Capitals only for screen
   and feature names a traveller sees as a tab or heading: Wishlist, Budget,
   Journal, Summary, Digest, Compare. "Admin" only where it names the role
   (Admin queue, admin-only features).
5. **Voice:** where a person speaks (Welcome, Feedback, sign-in and access
   requests, the help guide's "tell me what's wrong", Privacy, Terms) it is
   the maintainer, as **"I"**. Never "we", never "the Admin" as narrator.
   Everywhere else the app speaks impersonally ("Couldn't save", "No stops
   yet").

### G · Plan variants on screen

Per CONTEXT.md (updated 2026-10-08): **Fork** shows as **"What-if plan"**,
**Promote** as **"Make this the real plan"**; "Real plan" stays. Code, routes,
models and the glossary terms are unchanged.

- Badges, switcher, Compare (`components/trip/compare-table.tsx`,
  `app/**/compare/page.tsx` empty state), create/discard dialogs, Activity
  lines, toasts ("Couldn't make this the real plan. Try again.").
- `promote-fork-dialog.tsx`: title "Make '<name>' your real plan?"; the loss
  list in plain words ("Booked and paid things in your current plan will be
  removed: …"); "Type <name> to confirm". No "committed", no "losses".
- Help guide sections on variants use the new labels.

### H · Specific rewrites

- **Privacy** (`app/privacy/page.tsx`) and **Terms** (`app/terms/page.tsx`):
  rewritten to F. Intros say plainly what Teepee is and what the page covers,
  in the first person, with no "not a…" framing. Every fact stays. Nothing
  about what is collected, kept or shared changes, and its tests still hold
  the facts.
- **Sign-in denial** (`app/landing/sign-in-panel.tsx:46`): one or two short
  sentences, e.g. "You don't have access yet. I've been told you tried. If
  someone invited you, ask them to check."
- **Over-explained status lines** found in the sweep (e.g.
  `devices-panel.tsx:177`) cut to their one point.

### I · Whole-app pass

- Every Traveller-facing string brought to F, file by file. Heaviest first:
  help guide, privacy, feedback-launcher, digest-panel, release notes (the
  existing entries too), devices-panel, then the rest.
- Help guide field lists: "**Title**: explanation". The "Word list" section
  stays, lowercased per F4 where it isn't defining a feature name.

### J · What's new icon

`Sparkles` on What's new (`components/whats-new/whats-new-card.tsx`,
`app/(app)/whats-new/page.tsx`) becomes a plain icon from the same set
(megaphone or gift). Sparkles stays on the AI-suggest button.

### K · Guard test

A unit test that scans string literals, template literals and JSX text in
`app/` and `components/`, plus `lib/release-notes.ts`, `lib/help-guide*` and
the mail/push/digest text modules in `lib/`, skipping comments and test files,
and fails on:

- any `—` except a string that is exactly `—`;
- "Failed to" and "Please try again" in user-facing strings.

Exceptions go through a short named allowlist in the test, each with a reason.

### L · Release note

One short entry in `lib/release-notes.ts`, worded to travellers: plan
variants are now called what-if plans, with "Make this the real plan" to pick
one.

## Out of scope

- CI changes, `isolate: false`, splitting slow test files.
- Release notes for Parts 1–2 (nothing a traveller sees changes beyond faster
  thumbnails).
- Renaming Fork/Promote in code, routes or the database.
