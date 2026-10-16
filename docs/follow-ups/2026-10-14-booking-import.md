# Booking import: follow-ups (2026-10-14)

Left open by `feat/ai-booking-importer` (spec `docs/specs/2026-10-14-booking-import.md`).

- **BI-01 · The 10 MB limit is ~4 MB in practice on Vercel.** Server actions
  allow 12 MB, but Vercel functions refuse request bodies over ~4.5 MB. The
  sheet compresses images and refuses anything still over 4 MB with the
  existing upload message. Fix: upload to R2 with a presigned URL, then read it
  server-side.
- **BI-02 · The rate limit is per server instance.** `createRateLimiter` is
  in-memory, so 20 an hour is per instance. Counting the Traveller's
  `AiUsage` rows in the last hour would make it exact (and give the true wait).
- **BI-03 · `.eml` originals are not attached.** `validateUpload` takes images,
  PDFs and plain text only. Option: attach the email's first PDF instead.
- **BI-04 · Fixed, 2026-10-15, tidy-up batch 2 (fix round 1 same day).**
  Transport and Item warnings didn't refresh after an edit: they were
  computed at import; the Accommodation card recomputes its own.
  `lib/booking-import/stay-warnings.ts` computes the "outside your stay"
  warnings from a Proposal's current input (`stayWarnings`), and the
  Proposal editor recomputes them on every draft and submit
  (`refreshStayWarnings`). `build.ts`'s two import-time pushes are
  unchanged from before this fix (still `end.date`/`outsideStay` inline),
  because a Transport end known only by a date (no wall time printed in the
  booking) has no `depAt`/`arrAt` for `stayWarnings` to read — round 1 of
  review caught a first pass that switched `build.ts` over too and silently
  dropped that warning at import. `refreshStayWarnings` drops a Proposal's
  previous stay warning by recognising its fixed wording (`messages.ts`),
  not by recomputing it from the edited-away Proposal's input, so a
  date-only import's warning is still replaced correctly once an edit gives
  it a real time.
- **BI-05 · One zone per country.** A proposed Stop in a multi-zone country
  (US, Australia, Canada, Brazil) takes `guessTimezoneForCountry`'s single zone;
  the Traveller is told only when no zone is known.
- **BI-06 · A Trip with no Home base** turns the home-city end of a flight into
  a proposed Stop.
- **BI-07 · No admin view of `AiUsage`.** Read it with SQL for now.
- **BI-08 · Currencies without ECB rates.** TEEPEE now offers the 30 currencies
  Frankfurter publishes. A Cost in any other currency (VND, AED, MAD, EGP, PEN,
  ARS, KWD…) is still dropped from a Proposal with a note; supporting them
  needs a second rate source or a hand-entered rate.
- **BI-09 · The Proposal card shows `TransportCard` without `LegPill`.** The
  pill belongs to the plan's leg strip and needs an `onClick`; it was left out
  of the sheet.
- **BI-10 · Fixed, 2026-10-16, tidy-up batch 3.** `lib/fx.ts` requested
  `https://api.frankfurter.app`, which 301-redirects to
  `https://api.frankfurter.dev/v1`; it now calls `https://api.frankfurter.dev/v1`
  directly (`lib/fx.test.ts` pins the URL).
- **BI-11 · A Booking import takes ~6-20 s on Haiku 5.5** (measured
  2026-10-14). The sheet's in-progress state matters for this; consider
  streaming the extraction or giving a progress hint if Travellers find it
  slow.
- **BI-12 · Fixed.** `forkId` wasn't validated as a Fork of the Trip in
  `importBooking`/`confirmProposal`. A foreign or stale fork leaked nothing
  (same as other actions) but fell back to an empty plan, so every Stop was
  proposed as new. Both actions now validate `forkId` through
  `requirePlanAccess` (commit `fa60fd17`), the same guard every other write
  that accepts a client `forkId` goes through.
- **BI-13 · Fixed, 2026-10-16, tidy-up batch 3.** An `AiUsage` row wasn't
  written if `loadImportContext` threw after a paid call. `importBooking` now
  writes the row in a `finally` around reading the Trip and building
  Proposals — outcome `error`, Proposal count 0, the tokens spent — and the
  error still propagates.
- **BI-14 · Fixed, 2026-10-16, tidy-up batch 3.** City matching now needs the
  countries to agree for Home as it already did for Stops (`matchesHome` in
  `match.ts`): Brisbane, United States no longer matches a Brisbane, Australia
  Home base. A country unknown on either side still counts as agreement, and
  whole-word containment still needs the shorter name to be at least 4
  characters, so "York" and "New York City" still match each other when
  neither country is known.
- **BI-15 · `CURRENCIES[].symbol` isn't rendered anywhere** — the UI formats
  money with `Intl` instead. Pre-existing and inert today, but ISK's "Kr"
  reads inconsistently next to the Nordic codes (DKK/NOK/SEK) if the field is
  ever surfaced.
- **BI-16 · `DESIGN-BRIEF.md:311` still lists "Booking parser"** under
  Checklists — stale, predates this branch's Booking import feature.
  **Scheduled for batch 3** of the 2026-10-14 tidy-up pass.
- **BI-17 · Commit `1d08d76b` carries a mis-attributed trailer.** It reads
  `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>` instead of the
  project's standard trailer for that session. Noted rather than rewritten,
  so branch history and the ledger's SHAs stay stable.
