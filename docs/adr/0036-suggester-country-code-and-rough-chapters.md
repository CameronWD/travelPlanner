# Auto-suggester keys off derived countryCode and proposes rough chapters

Amends ADR 0034 (combined chapters for interleaved routes) and ADR 0009 (rough Stops
and rough Chapters).

## Context

ADR 0034 introduced the interleave-aware country auto-suggester. It grouped Stops by
country to build chapter proposals, but used the free-text `Stop.country` field as the
grouping key. Free-text country names are unreliable: they vary by locale, casing,
and how the geocoder spells them ("United Kingdom" vs "UK"), which silently fragmented
grouping across Stops that were geographically the same country.

Separately, the suggester only ever ran on dated (scheduled) Stops. While a Trip is
still being sketched — rough Stops only, no dates yet — the "Suggest from countries"
action produced nothing, leaving the brainstorming phase without any automated chapter
scaffolding.

## Decision

1. **Group by `Stop.countryCode`, not `Stop.country`.** `countryCode` is the
   ISO 3166-1 alpha-2 code (`"gb"`, `"de"`, `"fr"`) derived by geocoding and
   stored normalised to lowercase on save. It is stable across locale and
   geocoder phrasing. The country auto-suggester reads `countryCode` as its
   grouping key in all code paths.

2. **Name chapters via `Intl.DisplayNames`.** The `countryName(code)` helper in
   `lib/countries.ts` converts a `countryCode` to the locale display name
   (`"gb" → "United Kingdom"`) using the Web platform's `Intl.DisplayNames`
   API. Chapter names produced by the suggester are therefore always
   properly-cased and locale-appropriate, regardless of what was typed into
   the Stop's free-text field.

3. **Derive `countryCode` for rough Stops on save.** A rough Stop carries a
   geocoded location but previously skipped the `countryCode` derivation step
   because it had no dates. The save action now derives and persists
   `countryCode` for rough Stops using the same geocode path as scheduled Stops.
   This makes rough Stops first-class participants in any code that reads
   `countryCode`.

4. **`suggestRoughChapters` proposes chapters during sketching.** A new
   path in `lib/chapter-suggest.ts` groups rough Stops by their `countryCode`,
   applies the same interleave-aware combining logic as the dated path (ADR 0034),
   and creates rough Chapters with explicit ordered membership (ADR 0009). This
   lets the "Suggest from countries" action scaffold chapters before any Stops are
   dated — filling the sketching phase gap.

5. **Suggester-only; every chapter remains renamable and re-drawable.** No
   schema change; no new UI affordance beyond the existing "Suggest from
   countries" button. Combined and rough chapters produced by the suggester are
   ordinary chapter rows. The Traveller retains full control — all chapters
   are freely renamable and their bands re-drawable. The country key is an
   implementation detail of the suggestion algorithm, never exposed in the UI.

## Consequences

- Country grouping is now stable: two Stops whose geocoded `countryCode` is `"fr"`
  are always grouped together, regardless of how their free-text `country` field
  was filled in.
- Rough chapters (ADR 0009) now have a first-class automated proposal path. A
  couple sketching a trip from scratch can hit "Suggest" and immediately see a
  chapter scaffold to rearrange, without first having to firm up any dates.
- Once rough Stops are firmed up, the rough chapters become ordinary date-band
  chapters (ADR 0009 transition) — the suggested structure carries forward cleanly.
- Deriving `countryCode` on rough-Stop save is a small addition to the save action;
  it is idempotent and falls back gracefully when geocoding returns no country.
- `suggestRoughChapters` and the dated `suggestChaptersFromCountries` share the
  interleave-detect and zone-merge logic from ADR 0034 — the heuristic is not
  duplicated.
