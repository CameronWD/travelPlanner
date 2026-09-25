# Layout audit harness — deferred minor findings

From the Stage 1 build of `npm run audit:layout` (plan `docs/superpowers/plans/2026-09-24-layout-audit-stage-1.md`). The final whole-branch review triaged these as safe to defer; the ones it said to fix before merge were fixed. Pick them up when the harness is next touched. For Cam and whoever builds Stage 2.

## Still open

- **Task 1** — applyThemeClass light branch untested (audit-browser.test.ts:48-55; test was plan-supplied)
- **Task 2** — buildCaptureMatrix silently yields 0 print captures if /print ever leaves ROUTES (config.ts:368-372)
- **Task 2** — tripForRoute helper vs hard-coded trip "deep" for print/overlay — style split (config.ts:336-399)
- **Task 3** — makesContainingBlock ignores translate/scale/rotate/will-change/container-type/backdrop-filter/perspective; fixed boxes assumed viewport-clipped (collector.ts:222-239)
- **Task 3** — the 44px / 430px small-target thresholds are duplicated inside the collector string vs `checks.ts` constants (collector.ts:369-380)
- **Task 3** — wrapped inline elements dropped from overlap (collector.ts:352)
- **Task 3** — `inset(50%` prefix match hides partial clips (collector.ts:163)
- **Task 3** — list caps truncate silently (collector.ts:280,301,345,371,402)
- **Task 3** — collector smoke test runs no loop bodies in jsdom (collector.test.ts:9-18; plan-mandated test)
- **Task 3** — `#n` id suffixes renumber across runs → spurious Stage-2 diffs (checks.ts:272)
- **Task 3** — checkChrome horizontal-overlap requirement untested (checks.ts:191)
- **Task 3** — hasLabel can't see closed Radix tooltip triggers; STACK misses breakpoint-prefixed -space-x (collector.ts:292-298,341; brief-mandated)
- **Task 3** — overlap measures the hidden part of clipped text → phantom overlaps when a vertical clip exists (implementer-flagged; 0 live today; fix = intersect box with clip containers)
- **Task 4** — sliceRanges infinite-loops if deviceScaleFactor > maxDevicePx (step 0) — unreachable with dsf 1|2 (capture.ts:98-106)
- **Task 4** — captureSlices doc comment points at the task report (capture.ts:128-141)
- **Task 5** — matchTrips equal-length tie-break relies on sort stability, untested (trips.ts:99-102)
- **Task 5** — readPhase casts to PhaseName without runtime validation (trips.ts:155-156)
- **Task 5** — ensureEmptyTrip on an unauthenticated page fails obscurely (implicit caller-order precondition)
- **Task 5** — TRIP_HREF_RE vs NEW_TRIP_URL_RE near-duplicate patterns
- **Task 6** — focusFirstInput has no unit test and wasn't live-exercised (Task 7 smoke will exercise it)
- **Task 6** — report's gap table didn't disclose duplicate/delete-trip gaps arrived via uncaught exception
- **Task 6** — describeStep uses the raw unsubstituted name ("Edit {stop}") in thrown-step reasons vs resolved name in trigger-not-found reasons
- **Task 7** — re-run drops trip/empty run-level gaps even when their captures weren't re-run (run.ts:126, layout-audit.ts:262)
- **Task 7** — share-token lookup and empty-trip readPhase not isolated — a throw aborts the run before any manifest (layout-audit.ts:260,282-283); share skip reason always "no share link on settings" (:338)
- **Task 7** — hiding nextjs-portal also hides Next's runtime-error dialog; no pageerror/console capture (layout-audit.ts:379,421)
- **Task 7** — overlay captures never wait for Leaflet on /globe and /wishlist (layout-audit.ts:424)
- **Task 7** — planCapture/recordFor/logLine pure but untested inside a 664-line entry script (layout-audit.ts:311-473)
- **Task 7** — summarise prints one COVERAGE GAP line per overlay capture (14 for 4 overlays) (run.ts:202)
- **Task 7** — stale PNGs survive in a reused out dir for captures now skipped/errored (layout-audit.ts:415)
- **Task 8** — crops render sequentially and base64-inject the full source PNG per crop (fine at ~55 findings; slow at hundreds)

## Closed by the final fix wave

- Spill dedupe threshold now matches the classifier's 2px (Task 3).
- `pngSize` signature/length guard and off-image crops (Task 8, fixed in `baca4cd`).
- `resolveOutDir`'s sibling-prefix false positive (Task 2) — now `assertOutsideRepo`, shared with the crops tool.

## Plan-level notes

- `AutoFinding` has no `route`/`width`/`theme` fields (spec §3 lists them); join on `captureId` against `manifest.json`.
- Phase trips drift with the date: after 2026-09-26 Blue Mountains leaves Final prep and a re-run reports a coverage gap for it — pick or seed a new Final-prep trip before the Stage 2 re-run.
- `/tmp/layout-audit/stage1` uses the pre-fix overlay id shape and never had on-screen `/print` or page-end shots; do a fresh full run for the Stage 2 gate rather than merging into it.
