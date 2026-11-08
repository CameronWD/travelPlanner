# Holiday Region aliases Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A place's **Region** matches Google's public holiday feed even when Google named the Region in a local language ("Bayern", "Genève", "Johor Darul Ta'zim") and the feed uses English ("Bavaria", "Geneva", "Johor").

**Architecture:** A pure module, `lib/holidays/region-aliases.ts`, turns Google's name for a Region into the feed's name. It applies three name rules, then a per-country alias table. `lib/holidays/day.ts` runs every Region through it before comparing, both in `holidaysOnDay` (matching) and in `placesOnDay` (dedupe). Stored data is untouched: no migration, no script.

**Tech Stack:** TypeScript, Vitest.

**Spec:** `docs/specs/2026-11-06-google-extras.md` §B4, amended by Task 0 (the agreed spec "Region names match the holiday feed", 2026-11-09).

## Global Constraints

- **Name rules (applied first, case-insensitive, then trim):**
  - Drop a leading `Canton of `, `Federal Territory of ` or `Wilayah Persekutuan `.
  - Drop a trailing ` Darul …`: the word `Darul` and everything after it.
  - The rules apply to every country.
- **Alias table (applied after the rules, per country, looked up ignoring case, diacritics and surrounding whitespace).** Each value is the feed's spelling exactly:
  - `de`:
    - Bayern → Bavaria
    - Hessen → Hesse
    - Niedersachsen → Lower Saxony
    - Mecklenburg-Vorpommern → Mecklenburg-Western Pomerania
    - Nordrhein-Westfalen → North Rhine-Westphalia
    - Rheinland-Pfalz → Rhineland-Palatinate
    - Sachsen → Saxony
    - Sachsen-Anhalt → Saxony-Anhalt
    - Thüringen → Thuringia
  - `ch`:
    - Genf, Genève, Ginevra → Geneva
    - Luzern, Lucerna → Lucerne
    - Basel-Landschaft, Bâle-Campagne, Basilea Campagna → Basel-Land
    - Bâle-Ville, Basilea Città → Basel-Stadt
    - Sankt Gallen, Saint-Gall, San Gallo → St. Gallen
    - Wallis, Vallese → Valais
    - Tessin → Ticino
    - Waadt → Vaud
    - Freiburg, Friburgo → Fribourg
    - Neuenburg → Neuchâtel
    - Grisons, Grigioni → Graubünden
    - Berne, Berna → Bern
    - Zurigo → Zurich
    - Argovie, Argovia → Aargau
    - Thurgovie, Turgovia → Thurgau
    - Soleure, Soletta → Solothurn
    - Schaffhouse, Sciaffusa → Schaffhausen
    - Glaris, Glarona → Glarus
    - Zoug, Zugo → Zug
    - Schwytz, Svitto → Schwyz
  - `my`:
    - Melaka → Malacca
    - Pulau Pinang → Penang
- A name with no alias comes back as the rule-stripped, trimmed input, original casing kept.
- An unknown Region keeps today's behaviour: the "in parts of …" fallback line. A Region is never hidden because it failed to match.
- Verification tiers per `CLAUDE.md`:
  - **Inner loop:** `npx vitest run <files>`.
  - **Task done:** `npx vitest related --run <changed source files>`, `npx tsc --noEmit` and `npx eslint <changed files>`.
  - **Branch:** `npm test`, `npm run build` and `npm run test:integration`.
- Zero comments unless the WHY is non-obvious; the alias table needs none. No JSDoc.
- The commit trailer is exactly `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Never stage `AGENTS.md`.

## Review Focus

1. **A name already in the feed's English** ("Bavaria", "Rhineland-Palatinate", "England") comes back unchanged. Pinned in Task 1.
2. **Aliases are scoped by country:** "Bayern" in `at` is not turned into "Bavaria". Pinned in Task 1.
3. **Swiss and Malay names,** which have no feed fixture, still match ("Canton of Bern", "Genève", "Johor Darul Ta'zim", "Federal Territory of Kuala Lumpur", "Wilayah Persekutuan Labuan", "Melaka"). Pinned in Task 1 with direct tests.
4. **A truly unknown Region** still gets the named-Regions fallback, not a hidden holiday. Pinned in Task 1, which replaces the old fallback test that used "Bayern".
5. **One Day with a "Bayern" place and a "Bavaria" place** yields one place, not two. Pinned in Task 1.

---

### Task 0 (controller)
- [ ] `git switch -c fix/holiday-region-aliases` from `main`.
- [ ] Amend spec §B4. After the bullet that starts "A regional holiday shows only where its Region matches", add:
  > Google names some Regions in the local language, and does so inconsistently from place to place ("Bayern" for Munich Airport, "Bavaria" for Munich). Before matching, a Region passes through a fixed alias table for Germany, Switzerland and Malaysia (local names, "Canton of …", "Federal Territory of …", "… Darul …"). Stored Regions keep Google's wording.
- [ ] Commit the spec edit, this plan, and the refreshed `docs/feedback/inbox.md` (from today's `feedback:pull`).

### Task 1: Region aliases in holiday matching

**Files:**
- Create: `lib/holidays/region-aliases.ts`
- Create: `lib/holidays/region-aliases.test.ts`
- Modify: `lib/holidays/day.ts`. Replace its private `norm` with `normRegion` from the new module. `placesOnDay`'s dedupe key and `holidaysOnDay`'s `region` both use `normRegion(canonicalRegion(cc, region))`. The feed vocabulary keeps `normRegion` on the feed's own names.
- Modify: `lib/holidays/day.test.ts`

**Interfaces:**
- Produces:
  - `export function normRegion(s: string): string`: NFD normalise, strip diacritics, trim, lower-case. It's the current `norm` in `day.ts`, moved.
  - `export function canonicalRegion(countryCode: string, region: string): string`: country code compared case-insensitively. Returns the feed spelling for an alias, otherwise the rule-stripped, trimmed input.

- [ ] **Step 1: Write the failing tests**

  `lib/holidays/region-aliases.test.ts`, `describe("canonicalRegion")`:
  - `canonicalRegion("de", "Bayern")` → `"Bavaria"`; `canonicalRegion("de", "  BAYERN ")` → `"Bavaria"`; `canonicalRegion("DE", "Thüringen")` → `"Thuringia"`; `canonicalRegion("de", "thuringen")` → `"Thuringia"`.
  - `canonicalRegion("de", "Bavaria")` → `"Bavaria"`; `canonicalRegion("de", "Rhineland-Palatinate")` → `"Rhineland-Palatinate"`; `canonicalRegion("gb", "England")` → `"England"`.
  - `canonicalRegion("at", "Bayern")` → `"Bayern"`.
  - `canonicalRegion("ch", "Canton of Bern")` → `"Bern"`; `("ch", "Genève")` → `"Geneva"`; `("ch", "Basel-Landschaft")` → `"Basel-Land"`; `("ch", "Sankt Gallen")` → `"St. Gallen"`; `("ch", "Luzern")` → `"Lucerne"`.
  - `canonicalRegion("my", "Johor Darul Ta'zim")` → `"Johor"`; `("my", "Federal Territory of Kuala Lumpur")` → `"Kuala Lumpur"`; `("my", "Wilayah Persekutuan Labuan")` → `"Labuan"`; `("my", "Melaka")` → `"Malacca"`.
  - `canonicalRegion("de", "Atlantis")` → `"Atlantis"`.

  `lib/holidays/day.test.ts`:
  - **Replace** the test "falls back to named Regions for a Region outside the vocabulary", which uses `"Bayern"`, with the same assertion using `epiphany("Atlantis")`.
  - Add "matches Google's local-language Region names": `epiphany("Bayern")` equals the same single result as `epiphany("Bavaria")` (`namedRegions: null`), and `epiphany("Sachsen-Anhalt")[0]?.namedRegions` is `null`.
  - Add "hides a regional holiday for a local-language Region it does not list": `epiphany("Hessen")` → `[]`, and `epiphany("Thüringen")` → `[]`.
  - Add "dedupes a Region given in two languages": in `placesOnDay`, two Stops covering `2026-05-01`, `stop(..., "de", "Bayern")` and `stop(..., "de", "Bavaria")`, give exactly one place, `{ countryCode: "de", region: "Bayern" }` (the first one kept).

- [ ] **Step 2: Run and expect FAIL**

  `npx vitest run lib/holidays/region-aliases.test.ts lib/holidays/day.test.ts`. Expect failures: the module isn't found, and the new `day.test.ts` cases fail.

- [ ] **Step 3: Implement `region-aliases.ts` and wire it into `day.ts`**

  Store the alias table as readable entries (local name → feed name). Build the lookup keyed by `normRegion(local)` once at module load.

- [ ] **Step 4: Run and expect PASS**, then run the task-done verification (`npx vitest related --run lib/holidays/region-aliases.ts lib/holidays/day.ts`, `npx tsc --noEmit`, `npx eslint lib/holidays`).

- [ ] **Step 5: Commit**: `fix(holidays): match Google's local Region names to the holiday feed`.
