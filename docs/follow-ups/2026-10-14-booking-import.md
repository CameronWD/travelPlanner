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
- **BI-04 · Transport and Item warnings don't refresh after an edit.** They are
  computed at import; the Accommodation card recomputes its own.
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
- **BI-10 · `lib/fx.ts` calls a URL that now redirects.** It requests
  `https://api.frankfurter.app`, which 301-redirects to
  `https://api.frankfurter.dev/v1`. It works today via the redirect; switch the
  base URL to avoid depending on that.
- **BI-11 · A Booking import takes ~6-20 s on Haiku 5.5** (measured
  2026-10-14). The sheet's in-progress state matters for this; consider
  streaming the extraction or giving a progress hint if Travellers find it
  slow.
- **BI-12 · `forkId` isn't validated as a Fork of the Trip** in
  `importBooking`/`confirmProposal`. A foreign or stale fork leaks nothing
  (same as other actions) but falls back to an empty plan, so every Stop is
  proposed as new; matches the trust model of other actions, which don't
  validate this either.
- **BI-13 · An `AiUsage` row isn't written if `loadImportContext` throws**
  after a paid call. The call is already billed; the usage record is lost.
- **BI-14 · City matching edge cases.** `match.ts` does one-way containment,
  not two-way ("York" matches "New York City" but not the reverse), and the
  Home city match ignores country (so a same-named city in another country
  can match the Home base).
- **BI-15 · `CURRENCIES[].symbol` isn't rendered anywhere** — the UI formats
  money with `Intl` instead. Pre-existing and inert today, but ISK's "Kr"
  reads inconsistently next to the Nordic codes (DKK/NOK/SEK) if the field is
  ever surfaced.
- **BI-16 · `DESIGN-BRIEF.md:311` still lists "Booking parser"** under
  Checklists — stale, predates this branch's Booking import feature.
- **BI-17 · Commit `1d08d76b` carries a mis-attributed trailer.** It reads
  `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>` instead of the
  project's standard trailer for that session. Noted rather than rewritten,
  so branch history and the ledger's SHAs stay stable.
