# Booking import: English city names Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A booking that prints a city in another language ("München", "Lisboa") lands on the Stop named in English, and a new Stop is proposed under the English name.

**Architecture:** Claude reports three city names per place (`city` as printed, `cityEnglish`, `cityLocal`) and the country in English. `lib/booking-import/match.ts` stays deterministic and pure: it tries every name against Stops and Home. `build.ts` passes the names through and compares cities by their English name.

**Tech Stack:** TypeScript, zod 4 (structured output schema), vitest.

**Spec:** `docs/superpowers/specs/2026-11-25-booking-import-english-city-names.md`

## Global Constraints

- Branch `fix/booking-import-english-city-names-2026-11-25`. Commit with explicit paths (`git add <paths>`), never `git add -A`; other tasks may be committing in the same checkout.
- Never push, merge, or run `feedback:*`, `usage:report`, `db:seed*` or any script that reads `.env.production.local`.
- Do not call the Anthropic API from a task. The one live run is the orchestrator's, after the tasks.
- Stations, airports (`place`), a stay's name and every address are never translated.
- An existing Stop is never renamed.
- No table of city names in the code.
- Comments: only where the why is not obvious. No JSDoc on new helpers unless the file already documents its neighbours that way.
- Verification per task (never `npm test`, never `npm run build`):
  - inner loop: `TZ=UTC npx vitest run <test file>`
  - task done: `TZ=UTC npx vitest related --run <changed source files>` and `npx tsc --noEmit` and `npx eslint <changed files>`

## Review Focus

1. Claude gives `cityEnglish: null` (older shape, or unsure): the printed city must be used exactly as today. Test in Task 2.
2. A Stop named in the local language ("München") and a booking printed in English ("Munich"): must match through `cityLocal`. Test in Task 2.
3. `cityEnglish` is whitespace or an empty string: treated as absent, never a Stop named "". Test in Task 2.
4. Same English city name in two countries ("Brisbane", US and AU): still two different places; the country rule (BI-14) is untouched. Test in Task 2.
5. A connection through a city printed two ways on its two legs ("Lisboa" arriving, "Lisbon" departing): still a layover, no Stop proposed. Test in Task 2.

---

### Task 1: Claude reports the English and local city names

**Files:**
- Modify: `lib/booking-import/schema.ts`
- Modify: `lib/booking-import/prompt.ts`
- Modify: `test/fixtures/booking-import/sample-extraction.ts`
- Test: `lib/booking-import/extract.test.ts`
- Modify (compile only): any test that builds an `ExtractedEnd`, accommodation or item literal (`lib/booking-import/build.test.ts` and whatever `npx tsc --noEmit` names)

**Interfaces:**
- Produces: `EndSchema`, `AccommodationSchema` and `ItemSchema` each gain `cityEnglish: string | null` and `cityLocal: string | null`, placed directly after `city`. So `ExtractedEnd` is `{ place, city, cityEnglish, cityLocal, country, localDateTime }`.
- Produces: fixture helper `end(place, city, country, localDateTime, names?: { cityEnglish?: string | null; cityLocal?: string | null })` in `sample-extraction.ts`; `cityEnglish` defaults to `city`, `cityLocal` to `null`. `NO_END` gains `cityEnglish: null, cityLocal: null`. `STAY.accommodation` gains `cityEnglish: "Lisbon", cityLocal: "Lisboa"`.

- [ ] **Step 1: Write the failing tests** in `extract.test.ts`, next to the existing "the prompt explains slotTime…" test:

```ts
it("the prompt asks for the English and local city names and an English country, and keeps places and addresses as printed", () => {
  expect(EXTRACTION_SYSTEM_PROMPT).toMatch(/cityEnglish/);
  expect(EXTRACTION_SYSTEM_PROMPT).toMatch(/cityLocal/);
  expect(EXTRACTION_SYSTEM_PROMPT).toMatch(/"Germany", not "Deutschland"/);
  expect(EXTRACTION_SYSTEM_PROMPT).toMatch(/Never translate/);
  expect(EXTRACTION_SYSTEM_PROMPT).not.toMatch(/the city and the country as printed/);
});

it("the schema requires cityEnglish and cityLocal on every place", () => {
  expect(BookingExtractionSchema.safeParse(SAMPLE_EXTRACTION).success).toBe(true);
  const { cityEnglish: _dropped, ...arrWithout } = OUTBOUND.transport!.arr;
  const broken = { ...SAMPLE_EXTRACTION, proposals: [{ ...OUTBOUND, transport: { ...OUTBOUND.transport!, arr: arrWithout } }] };
  expect(BookingExtractionSchema.safeParse(broken).success).toBe(false);
});
```

Import `BookingExtractionSchema`, `SAMPLE_EXTRACTION` and `OUTBOUND` if the file does not already.

- [ ] **Step 2: Run** `TZ=UTC npx vitest run lib/booking-import/extract.test.ts`. Expected: both new tests FAIL.

- [ ] **Step 3: Schema.** Add the two fields to the three schemas. Change the file header's "every value is as printed, or null" to say that `cityEnglish` and `cityLocal` are the two values Claude supplies rather than reads.

- [ ] **Step 4: Prompt.** In `EXTRACTION_SYSTEM_PROMPT`:
  - First rule becomes: `"- Report only what is printed in the document. Never guess, infer or invent a value. If a value is not printed, use null. The only exceptions are cityEnglish and cityLocal, described below."`
  - Replace the line `"- For every place give the city and the country as printed. Give a country only when the document shows it."` with these three lines, exact copy:

```ts
'- For every place: city is the city as printed. cityEnglish is that city\'s usual English name ("Munich" for "München", "Lisbon" for "Lisboa", "Kyoto" for "京都"); when the printed name is already the English one, repeat it. cityLocal is the city\'s usual name in the main language of its country, in that language\'s own spelling ("München", "Lisboa", "京都"); use null when you are not sure. Both are null when city is null.',
'- Give the country by its usual English name ("Germany", not "Deutschland"), and only when the document shows a country.',
"- place, a stay's name and every address stay exactly as printed. Never translate them.",
```

- [ ] **Step 5: Fixtures.** Update `sample-extraction.ts` per the Interfaces block. Then run `npx tsc --noEmit` and add `cityEnglish` / `cityLocal` to every literal it names (use `null` for both where the test is not about names). Do not change `build.ts` or `match.ts`.

- [ ] **Step 6: Verify.** `TZ=UTC npx vitest related --run lib/booking-import/schema.ts lib/booking-import/prompt.ts` passes; `npx tsc --noEmit` clean; `npx eslint` on the changed files clean.

- [ ] **Step 7: Commit** the changed paths: `feat(booking-import): Claude reports a city's English and local names`

---

### Task 2: Matching and building use every city name

**Files:**
- Modify: `lib/booking-import/match.ts`
- Modify: `lib/booking-import/build.ts`
- Modify: `scripts/booking-import-smoke.ts` (one line of output)
- Test: `lib/booking-import/match.test.ts`, `lib/booking-import/build.test.ts`

**Interfaces:**
- Consumes: Task 1's `ExtractedEnd` / accommodation / item shapes with `cityEnglish` and `cityLocal`, and the fixture helper `end(place, city, country, localDateTime, names?)`.
- Produces: `PlaceQuery` is `{ city: string | null; cityEnglish: string | null; cityLocal: string | null; country: string | null; place: string | null }`.
- Produces: `export function cityNameOf(q: PlaceQuery): string | null` in `match.ts`: the trimmed `cityEnglish` when non-empty, else the trimmed `city` when non-empty, else `null`.

**Behaviour to implement in `match.ts`:**
- `resolvePlace` city match and `matchesHome` city match: true when `sameCity` holds for any of `q.city`, `q.cityEnglish`, `q.cityLocal`, `q.place` against the Stop / Home name. The `compatible` / `agrees` country rule is unchanged.
- Every `!q.city` / `q.city` presence test becomes a test on `cityNameOf(q)`.
- A `new` match: `name` is `cityNameOf(q)`, `key` is `` `${normalise(name)}|${cc ?? ""}` ``.

**Behaviour to implement in `build.ts`:**
- `endDraft` and both queries in `toDraft` carry `cityEnglish` and `cityLocal`, trimmed like `city`.
- `markLayovers`' `hub` and `stayCoversCity` compare on `cityNameOf(query) ?? query.place` rather than `query.city`, so "Lisboa" and "Lisbon" are one city.
- `anyStopOnDate: !d.query.city` and the item's `placed` test use `cityNameOf`.
- Unplaced Transport end text stays `end.query.place ?? end.query.city` (as printed).

**Smoke script:** in the per-Proposal line, print the Stop's name for `p.kind === "stop"` (e.g. `s1 stop Lisbon · high · 2026-12-02`). Nothing else changes; it still never prints the document.

- [ ] **Step 1: Write the failing tests.** In `match.test.ts`, update the local `q` helper to take the names and add:

```ts
const q2 = (city: string | null, cityEnglish: string | null, cityLocal: string | null, country: string | null, place: string | null = null) => ({ city, cityEnglish, cityLocal, country, place });

describe("resolvePlace: city names in other languages", () => {
  it("a city printed in the local language finds the Stop named in English", () => {
    expect(resolvePlace(q2("Lisboa", "Lisbon", "Lisboa", "Portugal"), { from: "2026-12-03", to: null }, CTX, STAY)).toEqual({ kind: "stop", stop: LISBON });
  });
  it("a city printed in English finds the Stop named in the local language (Review Focus 2)", () => {
    const MUNCHEN: MatchStop = { ...LISBON, id: "s-muc", name: "München", country: "Germany", countryCode: "de", timezone: "Europe/Berlin" };
    expect(resolvePlace(q2("Munich", "Munich", "München", "Germany"), { from: "2026-12-03", to: null }, { home: HOME, stops: [MUNCHEN] }, STAY)).toEqual({ kind: "stop", stop: MUNCHEN });
  });
  it("Home matches on the English name", () => {
    const home: MatchHome = { name: "Vienna", countryCode: "at", timezone: "Europe/Vienna" };
    expect(resolvePlace(q2("Wien", "Vienna", "Wien", "Austria"), { from: null, to: null }, { home, stops: [] }, END)).toEqual({ kind: "home" });
  });
  it("a new Stop takes the English name and key", () => {
    expect(resolvePlace(q2("München", "Munich", "München", "Germany"), { from: "2026-12-03", to: null }, CTX, STAY)).toEqual({ kind: "new", key: "munich|de", name: "Munich", country: "Germany", countryCode: "de" });
  });
  it("with no English name the printed city is used (Review Focus 1), and a blank one counts as none (Review Focus 3)", () => {
    expect(resolvePlace(q2("München", null, null, "Germany"), { from: "2026-12-03", to: null }, CTX, STAY)).toMatchObject({ kind: "new", key: "munchen|de", name: "München" });
    expect(resolvePlace(q2("München", "  ", null, "Germany"), { from: "2026-12-03", to: null }, CTX, STAY)).toMatchObject({ kind: "new", name: "München" });
  });
  it("the same English name in another country is still another place (Review Focus 4)", () => {
    expect(resolvePlace(q2("Lisbon", "Lisbon", null, "United States"), { from: "2026-12-03", to: null }, CTX, STAY)).toMatchObject({ kind: "new", key: "lisbon|us" });
  });
});
```

Use the file's existing `CTX`, `HOME`, `LISBON`, `STAY`, `END` constants; if a name differs, use the file's.

In `build.test.ts`:

```ts
describe("buildProposals: city names in other languages", () => {
  const lisboaStay = { ...STAY, accommodation: { ...STAY.accommodation!, city: "Lisboa", cityEnglish: "Lisbon", cityLocal: "Lisboa" } };

  it("a flight printing Lisbon and a hotel printing Lisboa propose one Stop, named Lisbon, and both hang on it", () => {
    const { proposals } = buildProposals({ ...SAMPLE_EXTRACTION, proposals: [OUTBOUND, RETURN, lisboaStay] }, { ...CTX, stops: [] });
    const stops = proposals.filter((p) => p.kind === "stop");
    expect(stops.map((s) => s.input.name)).toEqual(["Lisbon"]);
    const flight = proposals.find((p) => p.kind === "transport")!;
    const stay = proposals.find((p) => p.kind === "accommodation")!;
    expect(stay.input.stopId).toBe(flight.input.toStopId);
  });

  it("a hotel printing Lisboa lands on the existing Lisbon Stop, which keeps its name", () => {
    const { proposals } = buildProposals({ ...SAMPLE_EXTRACTION, proposals: [lisboaStay] }, CTX);
    expect(proposals.filter((p) => p.kind === "stop")).toEqual([]);
    expect(proposals.find((p) => p.kind === "accommodation")!.input.stopId).toBe(<the file's Lisbon Stop id>);
  });

  it("an unplaced end keeps the station as printed", () => {
    // a TRAIN from "München Hbf" (city München / Munich) with allowNew off or as a layover: depPlace is "München Hbf"
  });

  it("a connection through a city printed two ways is still a layover (Review Focus 5)", () => {
    // leg 1 arrives city "Lisboa"/cityEnglish "Lisbon" 2026-12-02T07:15, leg 2 departs city "Lisbon" 2026-12-02T09:00 to Porto; no Stop is proposed for Lisbon and both ends are free text
  });
});
```

Write the last two bodies in the style of the file's existing "a connection airport stays free text…" test (Review Focus 2 there), with the values in the comments. If Brisbane with no matching Home appears as a proposed Stop in the first test, keep `CTX`'s Home so it matches Home; the assertion is exactly one Stop, "Lisbon".

- [ ] **Step 2: Run** `TZ=UTC npx vitest run lib/booking-import/match.test.ts lib/booking-import/build.test.ts`. Expected: the new tests FAIL (or fail to compile on `PlaceQuery`).

- [ ] **Step 3: Implement** `cityNameOf` and the `match.ts` behaviour above.

- [ ] **Step 4: Implement** the `build.ts` behaviour above and the smoke script line.

- [ ] **Step 5: Run** the two test files. Expected: PASS, including every existing test unchanged in meaning (existing `q(...)` calls may gain `cityEnglish: null, cityLocal: null` through the helper).

- [ ] **Step 6: Verify.** `TZ=UTC npx vitest related --run lib/booking-import/match.ts lib/booking-import/build.ts` passes; `npx tsc --noEmit` clean; `npx eslint lib/booking-import/match.ts lib/booking-import/build.ts lib/booking-import/match.test.ts lib/booking-import/build.test.ts scripts/booking-import-smoke.ts` clean.

- [ ] **Step 7: Commit** the changed paths: `fix(booking-import): a city printed in another language lands on its Stop`

---

### Task 3: Release note

**Files:**
- Modify: `lib/release-notes.ts`
- Test: `lib/release-notes.test.ts` (existing; add nothing unless it asserts on the newest note)

- [ ] **Step 1:** Add at the top of `RELEASE_NOTES`:

```ts
{
  publishedAt: "2026-11-25T14:30:00Z",
  text: "Booking import: a booking printed in another language now lands on the right Stop. München finds Munich.",
},
```

- [ ] **Step 2: Verify.** `TZ=UTC npx vitest run lib/release-notes.test.ts` passes (it holds the length cap and ordering rules); `npx tsc --noEmit` clean; `npx eslint lib/release-notes.ts` clean.

- [ ] **Step 3: Commit** `lib/release-notes.ts`: `docs(release-notes): a booking in another language lands on the right Stop`

---

## After the tasks (orchestrator)

1. Live check: `set -a && source .env.local && set +a && npx tsx --conditions=react-server scripts/booking-import-smoke.ts test/fixtures/booking-import/sample-booking.txt`. Expected: the schema is accepted (no `api_error`), and exactly one Stop named Lisbon (Brisbane also appears, because the script has no Home base).
2. Branch tier: `npm test`, `npm run build`, `npm run test:integration`.
