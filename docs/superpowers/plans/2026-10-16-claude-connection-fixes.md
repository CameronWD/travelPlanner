# Claude connection fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close three Claude-connection Feedback notes. Timezones come from the place, the Trip ends the day you're home, and fixing a Home timezone keeps the times you typed. Notes get a delete path through Claude, every MCP write returns what it wrote, narrow reads arrive, and Reminders carry notes and can be about an Item or Transport leg. The batch 3 follow-ups TU-01 and TU-02 ride along.

**Architecture:** Six sections, in order: A → B → C → D → E → F, then a final gate (Task Z).
- **A:** a point-to-zone lookup (`lib/tz-point.ts`, loaded lazily on the client), wired into the one Stop timezone rule and its Home-base twin.
- **B:** one `growTripEndTx` helper owns the soft end date.
- **C:** a pure re-file function keeps Home-end wall times when the zone changes.
- **D:** clearing a Chapter's dates makes it rough on the server and in the form.
- **E:** a Reminder migration plus the reads, actions, UI and MCP tools for its notes and "about".
- **F:** per-entity read shapes shared by `get_trip_plan` and the new narrow reads, and a `runWrite` wrapper so every write returns the row.

**Tech Stack:** Next.js 16.4 App Router, React 19.3, Prisma 7.10 (hand-written SQL migration in E), zod 4, Vitest 4, Testing Library, ESLint 9 flat config, `@photostructure/tz-lookup` 11.7.0 (new, exact pin).

**Spec:** `docs/specs/2026-10-16-claude-connection-fixes.md`, decisions F1–F9. Vocabulary is `CONTEXT.md`, already updated for **Note**, the **soft end date** and **Reminder**. Each section opens with **Notes**: the interfaces it produces and uses, and the decisions made where the spec is silent. Task Z writes those decisions into the spec as "As built".

## Global Constraints

- **Branch** `feat/feedback-tz-enddate-review`.
  - Never commit to, merge into, rebase onto or push `main`. Never deploy.
  - Never run `feedback:resolve`, `feedback:accept` or `feedback:pull`. This applies to subagents especially: `feedback:pull` opens production.
  - Don't commit `next dev`'s CLAUDE.md block.
- **Feedback trailers.** Exactly these, each on its own line before the Co-Authored-By trailer, and only on the task named:
  - `Resolves-Feedback: cmva4jnfk003l07lfhfbs92wb` on the last task of section C.
  - `Resolves-Feedback: cmvaecnl8000307l3wutowp1t` on Task F.17.
  - `Resolves-Feedback: cmvaifznz000t07gwfwee8lfp` on Task F.18.
  - No other commit carries one.
- **Vocabulary** follows CONTEXT.md: **Note** (a comment) vs an Item's notes (its description); **Traveller**; **Plan**, **real plan**, **Fork**; **soft end date**, **Hard end date**; **Home base**; **Reminder** "about" one thing. Never write "member" in Traveller-facing copy, and never "itinerary" in new prose.
- **Forks stay correct.** Build nothing Fork-specific beyond what the spec says: Home-end re-filing covers Forks, and the soft end date reads only the real plan.
- **Verification per task:**
  - In the loop: `npx vitest run <files>`.
  - At task end: `npx vitest related --run <changed source files>` + `npx tsc --noEmit` + `npx eslint <changed files>`, plus the task's integration file.
  - Never the full suite or `next build` per task. The one exception is A.1 (new dependency), which runs `npm run knip` once.
- **Integration tier in this sandbox:** there is no Docker. A throwaway Postgres runs on localhost:5432 (trip/trip, db `trip`); if it's down, start it with `/tmp/claude-1000/-work/9a77e9b0-ef00-4a02-8c0f-84c338d2470c/scratchpad/pg/start.sh`. Run integration tests with `DATABASE_URL="postgresql://trip:trip@localhost:5432/trip?schema=public" DIRECT_URL="$DATABASE_URL"` exported. Apply new migrations with `npx prisma migrate deploy` and the same URLs. Never point anything at host.docker.internal or a production URL.
- **`next build`** is never run in /work, because it reads `.env.production.local`. Task Z builds in a throwaway copy that has only a localhost `.env`.
- **Code rules:**
  - Import boundaries are ESLint errors. Add restrictions only via `S`/`I` and `rules()` in `eslint.config.mjs`.
  - Actions return `ActionResult` (ADR 0074).
  - Updates are PATCH (ADR 0075). Forms use `toPatch(input, X_CLEARABLE)`.
  - Every export of a `"use server"` file is an async function listed in `lib/server-action-exports.test.ts`.
  - A Prisma or `*-reads.ts` change extends `test/integration/`.
  - Bug fixes go test-first.
  - Page and component tests: rewrite the mocks, keep the assertions.
- **Commits:** one or more per task, in the `type(scope): …` style, ending with these trailers:
  ```
  Co-Authored-By: <the model that wrote it> <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01LnCyba4taLzC7WxHYP3aUz
  ```
- **Line numbers are as of `bf8fb7f6`.** Earlier tasks move code, so re-grep. A site list that has drifted because of an earlier task in this plan is expected: note it and keep going.
- **Cross-section names:**
  - B's helper is `growTripEndTx(tx, tripId, plan: PlanId)` in `server/actions/trip-window.ts`. Pass `null` for the real plan. C calls it with `null`.
  - E's Reminder read shape (`ReminderItem`, `REMINDER_ITEM_SELECT`, `toReminderItem`) is defined in E. F uses E's actual names and location, and adds `readReminderItem` only if E didn't.
  - A's Home-base re-derivation means C's re-file must fire whenever the written `homeTimezone` differs from the stored one, not only when it was sent.

## Review Focus

These are inputs the spec implies that are most likely to bite a Traveller. Each names the task whose test pins it.

1. **A Brisbane Home base set through `create_trip` or the app** saves `Australia/Brisbane`. A December outbound flight's home-side time shows in AEST, not AEDT. Tested in A.7, A.8 and A.9.
2. **A return leg that lands the next day in the Home zone** (Tokyo 11 Dec 22:00 to Brisbane 12 Dec 08:30) sets the soft end to 2026-12-12. A later edit that pulls the leg earlier never shrinks it. Tested in B.1 and B.5 (integration).
3. **Correcting a Home timezone (Sydney to Brisbane)** keeps every typed Home-end time (06:10 stays 06:10) in the real plan and in each Fork. Untimed ends are left alone. Tested in C.1, C.2 and C.4 (integration).
4. **Switching off a Chapter's dates on an edit** leaves it rough even after a later Stop edit runs the span recompute, and its dated Stops keep their dates. Tested in D.1 (integration).
5. **A write through Claude touching a row next to a Surprise** never leaks the hidden row's contents in the returned row or the `shifted` list. A hidden row read directly is not found. Tested in F.8 and F.12.

---

## Section A — F3 point-based default timezone, `create_trip` accepts `homeTimezone`, TU-02

### Notes

**Produces (for later sections):**
- `lib/tz.ts`:
  - `export const UNCHOSEN_TIMEZONE = "UTC"` is the zone a client sends when it chose none. It is never treated as a choice.
  - `stopTimezone(stop: { timezone?: string | null; pointZone?: string | null; countryCode?: string | null; country?: string | null }): string`. It is still pure and client-safe. The new `pointZone` is a zone the caller has already looked up.
  - `homeBaseTimezone(home: { timezone?: string | null; pointZone?: string | null; countryCode?: string | null }): string | null`. This is the Home-base twin of `stopTimezone`. It returns `null` when nothing is known and never guesses "UTC".
- `lib/tz-point.ts` (new) holds the only import of `@photostructure/tz-lookup`:
  - `pointTimezone(lat?: number | null, lng?: number | null): string | null`
  - `resolveStopTimezone(stop: { timezone?: string | null; countryCode?: string | null; country?: string | null; lat?: number | null; lng?: number | null }): string`
  - `resolveHomeTimezone(home: { timezone?: string | null; countryCode?: string | null; lat?: number | null; lng?: number | null }): string | null`

  Server code imports it statically. Client code must load it with `import("@/lib/tz-point")`. A static import from `components/**` or `app/**` is an ESLint error (Task A.3).
- `mergeStopPatch` (lib/stop-patch.ts) now sends `timezone: UNCHOSEN_TIMEZONE` in two cases: a patch that says where and sends no zone, and a first scheduling where the row had no zone. `updateStop` then resolves the zone from the final point.
- `updateTrip`: renaming the Home base re-derives `homeTimezone` from the new point. Before this change it did so only when the country changed. **Section C (F5) must treat this as a Home timezone change.** The keep-local-times rewrite has to fire whenever the `homeTimezone` written differs from `before.homeTimezone`, not only when `homeTimezone` was sent. A rename from Gold Coast to Sydney now moves the zone from `Australia/Brisbane` to `Australia/Sydney`.
- MCP `create_trip` now has `homeTimezone` (forwarded unchanged to `createTrip`, which validates it).
- ADR 0030 gains an "Amendment — 2026-10-16: the zone comes from the point" section (Task A.8). Section C appends its own amendment after this one.

**Assumes from earlier sections:** none. Section A runs first.

**Decisions where the spec is silent:**
1. **Where the lookup lives.** `stopTimezone` stays pure and takes a precomputed `pointZone`. I did not pass the lookup function in. The client has to `await import()` anyway, then calls the synchronous rule. The server calls `resolveStopTimezone`, which does the lookup and applies the rule. As a result `lib/tz.ts`, which every client bundle loads, never references the package, and no rule logic is duplicated.
2. **The lookup is "unknown" at sea.** `tz-lookup` returns `Etc/GMT±N` for points at sea (I checked v11.7.0: `(0,-30)` gives `Etc/GMT+2`, `(1,2)` gives `Etc/GMT`). An `Etc/*` result, a zone `isValidTimeZone` rejects, or a throw on bad coordinates all count as "no point zone", so the country decides. This also keeps the existing integration case "Cair Paravel at (1,2) → UTC" true.
3. **Home base: `"UTC"` sent is a real choice.** No Home-base client sends "UTC" as a fallback. Settings sends `""` unless the field is touched, and the New-trip flow sends nothing. So `homeBaseTimezone` treats only an empty string as unchosen. The `updateTrip` direct-set path still writes what it is sent, exactly as today. For Stops, "UTC" keeps its 3.L meaning of "unchosen".
4. **Renaming the Home base re-derives the zone from the new point**, which reverses ADR 0030's "a hand-picked zone survives a rename within the same country". That rule existed because the guess was only country-level. Now the guess is point-level, and keeping the old zone is exactly the Brisbane/Sydney bug. A zone sent with the rename (Settings with the field touched, or `update_trip`) still wins. If the new point gives no zone and no country zone exists, the zone is kept when the country is unchanged and cleared when it changed. ADR 0030 is amended in A.8.
5. **`add_stop` (MCP) and the mobile add-stop sheet send `UNCHOSEN_TIMEZONE`** when no zone is chosen. Without that, the country zone they pre-computed (`Australia/Sydney`) would arrive as a choice and beat the point. The sheet has no zone control, so it needs no lazy import: the server resolves the zone from the picked point. Only the Stop form dialog shows a zone, so only it previews one, via the lazy import.
6. **Typed, unpicked places keep the country preview** (`handleCountryChange`) and send that zone. This is unchanged. A Traveller who types "Brisbane / Australia" without picking sees Sydney and can change it. Making the server re-derive here would need a "guessed vs chosen" flag in the form, which is beyond F3's "previews when a place is picked".
7. **Not changed (pre-existing; candidates for `docs/open-follow-ups.md`; the main session decides):**
   - `firmUpTrip` and the rough-segment flow (server/actions/stops.ts ~:1074, ~:880) date rough Stops with the first scheduled Stop's zone (`s.timezone ?? tripTz`), not with `stopTimezone`.
   - The Booking import (`lib/booking-import/build.ts:318`) proposes the country zone because a proposal has no point. Confirming the proposal sends that zone as a choice, so an imported Brisbane hotel gets `Australia/Sydney`.
   - The rough append path of `createStop` (server/actions/stops.ts ~:311-334) always geocodes and drops a picked `lat`/`lng`. The insert path keeps them.
8. **TU-02 closes here.** Striking it in `docs/open-follow-ups.md` is left to the final gate, which edits that file once for the whole branch.
9. **Pinned dependency:** `@photostructure/tz-lookup` at exactly `11.7.0` (`--save-exact`), so a data refresh can't change test expectations without a deliberate bump. Licence CC0-1.0, unpacked size 88 KB, CommonJS `module.exports` with `export =` types. With `esModuleInterop` on, `import tzlookup from "@photostructure/tz-lookup"` works.
10. **Final-gate check (proposed):** after `npm run build`, the tz-lookup payload (its error string `invalid coordinates`) appears in exactly one `.next/static/chunks/*.js` file. That file is not one of the chunks the trip layout loads up front. This is the evidence for "no main bundle grows".

**Proposed Resolves-Feedback:** none in this section. `cmva4jnfk003l07lfhfbs92wb` closes on section C's last task.

**Review Focus candidates:**
1. **TU-02 re-locate.** Input: a scheduled Tokyo Stop (`Asia/Tokyo`) gets `update_stop {country:"France", countryCode:"fr", lat:48.86, lng:2.35}` with no timezone. Expected: `Europe/Paris`. The same patch with `timezone:"Asia/Tokyo"` keeps Tokyo. A name-only patch keeps the row's zone. Tested in A.6 (pure cases plus the integration test in patch-updates.test.ts).
2. **Stop form preview.** Picking Brisbane shows Sydney at once, then `Brisbane (AEST)` once `lib/tz-point` loads, and the save sends `Australia/Brisbane`. If the Traveller picks a zone by hand before the lookup lands, the lookup does not overwrite it. Tested in A.9.
3. **Home rename within a country.** A Home base renamed from Gold Coast (`Australia/Brisbane`) to Sydney now writes `Australia/Sydney`. It used to be omitted, which is the ADR 0030 reversal. A zone sent with the rename still wins. Tested in A.8, and it interacts with section C.

---

### Task A.1: Add `@photostructure/tz-lookup` and `pointTimezone`

**Files:**
- Modify: `package.json`, `package-lock.json` (via npm)
- Create: `lib/tz-point.ts`
- Test: `lib/tz-point.test.ts` (create)

**Interfaces:**
- Consumes: `isValidTimeZone(zone: string): boolean` (lib/tz.ts:324)
- Produces: `pointTimezone(lat?: number | null, lng?: number | null): string | null`

- [ ] **Step 1: Install the package (exact version)**

```bash
cd /work && npm install @photostructure/tz-lookup@11.7.0 --save-exact
```
Expected: `package.json` `dependencies` gains `"@photostructure/tz-lookup": "11.7.0"`, alphabetically after `"@modelcontextprotocol/sdk"`, and `package-lock.json` updates.

- [ ] **Step 2: Write the failing test** — `lib/tz-point.test.ts`

```ts
import { describe, expect, it, vi } from "vitest";

// Lets one case make the lookup return a zone this runtime rejects.
const override = vi.hoisted(() => ({ zone: null as string | null }));
vi.mock("@photostructure/tz-lookup", async (importOriginal) => {
  const real = ((await importOriginal()) as { default: (lat: number, lng: number) => string }).default;
  return { default: (lat: number, lng: number) => override.zone ?? real(lat, lng) };
});

import { pointTimezone } from "./tz-point";

describe("pointTimezone (F3: the zone at a point)", () => {
  it("finds the zone inside a multi-zone country", () => {
    expect(pointTimezone(-27.47, 153.03)).toBe("Australia/Brisbane");
    expect(pointTimezone(-31.95, 115.86)).toBe("Australia/Perth");
    expect(pointTimezone(-33.87, 151.21)).toBe("Australia/Sydney");
  });
  it("a point at sea is no zone (the lookup's Etc/GMT±N), so the country decides", () => {
    expect(pointTimezone(0, -30)).toBeNull();
    expect(pointTimezone(1, 2)).toBeNull();
  });
  it("no point, or one the lookup refuses, is no zone", () => {
    expect(pointTimezone(null, 153.03)).toBeNull();
    expect(pointTimezone(-27.47, undefined)).toBeNull();
    expect(pointTimezone(100, 0)).toBeNull();
    expect(pointTimezone(Number.NaN, 0)).toBeNull();
  });
  it("a zone this runtime does not accept is no zone", () => {
    override.zone = "Mars/Olympus_Mons";
    try {
      expect(pointTimezone(-27.47, 153.03)).toBeNull();
    } finally {
      override.zone = null;
    }
  });
});
```

- [ ] **Step 3: Run it, expect FAIL**

`npx vitest run lib/tz-point.test.ts`. It fails with `Failed to resolve import "./tz-point"`.

- [ ] **Step 4: Implement** — `lib/tz-point.ts`

```ts
/**
 * The zone at a point (spec 2026-10-16 F3): the one module that imports the
 * offline lookup table (`@photostructure/tz-lookup`, ~80 KB). Server code
 * imports it; client code loads it with `import("@/lib/tz-point")` only when
 * a place is picked, so no main bundle carries the table (a static import
 * from components/ or app/ is an ESLint error). The rule that decides
 * between a chosen zone, this one and the country's is `stopTimezone` /
 * `homeBaseTimezone` in lib/tz.ts, which stays pure.
 */
import tzlookup from "@photostructure/tz-lookup";
import { isValidTimeZone } from "@/lib/tz";

/**
 * The IANA zone at `lat`/`lng`, or null when there is no point, the lookup
 * refuses it, or the point is at sea (the lookup answers `Etc/GMT±N` there,
 * which is a nautical offset, not a place's zone) — the country decides then.
 */
export function pointTimezone(lat?: number | null, lng?: number | null): string | null {
  if (lat == null || lng == null) return null;
  let zone: string;
  try {
    zone = tzlookup(lat, lng);
  } catch {
    return null;
  }
  if (zone.startsWith("Etc/") || !isValidTimeZone(zone)) return null;
  return zone;
}
```

- [ ] **Step 5: Run it, expect PASS**

`npx vitest run lib/tz-point.test.ts`. All 4 cases pass.

- [ ] **Step 6: Task-done check**

`npx vitest related --run lib/tz-point.ts` + `npx tsc --noEmit` + `npx eslint lib/tz-point.ts lib/tz-point.test.ts`

- [ ] **Step 7: Commit**

Files: `package.json package-lock.json lib/tz-point.ts lib/tz-point.test.ts`. Message:

```
feat(tz): look up the zone at a point (F3)

@photostructure/tz-lookup 11.7.0 (CC0, offline). Sea points (Etc/*)
and refused coordinates are no zone, so the country still decides.
```

---

### Task A.2: The one rule takes the point: `stopTimezone` `pointZone`, `homeBaseTimezone`, the resolvers

**Files:**
- Modify: `lib/tz.ts:300-314` (the `stopTimezone` docblock and body; add `UNCHOSEN_TIMEZONE` and `homeBaseTimezone` beside it)
- Modify: `lib/tz-point.ts` (add `resolveStopTimezone`, `resolveHomeTimezone`)
- Test: `lib/tz.test.ts` (import list :2-16; extend the `stopTimezone` describe at :284-306; add a `homeBaseTimezone` describe), `lib/tz-point.test.ts`

**Interfaces:**
- Consumes: `pointTimezone` (A.1)
- Produces: `UNCHOSEN_TIMEZONE`, `stopTimezone({ timezone?, pointZone?, countryCode?, country? }): string`, `homeBaseTimezone({ timezone?, pointZone?, countryCode? }): string | null`, `resolveStopTimezone({ timezone?, countryCode?, country?, lat?, lng? }): string`, `resolveHomeTimezone({ timezone?, countryCode?, lat?, lng? }): string | null`

- [ ] **Step 1: Write the failing tests**

In `lib/tz.test.ts`, add `homeBaseTimezone` and `UNCHOSEN_TIMEZONE` to the import list from `"./tz"`. Append these cases inside `describe("stopTimezone (the one Stop timezone rule)", …)`:

```ts
  it("the zone at the point beats the country's (F3)", () => {
    expect(stopTimezone({ countryCode: "au", pointZone: "Australia/Brisbane" })).toBe("Australia/Brisbane");
  });
  it("the UTC fallback with a point takes the point's zone", () => {
    expect(stopTimezone({ timezone: UNCHOSEN_TIMEZONE, countryCode: "au", pointZone: "Australia/Perth" })).toBe("Australia/Perth");
  });
  it("a chosen zone beats the point", () => {
    expect(stopTimezone({ timezone: "Australia/Sydney", countryCode: "au", pointZone: "Australia/Perth" })).toBe("Australia/Sydney");
  });
  it("no point zone falls back to the country", () => {
    expect(stopTimezone({ timezone: "UTC", countryCode: "au", pointZone: null })).toBe("Australia/Sydney");
  });
```

Then add a new describe:

```ts
describe("homeBaseTimezone (the Home-base twin)", () => {
  it("a sent zone wins, UTC included (no Home-base client sends UTC as a fallback)", () => {
    expect(homeBaseTimezone({ timezone: "Australia/Sydney", pointZone: "Australia/Brisbane", countryCode: "au" })).toBe("Australia/Sydney");
    expect(homeBaseTimezone({ timezone: "UTC", pointZone: "Europe/London", countryCode: "gb" })).toBe("UTC");
  });
  it("an empty zone is none: the point, then the country", () => {
    expect(homeBaseTimezone({ timezone: "", pointZone: "Australia/Brisbane", countryCode: "au" })).toBe("Australia/Brisbane");
    expect(homeBaseTimezone({ pointZone: null, countryCode: "au" })).toBe("Australia/Sydney");
  });
  it("nothing known is null, never a UTC guess", () => {
    expect(homeBaseTimezone({})).toBeNull();
    expect(homeBaseTimezone({ countryCode: "zz" })).toBeNull();
  });
});
```

In `lib/tz-point.test.ts`, change the import to `import { pointTimezone, resolveStopTimezone, resolveHomeTimezone } from "./tz-point";` and append:

```ts
describe("resolveStopTimezone (server: the rule with the lookup)", () => {
  it("chosen zone, else the point's, else the country's, else UTC", () => {
    expect(resolveStopTimezone({ timezone: "Australia/Sydney", countryCode: "au", lat: -27.47, lng: 153.03 })).toBe("Australia/Sydney");
    expect(resolveStopTimezone({ timezone: "UTC", countryCode: "au", lat: -27.47, lng: 153.03 })).toBe("Australia/Brisbane");
    expect(resolveStopTimezone({ countryCode: "au", lat: -31.95, lng: 115.86 })).toBe("Australia/Perth");
    expect(resolveStopTimezone({ countryCode: "au", lat: 0, lng: -30 })).toBe("Australia/Sydney");
    expect(resolveStopTimezone({ country: "Italy", lat: null, lng: null })).toBe("Europe/Rome");
    expect(resolveStopTimezone({})).toBe("UTC");
  });
});

describe("resolveHomeTimezone", () => {
  it("sent zone, else the point's, else the country's, else null", () => {
    expect(resolveHomeTimezone({ timezone: "Australia/Sydney", countryCode: "au", lat: -27.47, lng: 153.03 })).toBe("Australia/Sydney");
    expect(resolveHomeTimezone({ timezone: "", countryCode: "au", lat: -27.47, lng: 153.03 })).toBe("Australia/Brisbane");
    expect(resolveHomeTimezone({ countryCode: "au" })).toBe("Australia/Sydney");
    expect(resolveHomeTimezone({})).toBeNull();
  });
});
```

- [ ] **Step 2: Run it, expect FAIL**

`npx vitest run lib/tz.test.ts lib/tz-point.test.ts`. It fails: `homeBaseTimezone`, `resolveStopTimezone` and `resolveHomeTimezone` are not exported (TypeError: not a function), and "the zone at the point beats the country's" gets `Australia/Sydney`.

- [ ] **Step 3: Implement**

In `lib/tz.ts`, replace the block at :300-314 (the `stopTimezone` docblock and function) with:

```ts
/** The zone every client sends when it chose none ("UTC" — its fallback when it knew no place). Never a choice. */
export const UNCHOSEN_TIMEZONE = "UTC";

/**
 * The one rule for a Stop's timezone (spec 2026-10-14 card 3.L, amended
 * 2026-10-16 F3): a zone the caller chose wins, unless it is "UTC"
 * (UNCHOSEN_TIMEZONE); then the zone at the Stop's point (`pointZone`,
 * looked up by `pointTimezone` in lib/tz-point.ts — server code calls
 * `resolveStopTimezone` there); then its country — two-letter code first,
 * then name. Nothing known: "UTC" (the Booking import warns on that,
 * `lib/booking-import/build.ts`). Pure and client-safe; read-side `?? "UTC"`
 * fallbacks for a stored null are not this rule.
 */
export function stopTimezone(stop: {
  timezone?: string | null;
  pointZone?: string | null;
  countryCode?: string | null;
  country?: string | null;
}): string {
  if (stop.timezone && stop.timezone !== UNCHOSEN_TIMEZONE) return stop.timezone;
  return stop.pointZone ?? timezoneForCountryOrNull(stop.countryCode) ?? timezoneForCountryOrNull(stop.country) ?? "UTC";
}

/**
 * The Home base's twin of `stopTimezone` (ADR 0030, amended 2026-10-16): a
 * sent zone wins — "UTC" included, since no Home-base client sends it as a
 * fallback (Settings sends "" when untouched) — else the zone at the Home
 * point, else the country's, else null (a Home end with no zone keeps
 * ADR 0030's other-end fallback; never a UTC guess).
 */
export function homeBaseTimezone(home: {
  timezone?: string | null;
  pointZone?: string | null;
  countryCode?: string | null;
}): string | null {
  return (home.timezone || null) ?? home.pointZone ?? timezoneForCountryOrNull(home.countryCode);
}
```

In `lib/tz-point.ts`, change the import to `import { homeBaseTimezone, isValidTimeZone, stopTimezone } from "@/lib/tz";` and append:

```ts
/** `stopTimezone` with the zone at the Stop's point looked up — every server-side Stop write. */
export function resolveStopTimezone(stop: {
  timezone?: string | null;
  countryCode?: string | null;
  country?: string | null;
  lat?: number | null;
  lng?: number | null;
}): string {
  return stopTimezone({ ...stop, pointZone: pointTimezone(stop.lat, stop.lng) });
}

/** `homeBaseTimezone` with the zone at the Home point looked up — createTrip and updateTrip. */
export function resolveHomeTimezone(home: {
  timezone?: string | null;
  countryCode?: string | null;
  lat?: number | null;
  lng?: number | null;
}): string | null {
  return homeBaseTimezone({ timezone: home.timezone, countryCode: home.countryCode, pointZone: pointTimezone(home.lat, home.lng) });
}
```

- [ ] **Step 4: Run it, expect PASS**

`npx vitest run lib/tz.test.ts lib/tz-point.test.ts`. All pass, and the existing `stopTimezone` cases are unchanged.

- [ ] **Step 5: Task-done check**

`npx vitest related --run lib/tz.ts lib/tz-point.ts` + `npx tsc --noEmit` + `npx eslint lib/tz.ts lib/tz-point.ts lib/tz.test.ts lib/tz-point.test.ts`

- [ ] **Step 6: Commit**

Files: `lib/tz.ts lib/tz-point.ts lib/tz.test.ts lib/tz-point.test.ts`. Message:

```
feat(tz): one rule picks chosen, point, country, UTC (F3)

stopTimezone takes a looked-up pointZone and stays pure; homeBaseTimezone
is its Home-base twin; lib/tz-point's resolvers do the lookup server-side.
```

---

### Task A.3: The lookup table stays out of client bundles (ESLint boundary)

**Files:**
- Modify: `eslint.config.mjs:18-29` (add `I.tzPoint`), `:119-120` (the `app` and `components` zones' `imports`)
- Test: `eslint.config.test.ts` (`CASES`, after the "components → lib/db, relative" row ~:46)

**Interfaces:**
- Consumes: `lib/tz-point.ts` (A.1)
- Produces: the lint rule that later tasks A.9/A.10 must satisfy (dynamic `import()` only)

- [ ] **Step 1: Write the failing test.** Add to `CASES` in `eslint.config.test.ts`:

```ts
  // spec 2026-10-16 F3: the zone lookup table loads lazily in the client, never statically
  ["component → lib/tz-point statically", "components/probe.tsx", 'import { pointTimezone } from "@/lib/tz-point";\nexport const p = pointTimezone;', true],
  ["component → lib/tz-point, relative", "components/a/probe.tsx", 'import { pointTimezone } from "../../lib/tz-point";\nexport const p = pointTimezone;', true],
  ["component → lib/tz-point lazily is fine", "components/probe.tsx", 'export const load = () => import("@/lib/tz-point");', false],
  ["app → lib/tz-point statically", "app/probe.tsx", 'import { pointTimezone } from "@/lib/tz-point";\nexport const p = pointTimezone;', true],
  ["server → lib/tz-point is fine", "server/actions/probe.ts", 'import { resolveStopTimezone } from "@/lib/tz-point";\nexport const r = resolveStopTimezone;', false],
  ["MCP tool → lib/tz-point is fine", "lib/mcp/tools/probe.ts", 'import { resolveStopTimezone } from "@/lib/tz-point";\nexport const r = resolveStopTimezone;', false],
```

- [ ] **Step 2: Run it, expect FAIL**

`npx vitest run eslint.config.test.ts`. The three `true` rows fail (expected reported, got false).

- [ ] **Step 3: Implement.** In `eslint.config.mjs`, add to `I` after `libDb`:

```js
  tzPoint: { regex: "^(?:@/|(?:\\.\\./)+)lib/tz-point$", message: "lib/tz-point carries the zone lookup table: client code loads it with import() when a place is picked, never statically (spec 2026-10-16 F3)." },
```

Then change the two zone rows:

```js
  { name: "app", files: ["app/**"], match: (f) => f.startsWith("app/"), imports: [I.acting, I.enums, I.motion, I.tzPoint], syntax: UI_S },
  { name: "components", files: ["components/**"], match: (f) => f.startsWith("components/"), imports: [I.acting, I.enums, I.motion, I.libDb, I.app, I.tzPoint], syntax: UI_S },
```

`no-restricted-imports` checks only static `import`/`export … from`, so `import()` stays legal. `app/api/mcp/route.ts` keeps its own narrower block, which needs no change.

- [ ] **Step 4: Run it, expect PASS**

`npx vitest run eslint.config.test.ts`

- [ ] **Step 5: Task-done check**

`npx vitest related --run eslint.config.mjs` + `npx tsc --noEmit` + `npx eslint eslint.config.mjs eslint.config.test.ts` + `npx eslint components app` (expect no new errors; nothing imports the module yet)

- [ ] **Step 6: Commit**

Files: `eslint.config.mjs eslint.config.test.ts`. Message:

```
chore(lint): client code imports lib/tz-point lazily only (F3)
```

---

### Task A.4: `createStop` and `updateStop` resolve the zone at the point

**Files:**
- Modify: `server/actions/stops.ts:8` (import), `:235` (insert scheduled), `:360` (append scheduled), `:500` (update scheduled), docblock `:391-395`
- Test: `server/actions/stops.test.ts` (the "createStop countryCode and timezone fallback" describe ~:666-725; the "updateStop (PATCH, ADR 0075)" describe ~:1104)
- Test (integration, create): `test/integration/point-timezone.test.ts`

**Interfaces:**
- Consumes: `resolveStopTimezone` (A.2)
- Produces: every scheduled `createStop`/`updateStop` write stores `resolveStopTimezone({ timezone, lat, lng, countryCode, country })` using the **final** point (picked or geocoded)

- [ ] **Step 1: Write the failing tests.**

In `server/actions/stops.test.ts`, inside `describe("createStop countryCode and timezone fallback", …)`, add:

```ts
  it.each([["append", undefined], ["insert", "a"]] as const)("%s: a picked point decides the zone over the country's (F3)", async (_, after) => {
    stopFindFirstMock.mockResolvedValue(null);
    queryRawMock.mockResolvedValue([{ id: "a", sortOrder: 0, chapterId: null, chapterSortOrder: null }]);
    stopCreateMock.mockResolvedValue({ id: "new-stop", name: "Brisbane" });
    await createStop("trip-1", { mode: "scheduled", name: "Brisbane", country: "Australia", countryCode: "au", lat: -27.47, lng: 153.03, timezone: "UTC", arriveDate: "2026-12-22", departDate: "2026-12-24" }, undefined, after);
    expect(geocodePlaceDetailedMock).not.toHaveBeenCalled();
    expect(stopCreateMock).toHaveBeenCalledWith({ data: expect.objectContaining({ timezone: "Australia/Brisbane" }) });
  });

  it.each([["append", undefined], ["insert", "a"]] as const)("%s: a geocoded point decides the zone when none was chosen", async (_, after) => {
    stopFindFirstMock.mockResolvedValue(null);
    queryRawMock.mockResolvedValue([{ id: "a", sortOrder: 0, chapterId: null, chapterSortOrder: null }]);
    stopCreateMock.mockResolvedValue({ id: "new-stop", name: "Perth" });
    geocodePlaceDetailedMock.mockResolvedValueOnce({ name: "Perth, Australia", lat: -31.95, lng: 115.86, city: "Perth", country: "Australia", countryCode: "au" });
    await createStop("trip-1", { mode: "scheduled", name: "Perth", timezone: "UTC", arriveDate: "2026-12-22", departDate: "2026-12-24" }, undefined, after);
    expect(stopCreateMock).toHaveBeenCalledWith({ data: expect.objectContaining({ timezone: "Australia/Perth", countryCode: "au" }) });
  });

  it("a chosen zone still wins over the point", async () => {
    stopFindFirstMock.mockResolvedValue(null);
    stopCreateMock.mockResolvedValue({ id: "stop-1" });
    await createStop("trip-1", { mode: "scheduled", name: "Brisbane", countryCode: "au", lat: -27.47, lng: 153.03, timezone: "Australia/Sydney", arriveDate: "2026-12-22", departDate: "2026-12-24" });
    expect(stopCreateMock).toHaveBeenCalledWith({ data: expect.objectContaining({ timezone: "Australia/Sydney" }) });
  });
```

Inside `describe("updateStop (PATCH, ADR 0075)", …)` (uses `held` at ~:1105), add:

```ts
  it("an edit that sends UTC takes the zone at its point (F3)", async () => {
    stopFindUniqueMock.mockResolvedValue({ ...held, nights: null, arriveDate: "2026-07-01", departDate: "2026-07-05", timezone: "UTC", chapterId: null });
    stopUpdateMock.mockResolvedValue({});
    await updateStop("s1", { mode: "scheduled", name: "Brisbane", country: "Australia", countryCode: "au", lat: -27.47, lng: 153.03, timezone: "UTC", arriveDate: "2026-07-01", departDate: "2026-07-05" });
    expect(geocodePlaceDetailedMock).not.toHaveBeenCalled();
    expect(stopUpdateMock).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ timezone: "Australia/Brisbane" }) }));
  });
```

Create `test/integration/point-timezone.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// F3 against the real Postgres: a Stop's (and a Home base's) zone comes from
// its point. Only the Next/auth boundary, the network (geocode) and Activity
// are mocked; the actions, lib/tz-point and Prisma run for real.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); } }));
vi.mock("@/lib/geocode", () => ({
  geocodePlace: vi.fn(async () => null),
  geocodePlaceDetailed: vi.fn(async () => null),
}));
vi.mock("@/lib/activity-record", () => ({ recordActivity: vi.fn(async () => undefined) }));
vi.mock("@/lib/guards", async () => ({
  isTripOwnerOrAdmin: (await import("@/lib/access")).isTripOwnerOrAdmin,
  requireUser: vi.fn(async () => ({ id: "it-user" })),
  requireTripAccess: vi.fn(async () => ({ user: { id: "it-user" }, membership: { role: "owner" } })),
  requirePlanAccess: vi.fn(async (_t: string, forkId?: string | null) => ({ user: { id: "it-user" }, membership: { role: "owner" }, plan: forkId ?? null })),
  requireRowAccess: vi.fn(async (kind: string, id: string) => {
    const { db } = await import("@/lib/db");
    const { notFound } = await import("next/navigation");
    const delegate = (db as unknown as Record<string, { findUnique(a: unknown): Promise<unknown> }>)[kind];
    const row = await delegate.findUnique({ where: { id } });
    if (!row) notFound();
    return { row, user: { id: "it-user" }, membership: { role: "owner" }, surpriseOf: null };
  }),
}));
vi.mock("@/lib/surprise-guard", async () => ({
  ...(await vi.importActual<object>("@/lib/surprise-guard")),
  requireOutsideSurprise: vi.fn(async () => null),
}));

import { db } from "@/lib/db";
import { geocodePlaceDetailed } from "@/lib/geocode";
import { createStop } from "@/server/actions/stops";

// Undated, so the lone-Stop rule (ADR 0073) never re-dates these Stops.
const TRIP_ID = "it-trip-point-tz";

describe.skipIf(process.env.INTEGRATION !== "1")("a Stop's default zone comes from its point (F3, real Postgres)", () => {
  beforeAll(async () => {
    await db.trip.deleteMany({ where: { id: TRIP_ID } });
    await db.user.upsert({ where: { id: "it-user" }, update: {}, create: { id: "it-user", email: "it-user@example.test", name: "It User", isEmailVerified: true } });
    await db.trip.create({ data: { id: TRIP_ID, name: "Point tz trip", homeCurrency: "AUD", createdById: "it-user", members: { create: { userId: "it-user", role: "owner" } } } });
  });
  afterAll(async () => {
    await db.trip.deleteMany({ where: { id: TRIP_ID } });
  });

  const stopZone = async (r: unknown) => (await db.stop.findUnique({ where: { id: (r as { id: string }).id } }))?.timezone;

  it("a picked Brisbane point sent with the UTC fallback stores Australia/Brisbane, not the country's Sydney", async () => {
    const r = await createStop(TRIP_ID, { mode: "scheduled", name: "Brisbane", country: "Australia", countryCode: "au", lat: -27.47, lng: 153.03, timezone: "UTC", arriveDate: "2026-06-01", departDate: "2026-06-03" });
    expect(r).toMatchObject({ success: true });
    expect(await stopZone(r)).toBe("Australia/Brisbane");
  });

  it("a geocoded Perth point decides when nothing was picked", async () => {
    vi.mocked(geocodePlaceDetailed).mockResolvedValueOnce({ name: "Perth, Australia", lat: -31.95, lng: 115.86, city: "Perth", country: "Australia", countryCode: "au" });
    const r = await createStop(TRIP_ID, { mode: "scheduled", name: "Perth", country: "Australia", timezone: "UTC", arriveDate: "2026-06-03", departDate: "2026-06-05" });
    expect(await stopZone(r)).toBe("Australia/Perth");
  });

  it("a chosen zone wins over the point", async () => {
    const r = await createStop(TRIP_ID, { mode: "scheduled", name: "Brisbane again", countryCode: "au", lat: -27.47, lng: 153.03, timezone: "Australia/Sydney", arriveDate: "2026-06-05", departDate: "2026-06-06" });
    expect(await stopZone(r)).toBe("Australia/Sydney");
  });
});
```

- [ ] **Step 2: Run it, expect FAIL**

`npx vitest run server/actions/stops.test.ts`. The new cases fail with `timezone: "Australia/Sydney"` received where `Australia/Brisbane` or `Australia/Perth` was expected. If the local DB is up, also run `INTEGRATION=1 npx vitest run test/integration/point-timezone.test.ts`; its first two cases fail the same way.

- [ ] **Step 3: Implement** in `server/actions/stops.ts`
  - `:8`: `import { stopTimezone } from "@/lib/tz";` becomes `import { resolveStopTimezone } from "@/lib/tz-point";`
  - `:235`: `const timezone = stopTimezone({ timezone: parsed.data.timezone, countryCode: derivedCountryCode, country });` becomes
    `const timezone = resolveStopTimezone({ timezone: parsed.data.timezone, lat, lng, countryCode: derivedCountryCode, country });`. Here `lat`/`lng` are the geocoded-or-picked values set before the transaction, at ~:111-123.
  - `:360`: `const appendTimezone = stopTimezone({ timezone: parsed.data.timezone, countryCode: appendCountryCode, country });` becomes
    `const appendTimezone = resolveStopTimezone({ timezone: parsed.data.timezone, lat, lng, countryCode: appendCountryCode, country });`
  - `:500`: `timezone: stopTimezone({ timezone, countryCode: parsed.data.countryCode ?? updateCountryCode, country }),` becomes
    `timezone: resolveStopTimezone({ timezone, lat, lng, countryCode: parsed.data.countryCode ?? updateCountryCode, country }),`
  - In the docblock at `:394`, "timezone by `stopTimezone` with the final country, as `createStop` does." becomes "timezone by `resolveStopTimezone` with the final point and country (F3), as `createStop` does."

- [ ] **Step 4: Run it, expect PASS**

`npx vitest run server/actions/stops.test.ts`. The existing UTC-fallback cases (Kyoto → Asia/Tokyo, Lucca → Europe/Rome, Nowhere → UTC) still pass. Then `INTEGRATION=1 npx vitest run test/integration/point-timezone.test.ts` (DB up).

- [ ] **Step 5: Task-done check**

`npx vitest related --run server/actions/stops.ts` + `npx tsc --noEmit` + `npx eslint server/actions/stops.ts server/actions/stops.test.ts test/integration/point-timezone.test.ts` + `INTEGRATION=1 npx vitest run test/integration/point-timezone.test.ts`

- [ ] **Step 6: Commit**

Files: `server/actions/stops.ts server/actions/stops.test.ts test/integration/point-timezone.test.ts`. Message:

```
feat(stops): a Stop's default zone is the zone at its point (F3)
```

---

### Task A.5: The lone-Stop rule dates a rough Stop in its point's zone

**Files:**
- Modify: `server/actions/stop-flow.ts:9` (import), `:135` (select), `:147` (timezone)
- Test: `server/actions/stop-flow.lone-stop.test.ts:11` (fixture type), add a case after the first `it` (~:48)
- Test (integration): `test/integration/point-timezone.test.ts` (extend)

**Interfaces:**
- Consumes: `resolveStopTimezone` (A.2)
- Produces: `scheduleLoneStopTx` reads `lat`/`lng` and stores `resolveStopTimezone(stop)`

- [ ] **Step 1: Write the failing tests.**

In `server/actions/stop-flow.lone-stop.test.ts`, widen the fixture type at :11 to `stops: Array<{ id: string; arriveDate: string | null; departDate: string | null; timezone: string | null; country: string | null; countryCode: string | null; lat?: number | null; lng?: number | null }>;` and add:

```ts
  it("a rough lone Stop with a point takes the zone at its point, not the country's (F3)", async () => {
    const t = tx({ trip: { startDate: "2026-11-04", endDate: "2026-11-05" }, stops: [{ ...rough, lat: -31.95, lng: 115.86 }] });
    await expect(scheduleLoneStopTx(t.client, "trip1", null, "fill")).resolves.toBe(true);
    expect(t.findMany).toHaveBeenCalledWith(expect.objectContaining({ select: expect.objectContaining({ lat: true, lng: true }) }));
    expect(t.update).toHaveBeenCalledWith({
      where: { id: "s1" },
      data: { arriveDate: "2026-11-04", departDate: "2026-11-05", nights: null, timezone: "Australia/Perth" },
    });
  });
```

In `test/integration/point-timezone.test.ts`, add `import { updateTrip } from "@/server/actions/trips";`, a constant `const LONE_TRIP_ID = "it-trip-point-tz-lone";`, add `LONE_TRIP_ID` to the `afterAll` delete (`where: { id: { in: [TRIP_ID, LONE_TRIP_ID] } }`), and add:

```ts
  it("dating a Trip schedules its lone rough Perth Stop in Australia/Perth (ADR 0073 rule, F3 zone)", async () => {
    await db.trip.deleteMany({ where: { id: LONE_TRIP_ID } });
    await db.trip.create({ data: { id: LONE_TRIP_ID, name: "Lone Perth", homeCurrency: "AUD", createdById: "it-user", members: { create: { userId: "it-user", role: "owner" } } } });
    const s = await db.stop.create({ data: { tripId: LONE_TRIP_ID, name: "Perth", country: "Australia", countryCode: "au", lat: -31.95, lng: 115.86, nights: 3, sortOrder: 0 } });
    expect(await updateTrip(LONE_TRIP_ID, { startDate: "2026-07-01", endDate: "2026-07-04" })).toMatchObject({ success: true });
    expect(await db.stop.findUnique({ where: { id: s.id } })).toMatchObject({ arriveDate: "2026-07-01", departDate: "2026-07-04", timezone: "Australia/Perth" });
  });
```

- [ ] **Step 2: Run it, expect FAIL**

`npx vitest run server/actions/stop-flow.lone-stop.test.ts`. It fails: the select lacks `lat`/`lng` and the received timezone is `Australia/Sydney`.

- [ ] **Step 3: Implement** in `server/actions/stop-flow.ts`
  - `:9`: `import { stopTimezone } from "@/lib/tz";` becomes `import { resolveStopTimezone } from "@/lib/tz-point";`. First check with `grep -n stopTimezone server/actions/stop-flow.ts` that no other use remains.
  - `:135`: `select: { id: true, arriveDate: true, departDate: true, timezone: true, country: true, countryCode: true },` becomes `select: { id: true, arriveDate: true, departDate: true, timezone: true, country: true, countryCode: true, lat: true, lng: true },`
  - `:147`: `timezone: stopTimezone(stop),` becomes `timezone: resolveStopTimezone(stop),`

- [ ] **Step 4: Run it, expect PASS**

`npx vitest run server/actions/stop-flow.lone-stop.test.ts`. The existing "derives its timezone" case has no point, so it still expects `Australia/Sydney`. Then `INTEGRATION=1 npx vitest run test/integration/point-timezone.test.ts test/integration/lone-stop-rule.test.ts` (DB up).

- [ ] **Step 5: Task-done check**

`npx vitest related --run server/actions/stop-flow.ts` + `npx tsc --noEmit` + `npx eslint server/actions/stop-flow.ts server/actions/stop-flow.lone-stop.test.ts test/integration/point-timezone.test.ts` + the integration command above

- [ ] **Step 6: Commit**

Files: `server/actions/stop-flow.ts server/actions/stop-flow.lone-stop.test.ts test/integration/point-timezone.test.ts`. Message:

```
feat(stops): lone-Stop rule dates a Stop in its point's zone (F3)
```

---

### Task A.6: TU-02: a patch that re-locates a Stop re-derives its zone

**Files:**
- Modify: `lib/stop-patch.ts:11-12` (header rule text), `:25` (import), `:103` (timezone merge)
- Test: `lib/stop-patch.test.ts:21-23` (rough→scheduled case), `:64-70` (`country: null` case), add TU-02 cases
- Test: `server/actions/stops.test.ts` (updateStop PATCH describe ~:1104)
- Test (integration): `test/integration/patch-updates.test.ts` (the `Stop` describe, after ~:159)

**Interfaces:**
- Consumes: `UNCHOSEN_TIMEZONE` (A.2); `updateStop` resolving with `resolveStopTimezone` using the final point (A.4)
- Produces: `mergeStopPatch(...).timezone` (scheduled result) = `patch.timezone`, else the row's zone **unless the patch says where**, else `UNCHOSEN_TIMEZONE`

- [ ] **Step 1: Write the failing tests** (the bug fix comes test-first).

In `lib/stop-patch.test.ts`, change the import to also take `UNCHOSEN_TIMEZONE` from `"@/lib/tz"`, and add inside `describe("mergeStopPatch", …)`:

```ts
  // TU-02: re-locating names a new place, so the row's old zone no longer applies.
  it("TU-02: a scheduled Stop re-located with no timezone leaves the zone unchosen, for updateStop to derive at the new point", () => {
    const tokyo = { ...scheduled, name: "Tokyo", country: "Japan", countryCode: "jp", lat: 35.68, lng: 139.69, timezone: "Asia/Tokyo" };
    expect(mergeStopPatch(tokyo, { country: "France", countryCode: "fr", lat: 48.86, lng: 2.35 })).toMatchObject({ mode: "scheduled", countryCode: "fr", lat: 48.86, timezone: UNCHOSEN_TIMEZONE });
    expect(mergeStopPatch(tokyo, { lat: -27.47, lng: 153.03 })).toMatchObject({ timezone: UNCHOSEN_TIMEZONE });
  });
  it("TU-02: a re-locating patch that sends a timezone keeps it; one that names no place keeps the row's", () => {
    const tokyo = { ...scheduled, countryCode: "jp", timezone: "Asia/Tokyo" };
    expect(mergeStopPatch(tokyo, { countryCode: "fr", timezone: "Asia/Tokyo" })).toMatchObject({ timezone: "Asia/Tokyo" });
    expect(mergeStopPatch(tokyo, { notes: "x", arriveDate: "2026-05-02" })).toMatchObject({ timezone: "Asia/Tokyo" });
  });
```

In the same file, change the existing assertions:
- `:21-23`. Rename the test to `"switches a rough Stop to scheduled when both dates are given; with no zone sent it is left for updateStop to derive"` and change `timezone: "Europe/Rome"` to `timezone: UNCHOSEN_TIMEZONE`.
- `:64-70` ("an explicit country: null…"). Change `timezone: "Europe/Rome"` to `timezone: UNCHOSEN_TIMEZONE`. The patch says where, so the row's zone no longer applies.

In `server/actions/stops.test.ts`'s `describe("updateStop (PATCH, ADR 0075)", …)`, add:

```ts
  it("TU-02: re-locating a scheduled Stop with no timezone takes the zone at the new point", async () => {
    stopFindUniqueMock.mockResolvedValue({ ...held, name: "Tokyo", country: "Japan", countryCode: "jp", lat: 35.68, lng: 139.69, nights: null, arriveDate: "2026-07-01", departDate: "2026-07-05", timezone: "Asia/Tokyo", chapterId: null });
    stopUpdateMock.mockResolvedValue({});
    await updateStop("s1", { name: "Paris", country: "France", countryCode: "fr", lat: 48.86, lng: 2.35 });
    expect(stopUpdateMock).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ timezone: "Europe/Paris", countryCode: "fr" }) }));
  });
  it("first scheduling a rough Stop with no zone takes the zone at the row's point", async () => {
    stopFindUniqueMock.mockResolvedValue({ ...held, countryCode: "au", country: "Australia", lat: -27.47, lng: 153.03 });
    stopUpdateMock.mockResolvedValue({});
    await updateStop("s1", { arriveDate: "2026-07-01", departDate: "2026-07-05" });
    expect(stopUpdateMock).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ timezone: "Australia/Brisbane" }) }));
  });
```

In `test/integration/patch-updates.test.ts`, inside `describe("Stop", …)`, add:

```ts
    it("TU-02: re-locating a scheduled Stop with no timezone takes the new place's zone; a sent zone still wins", async () => {
      const s = await db.stop.create({ data: { tripId: TRIP_ID, name: "Tokyo", country: "Japan", countryCode: "jp", lat: 35.68, lng: 139.69, arriveDate: "2026-05-14", departDate: "2026-05-16", timezone: "Asia/Tokyo", sortOrder: 12 } });
      expect(await updateStop(s.id, { name: "Paris", country: "France", countryCode: "fr", lat: 48.86, lng: 2.35 })).toMatchObject({ success: true });
      expect(await db.stop.findUnique({ where: { id: s.id } })).toMatchObject({ name: "Paris", timezone: "Europe/Paris", arriveDate: "2026-05-14", lat: 48.86 });
      // A move inside one country moves the zone too (F3).
      expect(await updateStop(s.id, { name: "Brisbane", country: "Australia", countryCode: "au", lat: -27.47, lng: 153.03 })).toMatchObject({ success: true });
      expect(await db.stop.findUnique({ where: { id: s.id } })).toMatchObject({ timezone: "Australia/Brisbane" });
      expect(await updateStop(s.id, { name: "Perth", countryCode: "au", lat: -31.95, lng: 115.86, timezone: "Australia/Brisbane" })).toMatchObject({ success: true });
      expect(await db.stop.findUnique({ where: { id: s.id } })).toMatchObject({ name: "Perth", timezone: "Australia/Brisbane" });
      // Naming no place keeps the zone.
      expect(await updateStop(s.id, { notes: "kept" })).toMatchObject({ success: true });
      expect(await db.stop.findUnique({ where: { id: s.id } })).toMatchObject({ timezone: "Australia/Brisbane" });
    });
```

- [ ] **Step 2: Run it, expect FAIL**

`npx vitest run lib/stop-patch.test.ts server/actions/stops.test.ts`. The TU-02 cases fail: received `Asia/Tokyo` (pure), and `Asia/Tokyo` / `Australia/Sydney` in the stops tests. The rough→scheduled case fails because it receives `Europe/Rome`.

- [ ] **Step 3: Implement** in `lib/stop-patch.ts`
  - `:25`: `import { stopTimezone } from "@/lib/tz";` becomes `import { UNCHOSEN_TIMEZONE } from "@/lib/tz";`
  - `:11-12` header bullet. Replace with:
    ```
     *  - A timezone only applies to a scheduled result; none sent keeps the
     *    row's — unless the patch says where (TU-02) or the row has none — and
     *    is otherwise UNCHOSEN_TIMEZONE, so `updateStop` derives it from the
     *    final point and country (`resolveStopTimezone`, F3).
    ```
  - `:103` becomes
    ```ts
        // TU-02: a patch that says where moves the Stop, so the row's zone no longer applies.
        const timezone = patch.timezone ?? (saysWhere ? undefined : current.timezone) ?? UNCHOSEN_TIMEZONE;
    ```
    `point` and `place` are still used for the returned input, so the variables stay.

- [ ] **Step 4: Run it, expect PASS**

`npx vitest run lib/stop-patch.test.ts server/actions/stops.test.ts`, then `INTEGRATION=1 npx vitest run test/integration/patch-updates.test.ts` (DB up). The existing "a rough Stop scheduled with no timezone takes its country's zone, else UTC" still passes: Bari at (41.12,16.87) gives Europe/Rome, and Cair Paravel at (1,2) is at sea, which gives UTC.

- [ ] **Step 5: Task-done check**

`npx vitest related --run lib/stop-patch.ts` + `npx tsc --noEmit` + `npx eslint lib/stop-patch.ts lib/stop-patch.test.ts server/actions/stops.test.ts test/integration/patch-updates.test.ts` + `INTEGRATION=1 npx vitest run test/integration/patch-updates.test.ts`

- [ ] **Step 6: Commit**

Files: `lib/stop-patch.ts lib/stop-patch.test.ts server/actions/stops.test.ts test/integration/patch-updates.test.ts`. Message:

```
fix(stops): re-locating a Stop re-derives its zone (TU-02)

A patch that says where and sends no timezone no longer keeps the
row's zone; updateStop takes it from the new point (F3).
```

---

### Task A.7: MCP: `add_stop` leaves an omitted zone to the server; `create_trip` takes `homeTimezone`

**Files:**
- Modify: `lib/mcp/tools/trips-stops-write.ts:21-24` (header), `:52` (import), `:125` (`buildStopInput`), `:150-166` (`create_trip`), `:194-195` (`add_stop` description), `:208-209` (`update_stop` description)
- Test: `lib/mcp/tools/trips-stops-write.test.ts:188-197` (create_trip), `:297-306` (add_stop zone)

**Interfaces:**
- Consumes: `UNCHOSEN_TIMEZONE` (A.2); `createStop`/`updateStop` resolving at the point (A.4, A.6); `createTrip` resolving `homeTimezone` (A.8 makes it point-based; the forwarding here works with today's `createTrip`)
- Produces: `create_trip` input `homeTimezone?: string` → `createTrip({ …, homeTimezone })`

- [ ] **Step 1: Write the failing tests.** In `lib/mcp/tools/trips-stops-write.test.ts`:

Replace the test at :297-306 with:

```ts
  it("add_stop leaves an omitted timezone unchosen, so createStop takes it from the place's point (F3)", async () => {
    createStop.mockResolvedValue({ success: true });
    const c = await connectTestClient();
    await c.callTool({
      name: "add_stop",
      arguments: { tripId: TRIP_ID, name: "Brisbane", countryCode: "au", arriveDate: "2026-05-01", departDate: "2026-05-04" },
    });
    const call = createStop.mock.calls[0];
    expect((call[1] as { timezone: string }).timezone).toBe("UTC");
  });
```

After the create_trip test at :188-197, add:

```ts
  it("create_trip forwards homeTimezone and describes the default", async () => {
    createTrip.mockResolvedValue({ success: true, tripId: "t1", href: "/trips/t1" });
    const c = await connectTestClient();
    const tool = (await c.listTools()).tools.find((t) => t.name === "create_trip")!;
    const props = (tool.inputSchema as { properties?: Record<string, { description?: string }> }).properties ?? {};
    expect(Object.keys(props)).toContain("homeTimezone");
    expect(props.homeTimezone.description).toMatch(/where the Home base is/i);
    await c.callTool({ name: "create_trip", arguments: { name: "Oz", homeCurrency: "AUD", homeName: "Brisbane", homeTimezone: "Australia/Brisbane" } });
    expect(createTrip).toHaveBeenCalledWith(expect.objectContaining({ homeName: "Brisbane", homeTimezone: "Australia/Brisbane" }));
  });

  it("create_trip surfaces createTrip's error for an invalid homeTimezone", async () => {
    createTrip.mockResolvedValue({ success: false, errors: { homeTimezone: ["Pick a timezone from the list."] } });
    const c = await connectTestClient();
    const r = await c.callTool({ name: "create_trip", arguments: { name: "Oz", homeCurrency: "AUD", homeName: "Brisbane", homeTimezone: "Mars/Olympus" } });
    expect(r.isError).toBe(true);
    expect((r.content as { text: string }[])[0].text).toContain("Pick a timezone from the list.");
  });
```

- [ ] **Step 2: Run it, expect FAIL**

`npx vitest run lib/mcp/tools/trips-stops-write.test.ts`. The add_stop case receives `Australia/Sydney`, and the create_trip case fails on the missing `homeTimezone` property. The zod object strips the unknown key, so the forwarded call lacks it.

- [ ] **Step 3: Implement** in `lib/mcp/tools/trips-stops-write.ts`
  - `:52`: `import { stopTimezone } from "@/lib/tz";` becomes `import { UNCHOSEN_TIMEZONE } from "@/lib/tz";`
  - `:125`: `timezone: stopTimezone({ timezone, countryCode, country }),` becomes
    ```ts
          // Unchosen unless the caller sent one: createStop resolves it at the
          // final point (picked or geocoded), which a country guess here would beat (F3).
          timezone: timezone ?? UNCHOSEN_TIMEZONE,
    ```
  - Header `:21-24` becomes:
    ```
     * Timezone for a scheduled Stop: `stopTimezone` (lib/tz.ts), the one rule
     * the Add-a-stop UI, `createStop`/`updateStop`, the lone-Stop rule and the
     * Booking import share — an explicit zone wins unless it is the "UTC"
     * fallback, then the zone at the Stop's point, then the country (F3). The
     * tools send no guess of their own: the actions resolve it server-side.
    ```
  - `create_trip` (`:150-166`). Set `description` to `"Creates a new Trip for the acting Traveller, who becomes its owner. Give homeName for a Home base; its timezone is taken from where the Home base is unless you pass homeTimezone."` and add to `inputSchema` after `homeName`:
    ```ts
        homeTimezone: z.string().trim().optional().describe("IANA timezone of the Home base, e.g. Australia/Brisbane. Omit it and it is taken from where the Home base is (its point, else its country). Home ends of Transport are read and written in it."),
    ```
    The handler `(input) => runTool("create_trip", () => createTrip(input))` is unchanged. `createTripSchema` already validates `homeTimezone` with `isValidTimeZone` (lib/validations/trip.ts:19-21).
  - `add_stop` description (`:195`): replace `(timezone is derived from the country if you omit it)` with `(omit timezone and it is taken from the place: the zone at its point, else its country)`.
  - `update_stop` description (`:209`): after `"…its point is looked up again from the place."` insert ` Re-locating a scheduled Stop without a timezone gives it the zone at its new place.`

- [ ] **Step 4: Run it, expect PASS**

`npx vitest run lib/mcp/tools/trips-stops-write.test.ts`

- [ ] **Step 5: Task-done check**

`npx vitest related --run lib/mcp/tools/trips-stops-write.ts` + `npx tsc --noEmit` + `npx eslint lib/mcp/tools/trips-stops-write.ts lib/mcp/tools/trips-stops-write.test.ts`

- [ ] **Step 6: Commit**

Files: `lib/mcp/tools/trips-stops-write.ts lib/mcp/tools/trips-stops-write.test.ts`. Message:

```
feat(mcp): create_trip takes homeTimezone; add_stop zone from the point (F3)
```

---

### Task A.8: Home base zone from the point: `createTrip`, `updateTrip` rename, ADR 0030, CONTEXT.md

**Files:**
- Modify: `server/actions/trips.ts:12` (import), `:107`, `:117` (createTrip), `:336-343` (updateTrip rename branch, plus its comments)
- Modify: `docs/adr/0030-home-base-as-trip-origin-not-a-stop.md` (append an amendment), `CONTEXT.md:14` (Home base: "guessed from the country")
- Test: `server/actions/trips.test.ts:619-626` (createTrip country case), `:1024-1036` (updateTrip "same country, a zone already set"), new cases

**Interfaces:**
- Consumes: `resolveHomeTimezone` (A.2)
- Produces: `createTrip` stores `resolveHomeTimezone({ timezone: homeTimezone, lat, lng, countryCode })`. An `updateTrip` rename with no zone sent writes `resolveHomeTimezone({ lat, lng, countryCode })` from the new geocode. If that is null, the zone is kept when the country is unchanged and cleared when it changed. A sent zone still wins. **Section C relies on this.** A rename may now change `homeTimezone` without `homeTimezone` being sent.

- [ ] **Step 1: Write the failing tests.** In `server/actions/trips.test.ts`:

Replace :619-626 with:

```ts
  it("computes homeTimezone from the picked Home point when none is sent (F3)", async () => {
    requireUserMock.mockResolvedValue({ id: "user-1" });
    tripCreateMock.mockResolvedValue({ id: "trip-tz" });
    await createTrip({
      name: "Oz", homeCurrency: "AUD", homeName: "Gold Coast", homeLat: -28.0, homeLng: 153.43, homeCountryCode: "au",
    });
    expect(tripCreateMock).toHaveBeenCalledWith({ data: expect.objectContaining({ homeTimezone: "Australia/Brisbane" }) });
  });

  it("a geocoded Home point decides too; a point at sea falls back to the country", async () => {
    requireUserMock.mockResolvedValue({ id: "user-1" });
    tripCreateMock.mockResolvedValue({ id: "trip-tz3" });
    geocodePlaceDetailedMock.mockResolvedValueOnce({ name: "Perth", lat: -31.95, lng: 115.86, city: "Perth", country: "Australia", countryCode: "au" });
    await createTrip({ name: "Oz", homeCurrency: "AUD", homeName: "Perth" });
    expect(tripCreateMock).toHaveBeenLastCalledWith({ data: expect.objectContaining({ homeTimezone: "Australia/Perth" }) });
    await createTrip({ name: "Oz", homeCurrency: "AUD", homeName: "Offshore", homeLat: 0, homeLng: -30, homeCountryCode: "au" });
    expect(tripCreateMock).toHaveBeenLastCalledWith({ data: expect.objectContaining({ homeTimezone: "Australia/Sydney" }) });
  });
```

Replace :1024-1036 ("name changed, same country, a zone already set → unchanged (omitted)") with:

```ts
    it("name changed, same country → the zone at the new point (F3; ADR 0030 amended 2026-10-16)", async () => {
      tripFindUniqueMock.mockResolvedValueOnce({ homeName: "Gold Coast", homeCountryCode: "au", homeTimezone: "Australia/Brisbane" });
      geocodePlaceDetailedMock.mockResolvedValueOnce({
        name: "Sydney", lat: -33.86, lng: 151.2, city: "Sydney", country: "Australia", countryCode: "au",
      });
      tripUpdateMock.mockResolvedValue({ id: "t1" });

      await updateTrip("t1", { name: "T", homeCurrency: "AUD", homeName: "Sydney" });

      expect(tripUpdateMock).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ homeTimezone: "Australia/Sydney" }),
      }));
    });

    it("name changed to Brisbane from Sydney → Australia/Brisbane, the bug F3 fixes", async () => {
      tripFindUniqueMock.mockResolvedValueOnce({ homeName: "Sydney", homeCountryCode: "au", homeTimezone: "Australia/Sydney" });
      geocodePlaceDetailedMock.mockResolvedValueOnce({
        name: "Brisbane", lat: -27.47, lng: 153.03, city: "Brisbane", country: "Australia", countryCode: "au",
      });
      tripUpdateMock.mockResolvedValue({ id: "t1" });

      await updateTrip("t1", { name: "T", homeCurrency: "AUD", homeName: "Brisbane" });

      expect(tripUpdateMock).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ homeTimezone: "Australia/Brisbane" }),
      }));
    });

    it("name changed, the new place gives no zone and the country is unchanged → kept (omitted)", async () => {
      tripFindUniqueMock.mockResolvedValueOnce({ homeName: "Somewhere", homeCountryCode: null, homeTimezone: "Pacific/Fiji" });
      geocodePlaceDetailedMock.mockResolvedValueOnce({ name: "Mid-ocean", lat: 0, lng: -30, city: null, country: null, countryCode: null });
      tripUpdateMock.mockResolvedValue({ id: "t1" });

      await updateTrip("t1", { name: "T", homeCurrency: "AUD", homeName: "Mid-ocean" });

      expect(tripUpdateMock).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.not.objectContaining({ homeTimezone: expect.anything() }),
      }));
    });
```

(`GeoCandidate`, lib/geocode.ts:85-92, has nullable `city`/`country`/`countryCode`.)

The existing cases still hold: "geocoded country ≠ before → guesses the new country's zone" (Sydney point gives Australia/Sydney), "before.homeTimezone was null → guesses anyway" (Sydney), "geocode fails → kept", "first time via a rename" (Sydney), and "a sent homeTimezone also wins on a name change".

- [ ] **Step 2: Run it, expect FAIL**

`npx vitest run server/actions/trips.test.ts`. Gold Coast receives `Australia/Sydney`. Perth receives `Australia/Sydney`. "same country → new point" receives the omitted key. Brisbane receives the omitted key.

- [ ] **Step 3: Implement** in `server/actions/trips.ts`
  - `:12`: `import { timezoneForCountryOrNull } from "@/lib/tz";` becomes `import { resolveHomeTimezone } from "@/lib/tz-point";`. Afterwards `grep -n timezoneForCountryOrNull server/actions/trips.ts` should show no uses.
  - `:107`: `homeTimezone: homeTimezone || timezoneForCountryOrNull(resolvedCountryCode),` becomes
    `homeTimezone: resolveHomeTimezone({ timezone: homeTimezone, lat: homeLat, lng: homeLng, countryCode: resolvedCountryCode }),`
  - `:117`: the same line becomes
    `homeTimezone: resolveHomeTimezone({ timezone: homeTimezone, lat: geo?.lat, lng: geo?.lng, countryCode: resolvedCountryCode }),`
  - `:330-344`, the rename branch's zone. Replace the block from `if (sentTimezone !== undefined) {` to the closing `}` of its `else` with:
    ```ts
          if (sentTimezone !== undefined) {
            timezoneUpdate = sentTimezone;
          } else if (geo === null) {
            // Geocode failed — keep whatever zone the Trip already had rather
            // than forcing it to null.
            timezoneUpdate = KEEP_TIMEZONE;
          } else {
            // A rename re-locates the Home base: the zone at the new point,
            // else its country's (F3, ADR 0030 amended 2026-10-16). Neither
            // known: an unchanged country keeps the zone, a changed one clears it.
            const derived = resolveHomeTimezone({ lat: geo.lat, lng: geo.lng, countryCode: geo.countryCode });
            const countryChanged = (geo.countryCode ?? null) !== (before.homeCountryCode ?? null);
            timezoneUpdate = derived ?? (countryChanged ? null : KEEP_TIMEZONE);
          }
    ```
- [ ] **Step 4: Docs.**

Append to `docs/adr/0030-home-base-as-trip-origin-not-a-stop.md`:

```markdown

## Amendment — 2026-10-16: the zone comes from the point

The 2026-10-14 amendment guessed `homeTimezone` from the country and kept a
hand-picked zone across a same-country rename, because the guess was
country-granular (Australia → Sydney). With an offline point lookup
(`@photostructure/tz-lookup`, spec 2026-10-16 F3) the guess is the zone at the
Home base's point, so that protection now keeps exactly the wrong zone.

1. **One rule, shared with Stops** (`homeBaseTimezone` beside `stopTimezone`
   in `lib/tz.ts`; `resolveHomeTimezone` in `lib/tz-point.ts` does the lookup):
   a zone the Traveller sent wins; else the zone at the Home point; else the
   country's; else none. A point at sea gives no zone.
2. **A rename re-derives it** from the new point when no zone is sent with
   it. When the new place gives no zone, an unchanged country keeps the zone
   and a changed one clears it. A failed geocode still keeps it.
3. "Zones are not worked out from coordinates" (above) no longer holds for
   the Home base or a Stop. A Transport end that is a departure or arrival
   point with no Stop still keeps the other end's zone.
```

In `CONTEXT.md:14`, change `a **timezone** (guessed from the country, editable)` to `a **timezone** (guessed from where it is, else its country; editable)`.

- [ ] **Step 5: Run it, expect PASS**

`npx vitest run server/actions/trips.test.ts`

- [ ] **Step 6: Task-done check**

`npx vitest related --run server/actions/trips.ts` + `npx tsc --noEmit` + `npx eslint server/actions/trips.ts server/actions/trips.test.ts`. If the DB is up, also run `INTEGRATION=1 npx vitest run test/integration/patch-updates.test.ts test/integration/point-timezone.test.ts`. They call `updateTrip`; no query shape changed, but they confirm nothing broke.

- [ ] **Step 7: Commit**

Files: `server/actions/trips.ts server/actions/trips.test.ts docs/adr/0030-home-base-as-trip-origin-not-a-stop.md CONTEXT.md`. Message:

```
feat(trips): Home base zone from its point; rename re-derives (F3)

Brisbane and Perth Home bases get their own zones. ADR 0030 amended: a
same-country rename no longer keeps the old zone.
```

---

### Task A.9: Stop form previews the zone at a picked point (lazy lookup)

**Files:**
- Modify: `components/trip/stop-form-dialog.tsx:22` (import), `:268-286` (`handleCountryChange`, `handlePick`), `:379` (Select `onValueChange`)
- Test: `components/trip/stop-form-dialog.test.tsx` (the "place search on edit" describe ~:155-210)

**Interfaces:**
- Consumes: `stopTimezone({ …, pointZone })`, `UNCHOSEN_TIMEZONE` (A.2); `pointTimezone` via `import("@/lib/tz-point")` (A.1); the lint rule (A.3)
- Produces: none

- [ ] **Step 1: Write the failing tests.** In `components/trip/stop-form-dialog.test.tsx`, add `waitFor` to the `@testing-library/react` import, and add inside `describe("place search on edit (spec 2026-10-06 §L)", …)`:

```tsx
    const BRISBANE = { name: "Brisbane, Queensland, Australia", lat: -27.47, lng: 153.03, city: "Brisbane", country: "Australia", countryCode: "au" };

    it("a pick previews the zone at the picked point once the lookup loads (F3)", async () => {
      findPlaces.mockResolvedValue({ status: "ok", candidates: [BRISBANE] });
      const user = userEvent.setup();
      render(<StopFormDialog {...baseProps} stop={LONDON} />);
      const place = screen.getByPlaceholderText(/e\.g\. london/i);
      await user.clear(place);
      await user.type(place, "Bris");
      await user.click(await screen.findByRole("option", { name: /Brisbane/ }));
      await waitFor(() => expect(screen.getByText("Brisbane (AEST)")).toBeInTheDocument());
      await user.click(screen.getByRole("button", { name: /save changes/i }));
      expect(updateStop).toHaveBeenCalledWith("stop-1", expect.objectContaining({
        name: "Brisbane", countryCode: "au", lat: -27.47, lng: 153.03, timezone: "Australia/Brisbane",
      }));
    });

    it("a lookup still in flight never overwrites a zone typed into the Country field after the pick", async () => {
      findPlaces.mockResolvedValue({ status: "ok", candidates: [BRISBANE] });
      const user = userEvent.setup();
      render(<StopFormDialog {...baseProps} stop={LONDON} />);
      const place = screen.getByPlaceholderText(/e\.g\. london/i);
      await user.clear(place);
      await user.type(place, "Bris");
      await user.click(await screen.findByRole("option", { name: /Brisbane/ }));
      const country = screen.getByPlaceholderText(/e\.g\. united kingdom/i);
      await user.clear(country);
      await user.type(country, "Japan");
      await import("@/lib/tz-point"); // let any pending lookup settle
      await user.click(screen.getByRole("button", { name: /save changes/i }));
      expect(updateStop).toHaveBeenCalledWith("stop-1", expect.objectContaining({ country: "Japan", timezone: "Asia/Tokyo" }));
    });
```

The second case runs the "superseded" path through the Country field, because a typed country bumps the same request counter. That avoids having to drive the Radix Select in happy-dom. The Select's `onValueChange` uses the same guard; a reviewer checks it by reading the code.

- [ ] **Step 2: Run it, expect FAIL**

`npx vitest run components/trip/stop-form-dialog.test.tsx`. The first case times out waiting for `Brisbane (AEST)`, because the trigger shows `Sydney (AEST/AEDT)`. The second may already pass, since it pins the guard.

- [ ] **Step 3: Implement** in `components/trip/stop-form-dialog.tsx`
  - `:22`: `import { TIMEZONES, stopTimezone } from "@/lib/tz";` becomes `import { TIMEZONES, UNCHOSEN_TIMEZONE, stopTimezone } from "@/lib/tz";`
  - Replace `handleCountryChange` and `handlePick` (`:268-286`) with:
    ```tsx
      // A pick's zone lookup in flight; a later pick, a typed country or a
      // hand-picked zone bumps this so the lookup's answer is dropped.
      const zoneRequest = React.useRef(0);

      // Auto-guess timezone when the user types a country
      function handleCountryChange(value: string) {
        zoneRequest.current++;
        setCountry(value);
        // A hand-edited country no longer matches the picked point; drop it so
        // the save re-geocodes name + country server-side.
        setPicked(null);
        const guessed = stopTimezone({ country: value });
        if (guessed !== UNCHOSEN_TIMEZONE) setTimezone(guessed);
      }

      // A pick sets the name, country and point, and the timezone: the
      // country's at once, then the zone at the picked point once lib/tz-point
      // loads (F3). Loaded with import() so the lookup table stays out of the
      // main bundle; a failed load keeps the country's zone.
      function handlePick(p: PickedPlace) {
        setPicked(p);
        setName(p.name);
        const pickedCountry = p.region?.split(",").pop()?.trim();
        if (pickedCountry) setCountry(pickedCountry);
        const place = { countryCode: p.countryCode, country: pickedCountry };
        const tz = stopTimezone(place);
        if (tz !== UNCHOSEN_TIMEZONE) setTimezone(tz);
        const request = ++zoneRequest.current;
        import("@/lib/tz-point")
          .then(({ pointTimezone }) => {
            if (request !== zoneRequest.current) return;
            const atPoint = stopTimezone({ ...place, pointZone: pointTimezone(p.lat, p.lng) });
            if (atPoint !== UNCHOSEN_TIMEZONE) setTimezone(atPoint);
          })
          .catch(() => {});
      }
    ```
  - `:379`: `onValueChange={setTimezone}` becomes
    ```tsx
                  onValueChange={(v) => {
                    zoneRequest.current++;
                    setTimezone(v);
                  }}
    ```
  - Before editing, confirm with `grep -n "region\|lat" components/ui/place-combobox.tsx` that `PickedPlace` carries `lat`/`lng` as numbers. The existing `pickedPoint` (~:215) already reads `picked.lat`/`picked.lng`.

- [ ] **Step 4: Run it, expect PASS**

`npx vitest run components/trip/stop-form-dialog.test.tsx`. The existing Kyoto pick case still sends `Asia/Tokyo`.

- [ ] **Step 5: Task-done check**

`npx vitest related --run components/trip/stop-form-dialog.tsx` + `npx tsc --noEmit` + `npx eslint components/trip/stop-form-dialog.tsx components/trip/stop-form-dialog.test.tsx`. Lint must be clean, which proves the import is dynamic only (A.3).

- [ ] **Step 6: Commit**

Files: `components/trip/stop-form-dialog.tsx components/trip/stop-form-dialog.test.tsx`. Message:

```
feat(stop-form): preview the zone at a picked point (F3)

lib/tz-point loads with import() on pick; a later pick, typed country
or chosen zone wins over a lookup still in flight.
```

---

### Task A.10: Mobile add-stop sheet leaves the zone to the server

**Files:**
- Modify: `components/plan/mobile/add-stop-sheet.tsx:21` (import), `:136`
- Test: `components/plan/mobile/add-stop-sheet.test.tsx:130-143`

**Interfaces:**
- Consumes: `UNCHOSEN_TIMEZONE` (A.2); `createStop` resolving at the picked point (A.4)
- Produces: none

- [ ] **Step 1: Write the failing test.** Replace the test at `add-stop-sheet.test.tsx:130-143` with the following. The behaviour change is intentional: the sheet shows no zone, so it no longer sends a country guess that would beat the point.

```tsx
  it("Exact dates: submits a scheduled stop with the zone left to the server (F3: createStop takes it at the picked point)", async () => {
    render(<AddStopSheet {...base} forkId="fork-1" />);
    await userEvent.click(screen.getByRole("radio", { name: "Exact dates" }));
    await userEvent.click(screen.getByRole("button", { name: "pick Florence" }));
    await userEvent.click(screen.getByRole("button", { name: "pick range" }));
    await userEvent.click(screen.getByRole("button", { name: "Add Florence" }));
    expect(createStop).toHaveBeenCalledTimes(1);
    expect(createStop).toHaveBeenCalledWith(
      "t1",
      { mode: "scheduled", name: "Florence", country: "Italy", timezone: "UTC", arriveDate: "2026-12-22", departDate: "2026-12-24", lat: 43.77, lng: 11.25, countryCode: "it" },
      "fork-1",
      "rom",
    );
  });
```

- [ ] **Step 2: Run it, expect FAIL**

`npx vitest run components/plan/mobile/add-stop-sheet.test.tsx`. It receives `timezone: "Europe/Rome"`.

- [ ] **Step 3: Implement** in `components/plan/mobile/add-stop-sheet.tsx`
  - `:21`: `import { stopTimezone } from "@/lib/tz";` becomes `import { UNCHOSEN_TIMEZONE } from "@/lib/tz";`
  - `:136`: `: { mode: "scheduled", ...place, timezone: stopTimezone({ countryCode: picked?.countryCode, country }), arriveDate: range.start!, departDate: range.end! };` becomes
    ```tsx
            // No zone control here: createStop resolves it at the picked (or geocoded) point (F3).
            : { mode: "scheduled", ...place, timezone: UNCHOSEN_TIMEZONE, arriveDate: range.start!, departDate: range.end! };
    ```

- [ ] **Step 4: Run it, expect PASS**

`npx vitest run components/plan/mobile/add-stop-sheet.test.tsx`

- [ ] **Step 5: Task-done check**

`npx vitest related --run components/plan/mobile/add-stop-sheet.tsx` + `npx tsc --noEmit` + `npx eslint components/plan/mobile/add-stop-sheet.tsx components/plan/mobile/add-stop-sheet.test.tsx`

- [ ] **Step 6: Commit**

Files: `components/plan/mobile/add-stop-sheet.tsx components/plan/mobile/add-stop-sheet.test.tsx`. Message:

```
feat(plan): add-stop sheet lets the server pick the zone (F3)
```
## Section B — F4 soft end date grows to cover the return leg

### Notes

**Produces (for other sections):**
- `lib/soft-end.ts`
  - `export interface SoftEndStop { id: string; sortOrder: number; arriveDate: string | null; departDate: string | null; timezone: string | null }`
  - `export interface SoftEndLeg { fromStopId: string | null; toStopId: string | null; depIsHome: boolean; arrIsHome: boolean; arrAt: Date | string | null }`
  - `export function softEndDate(input: { stops: readonly SoftEndStop[]; transports: readonly SoftEndLeg[]; homeTimezone: string | null }): string | null`
  - `export function grownEndDate(current: string | null, soft: string | null): string | null`. Returns the date to write, or null when nothing should change.
- `server/actions/trip-window.ts` (a plain module, **not** `"use server"`, like `stop-flow.ts`, so it needs no ALLOWLIST entry)
  - `export async function growTripEndTx(tx: Prisma.TransactionClient, tripId: string, plan: PlanId): Promise<string | null>`. Returns the new `endDate` when it grew, else null. Does nothing for a Fork, and nothing for a Trip with no `startDate`.
  - `export function tripWindowScopes(grownTo: string | null): TripScope[]`. Returns `["trip"]` when the window grew, else `[]`. Callers spread it into `revalidateTrip(tripId, "plan", ...)`, so the trip layout (its header date range) and `/trips` refresh.
- `reflowSpanTx` (`server/actions/stop-flow.ts:232`) also returns `grownTo: string | null` in its result.
- **Section C (home timezone change):** C keeps each Home end's wall-clock time and recomputes its instant. The return leg's landing date in the Home zone therefore stays the same, so C does **not** need to call `growTripEndTx`. One exception: when `homeTimezone` goes from null to a zone, the landing is read in a different zone. If C wants that case covered, it calls `growTripEndTx(tx, tripId, null)` once after its rewrite. Optional.

**Assumes from earlier sections:** nothing. Section A only changes how zones are guessed (`stopTimezone`), and B reads the stored `Stop.timezone` and `Trip.homeTimezone`.

**Decisions where the spec is silent (with reason):**
1. **Real plan only. A Fork never moves `Trip.endDate`.** Dated views read the real plan only (`lib/day-reads.ts:8-9`, "dated views ignore `?plan=`"). The Trip window is the real plan's. **This changes today's behaviour:** `applyStopDates` and both firm-ups grow the Trip window from Fork rows today, which leaves empty trailing days on the real plan. The rule lives in the helper (`if (plan) return null`), so every caller passes its plan unchanged. `promoteFork` calls it after the retag, the moment Fork dates become real (B.6). For the same reason, a firm-up on a Fork no longer sets `Trip.startDate` on a date-less Trip (B.3). Firming up a Fork is no longer a back door that dates the Trip.
2. **What counts as the return leg.** Every real-plan leg with an `arrAt` that is either Home-bound (`arrIsHome`) or matches the `findReturnLeg` shape (departs the last plan Stop, `lastPlanStop` from `lib/trip-deadline.ts`, and arrives at no Stop). The **latest** landing among them wins. Reasons:
   - A multi-leg trip home is covered. Example: a train from Tokyo to "Narita", then a flight Narita → Home stored with `fromStopId: null`. You are home when the last leg lands. `resolveTripDeadline` takes the *earliest departure* for the deadline. This is the mirror image, and ADR 0068 stays untouched.
   - A free-text return ("Brisbane", `arrIsHome: false`) is the return leg under the one shape rule (ADR 0032 amendment).
3. **Zone for the landing date:** `resolveEndpointZones(departingStop.timezone, null, { depIsHome, arrIsHome, homeTimezone }).arrTz`, the same rule the write path and the leg card use. In practice:
   - A Home end with a Home zone is read in the Home base's zone.
   - Otherwise it falls back to the departing Stop's zone, else UTC.
   - The date the Traveller sees on the leg card is the date the window grows to.
4. **A date-less Trip (no `startDate`) stays date-less.** The helper never writes an `endDate` without a start. The firm-up paths set the start first and then call the helper. This keeps today's behaviour for `createStop` and `updateStop` on a date-less Trip.
5. **Never shrinks, race-safe.** The write is `trip.updateMany({ where: { id, OR: [{ endDate: null }, { endDate: { lt: next } }] } })`. Two grows racing (for example create-leg and set-dates) cannot pull the end back. ISO `YYYY-MM-DD` compares correctly as text.
6. **No Activity entry and no Flag** for the grow, the same as today's inline grows (spec: "raises no Flag"). `hardEndDate` is never read or written. ADR 0068 is unchanged.
7. **Revalidation:** when the window grows the action adds the `"trip"` scope, which is layout-wide and also covers `/trips`. The trip header shows `formatDateRange(startDate, endDate)` (`app/(app)/trips/[tripId]/layout.tsx:110-111`), and today's inline grows leave it stale.
8. **Transport writes are not wrapped in a new transaction.** `createTransport` and `updateTransport` write outside a transaction today. The helper runs on `db` straight after the write, as the firm-ups already do with `shiftStopPayloadTx(db, …)`. The guarded `updateMany` makes the grow safe without a lock.
9. **`updateTrip` does not call the helper.** The Traveller set the window, and pulling the end in is their call (CONTEXT.md **Hard end date**: "pulling it in is the Traveller's call"). Its lone-Stop "follow" rule (`scheduleLoneStopTx`) only copies the Trip's own dates.

**Audit: every write that dates or re-dates a Stop, or a leg that could be the return leg** (line numbers as of `bf8fb7f6`):

| Write | path:line | Grows today? | After B |
|---|---|---|---|
| `createStop`, insert path, scheduled | `server/actions/stops.ts:240-263` | no | `growTripEndTx` in tx (B.4) |
| `createStop`, insert path, rough (+ lone-Stop fill) | `stops.ts:208-231` | no | none needed: a rough Stop has no dates, and the lone-Stop fill copies the Trip's own dates |
| `createStop`, append path, scheduled | `stops.ts:363-383` | no | in tx (B.4) |
| `createStop`, append path, rough (+ lone-Stop fill) | `stops.ts:316-339` | no | none needed (same reason) |
| `updateStop`, scheduled branch | `stops.ts:494-518` | no | in tx (B.4) |
| `updateStop`, rough branch | `stops.ts:446-466` | no | none: it clears dates |
| `applyStopDates` (via `setStopDates` `:849`, `setStopNights` dated branch `:1243-1246`) | `stops.ts:771,819,826-830` | **yes**, inline, *also for Forks* | helper (B.3) |
| `moveStop` | `stops.ts:695-741` | no (the brief's ":826-829" is `applyStopDates`) | none: swaps `sortOrder` only, no dates |
| `firmUpSegment` | `stops.ts:965-977` | **yes**, inline (`db`), *also for Forks* | helper, real plan only (B.3) |
| `firmUpTrip` | `stops.ts:1094-1102` | **yes**, inline (`db`), *also for Forks* | helper, real plan only (B.3) |
| `makeStopRough` (+ lone-Stop fill) | `stops.ts:1175-1216` | no | none: clears dates, and the fill copies the Trip's dates |
| `deleteStop` (+ lone-Stop fill) | `stops.ts:537-579` | no | none: removal never grows, and the end never shrinks |
| `reorderStops` → `reflowSpanTx` | `stops.ts:1356-1373` → `stop-flow.ts:232-260` | no | helper inside `reflowSpanTx` (B.4) |
| `reorderChapters` → `reflowSpanTx` | `server/actions/chapters.ts:205-233` | no | through `reflowSpanTx` (B.4) |
| `restoreStops` (Undo, verbatim dates) | `stops.ts:1534-1565` | no | in tx (B.4) |
| `scheduleLoneStopTx` | `server/actions/stop-flow.ts:125-157` | n/a | none: writes exactly the Trip's start/end |
| `createTransport` | `server/actions/transport.ts:156-177` | no | after the create (B.5) |
| `updateTransport` | `transport.ts:305-322` | no | after `auditedUpdate` (B.5) |
| `reorderTransports` | `transport.ts:406-441` | no | none: changes `anchorStopId` and `sortOrder` only |
| `deleteTransport` | `transport.ts:447-468` | no | none: never shrinks |
| `promoteFork` (Fork rows become the real plan) | `server/actions/forks.ts:812-821` | no | in tx after the retag (B.6) |
| `createTrip` (rough rows from `roughStopRows`) | `server/actions/trips.ts:124-150` | n/a | none: rough Stops only, the window comes from the input |
| `duplicateTrip` (copies the source's rows and window verbatim) | `trips.ts:631-660` | n/a | none: not a dating write, the copy keeps the source's window |
| `updateTrip` (Traveller sets the window; lone Stop follows) | `trips.ts:240-390` | n/a | none (decision 9) |
| booking-import confirm → `createStop` / `createTransport` | `lib/booking-import/confirm.ts:110,155` | no | covered through the actions |
| MCP `create_stop` / `update_stop` / `move_stop` / `set_stop_nights` / `set_stop_dates` / `make_stop_rough` / `firm_up_trip` | `lib/mcp/tools/trips-stops-write.ts:212,227,260,273,286,317,342` | as the action | covered through the actions |
| MCP `create_transport` / `update_transport` / `delete_transport` | `lib/mcp/tools/bookings-write.ts:315,347,361` | as the action | covered through the actions |
| MCP make-it-fit trim → `setStopNights` | `lib/mcp/tools/make-it-fit.ts:134` | yes (via `applyStopDates`) | covered through the action |

**Review Focus candidates:**
1. **The spec scenario.** A return leg departs Tokyo on 11 Dec at 22:00 local and lands Brisbane on 12 Dec at 08:30 local (`arrIsHome`, `homeTimezone: "Australia/Brisbane"`). The last Stop departs on 11 Dec. Creating the leg (and also dating it later through `updateTransport`) must set `Trip.endDate` to `2026-12-12`, even though the UTC landing date is 11 Dec. Moving the landing earlier afterwards leaves 12 Dec. Tested in B.5 (integration) and B.1 (pure).
2. **A Fork never moves the Trip window.** Creating a Fork leg that lands on 14 Dec, or re-dating a Fork Stop, leaves `endDate` unchanged. Promoting that Fork grows it. Tested in B.2 (integration), B.3 (unit: Fork firm-up writes no Trip row), B.5 (integration Fork leg) and B.6 (promote).
3. **Never shrinks, and a date-less Trip stays date-less.** The helper on a Trip whose end is already later returns null and writes nothing. A Trip with no `startDate` and a dated Stop keeps `endDate: null`. Tested in B.2 (integration) and B.1 (`grownEndDate`).

**Proposed trailer:** none. The assembler puts `Resolves-Feedback: cmva4jnfk003l07lfhfbs92wb` on section C's last task.

---

### Task B.1: The soft end date rule, pure

**Files:**
- Create: `lib/soft-end.ts`
- Test: `lib/soft-end.test.ts` (new)

**Interfaces:**
- Consumes: `lastPlanStop` (`lib/trip-deadline.ts:41`), `resolveEndpointZones` (`lib/time-display.ts:46`), `instantToZonedDateISO` (`lib/tz.ts:345`). All exist today.
- Produces: `SoftEndStop`, `SoftEndLeg`, `softEndDate`, `grownEndDate` (exact signatures in Notes).

- [ ] **Step 1: Write the failing test** `lib/soft-end.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { grownEndDate, softEndDate, type SoftEndLeg, type SoftEndStop } from "./soft-end";

const tokyo: SoftEndStop = { id: "tokyo", sortOrder: 1, arriveDate: "2026-12-05", departDate: "2026-12-11", timezone: "Asia/Tokyo" };
const osaka: SoftEndStop = { id: "osaka", sortOrder: 0, arriveDate: "2026-12-01", departDate: "2026-12-05", timezone: "Asia/Tokyo" };
const home = (over: Partial<SoftEndLeg>): SoftEndLeg => ({
  fromStopId: "tokyo", toStopId: null, depIsHome: false, arrIsHome: true, arrAt: null, ...over,
});

describe("softEndDate (F4: the later of the last scheduled depart and the return leg's landing)", () => {
  it("a one-way trip with no return leg ends on the last scheduled Stop's depart", () => {
    expect(softEndDate({ stops: [osaka, tokyo], transports: [], homeTimezone: "Australia/Brisbane" })).toBe("2026-12-11");
  });

  it("a return leg landing the next day in the Home base's zone moves the end to that day (spec scenario)", () => {
    // Departs Tokyo 11 Dec 22:00 JST, lands Brisbane 12 Dec 08:30 AEST = 2026-12-11T22:30Z (UTC still 11 Dec).
    const leg = home({ arrAt: new Date("2026-12-11T22:30:00Z") });
    expect(softEndDate({ stops: [osaka, tokyo], transports: [leg], homeTimezone: "Australia/Brisbane" })).toBe("2026-12-12");
  });

  it("overnight across the date line: the Home zone's date wins over UTC's", () => {
    // Lands Honolulu 11 Dec 22:00 HST = 2026-12-12T08:00Z; Tokyo/UTC would both say 12 Dec.
    const leg = home({ arrAt: "2026-12-12T08:00:00.000Z" });
    const lastStop = { ...tokyo, departDate: "2026-12-10" };
    expect(softEndDate({ stops: [osaka, lastStop], transports: [leg], homeTimezone: "Pacific/Honolulu" })).toBe("2026-12-11");
  });

  it("a return leg landing before the last Stop's depart leaves the Stop's depart", () => {
    const leg = home({ arrAt: new Date("2026-12-09T03:00:00Z") });
    expect(softEndDate({ stops: [osaka, tokyo], transports: [leg], homeTimezone: "Australia/Brisbane" })).toBe("2026-12-11");
  });

  it("a Home end with no Home zone is read in the departing Stop's zone (the leg card's rule)", () => {
    // 2026-12-11T16:00Z = 12 Dec 01:00 in Tokyo.
    const leg = home({ arrAt: new Date("2026-12-11T16:00:00Z") });
    expect(softEndDate({ stops: [osaka, tokyo], transports: [leg], homeTimezone: null })).toBe("2026-12-12");
  });

  it("a free-text return leg off the last Stop counts (findReturnLeg's shape), read in that Stop's zone", () => {
    const leg = home({ arrIsHome: false, arrAt: new Date("2026-12-11T16:00:00Z") });
    expect(softEndDate({ stops: [osaka, tokyo], transports: [leg], homeTimezone: "Australia/Brisbane" })).toBe("2026-12-12");
  });

  it("a multi-leg trip home ends when the last leg lands, even one not tied to the last Stop", () => {
    const train = home({ arrIsHome: false, arrAt: new Date("2026-12-11T10:00:00Z") }); // to "Narita"
    const flight = home({ fromStopId: null, arrAt: new Date("2026-12-11T22:30:00Z") }); // Narita → Home
    expect(softEndDate({ stops: [osaka, tokyo], transports: [train, flight], homeTimezone: "Australia/Brisbane" })).toBe("2026-12-12");
  });

  it("ignores legs to another Stop, legs off a middle Stop, and legs with no arrival", () => {
    const toStop = home({ arrIsHome: false, toStopId: "osaka", arrAt: new Date("2026-12-20T00:00:00Z") });
    const offMiddle = home({ arrIsHome: false, fromStopId: "osaka", arrAt: new Date("2026-12-20T00:00:00Z") });
    const undated = home({ arrAt: null });
    expect(softEndDate({ stops: [osaka, tokyo], transports: [toStop, offMiddle, undated], homeTimezone: "Australia/Brisbane" })).toBe("2026-12-11");
  });

  it("is null with no scheduled Stop and no dated return leg", () => {
    const rough: SoftEndStop = { id: "r", sortOrder: 0, arriveDate: null, departDate: null, timezone: null };
    expect(softEndDate({ stops: [rough], transports: [], homeTimezone: "Australia/Brisbane" })).toBeNull();
    expect(softEndDate({ stops: [], transports: [], homeTimezone: null })).toBeNull();
  });
});

describe("grownEndDate (never shrinks)", () => {
  it("grows from nothing or from an earlier end", () => {
    expect(grownEndDate(null, "2026-12-12")).toBe("2026-12-12");
    expect(grownEndDate("2026-12-11", "2026-12-12")).toBe("2026-12-12");
  });
  it("writes nothing for an equal or earlier candidate, or none", () => {
    expect(grownEndDate("2026-12-12", "2026-12-12")).toBeNull();
    expect(grownEndDate("2026-12-12", "2026-12-11")).toBeNull();
    expect(grownEndDate("2026-12-12", null)).toBeNull();
  });
});
```

- [ ] **Step 2: Run it, expect FAIL.** `npx vitest run lib/soft-end.test.ts` fails with `Failed to resolve import "./soft-end"`.
- [ ] **Step 3: Implement** `lib/soft-end.ts`:

```ts
/**
 * The soft end date (CONTEXT.md **Trip**, **Hard end date**; spec
 * 2026-10-16 F4): the later of the last scheduled Stop's depart and the day
 * the return leg lands — read in the Home base's zone — so a Trip ends the
 * day you are back. Pure; `server/actions/trip-window.ts` stores it, only
 * ever growing `Trip.endDate`.
 *
 * The return leg here is every dated leg that is Home-bound (`arrIsHome`) or
 * has `findReturnLeg`'s shape (departs the last plan Stop, arrives at no
 * Stop); the LATEST landing wins — on a multi-leg journey home you are back
 * when the last one lands. (The Hard end date's deadline, ADR 0068, is the
 * mirror image — the earliest departure — and is untouched.) Each landing is
 * read in its arrival zone by the same rule the write path and the leg card
 * use (`resolveEndpointZones`), so the window grows to the date the
 * Traveller sees on the card.
 */
import { lastPlanStop } from "@/lib/trip-deadline";
import { resolveEndpointZones } from "@/lib/time-display";
import { instantToZonedDateISO } from "@/lib/tz";

export interface SoftEndStop {
  id: string;
  sortOrder: number;
  arriveDate: string | null;
  departDate: string | null;
  timezone: string | null;
}

export interface SoftEndLeg {
  fromStopId: string | null;
  toStopId: string | null;
  depIsHome: boolean;
  arrIsHome: boolean;
  arrAt: Date | string | null;
}

const later = (a: string | null, b: string): string => (a === null || b > a ? b : a);

export function softEndDate(input: {
  stops: readonly SoftEndStop[];
  transports: readonly SoftEndLeg[];
  homeTimezone: string | null;
}): string | null {
  let end: string | null = null;
  for (const s of input.stops) {
    if (s.arriveDate && s.departDate) end = later(end, s.departDate);
  }
  const lastId = lastPlanStop(input.stops)?.id ?? null;
  const zoneOf = new Map(input.stops.map((s) => [s.id, s.timezone]));
  for (const leg of input.transports) {
    if (!leg.arrAt) continue;
    const returnShape = lastId !== null && leg.fromStopId === lastId && !leg.toStopId;
    if (!leg.arrIsHome && !returnShape) continue;
    const instant = leg.arrAt instanceof Date ? leg.arrAt : new Date(leg.arrAt);
    if (Number.isNaN(instant.getTime())) continue;
    const { arrTz } = resolveEndpointZones(
      leg.fromStopId ? zoneOf.get(leg.fromStopId) ?? null : null,
      null,
      { depIsHome: leg.depIsHome, arrIsHome: leg.arrIsHome, homeTimezone: input.homeTimezone },
    );
    end = later(end, instantToZonedDateISO(instant, arrTz));
  }
  return end;
}

/** The end date to store: `soft` when it is later than `current`, else null (never shrinks). */
export function grownEndDate(current: string | null, soft: string | null): string | null {
  return soft !== null && (current === null || soft > current) ? soft : null;
}
```

- [ ] **Step 4: Run it, expect PASS.** `npx vitest run lib/soft-end.test.ts` passes, 11 tests.
- [ ] **Step 5: Task-done check.** `npx vitest related --run lib/soft-end.ts` + `npx tsc --noEmit` + `npx eslint lib/soft-end.ts lib/soft-end.test.ts`
- [ ] **Step 6: Commit** `lib/soft-end.ts`, `lib/soft-end.test.ts` with the message `feat(trip): soft end date rule covers the return leg home (F4)`

---

### Task B.2: `growTripEndTx`, the one helper that stores it

**Files:**
- Create: `server/actions/trip-window.ts`
- Modify: `prisma/schema.prisma:451` (comment only, so no migration)
- Test: `test/integration/soft-end-date.test.ts` (new; B.4 and B.5 extend it)

**Interfaces:**
- Consumes: `softEndDate`, `grownEndDate` (B.1); `REAL_PLAN`, `PlanId` (`lib/plan-scope.ts`); `TripScope` (`lib/revalidate.ts:12`).
- Produces: `growTripEndTx(tx: Prisma.TransactionClient, tripId: string, plan: PlanId): Promise<string | null>` and `tripWindowScopes(grownTo: string | null): TripScope[]`.

- [ ] **Step 1: Write the failing test** `test/integration/soft-end-date.test.ts`. The mock header covers the Next/auth boundary and the network. It is the same pattern as `test/integration/patch-updates.test.ts:6-34`, set up now so that B.4 and B.5 only add `describe` blocks. The helper tests below don't touch any mocked module.

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// F4 against the real Postgres. Only the Next/auth boundary, the network
// (geocode, FX) and Activity are mocked; the helper, the actions and Prisma
// run for real (patch-updates.test.ts pattern).
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); } }));
vi.mock("@/lib/geocode", () => ({
  geocodePlace: vi.fn(async () => null),
  geocodePlaceDetailed: vi.fn(async () => null),
}));
vi.mock("@/lib/money/fx", () => ({
  resolveRateForTrip: vi.fn(async () => ({ rate: 1, persist: null })),
  persistRate: vi.fn(async () => undefined),
}));
vi.mock("@/lib/activity-record", () => ({ recordActivity: vi.fn(async () => undefined) }));
vi.mock("@/lib/guards", async () => ({
  isTripOwnerOrAdmin: (await import("@/lib/access")).isTripOwnerOrAdmin,
  requireUser: vi.fn(async () => ({ id: "it-user" })),
  requireTripAccess: vi.fn(async () => ({ user: { id: "it-user" }, membership: { role: "owner" } })),
  requirePlanAccess: vi.fn(async (_t: string, forkId?: string | null) => ({ user: { id: "it-user" }, membership: { role: "owner" }, plan: forkId ?? null })),
  requireRowAccess: vi.fn(async (kind: string, id: string) => {
    const { db } = await import("@/lib/db");
    const { notFound } = await import("next/navigation");
    const delegate = (db as unknown as Record<string, { findUnique(a: unknown): Promise<unknown> }>)[kind];
    const row = await delegate.findUnique({ where: { id } });
    if (!row) notFound();
    return { row, user: { id: "it-user" }, membership: { role: "owner" }, surpriseOf: null };
  }),
}));
vi.mock("@/lib/surprise-guard", async () => ({
  ...(await vi.importActual<object>("@/lib/surprise-guard")),
  requireOutsideSurprise: vi.fn(async () => null),
}));

import { db } from "@/lib/db";
import { growTripEndTx } from "@/server/actions/trip-window";

const TRIP_ID = "it-trip-soft-end";
const DATELESS_ID = "it-trip-soft-end-dateless";

/** The spec scenario's Trip: home Brisbane, last Stop Tokyo departing 11 Dec, window ending 11 Dec. */
async function seedTrip(): Promise<{ tokyoId: string }> {
  await db.trip.deleteMany({ where: { id: { in: [TRIP_ID, DATELESS_ID] } } }); // cascades Stops, legs, Forks
  await db.trip.create({
    data: {
      id: TRIP_ID, name: "Soft end IT", homeCurrency: "AUD", createdById: "it-user",
      startDate: "2026-12-01", endDate: "2026-12-11",
      homeName: "Brisbane", homeTimezone: "Australia/Brisbane",
      members: { create: { userId: "it-user", role: "owner" } },
    },
  });
  await db.stop.create({ data: { tripId: TRIP_ID, name: "Osaka", timezone: "Asia/Tokyo", arriveDate: "2026-12-01", departDate: "2026-12-05", sortOrder: 0 } });
  const tokyo = await db.stop.create({ data: { tripId: TRIP_ID, name: "Tokyo", timezone: "Asia/Tokyo", arriveDate: "2026-12-05", departDate: "2026-12-11", sortOrder: 1 } });
  return { tokyoId: tokyo.id };
}

const endDate = async (id = TRIP_ID) => (await db.trip.findUnique({ where: { id }, select: { endDate: true } }))?.endDate;

describe.skipIf(process.env.INTEGRATION !== "1")("soft end date covers the return leg (F4, real Postgres)", () => {
  let tokyoId = "";
  beforeAll(async () => {
    await db.user.upsert({ where: { id: "it-user" }, update: {}, create: { id: "it-user", email: "it@example.test", name: "IT" } });
  });
  beforeEach(async () => {
    ({ tokyoId } = await seedTrip());
  });
  afterAll(async () => {
    await db.trip.deleteMany({ where: { id: { in: [TRIP_ID, DATELESS_ID] } } });
  });

  describe("growTripEndTx", () => {
    it("grows endDate to the return leg's landing date in the Home zone, inside a transaction, then is a no-op", async () => {
      await db.transport.create({ data: {
        tripId: TRIP_ID, mode: "FLIGHT", fromStopId: tokyoId, arrIsHome: true,
        depAt: new Date("2026-12-11T13:00:00Z"), arrAt: new Date("2026-12-11T22:30:00Z"),
      } });
      expect(await db.$transaction((tx) => growTripEndTx(tx, TRIP_ID, null))).toBe("2026-12-12");
      expect(await endDate()).toBe("2026-12-12");
      expect(await growTripEndTx(db, TRIP_ID, null)).toBeNull();
    });

    it("never shrinks: an earlier plan leaves a later end alone", async () => {
      await db.trip.update({ where: { id: TRIP_ID }, data: { endDate: "2026-12-20" } });
      expect(await growTripEndTx(db, TRIP_ID, null)).toBeNull();
      expect(await endDate()).toBe("2026-12-20");
    });

    it("reads the real plan only, and does nothing for a Fork", async () => {
      const fork = await db.fork.create({ data: { tripId: TRIP_ID, name: "Plan B", createdById: "it-user" } });
      await db.stop.create({ data: { tripId: TRIP_ID, forkId: fork.id, name: "Kyoto", timezone: "Asia/Tokyo", arriveDate: "2026-12-11", departDate: "2026-12-18", sortOrder: 2 } });
      expect(await growTripEndTx(db, TRIP_ID, fork.id)).toBeNull();
      expect(await growTripEndTx(db, TRIP_ID, null)).toBeNull();
      expect(await endDate()).toBe("2026-12-11");
    });

    it("leaves a date-less Trip date-less", async () => {
      await db.trip.create({ data: { id: DATELESS_ID, name: "Idea", homeCurrency: "AUD", createdById: "it-user", members: { create: { userId: "it-user", role: "owner" } } } });
      await db.stop.create({ data: { tripId: DATELESS_ID, name: "Rome", timezone: "Europe/Rome", arriveDate: "2026-07-01", departDate: "2026-07-04", sortOrder: 0 } });
      expect(await growTripEndTx(db, DATELESS_ID, null)).toBeNull();
      expect(await endDate(DATELESS_ID)).toBeNull();
    });
  });
});
```

- [ ] **Step 2: Run it, expect FAIL.** With the local DB up (`docker compose up -d`, `npx prisma migrate deploy`), run `TZ=UTC npx vitest run --config vitest.integration.config.ts test/integration/soft-end-date.test.ts`. It fails with `Failed to resolve import "@/server/actions/trip-window"`.
- [ ] **Step 3: Implement** `server/actions/trip-window.ts`:

```ts
import type { Prisma } from "@prisma/client";
import { REAL_PLAN, type PlanId } from "@/lib/plan-scope";
import { softEndDate, grownEndDate } from "@/lib/soft-end";
import type { TripScope } from "@/lib/revalidate";

/**
 * F4 (spec 2026-10-16; CONTEXT.md **Trip**): grow `Trip.endDate` — the soft
 * end — to cover the plan home: the later of the last scheduled Stop's
 * depart and the return leg's landing in the Home base's zone
 * (`lib/soft-end.ts`). Called inside (or straight after) every write that
 * dates or re-dates a Stop or a Home-bound leg, app and Claude alike.
 *
 * - Real plan only: a Fork's write leaves the Trip window alone (dated
 *   views read the real plan only — lib/day-reads.ts); `promoteFork` calls
 *   this once the Fork's rows are the real plan.
 * - A date-less Trip (no start) stays date-less.
 * - Never shrinks: the write is conditional on the stored end being earlier,
 *   so two racing grows can't pull it back. No Activity, no Flag; the Hard
 *   end date is never touched (ADR 0068).
 *
 * Plain module (not "use server"): it does no access check of its own —
 * every caller has already run its guard.
 *
 * @returns the new endDate when it grew, else null.
 */
export async function growTripEndTx(
  tx: Prisma.TransactionClient,
  tripId: string,
  plan: PlanId,
): Promise<string | null> {
  if (plan) return null;
  const trip = await tx.trip.findUnique({
    where: { id: tripId },
    select: { startDate: true, endDate: true, homeTimezone: true },
  });
  if (!trip?.startDate) return null;
  const [stops, transports] = await Promise.all([
    tx.stop.findMany({
      where: { tripId, ...REAL_PLAN },
      select: { id: true, sortOrder: true, arriveDate: true, departDate: true, timezone: true },
    }),
    tx.transport.findMany({
      where: { tripId, ...REAL_PLAN, arrAt: { not: null } },
      select: { fromStopId: true, toStopId: true, depIsHome: true, arrIsHome: true, arrAt: true },
    }),
  ]);
  const next = grownEndDate(trip.endDate, softEndDate({ stops, transports, homeTimezone: trip.homeTimezone }));
  if (!next) return null;
  const { count } = await tx.trip.updateMany({
    where: { id: tripId, OR: [{ endDate: null }, { endDate: { lt: next } }] },
    data: { endDate: next },
  });
  return count > 0 ? next : null;
}

/**
 * The extra revalidation scope a grown window needs: the trip layout shows
 * the date range (and "trip" also covers /trips). Spread after the action's
 * own scopes: `revalidateTrip(tripId, "plan", ...tripWindowScopes(grownTo))`.
 */
export function tripWindowScopes(grownTo: string | null): TripScope[] {
  return grownTo ? ["trip"] : [];
}
```

`prisma/schema.prisma:451`: change the comment only. Before:
`  endDate      String? // "YYYY-MM-DD" — soft; auto-extends to cover scheduled stops`
After:
`  endDate      String? // "YYYY-MM-DD" — soft; only grows, to cover scheduled stops and the return leg home (F4, server/actions/trip-window.ts)`

- [ ] **Step 4: Run it, expect PASS.** The same integration command passes, 4 tests.
- [ ] **Step 5: Task-done check.** `npx vitest related --run server/actions/trip-window.ts lib/soft-end.ts` + `npx tsc --noEmit` + `npx eslint server/actions/trip-window.ts test/integration/soft-end-date.test.ts` + the integration file above.
- [ ] **Step 6: Commit** `server/actions/trip-window.ts`, `prisma/schema.prisma`, `test/integration/soft-end-date.test.ts` with the message `feat(trip): growTripEndTx stores the soft end, real plan only, never shrinks (F4)`

---

### Task B.3: The three inline grows become the helper

`applyStopDates`, `firmUpSegment` and `firmUpTrip` stop computing the end themselves. The firm-ups keep setting `startDate` when it was null, but now only on the real plan (Notes, decision 1).

**Files:**
- Modify: `server/actions/stops.ts:23-24` (imports), `:771`, `:819`, `:826-830`, `:841` (`applyStopDates`); `:965-977`, `:1010` (`firmUpSegment`); `:1094-1102`, `:1150` (`firmUpTrip`)
- Test: `server/actions/stops.test.ts` (mock block after `:226`; assertions at `:1637`, `:1795-1797`; new tests), `server/actions/firm-up-trip.test.ts` (mock block; assertion at `:76-79`)

**Interfaces:**
- Consumes: `growTripEndTx`, `tripWindowScopes` (B.2).
- Produces: nothing new.

- [ ] **Step 1: Write the failing test.**

In `server/actions/stops.test.ts`, add after the `vi.mock("@/lib/surprise-guard", …)` block (`:221-225`):

```ts
// F4: the soft-end rule is tested on its own (lib/soft-end.test.ts) and
// against Postgres (test/integration/soft-end-date.test.ts); here we only
// check that each dating write runs it for its plan, and revalidates the
// layout when it grew.
const growTripEndTxMock = vi.hoisted(() => vi.fn(async (): Promise<string | null> => null));
vi.mock("@/server/actions/trip-window", () => ({
  growTripEndTx: growTripEndTxMock,
  tripWindowScopes: (g: string | null) => (g ? ["trip"] : []),
}));
```

Rewrite the mocks, keeping each test's intent:
- `stops.test.ts:1636-1637`. Before:
  ```ts
      // The trip window grows to cover s2's pushed depart (06-09), not just s1's own.
      expect(tripUpdateMock).toHaveBeenCalledWith({ where: { id: "trip-1" }, data: { endDate: "2026-06-09" } });
  ```
  After:
  ```ts
      // The trip window grows through the one soft-end rule (F4), inside the
      // same transaction, after the pushes landed — no inline Trip write.
      expect(growTripEndTxMock).toHaveBeenCalledWith(expect.anything(), "trip-1", null);
      expect(stopUpdateMock.mock.invocationCallOrder.at(-1)!).toBeLessThan(growTripEndTxMock.mock.invocationCallOrder[0]);
      expect(tripUpdateMock).not.toHaveBeenCalled();
  ```
- `stops.test.ts:1795-1797`. Before:
  ```ts
      // The trip's window grows to cover the last flowed depart (venice → 2026-07-15);
      // the existing startDate (2026-07-03) is preserved.
      expect(tripUpdateMock).toHaveBeenCalledWith({ where: { id: "trip-1" }, data: { startDate: "2026-07-03", endDate: "2026-07-15", roughMonth: null } });
  ```
  After:
  ```ts
      // The existing startDate (2026-07-03) is preserved — no Trip write of its
      // own; the end grows through the one soft-end rule (F4).
      expect(tripUpdateMock).not.toHaveBeenCalled();
      expect(growTripEndTxMock).toHaveBeenCalledWith(expect.anything(), "trip-1", null);
  ```

Add at the end of `describe("setStopDates …")` (the block holding `:1605`):

```ts
  it("a grown window also revalidates the trip layout (F4)", async () => {
    stopFindUniqueMock
      .mockResolvedValueOnce({ id: "s1", tripId: "trip-1", sortOrder: 0, arriveDate: "2026-06-01", departDate: "2026-06-03", nights: null, pinned: false, forkId: null })
      .mockResolvedValueOnce({ name: "S1", country: null, arriveDate: "2026-06-01", departDate: "2026-06-03", nights: null });
    stopFindManyMock.mockResolvedValue([]);
    stopUpdateMock.mockResolvedValue({});
    growTripEndTxMock.mockResolvedValueOnce("2026-06-08");

    await setStopDates("s1", { arriveDate: "2026-06-01", departDate: "2026-06-08" });

    expect(revalidateTripMock).toHaveBeenCalledWith("trip-1", "plan", "trip");
  });

  it("a Fork Stop's re-date passes its Fork (the rule leaves the Trip window alone)", async () => {
    stopFindUniqueMock
      .mockResolvedValueOnce({ id: "f1", tripId: "trip-1", sortOrder: 0, arriveDate: "2026-06-01", departDate: "2026-06-03", nights: null, pinned: false, forkId: "fork-9" })
      .mockResolvedValueOnce({ name: "F1", country: null, arriveDate: "2026-06-01", departDate: "2026-06-03", nights: null });
    stopFindManyMock.mockResolvedValue([]);
    stopUpdateMock.mockResolvedValue({});

    await setStopDates("f1", { arriveDate: "2026-06-01", departDate: "2026-06-30" });

    expect(growTripEndTxMock).toHaveBeenCalledWith(expect.anything(), "trip-1", "fork-9");
    expect(tripUpdateMock).not.toHaveBeenCalled();
  });
```

Add to `describe("firmUpTrip", …)` at `:2979`:

```ts
  it("a Fork's firm-up writes nothing to the Trip window — not even a first start date (F4)", async () => {
    tripFindUniqueMock.mockResolvedValue({ startDate: null, endDate: null });
    stopFindManyMock.mockResolvedValue([
      { id: "rome", sortOrder: 0, chapterId: null, nights: 3, pinned: false, arriveDate: null, departDate: null, timezone: null, name: "Rome", country: "Italy" },
    ]);
    stopUpdateMock.mockResolvedValue({});

    await firmUpTrip("trip-1", "2026-07-01", "fork-9");

    expect(tripUpdateMock).not.toHaveBeenCalled();
    expect(growTripEndTxMock).not.toHaveBeenCalled();
  });
```

Add to `describe("firmUpSegment", …)` at `:1775`:

```ts
  it("a Fork's segment firm-up writes nothing to the Trip window (F4)", async () => {
    tripFindUniqueMock.mockResolvedValue({ startDate: null, endDate: null });
    stopFindManyMock.mockResolvedValue([
      { id: "fr", sortOrder: 0, chapterId: null, nights: 3, pinned: false, arriveDate: null, departDate: null, timezone: null, name: "Rome", country: "Italy" },
    ]);
    stopUpdateMock.mockResolvedValue({});

    await firmUpSegment({ tripId: "trip-1", chapterId: null, anchorDate: "2026-07-01", forkId: "fork-9" });

    expect(tripUpdateMock).not.toHaveBeenCalled();
    expect(growTripEndTxMock).not.toHaveBeenCalled();
  });
```

In `server/actions/firm-up-trip.test.ts`, add the same `growTripEndTxMock` + `vi.mock("@/server/actions/trip-window", …)` block after its `vi.mock("@/lib/db", …)`. Then rewrite `:76-79`. Before:
```ts
    expect(tripUpdateMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "trip-1" },
      data: expect.objectContaining({ endDate: "2026-07-06" }),
    }));
```
After:
```ts
    // The trip already starts 07-01 (no Trip write of its own); the end grows
    // through the one soft-end rule (F4).
    expect(tripUpdateMock).not.toHaveBeenCalled();
    expect(growTripEndTxMock).toHaveBeenCalledWith(expect.anything(), "trip-1", null);
```

- [ ] **Step 2: Run it, expect FAIL.** `npx vitest run server/actions/stops.test.ts server/actions/firm-up-trip.test.ts`. Expect 7 failures:
  - The 3 rewritten assertions fail with `expected "spy" to be called with arguments: [Anything, "trip-1", null]` (0 calls), or with `tripUpdateMock` having been called.
  - The 2 new setStopDates tests fail with no `growTripEndTx` call, and revalidation is `("trip-1","plan")`.
  - The 2 Fork firm-up tests fail because `tripUpdateMock` was called.
- [ ] **Step 3: Implement** in `server/actions/stops.ts`.

Imports (`:23-24`): add after the `stop-flow` import:
```ts
import { growTripEndTx, tripWindowScopes } from "@/server/actions/trip-window";
```

`applyStopDates`:
- `:771` before `  let maxDepart = dates.departDate;`, after `  let grownTo: string | null = null;`
- `:819` delete `      if (r.departDate > maxDepart) maxDepart = r.departDate;`
- `:826-830` before:
  ```ts
      // Auto-grow the trip window; never shrink endDate.
      const trip = await tx.trip.findUnique({ where: { id: stop.tripId }, select: { endDate: true } });
      if (!trip?.endDate || trip.endDate < maxDepart) {
        await tx.trip.update({ where: { id: stop.tripId }, data: { endDate: maxDepart } });
      }
  ```
  After:
  ```ts
      // F4: the soft end grows to cover the plan home (real plan only; never shrinks).
      grownTo = await growTripEndTx(tx, stop.tripId, stop.forkId);
  ```
- `:841` before `  revalidateTrip(stop.tripId, "plan");`, after `  revalidateTrip(stop.tripId, "plan", ...tripWindowScopes(grownTo));`

`firmUpSegment` `:965-977`. Before (from the `// Grow the trip's window …` comment to the closing `}` of `if (newStart !== …)`):
```ts
  // Grow the trip's window to cover the freshly-dated segment. Without this any
  // stop dated past the current endDate silently drops out of every dated view
  // (calendar/day/today/print/share) and the budget. Only set startDate when it
  // was null (a date-less trip firmed up for the first time) — never move an
  // existing start; never shrink endDate.
  const firstArrive = results[0].arriveDate;
  const lastDepart = results[results.length - 1].departDate;
  const newStart = trip?.startDate ?? firstArrive;
  const newEnd = !trip?.endDate || trip.endDate < lastDepart ? lastDepart : trip.endDate;
  if (newStart !== trip?.startDate || newEnd !== trip?.endDate) {
    // A Rough month falls away once the Trip has a start date (CONTEXT.md).
    await db.trip.update({ where: { id: tripId }, data: { startDate: newStart, endDate: newEnd, roughMonth: null } });
  }
```
After:
```ts
  // Grow the trip's window to cover the freshly-dated segment. Without this any
  // stop dated past the current endDate silently drops out of every dated view
  // (calendar/day/today/print/share) and the budget. Only set startDate when it
  // was null (a date-less trip firmed up for the first time) — never move an
  // existing start; the end grows by the one soft-end rule (F4), never shrinks.
  // Real plan only: a Fork doesn't own the Trip window.
  let grownTo: string | null = null;
  if (plan === null) {
    if (!trip?.startDate) {
      // A Rough month falls away once the Trip has a start date (CONTEXT.md).
      await db.trip.update({ where: { id: tripId }, data: { startDate: results[0].arriveDate, roughMonth: null } });
    }
    grownTo = await growTripEndTx(db, tripId, plan);
  }
```
(The `firstArrive` and `lastDepart` declared at `:997-998` inside the `else` branch stay. They shadowed the removed outer ones.)
`:1010` before `  revalidateTrip(tripId, "plan");`, after `  revalidateTrip(tripId, "plan", ...tripWindowScopes(grownTo));`. Only the final return's revalidate changes. The early return at `:918` has written nothing.

`firmUpTrip` `:1094-1102`. Before:
```ts
  // Grow the trip window: never shrink endDate; only set startDate when it was null.
  let maxDepart = anchor;
  for (const d of datedById.values()) if (d.departDate > maxDepart) maxDepart = d.departDate;
  const newStart = trip?.startDate ?? anchor;
  const newEnd = !trip?.endDate || trip.endDate < maxDepart ? maxDepart : trip.endDate;
  if (newStart !== trip?.startDate || newEnd !== trip?.endDate) {
    // A Rough month falls away once the Trip has a start date (CONTEXT.md).
    await db.trip.update({ where: { id: tripId }, data: { startDate: newStart, endDate: newEnd, roughMonth: null } });
  }
```
After:
```ts
  // Grow the trip window: only set startDate when it was null; the end grows
  // by the one soft-end rule (F4), never shrinks. Real plan only.
  let grownTo: string | null = null;
  if (plan === null) {
    if (!trip?.startDate) {
      // A Rough month falls away once the Trip has a start date (CONTEXT.md).
      await db.trip.update({ where: { id: tripId }, data: { startDate: anchor, roughMonth: null } });
    }
    grownTo = await growTripEndTx(db, tripId, plan);
  }
```
`:1150` before `  revalidateTrip(tripId, "plan");`, after `  revalidateTrip(tripId, "plan", ...tripWindowScopes(grownTo));`. The early return at `:1046` is unchanged.

- [ ] **Step 4: Run it, expect PASS.** `npx vitest run server/actions/stops.test.ts server/actions/firm-up-trip.test.ts` passes. The existing `firmUpTrip` rough-month test (`:2980-2995`, real plan, `startDate: null`) still sees `data: objectContaining({ roughMonth: null, startDate: "2026-07-01" })`.
- [ ] **Step 5: Task-done check.** `npx vitest related --run server/actions/stops.ts` + `npx tsc --noEmit` + `npx eslint server/actions/stops.ts server/actions/stops.test.ts server/actions/firm-up-trip.test.ts`. If a suite that `related` pulls in fails with `Cannot read properties of undefined (reading 'findMany')` on `tx.transport`, it runs these actions against a mocked `db` without the helper mock. Add the same `vi.mock("@/server/actions/trip-window", …)` block to it, and keep its assertions.
- [ ] **Step 6: Commit** `server/actions/stops.ts`, `server/actions/stops.test.ts`, `server/actions/firm-up-trip.test.ts` with the message `refactor(stops): date edits and firm-ups grow the end through growTripEndTx (F4)`

---

### Task B.4: Stop writes that dated without growing now grow

These writes now grow the end: `createStop` (both scheduled paths), the scheduled `updateStop`, `restoreStops`, and `reflowSpanTx`, which also covers `reorderStops` and `reorderChapters`.

**Files:**
- Modify: `server/actions/stops.ts:166`, `:261-263`, `:267` (insert path); `:363`, `:381-382`, `:386` (append path); `:494`, `:516`, `:521` (`updateStop`); `:1336`, `:1368`, `:1377` (`reorderStops`); `:1534`, `:1564`, `:1567` (`restoreStops`)
- Modify: `server/actions/stop-flow.ts:232-260` (`reflowSpanTx`) and imports `:1-9`
- Modify: `server/actions/chapters.ts:227-233` (`reorderChapters`) and imports
- Test: `server/actions/stops.test.ts` (new tests), `server/actions/chapters.test.ts` (mock block + new test), `test/integration/soft-end-date.test.ts` (new `describe`)

**Interfaces:**
- Consumes: `growTripEndTx`, `tripWindowScopes` (B.2); the `growTripEndTxMock` block in `stops.test.ts` (B.3).
- Produces: `reflowSpanTx(...)` resolves to `{ changed; conflicts; payload; grownTo: string | null }`.

- [ ] **Step 1: Write the failing test.**

`server/actions/stops.test.ts`, a new `describe` after `describe("createStop", …)` (which ends before `:666`):

```ts
describe("F4: dating Stop writes grow the soft end", () => {
  it("createStop (scheduled, append) runs the rule for its plan inside the create's transaction", async () => {
    stopFindFirstMock.mockResolvedValue(null);
    stopCreateMock.mockResolvedValue({ id: "stop-1" });
    growTripEndTxMock.mockResolvedValueOnce("2026-07-05");

    await createStop("trip-1", VALID_INPUT);

    expect(growTripEndTxMock).toHaveBeenCalledWith(expect.anything(), "trip-1", null);
    expect(stopCreateMock.mock.invocationCallOrder[0]).toBeLessThan(growTripEndTxMock.mock.invocationCallOrder[0]);
    expect(revalidateTripMock).toHaveBeenCalledWith("trip-1", "plan", "trip");
  });

  it("createStop (scheduled, insert after an anchor) runs it too", async () => {
    queryRawMock.mockResolvedValue([{ id: "a", sortOrder: 0, chapterId: null, chapterSortOrder: null, arriveDate: "2026-06-25" }]);
    stopCreateMock.mockResolvedValue({ id: "stop-2" });
    chapterFindManyMock.mockResolvedValue([]);

    await createStop("trip-1", VALID_INPUT, undefined, "a");

    expect(growTripEndTxMock).toHaveBeenCalledWith(expect.anything(), "trip-1", null);
  });

  it("a rough createStop dates nothing, so it doesn't run the rule", async () => {
    stopFindFirstMock.mockResolvedValue(null);
    stopCreateMock.mockResolvedValue({ id: "stop-r" });

    await createStop("trip-1", { mode: "rough", name: "Paris", nights: 2 });

    expect(growTripEndTxMock).not.toHaveBeenCalled();
  });

  it("updateStop (scheduled) runs the rule for the Stop's plan", async () => {
    stopFindUniqueMock.mockResolvedValue({ id: "stop-1", tripId: "trip-1", forkId: null, sortOrder: 0, arriveDate: "2026-07-01", departDate: "2026-07-05", nights: null, pinned: false });
    stopUpdateMock.mockResolvedValue({});
    chapterFindManyMock.mockResolvedValue([]);

    await updateStop("stop-1", { departDate: "2026-07-09" });

    expect(growTripEndTxMock).toHaveBeenCalledWith(expect.anything(), "trip-1", null);
  });

  it("reorderStops runs it through the reflow", async () => {
    chapterFindManyMock.mockResolvedValue([]);
    queryRawMock.mockResolvedValue([{ id: "a", tripId: "t1", arriveDate: null }]);
    stopUpdateMock.mockResolvedValue({});

    await reorderStops("t1", [{ id: "a", chapterId: null }]);

    expect(growTripEndTxMock).toHaveBeenCalledWith(expect.anything(), "t1", null);
  });

  it("restoreStops (Undo) runs it after the verbatim writes", async () => {
    stopFindManyMock.mockResolvedValue([{ id: "a", tripId: "t1", forkId: null }]);
    queryRawMock.mockResolvedValue([{ id: "a" }]);
    stopUpdateMock.mockResolvedValue({});
    chapterFindManyMock.mockResolvedValue([]);
    growTripEndTxMock.mockResolvedValueOnce("2026-07-09");

    await restoreStops([{ id: "a", sortOrder: 0, chapterId: null, arriveDate: "2026-07-01", departDate: "2026-07-09" }]);

    expect(growTripEndTxMock).toHaveBeenCalledWith(expect.anything(), "t1", null);
    expect(revalidateTripMock).toHaveBeenCalledWith("t1", "plan", "trip");
  });
});
```

`server/actions/chapters.test.ts`: add the `growTripEndTxMock` + `vi.mock("@/server/actions/trip-window", …)` block (exactly as in B.3) after `vi.mock("@/lib/activity-record", …)` (`:116`). Then add to `describe("reorderChapters", …)` (`:509`):

```ts
  it("runs the soft-end rule through the reflow and revalidates the layout when it grew (F4)", async () => {
    chapterFindManyMock.mockResolvedValue([
      { id: "c1", startDate: null, forkId: null },
      { id: "c2", startDate: null, forkId: null },
    ]);
    stopFindManyMock.mockResolvedValue([]);
    tripFindUniqueMock.mockResolvedValue({ startDate: null });
    queryRawMock.mockResolvedValue([]);
    growTripEndTxMock.mockResolvedValueOnce("2026-07-20");

    await reorderChapters("t1", ["c2", "c1"]);

    expect(growTripEndTxMock).toHaveBeenCalledWith(expect.anything(), "t1", null);
    expect(revalidateTripMock).toHaveBeenCalledWith("t1", "plan", "trip");
  });
```

`test/integration/soft-end-date.test.ts`: add the action import next to the existing ones:
```ts
import { createStop, updateStop } from "@/server/actions/stops";
```
Then add inside the outer `describe`, after `describe("growTripEndTx", …)`:

```ts
  describe("Stop actions", () => {
    it("createStop (scheduled) past the end grows it; a rough one doesn't", async () => {
      expect(await createStop(TRIP_ID, { mode: "rough", name: "Kyoto", nights: 3 })).toMatchObject({ success: true });
      expect(await endDate()).toBe("2026-12-11");
      expect(await createStop(TRIP_ID, {
        mode: "scheduled", name: "Sapporo", country: "Japan", timezone: "Asia/Tokyo",
        arriveDate: "2026-12-11", departDate: "2026-12-14", lat: 43.06, lng: 141.35,
      })).toMatchObject({ success: true });
      expect(await endDate()).toBe("2026-12-14");
    });

    it("updateStop moving the last depart later grows the end; moving it back doesn't shrink it", async () => {
      expect(await updateStop(tokyoId, { departDate: "2026-12-13" })).toEqual({ success: true });
      expect(await endDate()).toBe("2026-12-13");
      expect(await updateStop(tokyoId, { departDate: "2026-12-10" })).toEqual({ success: true });
      expect(await endDate()).toBe("2026-12-13");
    });
  });
```

- [ ] **Step 2: Run it, expect FAIL.**
  - `npx vitest run server/actions/stops.test.ts server/actions/chapters.test.ts`: 6 new tests fail with `growTripEndTx` not called, or the revalidate call lacks `"trip"`. The rough-create test passes already, and stays as the guard.
  - `TZ=UTC npx vitest run --config vitest.integration.config.ts test/integration/soft-end-date.test.ts`: the two Stop-action tests fail. They expect `"2026-12-14"` and `"2026-12-13"` and receive `"2026-12-11"`.
- [ ] **Step 3: Implement.**

`server/actions/stop-flow.ts`: add `import { growTripEndTx } from "@/server/actions/trip-window";` after `:9`. In `reflowSpanTx` (`:232-260`):
- The return type changes. Before:
  `): Promise<{ changed: { id: string; arriveDate: string; departDate: string }[]; conflicts: FlowConflict[]; payload: PayloadShiftResult }> {`
  After:
  `): Promise<{ changed: { id: string; arriveDate: string; departDate: string }[]; conflicts: FlowConflict[]; payload: PayloadShiftResult; grownTo: string | null }> {`
- `:254-259`. Before:
  ```ts
    await recomputeChapterSpans(tx, tripId, forkId);
    return {
      changed: changedResults.map((r) => ({ id: r.id, arriveDate: r.arriveDate, departDate: r.departDate })),
      conflicts,
      payload,
    };
  ```
  After:
  ```ts
    await recomputeChapterSpans(tx, tripId, forkId);
    // F4: the soft end covers the re-dated plan (real plan only; never shrinks).
    const grownTo = await growTripEndTx(tx, tripId, forkId);
    return {
      changed: changedResults.map((r) => ({ id: r.id, arriveDate: r.arriveDate, departDate: r.departDate })),
      conflicts,
      payload,
      grownTo,
    };
  ```
- Change the doc comment's last sentence (`:229-230`). Before: `Gap-preserving; never changes the trip's overall length.` After: `Gap-preserving; never changes the trip's overall length (the soft end still runs, F4, in case a conflict pushed past it).`

`server/actions/stops.ts`:
- **Insert path.** Before `:166` `    const created = await db.$transaction(async (tx) => {`, add `    let grownTo: string | null = null;`. At `:261-263`. Before:
  ```ts
        // ADR 0073: a dated Trip's only Stop takes the Trip's dates.
        await scheduleLoneStopTx(tx, tripId, plan, "fill");
        return createdScheduled;
  ```
  After:
  ```ts
        // ADR 0073: a dated Trip's only Stop takes the Trip's dates.
        await scheduleLoneStopTx(tx, tripId, plan, "fill");
        // F4: the soft end covers the new Stop (real plan only; never shrinks).
        grownTo = await growTripEndTx(tx, tripId, plan);
        return createdScheduled;
  ```
  At `:267`, `revalidateTrip(tripId, "plan");` becomes `revalidateTrip(tripId, "plan", ...tripWindowScopes(grownTo));`. This line is shared with the rough insert, where `grownTo` stays null.
- **Append path (scheduled).** Before `:363` `  const created = await db.$transaction(async (tx) => {`, add `  let grownTo: string | null = null;`. At `:381-382`, after `    await scheduleLoneStopTx(tx, tripId, plan, "fill");` add `    grownTo = await growTripEndTx(tx, tripId, plan);`. At `:386`, `revalidateTrip(tripId, "plan");` becomes `revalidateTrip(tripId, "plan", ...tripWindowScopes(grownTo));`.
- **`updateStop` scheduled.** Before `:494` `  const updated = await db.$transaction(async (tx) => {`, add `  let grownTo: string | null = null;`. At `:516`, after `    await recomputeChapterSpans(tx, stop.tripId, stop.forkId);` add `    grownTo = await growTripEndTx(tx, stop.tripId, stop.forkId);`. At `:521`, `revalidateTrip(stop.tripId, "plan");` becomes `revalidateTrip(stop.tripId, "plan", ...tripWindowScopes(grownTo));`.
- **`reorderStops`.** Next to `let payload…` (`:1336`), add `  let grownTo: string | null = null;`. After `      payload = reflow.payload;` (`:1368`), add `      grownTo = reflow.grownTo;`. At `:1377`, `revalidateTrip(tripId, "plan");` becomes `revalidateTrip(tripId, "plan", ...tripWindowScopes(grownTo));`.
- **`restoreStops`.** Before `:1534` `  await db.$transaction(async (tx) => {`, add `  let grownTo: string | null = null;`. At `:1564`, after `    await recomputeChapterSpans(tx, tripId, restoreForkId);` add `    grownTo = await growTripEndTx(tx, tripId, restoreForkId);`. At `:1567`, `revalidateTrip(tripId, "plan");` becomes `revalidateTrip(tripId, "plan", ...tripWindowScopes(grownTo));`.

`server/actions/chapters.ts`: add `import { tripWindowScopes } from "@/server/actions/trip-window";` beside the `stop-flow` import. Next to `let payload: PayloadShiftResult | undefined;` (`:204`), add `  let grownTo: string | null = null;`. After `    payload = reflow.payload;` (`:230`), add `    grownTo = reflow.grownTo;`. At `:233`, `revalidateTrip(tripId, "plan");` becomes `revalidateTrip(tripId, "plan", ...tripWindowScopes(grownTo));`.

- [ ] **Step 4: Run it, expect PASS.** Both commands from Step 2 pass.
- [ ] **Step 5: Task-done check.** `npx vitest related --run server/actions/stops.ts server/actions/stop-flow.ts server/actions/chapters.ts` + `npx tsc --noEmit` + `npx eslint server/actions/stops.ts server/actions/stop-flow.ts server/actions/chapters.ts server/actions/stops.test.ts server/actions/chapters.test.ts test/integration/soft-end-date.test.ts` + the integration file. Same rule as B.3: a `related` suite that now reaches `reflowSpanTx` against a mocked `db` (for example `stop-flow.lone-stop.test.ts`, if it does) gets the `trip-window` mock block, with its assertions kept.
- [ ] **Step 6: Commit** `server/actions/stops.ts`, `server/actions/stop-flow.ts`, `server/actions/chapters.ts`, `server/actions/stops.test.ts`, `server/actions/chapters.test.ts`, `test/integration/soft-end-date.test.ts` with the message `fix(stops): creating, editing, dragging or undoing a dated Stop grows the soft end (F4)`

---

### Task B.5: Transport writes grow the end to the day the return leg lands

**Files:**
- Modify: `server/actions/transport.ts:19-20` (imports), after `:177` (end of `db.transport.create`), `:215`; after `:322` (end of `auditedUpdate`), `:385`
- Test: `server/actions/transport.test.ts` (mock block after `:169`, new tests), `test/integration/soft-end-date.test.ts` (new `describe`)

**Interfaces:**
- Consumes: `growTripEndTx`, `tripWindowScopes` (B.2).
- Produces: nothing new. `create_transport` / `update_transport` (MCP) and booking-import confirm inherit the behaviour.

- [ ] **Step 1: Write the failing test.**

`server/actions/transport.test.ts`: add after `vi.mock("@/lib/db", …)` (ends `:169`):

```ts
// F4: the rule itself is tested in lib/soft-end.test.ts and the integration
// tier; here only the wiring.
const growTripEndTxMock = vi.hoisted(() => vi.fn(async (): Promise<string | null> => null));
vi.mock("@/server/actions/trip-window", () => ({
  growTripEndTx: growTripEndTxMock,
  tripWindowScopes: (g: string | null) => (g ? ["trip"] : []),
}));
```

Then add a new `describe` after `describe("plan-scope: createTransport sortOrder", …)`:

```ts
describe("F4: a dated leg grows the soft end", () => {
  it("createTransport runs the rule for its plan after the write", async () => {
    transportFindFirstMock.mockResolvedValue(null);
    transportCreateMock.mockResolvedValue({ id: "t-1" });

    await createTransport("trip-1", VALID_INPUT);

    expect(growTripEndTxMock).toHaveBeenCalledWith(expect.anything(), "trip-1", null);
    expect(transportCreateMock.mock.invocationCallOrder[0]).toBeLessThan(growTripEndTxMock.mock.invocationCallOrder[0]);
    expect(revalidateTripMock).toHaveBeenCalledWith("trip-1", "plan", "money");
  });

  it("createTransport revalidates the layout when the window grew", async () => {
    transportFindFirstMock.mockResolvedValue(null);
    transportCreateMock.mockResolvedValue({ id: "t-1" });
    growTripEndTxMock.mockResolvedValueOnce("2026-12-12");

    await createTransport("trip-1", VALID_INPUT);

    expect(revalidateTripMock).toHaveBeenCalledWith("trip-1", "plan", "money", "trip");
  });

  it("a Fork leg passes its Fork (the rule leaves the Trip window alone)", async () => {
    transportFindFirstMock.mockResolvedValue(null);
    transportCreateMock.mockResolvedValue({ id: "t-1" });

    await createTransport("trip-1", VALID_INPUT, "fork-9");

    expect(growTripEndTxMock).toHaveBeenCalledWith(expect.anything(), "trip-1", "fork-9");
  });

  it("updateTransport runs the rule for the leg's plan after the write", async () => {
    transportFindUniqueMock.mockResolvedValue({ id: "t-1", tripId: "trip-1", forkId: null });
    transportUpdateMock.mockResolvedValue({ id: "t-1", tripId: "trip-1" });
    growTripEndTxMock.mockResolvedValueOnce("2026-12-12");

    await updateTransport("t-1", { mode: "FLIGHT" });

    expect(growTripEndTxMock).toHaveBeenCalledWith(expect.anything(), "trip-1", null);
    expect(transportUpdateMock.mock.invocationCallOrder[0]).toBeLessThan(growTripEndTxMock.mock.invocationCallOrder[0]);
    expect(revalidateTripMock).toHaveBeenCalledWith("trip-1", "plan", "money", "trip");
  });
});
```

`test/integration/soft-end-date.test.ts`: add the action import next to the existing ones:
```ts
import { createTransport, updateTransport } from "@/server/actions/transport";
```
Then add inside the outer `describe`:

```ts
  describe("Transport actions (the spec scenario)", () => {
    it("a return leg leaving Tokyo 11 Dec 22:00 and landing Brisbane 12 Dec 08:30 local ends the Trip on 12 Dec", async () => {
      const r = await createTransport(TRIP_ID, {
        mode: "FLIGHT", fromStopId: tokyoId, arrIsHome: true,
        depAt: "2026-12-11T22:00", arrAt: "2026-12-12T08:30",
      });
      expect(r).toMatchObject({ success: true });
      const leg = await db.transport.findUnique({ where: { id: (r as { id: string }).id } });
      // Typed in the Home base's zone (AEST, +10): the UTC instant is still 11 Dec.
      expect(leg?.arrAt?.toISOString()).toBe("2026-12-11T22:30:00.000Z");
      expect(await endDate()).toBe("2026-12-12");
    });

    it("dating an existing return leg with updateTransport grows the end; moving it earlier doesn't shrink it", async () => {
      const leg = await db.transport.create({ data: { tripId: TRIP_ID, mode: "FLIGHT", fromStopId: tokyoId, arrIsHome: true } });
      expect(await updateTransport(leg.id, { arrAt: "2026-12-12T08:30" })).toEqual({ success: true });
      expect(await endDate()).toBe("2026-12-12");
      expect(await updateTransport(leg.id, { arrAt: "2026-12-11T20:00" })).toEqual({ success: true });
      expect(await endDate()).toBe("2026-12-12");
    });

    it("a Fork's return leg leaves the Trip window alone", async () => {
      const fork = await db.fork.create({ data: { tripId: TRIP_ID, name: "Plan B", createdById: "it-user" } });
      const forkTokyo = await db.stop.create({ data: { tripId: TRIP_ID, forkId: fork.id, name: "Tokyo", timezone: "Asia/Tokyo", arriveDate: "2026-12-05", departDate: "2026-12-13", sortOrder: 0 } });
      expect(await createTransport(TRIP_ID, {
        mode: "FLIGHT", fromStopId: forkTokyo.id, arrIsHome: true, arrAt: "2026-12-14T08:30",
      }, fork.id)).toMatchObject({ success: true });
      expect(await endDate()).toBe("2026-12-11");
    });
  });
```

- [ ] **Step 2: Run it, expect FAIL.**
  - `npx vitest run server/actions/transport.test.ts`: the 4 new tests fail with `growTripEndTx` not called, or with revalidation lacking `"trip"`.
  - `TZ=UTC npx vitest run --config vitest.integration.config.ts test/integration/soft-end-date.test.ts`: the first two Transport tests fail. They expect `"2026-12-12"` and receive `"2026-12-11"`. The Fork test passes already, and stays as the guard.
- [ ] **Step 3: Implement** in `server/actions/transport.ts`.

Imports: after `:19` (`import { lockPlanTransportsTx } …`) add:
```ts
import { growTripEndTx, tripWindowScopes } from "@/server/actions/trip-window";
```

`createTransport`: directly after the `db.transport.create({ … })` statement (its closing `});` at `:177`) add:
```ts
  // F4: a dated return leg can push the soft end to the day it lands home
  // (real plan only; never shrinks — the helper's write is conditional).
  const grownTo = await growTripEndTx(db, tripId, plan);
```
At `:215`, `revalidateTrip(tripId, "plan", "money");` becomes `revalidateTrip(tripId, "plan", "money", ...tripWindowScopes(grownTo));`.

`updateTransport`: directly after the `await auditedUpdate("TRANSPORT", db.transport, transportId, { … }, transport.forkId ?? null, { before });` statement (ends `:322`) add:
```ts
  // F4: re-dating (or re-homing) a leg can push the soft end to the day it lands home.
  const grownTo = await growTripEndTx(db, transport.tripId, transport.forkId ?? null);
```
At `:385`, `revalidateTrip(transport.tripId, "plan", "money");` becomes `revalidateTrip(transport.tripId, "plan", "money", ...tripWindowScopes(grownTo));`.

`reorderTransports` and `deleteTransport` are unchanged: they date nothing, and the end never shrinks.

- [ ] **Step 4: Run it, expect PASS.** Both commands from Step 2 pass. The integration file now has 9 tests.
- [ ] **Step 5: Task-done check.** `npx vitest related --run server/actions/transport.ts` + `npx tsc --noEmit` + `npx eslint server/actions/transport.ts server/actions/transport.test.ts test/integration/soft-end-date.test.ts` + the integration file. If a `related` suite such as `lib/mcp/tools/*.test.ts` or `server/actions/booking-import.test.ts` runs `createTransport` against a mocked `db` and breaks on `tx.trip`/`db.stop` being undefined inside the helper, add the `trip-window` mock block to it and keep its assertions.
- [ ] **Step 6: Commit** `server/actions/transport.ts`, `server/actions/transport.test.ts`, `test/integration/soft-end-date.test.ts` with the message `fix(transport): the Trip runs to the day the return leg lands home (F4)`

---

### Task B.6: Promoting a Fork grows the window to the promoted plan

**Files:**
- Modify: `server/actions/forks.ts` imports; `:766` (before the `db.$transaction`), `:821`, `:834` (`promoteFork`)
- Test: `server/actions/forks.test.ts` (mock block after `:289`; new test in `describe("promoteFork")`)

**Interfaces:**
- Consumes: `growTripEndTx`, `tripWindowScopes` (B.2).
- Produces: nothing new.

- [ ] **Step 1: Write the failing test.** In `server/actions/forks.test.ts`, add after `vi.mock("@/lib/plan-reads", …)` (`:289`):

```ts
// F4: Forks don't own the Trip window; promotion is when a Fork's dates become
// the real plan's, so the soft end runs then (rule tested elsewhere).
const growTripEndTxMock = vi.hoisted(() => vi.fn(async (): Promise<string | null> => null));
vi.mock("@/server/actions/trip-window", () => ({
  growTripEndTx: growTripEndTxMock,
  tripWindowScopes: (g: string | null) => (g ? ["trip"] : []),
}));
```

In `describe("promoteFork")` → `describe("cache invalidation")` (`:1903`), add:

```ts
    it("grows the soft end to the promoted plan inside the transaction, after the Forks are gone (F4)", async () => {
      growTripEndTxMock.mockResolvedValueOnce("2026-10-18");

      await promoteFork("fork-9");

      expect(growTripEndTxMock).toHaveBeenCalledWith(expect.anything(), "trip-1", null);
      expect(forkDeleteManyMock.mock.invocationCallOrder[0]).toBeLessThan(growTripEndTxMock.mock.invocationCallOrder[0]);
      expect(revalidateTripMock).toHaveBeenCalledWith("trip-1", "plan", "money", "trip");
    });
```

- [ ] **Step 2: Run it, expect FAIL.** `npx vitest run server/actions/forks.test.ts`: the new test fails with `growTripEndTx` not called. The existing `revalidates the core trip paths after promotion` test still passes, because the mock returns null.
- [ ] **Step 3: Implement** in `server/actions/forks.ts`.
  - Add `import { growTripEndTx, tripWindowScopes } from "@/server/actions/trip-window";` with the other `@/server/actions/*` imports.
  - Before `  await db.$transaction(async (tx) => {` (the promotion transaction, `:766`), add `  let grownTo: string | null = null;`.
  - After `    await tx.fork.deleteMany({ where: { tripId } });` (`:821`), add:
    ```ts
        // F4: the promoted rows are now the real plan — the soft end covers them
        // (never shrinks; the Hard end date is untouched, ADR 0068).
        grownTo = await growTripEndTx(tx, tripId, null);
    ```
  - At `:834`, `revalidateTrip(tripId, "plan", "money");` becomes `revalidateTrip(tripId, "plan", "money", ...tripWindowScopes(grownTo));`.
- [ ] **Step 4: Run it, expect PASS.** `npx vitest run server/actions/forks.test.ts` passes.
- [ ] **Step 5: Task-done check.** `npx vitest related --run server/actions/forks.ts` + `npx tsc --noEmit` + `npx eslint server/actions/forks.ts server/actions/forks.test.ts`
- [ ] **Step 6: Commit** `server/actions/forks.ts`, `server/actions/forks.test.ts` with the message `fix(forks): promoting a what-if plan grows the Trip's soft end to it (F4)`
## Section C — F5 Home timezone change keeps Home-end local times

### Notes

**Produces (for later sections / the final gate):**
```ts
// lib/home-timezone-refile.ts (new)
export interface HomeLeg {
  id: string;
  depAt: Date | null;
  arrAt: Date | null;
  depIsHome: boolean;
  arrIsHome: boolean;
  fromTimezone: string | null; // fromStop?.timezone ?? null
  toTimezone: string | null;   // toStop?.timezone ?? null
}
export interface RefiledLeg { id: string; depAt?: Date; arrAt?: Date }
export function keepWallTime(instant: Date, fromZone: string, toZone: string): Date;
export function refileHomeEnds(legs: HomeLeg[], oldHomeTimezone: string | null, newHomeTimezone: string | null): RefiledLeg[];
export type RefileTx = Pick<Prisma.TransactionClient, "transport">;
export function refileHomeEndsTx(tx: RefileTx, tripId: string, oldHomeTimezone: string | null, newHomeTimezone: string | null): Promise<number>; // legs rewritten, all plans

// lib/activity.ts (added)
export function homeTimezoneSummary(to: string | null, keptLocalTimes: boolean): ActivitySummary;
```
`updateTrip` (server/actions/trips.ts) gains no new signature; behaviour: a save that actually changes `Trip.homeTimezone` re-files Home-end instants for the real plan and every Fork in the same transaction as the zone write, then records one Activity line.

**Assumes from earlier sections:**
- **Section B:** `growTripEndTx(tx: Prisma.TransactionClient, tripId: string): Promise<unknown>` — the one helper that grows `Trip.endDate` to cover the return leg's arrival date in the Home zone. Task C.4 calls it after re-filing, inside the same transaction, after the `homeTimezone` write. Import it from wherever section B put it (name assumed; if B named it differently, use B's export). If B has already added a `growTripEndTx` call to `updateTrip`'s transaction for the date-change path, keep **one** call at the end of the transaction guarded by `if (datesChanged || zoneMove)` rather than two. If B's helper module is mocked in `server/actions/trips.test.ts`, C.4's tests rely on that mock existing; if B didn't touch `trips.ts`, C.4 adds `vi.mock(<B's module>, () => ({ growTripEndTx: vi.fn().mockResolvedValue(undefined) }))`.
- **Section A:** changes how `updateTrip` *derives* `timezoneUpdate` (point-based). Section C reads only the final `timezoneUpdate` value and `before.homeTimezone`, so it works whichever rule produced the zone. A may also edit the `homeTimezone` `.describe()` in `lib/mcp/tools/trips-stops-write.ts:182` and the CONTEXT.md **Home base** sentence ("guessed from the country") — C.5/C.6 must merge onto A's wording, not revert it. Line numbers below are as of today, before A/B.

**Decisions where the spec is silent (with reason):**
1. **Which ends move: every end whose resolved zone changes, not only flagged Home ends.** Old and new zone per end come from `resolveEndpointZones` (`lib/time-display.ts:42`), the rule the write path (`server/actions/transport.ts:122,279`) and every display share. So an end is re-filed exactly when the zone it was typed in and the zone it is now shown in differ. That covers a Home end, and also a non-Home end with no Stop that borrowed the Home zone (`toStopId` null on a `depIsHome` leg). Without that second case, the typed time on that end would shift, which is the bug. Only legs with `depIsHome || arrIsHome` are read, because only they can change zone.
2. **null → zone (and zone → null) use the same rule.** While `homeTimezone` was null, a Home end was written and shown in the fallback zone: the other end's Stop zone, else UTC (`resolveEndpointZones`, ADR 0030 amendment 2026-10-14 point 2). The Traveller typed and saw times in that zone, so keeping the shown wall time means re-reading in the fallback and writing in the new zone. Clearing the Home base (zone → null) does the reverse, for the same reason. The 2026-10-14 amendment's "no stored leg times were rewritten" was a one-off migration note. It does not bind later changes, and the 2026-10-16 amendment says so.
3. **Fork scope:** the query is `where: { tripId, OR: [{ depIsHome: true }, { arrIsHome: true }] }` with no `forkId` filter, so it covers the real plan and every Fork (Home base is trip-wide, CONTEXT.md).
4. **Untimed ends:** a Transport end is either an instant or null. Booking import's date-only ends (BI-04) are stored with `depAt`/`arrAt` absent, i.e. null, so there is no stored date-only end. A null end is skipped. An instant's seconds are dropped when it is re-filed (`instantToZonedTime` is HH:MM). Every write path stores minute precision, so nothing is lost.
5. **DST gap:** a local time that does not exist in the new zone (e.g. Brisbane → Sydney, 2026-10-04 02:30) lands where `zonedWallTimeToInstant` puts it: the same instant, shown as 03:30. Verified in node: `zonedWallTimeToInstant("2026-10-04","02:30","Australia/Sydney")` = `2026-10-03T16:30Z`, which equals Brisbane's 02:30. The function reports no change for that end. Pinned in C.1.
6. **Activity: one trip-level line.** `updateTrip` records no Activity today, and "TRIP" is not an `ActivityEntityType`. So we follow `setChaptersEnabled`/`setForksEnabled` (`server/actions/trips.ts:713,749`): `verb: "UPDATED"`, `entityType: "TRANSPORT"` (the closest fit), `entityId: null`, `entityLabel: "Home timezone"`, `changes: homeTimezoneSummary(...)`, `surpriseOf: null` (it names no Surprise thing). It is recorded on **every** real zone change. The clause " — Home-end times kept as local times" is added when at least one end (any Plan) was re-filed. Per-leg writes record nothing: Forks stay silent, and one line says it. The feed reads "Cam changed the Home timezone to Australia/Brisbane — Home-end times kept as local times".
7. **"Changes" = actually different.** `zoneMove` is set only when `timezoneUpdate !== KEEP_TIMEZONE` and `(timezoneUpdate ?? null) !== (before.homeTimezone ?? null)`. Re-sending the same zone (the Settings form always sends it) does nothing new.
8. CONTEXT.md **Home base** gains one clause (C.6). It is the vocabulary record for what a Traveller sees. The ADR alone would leave the glossary silent on it.

**Review Focus candidates:**
1. A Trip with Home zone `Australia/Sydney`, a real-plan outbound leg departing Home at 06:10 local on 2026-12-10, and a Fork return leg arriving Home at 05:30 on 2026-12-26. `updateTrip(trip, { homeTimezone: "Australia/Brisbane" })` → both still read 06:10 / 05:30 in Brisbane. The instants move +1h (`2026-12-09T19:10Z` → `20:10Z`). The Lisbon ends, the Fork leg's null depAt and a non-Home leg are untouched. The Trip gets one Activity line. (C.4 integration test)
2. `homeTimezone` null and a Home departure typed as 06:10 with the far end in Lisbon (stored `06:10Z`). Set the zone to Brisbane → it still shows 06:10, now Brisbane time (`2026-12-09T20:10Z`). (C.1)
3. A save that re-sends the zone the Trip already has, or omits it → no re-file, no Activity, no transaction when the dates are unchanged either. (C.4)

**Feedback trailer:** Task C.6 (last of this section) carries `Resolves-Feedback: cmva4jnfk003l07lfhfbs92wb`. It completes the note together with sections A and B, which run earlier.

---

### Task C.1: Pure re-file of Home-end times (`refileHomeEnds`)

**Files:**
- Create: `lib/home-timezone-refile.ts`
- Test: `lib/home-timezone-refile.test.ts` (create)

**Interfaces:**
- Consumes: `resolveEndpointZones(fromTz, toTz, home?: { depIsHome?, arrIsHome?, homeTimezone? }): { depTz: string; arrTz: string }` (`lib/time-display.ts:42`); `zonedWallTimeToInstant(dateISO, hhmm, tz): Date`, `instantToZonedDateISO(instant, tz): string`, `instantToZonedTime(instant, tz): string` (`lib/tz.ts:396,345,416`).
- Produces: `HomeLeg`, `RefiledLeg`, `keepWallTime`, `refileHomeEnds` (signatures in Notes).

- [ ] **Step 1: Write the failing test** — `lib/home-timezone-refile.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { instantToZonedTime, zonedWallTimeToInstant } from "@/lib/tz";
import { keepWallTime, refileHomeEnds, type HomeLeg } from "./home-timezone-refile";

const SYD = "Australia/Sydney";
const BNE = "Australia/Brisbane";
const LIS = "Europe/Lisbon";
const at = (d: string, t: string, z: string) => zonedWallTimeToInstant(d, t, z);

const leg = (over: Partial<HomeLeg>): HomeLeg => ({
  id: "t1", depAt: null, arrAt: null, depIsHome: false, arrIsHome: false,
  fromTimezone: null, toTimezone: null, ...over,
});

describe("keepWallTime", () => {
  it("Sydney → Brisbane in December keeps 06:10 and moves the instant +1h (Sydney is on daylight time)", () => {
    const before = at("2026-12-10", "06:10", SYD);
    expect(before.toISOString()).toBe("2026-12-09T19:10:00.000Z");
    const after = keepWallTime(before, SYD, BNE);
    expect(after.toISOString()).toBe("2026-12-09T20:10:00.000Z");
    expect(instantToZonedTime(after, BNE)).toBe("06:10");
  });

  it("Sydney → Brisbane in July is the same offset, so the instant does not move", () => {
    const before = at("2026-07-10", "06:10", SYD);
    expect(keepWallTime(before, SYD, BNE).getTime()).toBe(before.getTime());
  });

  it("keeps the local date across midnight UTC (23:30 Sydney stays 23:30 on the 10th in Brisbane)", () => {
    const after = keepWallTime(at("2026-12-10", "23:30", SYD), SYD, BNE);
    expect(after.toISOString()).toBe("2026-12-10T13:30:00.000Z");
  });

  it("a local time that doesn't exist in the new zone (spring-forward gap) lands on the next valid time", () => {
    // 02:30 on 4 Oct 2026 doesn't exist in Sydney; Brisbane's 02:30 is the same instant as Sydney's 03:30.
    const before = at("2026-10-04", "02:30", BNE);
    const after = keepWallTime(before, BNE, SYD);
    expect(after.getTime()).toBe(before.getTime());
    expect(instantToZonedTime(after, SYD)).toBe("03:30");
  });

  it("the same zone returns the instant unchanged", () => {
    const i = at("2026-12-10", "06:10", SYD);
    expect(keepWallTime(i, SYD, SYD)).toBe(i);
  });
});

describe("refileHomeEnds", () => {
  it("re-files a Home departure and leaves the Stop arrival alone", () => {
    const depAt = at("2026-12-10", "06:10", SYD);
    const arrAt = at("2026-12-11", "07:15", LIS);
    const out = refileHomeEnds([leg({ depIsHome: true, toTimezone: LIS, depAt, arrAt })], SYD, BNE);
    expect(out).toEqual([{ id: "t1", depAt: at("2026-12-10", "06:10", BNE) }]);
  });

  it("re-files a Home arrival and leaves the Stop departure alone", () => {
    const depAt = at("2026-12-24", "09:00", LIS);
    const arrAt = at("2026-12-25", "21:40", SYD);
    const out = refileHomeEnds([leg({ arrIsHome: true, fromTimezone: LIS, depAt, arrAt })], SYD, BNE);
    expect(out).toEqual([{ id: "t1", arrAt: at("2026-12-25", "21:40", BNE) }]);
  });

  it("null → zone: a Home end typed in the fallback (the other end's Stop zone) keeps its shown time", () => {
    // With no Home zone the departure was written in Lisbon time (resolveEndpointZones' fallback).
    const depAt = at("2026-12-10", "06:10", LIS);
    expect(depAt.toISOString()).toBe("2026-12-10T06:10:00.000Z");
    const out = refileHomeEnds([leg({ depIsHome: true, toTimezone: LIS, depAt })], null, BNE);
    expect(out).toEqual([{ id: "t1", depAt: at("2026-12-10", "06:10", BNE) }]);
    expect(out[0].depAt!.toISOString()).toBe("2026-12-09T20:10:00.000Z");
  });

  it("null → zone with no Stop at either end: the fallback was UTC", () => {
    const depAt = at("2026-12-10", "06:10", "UTC");
    const out = refileHomeEnds([leg({ depIsHome: true, depAt })], null, BNE);
    expect(out).toEqual([{ id: "t1", depAt: at("2026-12-10", "06:10", BNE) }]);
  });

  it("zone → null (Home base cleared): a Home end falls back to the other end's zone and keeps its time", () => {
    const depAt = at("2026-12-10", "06:10", SYD);
    const out = refileHomeEnds([leg({ depIsHome: true, toTimezone: LIS, depAt })], SYD, null);
    expect(out).toEqual([{ id: "t1", depAt: at("2026-12-10", "06:10", LIS) }]);
  });

  it("a Stop-less far end that borrowed the Home zone moves with it", () => {
    // depIsHome, no toStop: the arrival is shown in the Home zone too (resolveEndpointZones).
    const depAt = at("2026-12-10", "06:10", SYD);
    const arrAt = at("2026-12-10", "08:20", SYD);
    const out = refileHomeEnds([leg({ depIsHome: true, depAt, arrAt })], SYD, BNE);
    expect(out).toEqual([{ id: "t1", depAt: at("2026-12-10", "06:10", BNE), arrAt: at("2026-12-10", "08:20", BNE) }]);
  });

  it("skips untimed ends and legs whose instants don't move", () => {
    const out = refileHomeEnds(
      [
        leg({ id: "untimed", depIsHome: true, toTimezone: LIS }), // depAt/arrAt null (e.g. a date-only import end)
        leg({ id: "winter", depIsHome: true, toTimezone: LIS, depAt: at("2026-07-10", "06:10", SYD) }), // same offset in July
      ],
      SYD,
      BNE,
    );
    expect(out).toEqual([]);
  });

  it("same zone before and after → nothing", () => {
    const out = refileHomeEnds([leg({ depIsHome: true, depAt: at("2026-12-10", "06:10", SYD) })], SYD, SYD);
    expect(out).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it, expect FAIL** — `npx vitest run lib/home-timezone-refile.test.ts` → fails with "Failed to resolve import "./home-timezone-refile"".

- [ ] **Step 3: Implement** — create `lib/home-timezone-refile.ts`:
```ts
/**
 * Home timezone change keeps Home-end local times (ADR 0030 amendment
 * 2026-10-16, spec 2026-10-16 F5). A Transport end's time is typed as a local
 * wall-clock time off a ticket and stored as an instant read in that end's
 * zone (lib/wall-time.ts). When the Trip's Home zone changes, every end whose
 * zone follows it keeps the local time it showed; only the instant moves.
 *
 * "Whose zone follows it" is decided by resolveEndpointZones, the one rule
 * the write path and every display share: an end is re-filed exactly when
 * the zone it was typed in and the zone it is now shown in differ.
 */
import { resolveEndpointZones } from "@/lib/time-display";
import { instantToZonedDateISO, instantToZonedTime, zonedWallTimeToInstant } from "@/lib/tz";

export interface HomeLeg {
  id: string;
  depAt: Date | null;
  arrAt: Date | null;
  depIsHome: boolean;
  arrIsHome: boolean;
  /** The departure Stop's zone (null: no Stop, or a rough Stop). */
  fromTimezone: string | null;
  /** The arrival Stop's zone. */
  toTimezone: string | null;
}

/** Only the ends that moved are present. */
export interface RefiledLeg { id: string; depAt?: Date; arrAt?: Date }

/** The instant showing the same local date and HH:MM in `toZone` as `instant` shows in `fromZone`. */
export function keepWallTime(instant: Date, fromZone: string, toZone: string): Date {
  if (fromZone === toZone) return instant;
  return zonedWallTimeToInstant(
    instantToZonedDateISO(instant, fromZone),
    instantToZonedTime(instant, fromZone),
    toZone,
  );
}

function moved(instant: Date | null, fromZone: string, toZone: string): Date | undefined {
  if (!instant) return undefined;
  const next = keepWallTime(instant, fromZone, toZone);
  return next.getTime() === instant.getTime() ? undefined : next;
}

/** The legs whose stored instants change when the Home zone goes from `oldHomeTimezone` to `newHomeTimezone`. */
export function refileHomeEnds(
  legs: HomeLeg[],
  oldHomeTimezone: string | null,
  newHomeTimezone: string | null,
): RefiledLeg[] {
  const out: RefiledLeg[] = [];
  for (const leg of legs) {
    const flags = { depIsHome: leg.depIsHome, arrIsHome: leg.arrIsHome };
    const before = resolveEndpointZones(leg.fromTimezone, leg.toTimezone, { ...flags, homeTimezone: oldHomeTimezone });
    const after = resolveEndpointZones(leg.fromTimezone, leg.toTimezone, { ...flags, homeTimezone: newHomeTimezone });
    const depAt = moved(leg.depAt, before.depTz, after.depTz);
    const arrAt = moved(leg.arrAt, before.arrTz, after.arrTz);
    if (depAt || arrAt) out.push({ id: leg.id, ...(depAt ? { depAt } : {}), ...(arrAt ? { arrAt } : {}) });
  }
  return out;
}
```

- [ ] **Step 4: Run it, expect PASS** — `npx vitest run lib/home-timezone-refile.test.ts` → all green.

- [ ] **Step 5: Task-done check** — `npx vitest related --run lib/home-timezone-refile.ts` + `npx tsc --noEmit` + `npx eslint lib/home-timezone-refile.ts lib/home-timezone-refile.test.ts`.

- [ ] **Step 6: Commit** — `lib/home-timezone-refile.ts`, `lib/home-timezone-refile.test.ts`; message `feat(tz): pure re-file of Home-end times that keeps their local time`.

---

### Task C.2: `refileHomeEndsTx` — read every Plan's Home legs and write the moved instants

**Files:**
- Modify: `lib/home-timezone-refile.ts` (append)
- Test: `lib/home-timezone-refile.test.ts` (append a `describe`)

**Interfaces:**
- Consumes: `refileHomeEnds`, `HomeLeg` (C.1); `Prisma.TransactionClient` from `@prisma/client` (as `server/actions/stop-flow.ts:1`, `lib/trip-slug-store.ts:5`).
- Produces: `export type RefileTx = Pick<Prisma.TransactionClient, "transport">;` and `export async function refileHomeEndsTx(tx: RefileTx, tripId: string, oldHomeTimezone: string | null, newHomeTimezone: string | null): Promise<number>`. It returns the number of legs rewritten.

- [ ] **Step 1: Write the failing test** — append to `lib/home-timezone-refile.test.ts` (add `vi` to the vitest import and `refileHomeEndsTx, type RefileTx` to the module import):
```ts
describe("refileHomeEndsTx", () => {
  function fakeTx(rows: unknown[]) {
    const findMany = vi.fn().mockResolvedValue(rows);
    const update = vi.fn().mockResolvedValue({});
    return { tx: { transport: { findMany, update } } as unknown as RefileTx, findMany, update };
  }

  it("reads every Plan's Home legs (no forkId filter) with their Stops' zones", async () => {
    const { tx, findMany } = fakeTx([]);
    await refileHomeEndsTx(tx, "trip-1", SYD, BNE);
    expect(findMany).toHaveBeenCalledWith({
      where: { tripId: "trip-1", OR: [{ depIsHome: true }, { arrIsHome: true }] },
      select: {
        id: true, depAt: true, arrAt: true, depIsHome: true, arrIsHome: true,
        fromStop: { select: { timezone: true } },
        toStop: { select: { timezone: true } },
      },
    });
  });

  it("writes only the ends that moved and returns how many legs it rewrote", async () => {
    const { tx, update } = fakeTx([
      { id: "out", depAt: at("2026-12-10", "06:10", SYD), arrAt: at("2026-12-11", "07:15", LIS), depIsHome: true, arrIsHome: false, fromStop: null, toStop: { timezone: LIS } },
      { id: "fork-ret", depAt: null, arrAt: at("2026-12-26", "05:30", SYD), depIsHome: false, arrIsHome: true, fromStop: { timezone: LIS }, toStop: null },
      { id: "winter", depAt: at("2026-07-10", "06:10", SYD), arrAt: null, depIsHome: true, arrIsHome: false, fromStop: null, toStop: { timezone: LIS } },
    ]);
    expect(await refileHomeEndsTx(tx, "trip-1", SYD, BNE)).toBe(2);
    expect(update).toHaveBeenCalledTimes(2);
    expect(update).toHaveBeenCalledWith({ where: { id: "out" }, data: { depAt: at("2026-12-10", "06:10", BNE) } });
    expect(update).toHaveBeenCalledWith({ where: { id: "fork-ret" }, data: { arrAt: at("2026-12-26", "05:30", BNE) } });
  });

  it("a Stop whose zone is null (rough) reads as no zone", async () => {
    const { tx, update } = fakeTx([
      { id: "t", depAt: at("2026-12-10", "06:10", "UTC"), arrAt: null, depIsHome: true, arrIsHome: false, fromStop: null, toStop: { timezone: null } },
    ]);
    expect(await refileHomeEndsTx(tx, "trip-1", null, BNE)).toBe(1);
    expect(update).toHaveBeenCalledWith({ where: { id: "t" }, data: { depAt: at("2026-12-10", "06:10", BNE) } });
  });
});
```

- [ ] **Step 2: Run it, expect FAIL** — `npx vitest run lib/home-timezone-refile.test.ts` → the new tests fail with ``refileHomeEndsTx` is not a function`` / missing export (TS import error).

- [ ] **Step 3: Implement** — append to `lib/home-timezone-refile.ts` (and add `import type { Prisma } from "@prisma/client";` to the imports):
```ts
export type RefileTx = Pick<Prisma.TransactionClient, "transport">;

/**
 * Re-file every Home-end time on the Trip, in the real plan and every Fork
 * (the Home base is trip-wide, CONTEXT.md), inside the caller's transaction.
 * Call it in the same transaction that writes the new `homeTimezone`.
 * Returns how many legs were rewritten.
 */
export async function refileHomeEndsTx(
  tx: RefileTx,
  tripId: string,
  oldHomeTimezone: string | null,
  newHomeTimezone: string | null,
): Promise<number> {
  const rows = await tx.transport.findMany({
    where: { tripId, OR: [{ depIsHome: true }, { arrIsHome: true }] },
    select: {
      id: true, depAt: true, arrAt: true, depIsHome: true, arrIsHome: true,
      fromStop: { select: { timezone: true } },
      toStop: { select: { timezone: true } },
    },
  });
  const legs: HomeLeg[] = rows.map((r) => ({
    id: r.id,
    depAt: r.depAt,
    arrAt: r.arrAt,
    depIsHome: r.depIsHome,
    arrIsHome: r.arrIsHome,
    fromTimezone: r.fromStop?.timezone ?? null,
    toTimezone: r.toStop?.timezone ?? null,
  }));
  const changes = refileHomeEnds(legs, oldHomeTimezone, newHomeTimezone);
  for (const { id, ...data } of changes) {
    await tx.transport.update({ where: { id }, data });
  }
  return changes.length;
}
```

- [ ] **Step 4: Run it, expect PASS** — `npx vitest run lib/home-timezone-refile.test.ts`.

- [ ] **Step 5: Task-done check** — `npx vitest related --run lib/home-timezone-refile.ts` + `npx tsc --noEmit` + `npx eslint lib/home-timezone-refile.ts lib/home-timezone-refile.test.ts`. (The real-Postgres check of this query is in C.4's integration test.)

- [ ] **Step 6: Commit** — `lib/home-timezone-refile.ts`, `lib/home-timezone-refile.test.ts`; message `feat(tz): refileHomeEndsTx re-files Home-end times in every plan`.

---

### Task C.3: Activity wording — `homeTimezoneSummary`

**Files:**
- Modify: `lib/activity.ts:494-507` (add the builder after `surpriseSummary`, before the `// activityLine` banner at :508-509)
- Test: `lib/activity.test.ts` (import at :2-18; add a `describe` after `describe("surpriseSummary"` at :570)

**Interfaces:**
- Consumes: `ActivitySummary` (`lib/activity.ts:56`).
- Produces: `export function homeTimezoneSummary(to: string | null, keptLocalTimes: boolean): ActivitySummary`.

- [ ] **Step 1: Write the failing test** — add `homeTimezoneSummary` to the import list in `lib/activity.test.ts`, then:
```ts
describe("homeTimezoneSummary (ADR 0030 amendment 2026-10-16)", () => {
  it("names the new zone and says the Home-end times kept their local time", () => {
    expect(homeTimezoneSummary("Australia/Brisbane", true)).toEqual({
      summary: "changed the Home timezone to Australia/Brisbane — Home-end times kept as local times",
    });
  });
  it("leaves the clause off when no Home-end time had to move", () => {
    expect(homeTimezoneSummary("Australia/Brisbane", false)).toEqual({ summary: "changed the Home timezone to Australia/Brisbane" });
  });
  it("a cleared zone reads as cleared", () => {
    expect(homeTimezoneSummary(null, true)).toEqual({ summary: "cleared the Home timezone — Home-end times kept as local times" });
  });
  it("is the line activityLine shows", () => {
    expect(activityLine({ verb: "UPDATED", entityType: "TRANSPORT", entityLabel: "Home timezone", changes: homeTimezoneSummary("Australia/Brisbane", true) }))
      .toBe("changed the Home timezone to Australia/Brisbane — Home-end times kept as local times");
  });
});
```

- [ ] **Step 2: Run it, expect FAIL** — `npx vitest run lib/activity.test.ts` → `homeTimezoneSummary is not a function` (TS: no exported member).

- [ ] **Step 3: Implement** — in `lib/activity.ts`, after `surpriseSummary` (ends :507):
```ts
/**
 * A Home timezone change (ADR 0030 amendment 2026-10-16): one trip-level
 * line. `keptLocalTimes` when at least one Home-end time was re-filed so it
 * keeps the local time it showed.
 */
export function homeTimezoneSummary(to: string | null, keptLocalTimes: boolean): ActivitySummary {
  const head = to === null ? "cleared the Home timezone" : `changed the Home timezone to ${to}`;
  return { summary: keptLocalTimes ? `${head} — Home-end times kept as local times` : head };
}
```

- [ ] **Step 4: Run it, expect PASS** — `npx vitest run lib/activity.test.ts`.

- [ ] **Step 5: Task-done check** — `npx vitest related --run lib/activity.ts` + `npx tsc --noEmit` + `npx eslint lib/activity.ts lib/activity.test.ts`.

- [ ] **Step 6: Commit** — `lib/activity.ts`, `lib/activity.test.ts`; message `feat(activity): wording for a Home timezone change`.

---

### Task C.4: `updateTrip` keeps Home-end local times when the Home zone changes

**Files:**
- Modify: `server/actions/trips.ts`
  - imports :12-19 (add `refileHomeEndsTx`, `homeTimezoneSummary`, and section B's `growTripEndTx` if B hasn't imported it already)
  - doc comment :222-233 (add one sentence)
  - transaction block :374-386 (replace)
  - after `revalidateTrip(tripId, "trip");` :394 — no; the Activity call goes **before** it, after the slug transaction :392
- Test: `server/actions/trips.test.ts` (new hoisted mock beside `scheduleLoneStopTxMock` :216-220; new `describe` inside `describe("updateTrip")`, after the `homeTimezone` describe that closes at :1095)
- Create: `test/integration/home-timezone-refile.test.ts`

**Interfaces:**
- Consumes: `refileHomeEndsTx(tx, tripId, old, new): Promise<number>` (C.2); `homeTimezoneSummary(to, kept)` (C.3); `growTripEndTx(tx, tripId, null)` (section B, see Notes); `recordActivity` (`lib/activity-record.ts`, already imported at `trips.ts:19`).
- Produces: behaviour only. `updateTrip(tripId, patch)` keeps its `UpdateTripResult` shape.

- [ ] **Step 1: Write the failing tests**

(a) `server/actions/trips.test.ts`. After the `stop-flow` mock (:216-220), add:
```ts
// F5 (ADR 0030 amendment 2026-10-16): the re-file itself is tested in
// lib/home-timezone-refile.test.ts; here it is a spy so updateTrip's call is observable.
const { refileHomeEndsTxMock } = vi.hoisted(() => ({ refileHomeEndsTxMock: vi.fn().mockResolvedValue(0) }));
vi.mock("@/lib/home-timezone-refile", () => ({ refileHomeEndsTx: refileHomeEndsTxMock }));
```
Inside `describe("updateTrip", …)`, after the `homeTimezone` describe (closes :1095), add:
```ts
  describe("a Home timezone change keeps Home-end local times (F5)", () => {
    const home = { homeName: "Gold Coast", homeCountryCode: "au", homeTimezone: "Australia/Sydney" };

    it("re-files Home ends in the transaction that writes the zone, after the write", async () => {
      tripFindUniqueMock.mockResolvedValueOnce(home);
      tripUpdateMock.mockResolvedValue({});
      refileHomeEndsTxMock.mockResolvedValueOnce(2);

      await updateTrip("t1", { homeTimezone: "Australia/Brisbane" });

      expect(refileHomeEndsTxMock).toHaveBeenCalledWith(expect.anything(), "t1", "Australia/Sydney", "Australia/Brisbane");
      expect(tripUpdateMock).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ homeTimezone: "Australia/Brisbane" }) }));
      expect(tripUpdateMock.mock.invocationCallOrder[0]).toBeLessThan(refileHomeEndsTxMock.mock.invocationCallOrder[0]);
    });

    it("records one Activity line that says the times were kept", async () => {
      tripFindUniqueMock.mockResolvedValueOnce(home);
      tripUpdateMock.mockResolvedValue({});
      refileHomeEndsTxMock.mockResolvedValueOnce(2);

      await updateTrip("t1", { homeTimezone: "Australia/Brisbane" });

      expect(recordActivityMock).toHaveBeenCalledOnce();
      expect(recordActivityMock).toHaveBeenCalledWith({
        tripId: "t1",
        verb: "UPDATED",
        entityType: "TRANSPORT",
        entityId: null,
        entityLabel: "Home timezone",
        changes: { summary: "changed the Home timezone to Australia/Brisbane — Home-end times kept as local times" },
        surpriseOf: null,
      });
    });

    it("no Home-end time moved → the line names the zone only", async () => {
      tripFindUniqueMock.mockResolvedValueOnce(home);
      tripUpdateMock.mockResolvedValue({});
      refileHomeEndsTxMock.mockResolvedValueOnce(0);

      await updateTrip("t1", { homeTimezone: "Australia/Brisbane" });

      expect(recordActivityMock).toHaveBeenCalledWith(expect.objectContaining({
        changes: { summary: "changed the Home timezone to Australia/Brisbane" },
      }));
    });

    it("null → a guessed zone (rename) re-files from no zone", async () => {
      tripFindUniqueMock.mockResolvedValueOnce({ homeName: "Gold Coast", homeCountryCode: "au", homeTimezone: null });
      geocodePlaceDetailedMock.mockResolvedValueOnce({ name: "Sydney", lat: -33.86, lng: 151.2, city: "Sydney", country: "Australia", countryCode: "au" });
      tripUpdateMock.mockResolvedValue({});

      await updateTrip("t1", { homeName: "Sydney" });

      const written = (tripUpdateMock.mock.calls[0][0] as { data: { homeTimezone: string } }).data.homeTimezone;
      expect(refileHomeEndsTxMock).toHaveBeenCalledWith(expect.anything(), "t1", null, written);
    });

    it("clearing the Home base re-files to no zone", async () => {
      tripFindUniqueMock.mockResolvedValueOnce(home);
      tripUpdateMock.mockResolvedValue({});
      refileHomeEndsTxMock.mockResolvedValueOnce(1);

      await updateTrip("t1", { homeName: "" });

      expect(refileHomeEndsTxMock).toHaveBeenCalledWith(expect.anything(), "t1", "Australia/Sydney", null);
      expect(recordActivityMock).toHaveBeenCalledWith(expect.objectContaining({
        changes: { summary: "cleared the Home timezone — Home-end times kept as local times" },
      }));
    });

    it("re-sending the zone the Trip already has changes nothing: no re-file, no Activity, no extra transaction", async () => {
      tripFindUniqueMock.mockResolvedValueOnce(home);
      tripUpdateMock.mockResolvedValue({});

      await updateTrip("t1", { homeTimezone: "Australia/Sydney" });

      expect(refileHomeEndsTxMock).not.toHaveBeenCalled();
      expect(recordActivityMock).not.toHaveBeenCalled();
      // Only the slug transaction runs.
      expect(transactionMock).toHaveBeenCalledOnce();
    });

    it("a save that leaves the zone alone (key omitted) does not re-file", async () => {
      tripFindUniqueMock.mockResolvedValueOnce(home);
      tripUpdateMock.mockResolvedValue({});

      await updateTrip("t1", { name: "Renamed" });

      expect(refileHomeEndsTxMock).not.toHaveBeenCalled();
      expect(recordActivityMock).not.toHaveBeenCalled();
    });

    it("a zone change with new dates runs both in one transaction", async () => {
      tripFindUniqueMock.mockResolvedValueOnce({ ...home, startDate: "2026-12-01", endDate: "2026-12-20" });
      tripUpdateMock.mockResolvedValue({});

      await updateTrip("t1", { homeTimezone: "Australia/Brisbane", startDate: "2026-12-02", endDate: "2026-12-21" });

      expect(refileHomeEndsTxMock).toHaveBeenCalledOnce();
      expect(scheduleLoneStopTxMock).toHaveBeenCalledWith(expect.anything(), "t1", null, "follow");
      // One transaction for the trip write + re-file + lone-Stop rule, one for the slug.
      expect(transactionMock).toHaveBeenCalledTimes(2);
    });
  });
```
If section B's `growTripEndTx` mock exists in this file, add to the first test: `expect(growTripEndTxMock).toHaveBeenCalledWith(expect.anything(), "t1", null)` and `expect(refileHomeEndsTxMock.mock.invocationCallOrder[0]).toBeLessThan(growTripEndTxMock.mock.invocationCallOrder[0])`.

(b) `test/integration/home-timezone-refile.test.ts` (new, real Postgres):
```ts
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// F5 against the real Postgres: a Home timezone change keeps every Home-end
// time's local wall-clock time, in the real plan and every Fork, and moves
// nothing else. Only the Next/auth boundary, the network and Activity are mocked.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); }, redirect: vi.fn() }));
vi.mock("@/lib/geocode", () => ({ geocodePlace: vi.fn(async () => null), geocodePlaceDetailed: vi.fn(async () => null) }));
vi.mock("@/lib/activity-record", () => ({ recordActivity: vi.fn(async () => undefined) }));
vi.mock("@/lib/guards", async () => ({
  isTripOwnerOrAdmin: (await import("@/lib/access")).isTripOwnerOrAdmin,
  requireUser: vi.fn(async () => ({ id: "it-user" })),
  requireTripAccess: vi.fn(async () => ({ user: { id: "it-user" }, membership: { role: "owner" } })),
}));

import { db } from "@/lib/db";
import { recordActivity } from "@/lib/activity-record";
import { updateTrip } from "@/server/actions/trips";
import { instantToZonedTime, zonedWallTimeToInstant } from "@/lib/tz";

const TRIP_ID = "it-trip-home-tz";
const FORK_ID = "it-fork-home-tz";
const SYD = "Australia/Sydney";
const BNE = "Australia/Brisbane";
const LIS = "Europe/Lisbon";
const at = (d: string, t: string, z: string) => zonedWallTimeToInstant(d, t, z);

describe.skipIf(process.env.INTEGRATION !== "1")("a Home timezone change keeps Home-end local times (F5, real Postgres)", () => {
  beforeAll(async () => {
    await db.trip.deleteMany({ where: { id: TRIP_ID } });
    await db.user.upsert({ where: { id: "it-user" }, update: {}, create: { id: "it-user", email: "it-user@example.test", name: "It User", isEmailVerified: true } });
    await db.trip.create({
      data: {
        id: TRIP_ID, name: "Home zone trip", homeCurrency: "AUD", startDate: "2026-12-10", endDate: "2026-12-26",
        homeName: "Gold Coast", homeCountryCode: "au", homeTimezone: SYD, createdById: "it-user",
        members: { create: { userId: "it-user", role: "owner" } },
      },
    });
    await db.fork.create({ data: { id: FORK_ID, tripId: TRIP_ID, name: "Longer Lisbon", createdById: "it-user" } });
    await db.stop.createMany({
      data: [
        { id: "it-htz-lis", tripId: TRIP_ID, name: "Lisbon", timezone: LIS, arriveDate: "2026-12-11", departDate: "2026-12-24", nights: 13, sortOrder: 0 },
        { id: "it-htz-lis-fork", tripId: TRIP_ID, forkId: FORK_ID, name: "Lisbon", timezone: LIS, arriveDate: "2026-12-11", departDate: "2026-12-25", nights: 14, sortOrder: 0 },
      ],
    });
    await db.transport.createMany({
      data: [
        // Real plan: outbound (Home → Lisbon), return (Lisbon → Home), and a non-Home leg.
        { id: "it-htz-out", tripId: TRIP_ID, mode: "FLIGHT", depIsHome: true, toStopId: "it-htz-lis", depAt: at("2026-12-10", "06:10", SYD), arrAt: at("2026-12-11", "07:15", LIS), sortOrder: 0 },
        { id: "it-htz-ret", tripId: TRIP_ID, mode: "FLIGHT", arrIsHome: true, fromStopId: "it-htz-lis", depAt: at("2026-12-24", "09:00", LIS), arrAt: at("2026-12-25", "21:40", SYD), sortOrder: 1 },
        { id: "it-htz-other", tripId: TRIP_ID, mode: "TRAIN", fromStopId: "it-htz-lis", depAt: at("2026-12-15", "10:00", LIS), sortOrder: 2 },
        // Fork: a return leg with no departure time yet.
        { id: "it-htz-fork-ret", tripId: TRIP_ID, forkId: FORK_ID, mode: "FLIGHT", arrIsHome: true, fromStopId: "it-htz-lis-fork", depAt: null, arrAt: at("2026-12-26", "05:30", SYD), sortOrder: 0 },
      ],
    });
  });
  afterAll(async () => {
    await db.trip.deleteMany({ where: { id: TRIP_ID } });
  });

  it("Sydney → Brisbane keeps every Home-end local time, real plan and Fork; nothing else moves", async () => {
    expect(await updateTrip(TRIP_ID, { homeTimezone: BNE })).toMatchObject({ success: true });

    const rows = new Map((await db.transport.findMany({ where: { tripId: TRIP_ID } })).map((t) => [t.id, t]));
    const out = rows.get("it-htz-out")!;
    expect(out.depAt).toEqual(at("2026-12-10", "06:10", BNE));
    expect(out.depAt!.toISOString()).toBe("2026-12-09T20:10:00.000Z"); // +1h: Sydney was on daylight time
    expect(instantToZonedTime(out.depAt!, BNE)).toBe("06:10");
    expect(out.arrAt).toEqual(at("2026-12-11", "07:15", LIS)); // the Lisbon end is untouched

    const ret = rows.get("it-htz-ret")!;
    expect(ret.depAt).toEqual(at("2026-12-24", "09:00", LIS));
    expect(ret.arrAt).toEqual(at("2026-12-25", "21:40", BNE));

    const forkRet = rows.get("it-htz-fork-ret")!;
    expect(forkRet.depAt).toBeNull();
    expect(forkRet.arrAt).toEqual(at("2026-12-26", "05:30", BNE));

    expect(rows.get("it-htz-other")!.depAt).toEqual(at("2026-12-15", "10:00", LIS));

    expect((await db.trip.findUnique({ where: { id: TRIP_ID }, select: { homeTimezone: true } }))!.homeTimezone).toBe(BNE);
    expect(recordActivity).toHaveBeenCalledWith(expect.objectContaining({
      tripId: TRIP_ID,
      changes: { summary: "changed the Home timezone to Australia/Brisbane — Home-end times kept as local times" },
    }));
  });

  it("saving the same zone again moves nothing", async () => {
    const before = await db.transport.findMany({ where: { tripId: TRIP_ID }, orderBy: { id: "asc" } });
    await updateTrip(TRIP_ID, { homeTimezone: BNE });
    const after = await db.transport.findMany({ where: { tripId: TRIP_ID }, orderBy: { id: "asc" } });
    expect(after.map((t) => [t.id, t.depAt, t.arrAt])).toEqual(before.map((t) => [t.id, t.depAt, t.arrAt]));
  });
});
```
(If `Trip`/`Stop`/`Fork` require columns not shown here when this runs, add them as `test/integration/patch-updates.test.ts:48-53` and `test/integration/lone-stop-rule.test.ts:131` do. If B's `growTripEndTx` extends `endDate` to 2026-12-26 here, that is expected and not asserted.)

- [ ] **Step 2: Run it, expect FAIL** — `npx vitest run server/actions/trips.test.ts -t "F5"` → `refileHomeEndsTxMock` was never called, and `recordActivityMock` was not called. Then, with the local DB up (`docker compose up -d`, `npx prisma migrate deploy`), run `npm run test:integration -- test/integration/home-timezone-refile.test.ts` → `out.depAt` is still `2026-12-09T19:10:00.000Z`.

- [ ] **Step 3: Implement** — in `server/actions/trips.ts`:

Imports (after :19 `recordActivity`):
```ts
import { homeTimezoneSummary } from "@/lib/activity";
import { refileHomeEndsTx } from "@/lib/home-timezone-refile";
// + section B's growTripEndTx, from B's module, if not already imported
```

Doc comment (:222-233): add before the `Note:` paragraph:
```ts
 * A save that changes `homeTimezone` keeps every Home-end Transport time at
 * the local time it showed, in the real plan and every Fork, in the same
 * transaction (ADR 0030 amendment 2026-10-16).
```

Replace :374-386 (`if (datesChanged) { … } else { await db.trip.update(update); }`) with:
```ts
  // F5 (ADR 0030 amendment 2026-10-16): the zone this save actually moves to,
  // whichever rule above picked it. Re-sending the current zone is no move.
  const zoneMove =
    timezoneUpdate !== KEEP_TIMEZONE && (timezoneUpdate ?? null) !== (before.homeTimezone ?? null)
      ? { from: before.homeTimezone ?? null, to: timezoneUpdate }
      : null;
  let homeEndsKept = 0;

  if (datesChanged || zoneMove) {
    await db.$transaction(async (tx) => {
      await tx.trip.update(update);
      // Home-end times keep their local time in the new zone — every Plan
      // (the Home base is trip-wide). After the zone write, in the same tx.
      if (zoneMove) homeEndsKept = await refileHomeEndsTx(tx, tripId, zoneMove.from, zoneMove.to);
      if (datesChanged) {
        // ADR 0073: new Trip dates pull the only Stop along, in the real plan and
        // every Fork (the lone-Stop count is per plan; Trip dates are trip-wide).
        const forks = await tx.fork.findMany({ where: { tripId }, select: { id: true } });
        for (const forkId of [null, ...forks.map((f) => f.id)]) {
          await scheduleLoneStopTx(tx, tripId, forkId, "follow");
        }
      }
      // F4: the return leg's arrival date in the Home zone may grow the soft end date (section B).
      if (zoneMove) await growTripEndTx(tx, tripId, null);
    });
  } else {
    await db.trip.update(update);
  }
```
(If section B has already placed a `growTripEndTx(tx, tripId, null)` call in this transaction, replace both with one call at the end: `await growTripEndTx(tx, tripId, null);`. The transaction only runs when `datesChanged || zoneMove`.)

After the slug transaction (:392) and before `revalidateTrip(tripId, "trip");` (:394):
```ts
  // One trip-level line for a Home timezone change (ADR 0030 amendment
  // 2026-10-16). "TRIP" isn't an ActivityEntityType; TRANSPORT is the closest
  // fit, as CHAPTER/FORK are for the toggles below. It names no Surprise thing.
  if (zoneMove) {
    await recordActivity({
      tripId,
      verb: "UPDATED",
      entityType: "TRANSPORT",
      entityId: null,
      entityLabel: "Home timezone",
      changes: homeTimezoneSummary(zoneMove.to, homeEndsKept > 0),
      surpriseOf: null,
    });
  }
```

- [ ] **Step 4: Run it, expect PASS** — `npx vitest run server/actions/trips.test.ts` (the whole file: the existing `homeTimezone` and lone-Stop tests must stay green). Then `npm run test:integration -- test/integration/home-timezone-refile.test.ts`.

- [ ] **Step 5: Task-done check** — `npx vitest related --run server/actions/trips.ts lib/home-timezone-refile.ts` + `npx tsc --noEmit` + `npx eslint server/actions/trips.ts server/actions/trips.test.ts test/integration/home-timezone-refile.test.ts` + `npm run test:integration -- test/integration/home-timezone-refile.test.ts` (local DB up).

- [ ] **Step 6: Commit** — `server/actions/trips.ts`, `server/actions/trips.test.ts`, `test/integration/home-timezone-refile.test.ts`; message `fix(trip): a Home timezone change keeps Home-end local times`.

---

### Task C.5: `update_trip` says that a Home timezone change keeps local times

**Files:**
- Modify: `lib/mcp/tools/trips-stops-write.ts:172-187` (`update_trip` description :175 and `homeTimezone` `.describe()` :182)
- Test: `lib/mcp/tools/trips-stops-write.test.ts` (inside `describe("update_trip (PATCH)"` at :199)

**Interfaces:**
- Consumes: nothing new.
- Produces: tool description text only.

- [ ] **Step 1: Write the failing test** — inside `describe("update_trip (PATCH)", …)`:
```ts
    it("says a Home timezone change keeps Home-end times as local times (F5)", async () => {
      const c = await connectTestClient();
      const tool = (await c.listTools()).tools.find((t) => t.name === "update_trip")!;
      expect(tool.description).toMatch(/homeTimezone/);
      expect(tool.description).toMatch(/keeps? .*local time/i);
      const tz = (tool.inputSchema as { properties: Record<string, { description?: string }> }).properties.homeTimezone;
      expect(tz.description).toMatch(/local time/i);
    });
```

- [ ] **Step 2: Run it, expect FAIL** — `npx vitest run lib/mcp/tools/trips-stops-write.test.ts -t "F5"` → the description doesn't match `/homeTimezone/`.

- [ ] **Step 3: Implement** — in `lib/mcp/tools/trips-stops-write.ts`:

:175 before:
```ts
      description: "Changes only the fields you pass; fields you omit keep their current value.",
```
after:
```ts
      description:
        "Changes only the fields you pass; fields you omit keep their current value. Changing homeTimezone keeps every Home-end Transport time at the local time it shows (a 06:10 departure stays 06:10), in the real plan and every what-if plan; only the moment it stands for moves with the zone. Fix a wrong Home timezone this way rather than editing the leg times.",
```
:182 before:
```ts
        homeTimezone: z.string().trim().optional().describe("IANA timezone of the Home base, e.g. Australia/Brisbane. Home ends of Transport are read and written in it."),
```
after (merge onto section A's wording if A changed this line; keep A's derivation sentence):
```ts
        homeTimezone: z.string().trim().optional().describe("IANA timezone of the Home base, e.g. Australia/Brisbane. Home ends of Transport are read and written in it; changing it keeps their local times."),
```

- [ ] **Step 4: Run it, expect PASS** — `npx vitest run lib/mcp/tools/trips-stops-write.test.ts lib/mcp/vocab.test.ts`.

- [ ] **Step 5: Task-done check** — `npx vitest related --run lib/mcp/tools/trips-stops-write.ts` + `npx tsc --noEmit` + `npx eslint lib/mcp/tools/trips-stops-write.ts lib/mcp/tools/trips-stops-write.test.ts`.

- [ ] **Step 6: Commit** — `lib/mcp/tools/trips-stops-write.ts`, `lib/mcp/tools/trips-stops-write.test.ts`; message `docs(mcp): update_trip says a Home timezone change keeps local times`.

---

### Task C.6: ADR 0030 amendment 2026-10-16 and the CONTEXT.md Home base clause

**Files:**
- Modify: `docs/adr/0030-home-base-as-trip-origin-not-a-stop.md` (append after the last line, :85)
- Modify: `CONTEXT.md:14` (the **Home base** entry)

**Interfaces:**
- Consumes: the behaviour shipped in C.1–C.5.
- Produces: docs only.

- [ ] **Step 1: Write the failing test** — docs only, no test. Instead confirm what is there now: `grep -n "2026-10-16" docs/adr/0030-home-base-as-trip-origin-not-a-stop.md` → no match. `grep -n "keeps each Home-end time" CONTEXT.md` → no match.

- [ ] **Step 2: Run it, expect FAIL** — both greps print nothing.

- [ ] **Step 3: Implement**

Append to `docs/adr/0030-home-base-as-trip-origin-not-a-stop.md`:
```markdown

## Amendment — 2026-10-16: changing the Home timezone keeps Home-end local times

The 2026-10-14 amendment made the Home zone editable but left stored leg
times alone. A Transport time is typed as a local time off a ticket and stored
as an instant read in that end's zone, so correcting a wrong guess moved every
typed Home-end time. Changing Sydney to Brisbane in December moved a 06:10
departure to 05:10. For a ticket, the local time is the fact.

1. **A save that changes `homeTimezone` keeps every Home-end time's local
   time.** It does not matter where the change came from: Trip settings,
   `update_trip`, or a Home base rename that re-derives the zone (whichever
   rule picks it). Each affected end's stored instant is recomputed from the
   wall-clock time it showed, in the new zone. This covers the real plan and
   every Fork, because the Home base is trip-wide. It happens in the same
   transaction as the zone write, and the soft end date is then re-grown
   (spec 2026-10-16 F4).
2. **An end is affected when its resolved zone changes.** The test is the
   rule the write path and every display share (`resolveEndpointZones`):
   a Home end, and also a non-Home end with no Stop that borrowed the Home
   zone. Moving from no zone re-reads the times in the fallback they were
   typed in (the other end's Stop zone, else UTC). Clearing the Home base
   does the reverse. Point 3 of the 2026-10-14 amendment was a note about
   that one migration. It does not govern later changes.
3. **An end with no time is untouched.** A date-only booking import stores
   no time. A local time that doesn't exist in the new zone (a daylight-saving
   gap) lands on the next valid time, e.g. 02:30 → 03:30.
4. **One Activity line** records the change, "changed the Home timezone to
   Australia/Brisbane — Home-end times kept as local times", and the legs
   record nothing of their own. `update_trip`'s description says the same,
   so Claude fixes a zone instead of retyping times.

No backfill: stored times are already the moments that were typed.
```

`CONTEXT.md:14`. Before (as of today; if section A has reworded "guessed from the country", keep A's wording and add only the new clause):
```
and a **timezone** (guessed from the country, editable) that the Home end of a **Transport** is read and written in — but it is *not* a Stop
```
After:
```
and a **timezone** (guessed from the country, editable) that the Home end of a **Transport** is read and written in — changing it keeps each Home-end time at the local time it shows, in every Plan — but it is *not* a Stop
```

- [ ] **Step 4: Run it, expect PASS** — `grep -n "2026-10-16" docs/adr/0030-home-base-as-trip-origin-not-a-stop.md` → the amendment heading. `grep -n "keeps each Home-end time" CONTEXT.md` → line 14.

- [ ] **Step 5: Task-done check** — no source changed; `npx tsc --noEmit` is unaffected. Re-run `npx vitest run lib/home-timezone-refile.test.ts server/actions/trips.test.ts lib/mcp/tools/trips-stops-write.test.ts` as the section's closing check.

- [ ] **Step 6: Commit** — `docs/adr/0030-home-base-as-trip-origin-not-a-stop.md`, `CONTEXT.md`; message:
```
docs(adr): 0030 amendment — Home timezone change keeps local times

Resolves-Feedback: cmva4jnfk003l07lfhfbs92wb
```
## Section D — F9 TU-01: Chapter dates off on an edit makes it rough

### Notes

**Interfaces this section produces:** none for other sections. `updateChapter(chapterId, patch: Patch<ChapterInput>)` keeps its signature. What changes is the clearing case: when a patch takes a dated Chapter to `startDate: null, endDate: null`, the same transaction unlinks the Chapter's **dated** Stops (`chapterId: null`).

**Interfaces assumed from earlier sections:** none. D doesn't touch A–C files. A strikes TU-02 in the same file, `docs/open-follow-ups.md`. **Assembler:** both sections edit the "Open items" count line at `docs/open-follow-ups.md:506`. Whichever task lands second re-reads that line and leaves the other id struck too.

**Decisions where the spec is silent (with reason):**
1. **Why the action changes, not only the form.** The form fix alone (send both nulls) is not enough. A dated Stop keeps an explicit `chapterId` from when it was rough (ADR 0009: a rough Stop firmed by `dateChapterSegment`, `server/actions/stops.ts:878`, keeps its link). `recomputeChapterSpans` (`server/actions/stop-flow.ts:82`) counts a dated Stop whose `chapterId === C` as a span contributor (`spanContributors`, `lib/chapters.ts:133`). So the next Stop edit anywhere in the plan would **re-date the Chapter on its own**. That breaks the spec: "its dated Stops stay dated and simply stop being members".
   - The fix: `updateChapter`, in the clearing case only, sets `chapterId: null, chapterSortOrder: null` on that Chapter's Stops with `arriveDate != null`. It runs inside a `$transaction` under `lockPlanStopsTx` (ADR 0007: every path that writes a plan's Stop rows takes that lock).
   - Rough Stops keep their explicit membership.
   - Dated Stops with no link were members only by date band. Now that the band is gone they fall out of the Chapter by themselves.
   - Activity: one UPDATED CHAPTER row, recorded after commit through `recordUpdate`. The Stop unlinks write no rows: membership is not a Stop field the feed shows.
2. **When the warning shows.** It shows only when editing a Chapter that **currently** has dates (`chapter.startDate != null`) and the switch is off. Editing a rough Chapter sends the nulls too. That's harmless: the server's clearing branch keys on `before.startDate != null`.
3. **Form vs. action test.** The form test proves the form sends both nulls. The action unit test proves the unlink. The integration case proves the Chapter **stays** rough after a later `recomputeChapterSpans`. Without the action change, the bug would come back through that path.

**Review Focus candidate:**
- **Input:** a dated Chapter with one dated Stop explicitly linked (`chapterId` set, firmed from rough), one dated Stop inside its band only by date, and one rough member.
- **Action:** switch "Set dates now" off and save, then run any Stop edit (anything that calls `recomputeChapterSpans`).
- **Expected:**
  - The Chapter is rough and stays rough.
  - Both dated Stops keep their dates, with `chapterId` null.
  - The rough Stop is still in the Chapter.
- **Tested in:** D.1 (unit + `test/integration/patch-updates.test.ts`) and D.2 (form).

---

### Task D.1: `updateChapter` — clearing a dated Chapter's dates unlinks its dated Stops (TU-01)

**Files:**
- Modify: `server/actions/chapters.ts:1-19` (imports), `server/actions/chapters.ts:111-134` (`updateChapter`)
- Test: `server/actions/chapters.test.ts:4-63` (hoisted mocks: add `stopUpdateManyMock` to both the `db` mock and the tx object), `server/actions/chapters.test.ts:340-371` (describe "updateChapter (PATCH, ADR 0075)")
- Test (integration): `test/integration/patch-updates.test.ts:71-78` (describe "Chapter")

**Interfaces:**
- Consumes: `lockPlanStopsTx(tx, tripId, forkId)` (already imported from `@/server/actions/stop-flow`); `recordUpdate(entityType, { tripId, plan, entityId, before, after })` from `@/lib/activity-guard`; `recomputeChapterSpans(tx, tripId, forkId)` (integration test only).
- Produces: no new export. Behaviour: a patch that takes a dated Chapter to both-null dates also writes `chapterId: null, chapterSortOrder: null` on `Stop` where `chapterId = <id> AND arriveDate IS NOT NULL`, in one transaction.

- [ ] **Step 1: Write the failing test**

In `server/actions/chapters.test.ts`, add the mock to the hoisted block: `const stopUpdateManyMock = vi.fn().mockResolvedValue({ count: 0 });`. Return it from `vi.hoisted`. Add `updateMany: stopUpdateManyMock` to the tx object's `stop` (inside `dbTransactionMock`) and to the `vi.mock("@/lib/db")` `stop` delegate.

In the existing `describe("updateChapter (PATCH, ADR 0075)")`, extend `beforeEach` with:

```ts
    queryRawMock.mockResolvedValue([]); // lockPlanStopsTx
    stopUpdateManyMock.mockResolvedValue({ count: 0 });
```

Then append these cases to that describe:

```ts
  // TU-01: dates off on a dated Chapter makes it rough. Its dated Stops keep
  // their dates and leave it — an explicit link left from when they were
  // rough (ADR 0009) would let recomputeChapterSpans (ADR 0021) re-date it.
  it("clearing a dated chapter's dates unlinks its dated stops under the plan lock, in one transaction", async () => {
    chapterUpdateMock.mockResolvedValue({ ...dated, startDate: null, endDate: null });
    const r = await updateChapter("c1", { startDate: null, endDate: null });
    expect(r).toEqual({ success: true });
    expect(dbTransactionMock).toHaveBeenCalledTimes(1);
    expect(queryRawMock).toHaveBeenCalledTimes(1); // lockPlanStopsTx
    expect(stopUpdateManyMock).toHaveBeenCalledWith({
      where: { chapterId: "c1", arriveDate: { not: null } },
      data: { chapterId: null, chapterSortOrder: null },
    });
    expect(chapterUpdateMock).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: { name: "Italy", colour: "amber", startDate: null, endDate: null },
    });
    expect(recordActivity).toHaveBeenCalledWith(expect.objectContaining({ verb: "UPDATED", entityType: "CHAPTER", entityId: "c1" }));
  });

  it("a rename of a dated chapter touches no stop", async () => {
    await updateChapter("c1", { name: "New name" });
    expect(stopUpdateManyMock).not.toHaveBeenCalled();
    expect(dbTransactionMock).not.toHaveBeenCalled();
  });

  it("clearing an already-rough chapter touches no stop", async () => {
    chapterFindUniqueMock.mockResolvedValue({ ...dated, startDate: null, endDate: null });
    await updateChapter("c1", { startDate: null, endDate: null });
    expect(stopUpdateManyMock).not.toHaveBeenCalled();
  });

  it("re-dating a chapter touches no stop", async () => {
    await updateChapter("c1", { startDate: "2026-05-02", endDate: "2026-05-11" });
    expect(stopUpdateManyMock).not.toHaveBeenCalled();
  });
```

In `test/integration/patch-updates.test.ts`, add the import `import { recomputeChapterSpans } from "@/server/actions/stop-flow";`. Then add inside `describe("Chapter", …)`:

```ts
    it("dates off on a dated Chapter makes it rough: its dated Stops keep their dates and leave it, rough members stay, and a later span recompute leaves it rough (TU-01)", async () => {
      const ch = await db.chapter.create({ data: { tripId: TRIP_ID, name: "Tuscany", colour: "rose", startDate: "2026-05-15", endDate: "2026-05-18", sortOrder: 7 } });
      const linked = await db.stop.create({ data: { tripId: TRIP_ID, name: "Siena", country: "Italy", arriveDate: "2026-05-15", departDate: "2026-05-17", nights: 2, chapterId: ch.id, chapterSortOrder: 0, sortOrder: 30 } });
      const byDate = await db.stop.create({ data: { tripId: TRIP_ID, name: "Lucca", country: "Italy", arriveDate: "2026-05-17", departDate: "2026-05-18", nights: 1, sortOrder: 31 } });
      const rough = await db.stop.create({ data: { tripId: TRIP_ID, name: "Pisa", country: "Italy", nights: 1, chapterId: ch.id, chapterSortOrder: 1, sortOrder: 32 } });

      expect(await updateChapter(ch.id, { startDate: null, endDate: null })).toEqual({ success: true });

      expect(await db.chapter.findUnique({ where: { id: ch.id } })).toMatchObject({ startDate: null, endDate: null });
      expect(await db.stop.findUnique({ where: { id: linked.id } })).toMatchObject({ arriveDate: "2026-05-15", departDate: "2026-05-17", chapterId: null });
      expect(await db.stop.findUnique({ where: { id: byDate.id } })).toMatchObject({ arriveDate: "2026-05-17", chapterId: null });
      expect(await db.stop.findUnique({ where: { id: rough.id } })).toMatchObject({ arriveDate: null, chapterId: ch.id });

      // Any later Stop write runs this self-heal; it must not re-date the Chapter.
      await db.$transaction((tx) => recomputeChapterSpans(tx, TRIP_ID, null));
      expect(await db.chapter.findUnique({ where: { id: ch.id } })).toMatchObject({ startDate: null, endDate: null });

      await db.stop.deleteMany({ where: { id: { in: [linked.id, byDate.id, rough.id] } } });
      await db.chapter.delete({ where: { id: ch.id } });
    });
```

- [ ] **Step 2: Run it, expect FAIL**

`npx vitest run server/actions/chapters.test.ts`. Expected: the first new case fails with `stopUpdateManyMock` "expected to be called" (0 calls) and `dbTransactionMock` called 0 times. The other three pass.

With the DB up (`DATABASE_URL=postgresql://trip:trip@localhost:5432/trip?schema=public npm run test:integration -- test/integration/patch-updates.test.ts`), the new case fails on `linked.chapterId` (expected `null`, received the Chapter id).

- [ ] **Step 3: Implement**

`server/actions/chapters.ts`: change the import at `:12` to `import { auditedUpdate, recordPlanActivity, recordUpdate } from "@/lib/activity-guard";`. Replace the write in `updateChapter` (`:129-133`) with:

```ts
  // Dates written `?? null`: absent now means "carried from the row" (merged above), so an explicit null clears.
  const data = { ...parsed.data, startDate: parsed.data.startDate ?? null, endDate: parsed.data.endDate ?? null };
  const plan = chapter.forkId ?? null;

  if (before.startDate != null && data.startDate === null) {
    // TU-01: a dated Chapter made rough no longer groups its dated Stops. They
    // keep their dates; any explicit link left from when they were rough
    // (ADR 0009) is dropped, or recomputeChapterSpans (ADR 0021) would count
    // them as span contributors and re-date the Chapter on the next Stop edit.
    // Rough members keep their explicit membership. ADR 0007: the plan's Stop
    // lock before writing Stop rows.
    const after = await db.$transaction(async (tx) => {
      await lockPlanStopsTx(tx, chapter.tripId, plan);
      await tx.stop.updateMany({
        where: { chapterId, arriveDate: { not: null } },
        data: { chapterId: null, chapterSortOrder: null },
      });
      return tx.chapter.update({ where: { id: chapterId }, data });
    });
    await recordUpdate("CHAPTER", { tripId: chapter.tripId, plan, entityId: chapterId, before, after });
  } else {
    await auditedUpdate("CHAPTER", db.chapter, chapterId, data, plan, { before });
  }
  revalidateTrip(chapter.tripId, "plan");
  return { success: true };
```

Extend the JSDoc on `updateChapter` (`:110`) with: "Clearing a dated Chapter's dates makes it rough and unlinks its dated Stops (TU-01)."

- [ ] **Step 4: Run it, expect PASS**

`npx vitest run server/actions/chapters.test.ts`. Then, with the DB up, the integration command from Step 2.

- [ ] **Step 5: Task-done check**

- `npx vitest related --run server/actions/chapters.ts`
- `npx tsc --noEmit`
- `npx eslint server/actions/chapters.ts server/actions/chapters.test.ts test/integration/patch-updates.test.ts`
- `DATABASE_URL=postgresql://trip:trip@localhost:5432/trip?schema=public npm run test:integration -- test/integration/patch-updates.test.ts` (when the local DB is up)

- [ ] **Step 6: Commit**

Files: `server/actions/chapters.ts`, `server/actions/chapters.test.ts`, `test/integration/patch-updates.test.ts`.

Message:

```
fix(chapters): clearing a Chapter's dates unlinks its dated Stops (TU-01)

A dated Stop keeps the chapterId it had while rough, so recomputeChapterSpans
re-dated a Chapter made rough on the next Stop edit.
```

No `Resolves-Feedback:` trailer.

---

### Task D.2: Chapter form — "Set dates now" off on an edit sends both nulls and warns (TU-01)

**Files:**
- Modify: `components/trip/chapter-form-dialog.tsx:131-145` (state + submit), `components/trip/chapter-form-dialog.tsx:186-198` (toggle: warning below it)
- Modify: `docs/open-follow-ups.md:506` (open-items count line), `docs/open-follow-ups.md:582-599` (strike TU-01)
- Test: `components/trip/chapter-form-dialog.test.tsx` (add cases after Case 5, `:98-113`)

**Interfaces:**
- Consumes: `updateChapter(chapterId, patch: Patch<ChapterInput>)` (D.1); `createChapter(tripId, input: ChapterInput, originStopId?, forkId?)` (unchanged).
- Produces: the copy `"This Chapter will no longer group its dated stops."`, exported as the constant `CHAPTER_DATES_OFF_WARNING` from `components/trip/chapter-form-dialog.tsx`.

- [ ] **Step 1: Write the failing test**

Append to `components/trip/chapter-form-dialog.test.tsx` (inside the top `describe`):

```tsx
  // TU-01: switching "Set dates now" off on an edit clears the dates.
  it("switching 'Set dates now' off on a dated chapter sends both dates as null and warns first", async () => {
    const user = userEvent.setup();
    render(<ChapterFormDialog {...baseProps} chapter={existingChapter} />);

    expect(screen.queryByText("This Chapter will no longer group its dated stops.")).not.toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: /set dates now/i }));
    expect(screen.getByText("This Chapter will no longer group its dated stops.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /save changes/i }));
    expect(updateChapter).toHaveBeenCalledWith("chapter-99", {
      name: "France",
      colour: "blue",
      startDate: null,
      endDate: null,
    });
  });

  it("shows no warning when editing a rough chapter", () => {
    render(<ChapterFormDialog {...baseProps} chapter={{ ...existingChapter, startDate: null, endDate: null }} />);
    expect(screen.getByRole("checkbox", { name: /set dates now/i })).not.toBeChecked();
    expect(screen.queryByText("This Chapter will no longer group its dated stops.")).not.toBeInTheDocument();
  });

  it("a new chapter with the switch off still sends only name and colour", async () => {
    const user = userEvent.setup();
    render(<ChapterFormDialog {...baseProps} />);
    await user.type(screen.getByPlaceholderText(/e\.g\. france/i), "Spain");
    await user.click(screen.getByRole("button", { name: /add chapter/i }));
    expect(createChapter).toHaveBeenCalledWith("trip-1", { name: "Spain", colour: expect.any(String) }, undefined, undefined);
    expect(screen.queryByText("This Chapter will no longer group its dated stops.")).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Run it, expect FAIL**

`npx vitest run components/trip/chapter-form-dialog.test.tsx`. Expected:
- Case 1 fails: the warning text is not found.
- After removing that line locally, it would fail because `updateChapter` was called with `{ name, colour }`.
- Cases 2 and 3 pass.

- [ ] **Step 3: Implement**

In `components/trip/chapter-form-dialog.tsx`, add above `ChapterFormDialog`:

```tsx
/** TU-01: shown on an edit of a dated Chapter while "Set dates now" is off. */
export const CHAPTER_DATES_OFF_WARNING = "This Chapter will no longer group its dated stops.";
```

In `ChapterForm`, after the `setDatesNow` state (`:136`):

```tsx
  // TU-01: switching the dates off on an edit clears them (PATCH: null clears,
  // ADR 0075) — the Chapter becomes rough and its dated Stops leave it.
  const hadDates = isEdit && chapter?.startDate != null;
```

Replace `submit` (`:139-146`) with:

```tsx
    submit: () => {
      if (isEdit && chapter) {
        return updateChapter(
          chapter.id,
          setDatesNow
            ? { name, colour, startDate, endDate }
            : { name, colour, startDate: null, endDate: null },
        );
      }
      return createChapter(
        tripId,
        setDatesNow ? { name, colour, startDate, endDate } : { name, colour },
        originStopId,
        forkId ?? undefined,
      );
    },
```

Directly after the toggle's closing `</label>` (`:198`):

```tsx
      {hadDates && !setDatesNow && (
        <p role="status" className="text-sm text-muted-foreground">
          {CHAPTER_DATES_OFF_WARNING}
        </p>
      )}
```

In `docs/open-follow-ups.md`:
- Change the heading at `:582` to `### ~~TU-01 · The Chapter form's "Set dates now" switched off on an edit keeps the dates~~`.
- Add a first bullet under it: `- **Fixed 2026-10-16** on \`feat/feedback-tz-enddate-review\` (tasks D.1–D.2, spec 2026-10-16 F9): with the switch off the edit sends both dates as \`null\`, and \`updateChapter\` unlinks the Chapter's dated Stops in the same transaction so \`recomputeChapterSpans\` can't re-date it. The form warns "This Chapter will no longer group its dated stops."`
- On the count line `:506`, change `**6 items:` to `**5 items:` and wrap `` `TU-01` `` as `` ~~`TU-01`~~ (fixed 2026-10-16) ``. If section A already struck TU-02 on this line, keep that strike and the count A set, minus one.

- [ ] **Step 4: Run it, expect PASS**

`npx vitest run components/trip/chapter-form-dialog.test.tsx`

- [ ] **Step 5: Task-done check**

- `npx vitest related --run components/trip/chapter-form-dialog.tsx`
- `npx tsc --noEmit`
- `npx eslint components/trip/chapter-form-dialog.tsx components/trip/chapter-form-dialog.test.tsx`

- [ ] **Step 6: Commit**

Files: `components/trip/chapter-form-dialog.tsx`, `components/trip/chapter-form-dialog.test.tsx`, `docs/open-follow-ups.md`.

Message: `fix(chapters): "Set dates now" off on an edit makes the Chapter rough (TU-01)`. No `Resolves-Feedback:` trailer.

---

## Section E — F8 Reminder notes and "about" an Item or Transport leg

### Notes

**Interfaces this section produces (F and the final gate rely on them):**
- `lib/reminder-about.ts` (pure, client-safe; E.2):
  - Types: `ABOUT_KEYS`, `AboutKey`, `ReminderAbout = { stopId: string } | { itemId: string } | { transportId: string }`.
  - `ReminderItem` (moved here; `lib/reminder-reads.ts` and `server/actions/reminders.ts` re-export it), with the shape `{ id, title, date, notes, stopId, stopName, itemId, itemTitle, transportId, transportLabel }` (every field `string | null` except id/title/date).
  - `ReminderAboutOptions = { stops: {id,name}[]; items: {id,title}[]; transports: {id,label}[] }`.
  - Functions: `aboutCount(r)`, `replaceAbout(patch)`, `aboutFromPick(value)`, `aboutPickValue(r)`, `reminderTransportLabel(t)`, `reminderAboutLabel(r)`, `toReminderItem(row)`.
  - Select constants: `REMINDER_TRANSPORT_SELECT`, `REMINDER_ITEM_SELECT`.
- **For F6** (writes return the row): to re-read one Reminder Surprise-aware, use `db.reminder.findFirst({ where: { id, ...v.where.reminder }, select: REMINDER_ITEM_SELECT })` then `toReminderItem`. That is the same select and mapper `get_reminders` uses (E.4).
- `lib/reminder-reads.ts` (E.4–E.5):
  - `listRemindersForTrip(tripId, fromDate): Promise<ReminderItem[]>` (shape grown);
  - `readRemindersAbout(tripId, v: SurpriseVisibility): Promise<RemindersAbout>` with `RemindersAbout = { byStopId; byItemId; byTransportId }`, each a `Map<string, ReminderItem[]>`;
  - `readReminderAboutOptions(tripId): Promise<ReminderAboutOptions>`.
- `lib/validations/reminder.ts` (E.7):
  - `reminderFieldsSchema` (plain object) and `reminderSchema` (refined: at most one about id);
  - `REMINDER_ONE_THING` (message);
  - `ReminderInput` now has `notes?`, `itemId?`, `transportId?`.
- Components: `ReminderNotes` (`components/trip/reminder-notes.tsx`, E.6) and `ReminderList` (`components/trip/reminder-list.tsx`, E.13). `AddReminderDialog` prop `stopId` becomes `about: ReminderAbout` (E.12).
- Test helper: `test/helpers/reminder-item.ts` → `reminderItem(over)` (E.4).
- **Section F's last task carries `Resolves-Feedback: cmvaifznz000t07gwfwee8lfp`**, not E.15 (MCP) or E.16 (docs).

**Interfaces assumed from earlier sections:** none. E reads no A–D output. If section F renames or reshapes `get_reminders`, E.15's assertions follow F's shape. E.15 adds fields only.

**Decisions where the spec is silent (with reason):**
1. **One-only rule.** At most one of `stopId`/`itemId`/`transportId` is set. It is enforced at three layers:
   - the Postgres CHECK `Reminder_about_one_thing_check` (`num_nonnulls(...) <= 1`, hand-written: Prisma can't express a CHECK);
   - `reminderSchema.refine` (message `REMINDER_ONE_THING`, form-level key `_`);
   - the MCP tools, which refuse before any lookup.
2. **An update that names any about key replaces the whole about** (`replaceAbout`): the other two are written `null`. So moving a Reminder from a Stop to an Item can never trip the CHECK. A patch naming none leaves the about alone. `null` on the held key makes it about the Trip as a whole. This is the first way to clear a Reminder's `stopId`; the old comments saying "no way to clear" are rewritten.
3. **Surprise.** Transport is outside every Surprise by design (CONTEXT.md Surprise; `lib/guards.ts:303` comment). So "a Surprise thing hides the Reminder" applies to Stops and Items only.
   - `where.reminder` gains `nullableNotIn("itemId", hiddenItemIds)`. `hiddenItemIds` holds Surprise Items and every Item inside a hidden Stop.
   - The write guard refs `{ itemId }` when the Reminder is about an Item.
   - `insideSurpriseEntityIds` stamps Reminders about the Items of a Surprise (Stop: Reminders about the Stop **or** any of its Items; Item: Reminders about it).
   - A Reminder about a Transport leg is never hidden. Leg labels name Stops, and Stop names are never hidden from a surprised Traveller (they see the Stop from outside).
4. **Item and Transport rows must be real-plan.** The action's cross-trip check for `itemId`/`transportId` also requires `forkId: null`: a Reminder hangs off the real plan only (the existing "A Fork's Stop is not in the real plan" rule, `components/trip/itinerary-manager.tsx:1405`). The Stop check is left as it is, `{ id, tripId }`, so no behaviour changes there. A promoted Fork deletes the old real-plan rows and their Reminders become about nothing (`onDelete: SetNull`). That is already what happens to Stop Reminders; nothing is built for Forks.
5. **Notes.** `String?`, max 2000 chars, trimmed; empty means cleared (`null`). Shown everywhere a Reminder renders in the app:
   - Home's Reminders card (phone, every Phase) and the Checklists page: **folded** in a native `<details>` ("Notes", tap to expand);
   - the desktop Home "Sort these out" row: the same fold, outside the row link;
   - Stop / Item / Transport reminder lists: the same fold.
   - The Digest selects `{ id, title }` only, pinned by E.9.
6. **Where the "about" picker lives.** The app has no Reminder **edit** UI today (only `RemindersCard`'s inline add form and `AddReminderDialog`), and the spec doesn't add one.
   - The picker goes on `RemindersCard`'s add form. It offers real-plan Stops, Items and Transport legs, minus anything hidden from the viewer, through `readReminderAboutOptions`. It is shown only where the page passes options: the Checklists page, as today.
   - Home's card still has no picker (unchanged).
   - `AddReminderDialog` keeps a fixed, hidden about, now `{ stopId } | { itemId } | { transportId }`, and gains Notes.
7. **"The thing's card lists the Reminder".** For a Stop this is the existing open-body link plus `StopExtrasDialog`. For an Item and a Transport leg it is the plan editor's **edit dialog** (`ItemFormDialog`, `TransportFormDialog`), where those things already list their Attachments and Notes. A "Reminders" field there lists them and offers "Add a reminder", real plan only.
   - The Day view's and Wishlist's `ItemFormDialog` get no reminders (the props are optional). Those pages don't load them; no spec line asks for it.
8. **Activity diff.** The diff for REMINDER changes key `stopName` → `about` (label "About" unchanged, value is the Stop name, Item title or leg label) and adds `notes` ("Notes"). Nothing reads the old key (`grep '"stopName"'` hits only `lib/activity.ts:233`).
9. **The leg label for the chip** is `"<Mode> <from> → <to>"`, e.g. `Train Paris → Lyon`. The ends are the linked Stop's name, else the typed place, else the Home base name for a Home end; with no ends it is just `"Train"`. It is pure, computed at read time from `REMINDER_TRANSPORT_SELECT`.
10. **Migration timestamp** `20261016120000_reminder_notes_and_about`. **Assembler:** if an earlier section adds a migration with a later timestamp, rename this one so it sorts after it.

**Review Focus candidates:**
1. **A Reminder about a plain Item inside a Surprise Stop** is hidden from the surprised Traveller everywhere it could surface, and stays visible to the planner. Surfaces: Home card, `get_reminders`, the plan editor's Item card, the Digest. Tested in E.3 (fragment), E.4 (integration, `listRemindersForTrip` + `readRemindersAbout`) and E.5 (the picker doesn't offer the Item).
2. **`update_reminder` with both `stopId` and `itemId`** is refused with nothing written and no lookup made. **`update_reminder` with only `itemId`** on a Reminder about a Stop moves it: `stopId` becomes null and the CHECK never trips. Tested in E.8 (action unit), E.8 (integration `patch-updates`) and E.15 (tool).
3. **Notes never reach the Digest.** The Digest query selects `{ id, title }` and the line is the title alone, even when the Reminder carries notes. Tested in E.9.

---

### Task E.1: Schema + migration — `Reminder.notes`, `itemId`, `transportId`, and the one-thing CHECK

**Files:**
- Modify: `prisma/schema.prisma:961-985` (model `Reminder` + doc comment), `prisma/schema.prisma:764-…` (model `Item`: add `reminders Reminder[]` beside its other relation lists), `prisma/schema.prisma:698-734` (model `Transport`: add `reminders Reminder[]` after `anchorStop`)
- Create: `prisma/migrations/20261016120000_reminder_notes_and_about/migration.sql`
- Test (integration): Create `test/integration/reminder-about.test.ts`

**Interfaces:**
- Produces:
  - columns `Reminder.notes TEXT NULL`, `Reminder.itemId TEXT NULL` (FK → `Item.id`, `ON DELETE SET NULL`), `Reminder.transportId TEXT NULL` (FK → `Transport.id`, `ON DELETE SET NULL`);
  - indexes `Reminder_itemId_idx`, `Reminder_transportId_idx`;
  - CHECK `Reminder_about_one_thing_check`;
  - Prisma relations `Reminder.item`, `Reminder.transport`, `Item.reminders`, `Transport.reminders`.

- [ ] **Step 1: Write the failing test**

Create `test/integration/reminder-about.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";

// Real Postgres (npm run test:integration), spec 2026-10-16 F8: a Reminder
// carries optional notes and is about at most one thing — a Stop, an Item
// or a Transport leg. Prisma cannot express the CHECK, so the migration is
// hand-written; this pins that it exists and bites.
const OWNER = "it-ra-owner";
const TRIP_ID = "it-ra-trip";

describe.skipIf(process.env.INTEGRATION !== "1")("Reminder about one thing (real Postgres, F8)", () => {
  let stopId = "";
  let itemId = "";
  let transportId = "";

  beforeAll(async () => {
    await db.user.upsert({ where: { id: OWNER }, update: {}, create: { id: OWNER, email: "ra-owner@example.test", name: "RA Owner" } });
    await db.trip.deleteMany({ where: { id: TRIP_ID } });
    await db.trip.create({
      data: { id: TRIP_ID, name: "IT Reminder about", homeCurrency: "AUD", createdById: OWNER, members: { create: { userId: OWNER, role: "owner" } } },
    });
    stopId = (await db.stop.create({ data: { tripId: TRIP_ID, name: "IT Lyon", sortOrder: 0 } })).id;
    itemId = (await db.item.create({ data: { tripId: TRIP_ID, title: "IT Bouchon dinner", category: "OTHER" } })).id;
    transportId = (await db.transport.create({ data: { tripId: TRIP_ID, mode: "TRAIN", depPlace: "Paris", arrPlace: "Lyon" } })).id;
  });

  afterAll(async () => {
    await db.trip.deleteMany({ where: { id: TRIP_ID } });
  });

  it("the CHECK constraint exists", async () => {
    const rows = await db.$queryRaw<{ conname: string }[]>`
      SELECT conname FROM pg_constraint WHERE conname = 'Reminder_about_one_thing_check'`;
    expect(rows).toHaveLength(1);
  });

  it("a Reminder holds notes and is about an Item, or a Transport leg", async () => {
    const a = await db.reminder.create({ data: { tripId: TRIP_ID, title: "IT Book table", date: "2027-01-02", notes: "Ask for the window", itemId } });
    const b = await db.reminder.create({ data: { tripId: TRIP_ID, title: "IT Seats", date: "2027-01-01", transportId } });
    expect(await db.reminder.findUnique({ where: { id: a.id } })).toMatchObject({ notes: "Ask for the window", itemId, stopId: null, transportId: null });
    expect(await db.reminder.findUnique({ where: { id: b.id } })).toMatchObject({ notes: null, transportId, itemId: null });
  });

  it("refuses a Reminder about two things", async () => {
    await expect(
      db.reminder.create({ data: { tripId: TRIP_ID, title: "IT Two things", date: "2027-01-03", stopId, itemId } }),
    ).rejects.toThrow();
    const r = await db.reminder.create({ data: { tripId: TRIP_ID, title: "IT One thing", date: "2027-01-03", stopId } });
    await expect(db.reminder.update({ where: { id: r.id }, data: { transportId } })).rejects.toThrow();
    expect(await db.reminder.count({ where: { tripId: TRIP_ID, title: "IT Two things" } })).toBe(0);
  });

  it("deleting the Item or the leg leaves the Reminder about nothing", async () => {
    const it1 = await db.item.create({ data: { tripId: TRIP_ID, title: "IT Doomed", category: "OTHER" } });
    const leg = await db.transport.create({ data: { tripId: TRIP_ID, mode: "BUS" } });
    const r1 = await db.reminder.create({ data: { tripId: TRIP_ID, title: "IT About doomed item", date: "2027-01-04", itemId: it1.id } });
    const r2 = await db.reminder.create({ data: { tripId: TRIP_ID, title: "IT About doomed leg", date: "2027-01-04", transportId: leg.id } });
    await db.item.delete({ where: { id: it1.id } });
    await db.transport.delete({ where: { id: leg.id } });
    expect(await db.reminder.findUnique({ where: { id: r1.id } })).toMatchObject({ itemId: null, title: "IT About doomed item" });
    expect(await db.reminder.findUnique({ where: { id: r2.id } })).toMatchObject({ transportId: null });
  });
});
```

- [ ] **Step 2: Run it, expect FAIL**

`DATABASE_URL=postgresql://trip:trip@localhost:5432/trip?schema=public npm run test:integration -- test/integration/reminder-about.test.ts`.

Expected:
- "the CHECK constraint exists" fails (0 rows);
- the create cases fail with Prisma's `Unknown argument \`notes\`` / `itemId`;
- "refuses a Reminder about two things" fails on the unknown argument, not on the CHECK.

- [ ] **Step 3: Implement**

`prisma/schema.prisma`: replace model `Reminder` and its doc comment (`:961-985`):

```prisma
/// A Traveller's dated note (CONTEXT.md "Reminder"). Carries a date and never
/// a time: TEEPEE dispatches at a few fixed hours, so a promised 14:30 would
/// be a lie — an Alarm is what fires precisely. Surfaces in that day's Digest
/// (title only) and on Home. See ADR 0047.
///
/// "About" (Task 7, spec 2026-10-16 F8): a Reminder may be about ONE Stop,
/// ONE Item or ONE Transport leg — never several. All three NULL means "about
/// the Trip as a whole". The hand-written CHECK "Reminder_about_one_thing_check"
/// (migration 20261016120000) holds at most one set; Prisma cannot express it.
/// Deleting the thing does not delete the Reminder (onDelete: SetNull): the
/// note the Traveller wrote still matters once its thing is gone.
///
/// `notes`: optional detail shown in the app (folded on Home), never read out
/// in the Digest.
model Reminder {
  id          String  @id @default(cuid())
  tripId      String
  stopId      String?
  itemId      String?
  transportId String?
  title       String
  notes       String?
  date        String // "YYYY-MM-DD"

  trip      Trip       @relation(fields: [tripId], references: [id], onDelete: Cascade)
  stop      Stop?      @relation(fields: [stopId], references: [id], onDelete: SetNull)
  item      Item?      @relation(fields: [itemId], references: [id], onDelete: SetNull)
  transport Transport? @relation(fields: [transportId], references: [id], onDelete: SetNull)

  createdAt DateTime @default(now())

  @@index([tripId])
  @@index([date])
  @@index([stopId])
  @@index([itemId])
  @@index([transportId])
  @@index([tripId, date])
}
```

In `model Item`, add `reminders Reminder[]` next to its other relation lists. In `model Transport`, add `reminders  Reminder[]` after the `anchorStop` relation line (`:725`).

Create `prisma/migrations/20261016120000_reminder_notes_and_about/migration.sql`. This is what `prisma migrate dev --create-only` generates for the schema change, plus the hand-written CHECK at the end:

```sql
-- Spec 2026-10-16 F8: a Reminder carries optional notes and may be about one
-- Item or one Transport leg as well as one Stop — never several.

-- AlterTable
ALTER TABLE "Reminder" ADD COLUMN     "itemId" TEXT,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "transportId" TEXT;

-- CreateIndex
CREATE INDEX "Reminder_itemId_idx" ON "Reminder"("itemId");

-- CreateIndex
CREATE INDEX "Reminder_transportId_idx" ON "Reminder"("transportId");

-- AddForeignKey
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_transportId_fkey" FOREIGN KEY ("transportId") REFERENCES "Transport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Hand-written (Prisma's schema language has no CHECK): at most one of the
-- three "about" columns is set. Every existing row has at most stopId set, so
-- this validates without a backfill.
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_about_one_thing_check"
  CHECK (num_nonnulls("stopId", "itemId", "transportId") <= 1);
```

Apply it in the sandbox. Use the local throwaway Postgres only; never a shell holding `.env.production.local`. Use `migrate deploy`, not `migrate dev`: dev would offer to reset over the hand-written CHECK.

```bash
docker compose up -d   # if the local DB isn't up
DATABASE_URL=postgresql://trip:trip@localhost:5432/trip?schema=public \
DIRECT_URL=postgresql://trip:trip@localhost:5432/trip?schema=public \
  npx prisma migrate deploy
npx prisma generate
```

Expected: `Applying migration \`20261016120000_reminder_notes_and_about\``, then `All migrations have been successfully applied.` If the local DB is unavailable, write the files anyway and say so in the report. CI's integration job applies migrations itself.

- [ ] **Step 4: Run it, expect PASS**

The command from Step 2: 4 passed.

- [ ] **Step 5: Task-done check**

- `npx prisma validate`
- `npx tsc --noEmit` (the client regenerated with the new optional fields; nothing else changes)
- `npx eslint test/integration/reminder-about.test.ts`
- the integration file from Step 2

There are no changed source files for `vitest related`.

- [ ] **Step 6: Commit**

Files: `prisma/schema.prisma`, `prisma/migrations/20261016120000_reminder_notes_and_about/migration.sql`, `test/integration/reminder-about.test.ts`.

Message: `feat(reminders): notes and an Item or Transport leg to be about (schema, F8)`.

---

### Task E.2: `lib/reminder-about.ts` — the pure "about" rules, the read shape and the leg label

**Files:**
- Create: `lib/reminder-about.ts`
- Test: Create `lib/reminder-about.test.ts`

**Interfaces:**
- Consumes: `TRANSPORT_MODE_META` (`lib/transport.ts:29`), `TransportMode` (`lib/enum-values`).
- Produces (exact):

```ts
export const ABOUT_KEYS: readonly ["stopId", "itemId", "transportId"];
export type AboutKey = "stopId" | "itemId" | "transportId";
export type ReminderAbout = { stopId: string } | { itemId: string } | { transportId: string };
export interface ReminderItem { id: string; title: string; date: string; notes: string | null; stopId: string | null; stopName: string | null; itemId: string | null; itemTitle: string | null; transportId: string | null; transportLabel: string | null }
export interface ReminderAboutOptions { stops: { id: string; name: string }[]; items: { id: string; title: string }[]; transports: { id: string; label: string }[] }
export interface ReminderTransportRow { mode: string; depPlace: string | null; arrPlace: string | null; depIsHome: boolean; arrIsHome: boolean; fromStop: { name: string } | null; toStop: { name: string } | null; trip: { homeName: string | null } }
export const REMINDER_TRANSPORT_SELECT; export const REMINDER_ITEM_SELECT;
export function aboutCount(r: Partial<Record<AboutKey, string | null | undefined>>): number;
export function replaceAbout<P extends Partial<Record<AboutKey, string | null | undefined>>>(patch: P): P;
export function aboutFromPick(value: string): Partial<Record<AboutKey, string>>;
export function aboutPickValue(about: ReminderAbout): string;
export function reminderTransportLabel(t: ReminderTransportRow): string;
export function reminderAboutLabel(r: Pick<ReminderItem, "stopName" | "itemTitle" | "transportLabel">): string | null;
export function toReminderItem(row: ReminderReadRow): ReminderItem;
```

- [ ] **Step 1: Write the failing test**

Create `lib/reminder-about.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  aboutCount, aboutFromPick, aboutPickValue, replaceAbout,
  reminderAboutLabel, reminderTransportLabel, toReminderItem,
} from "./reminder-about";

const leg = (o: Partial<Parameters<typeof reminderTransportLabel>[0]> = {}) => ({
  mode: "TRAIN", depPlace: null, arrPlace: null, depIsHome: false, arrIsHome: false,
  fromStop: null, toStop: null, trip: { homeName: null }, ...o,
});

describe("aboutCount", () => {
  it("counts only the set about ids", () => {
    expect(aboutCount({})).toBe(0);
    expect(aboutCount({ stopId: "s", itemId: null, transportId: undefined })).toBe(1);
    expect(aboutCount({ stopId: "s", itemId: "i" })).toBe(2);
    expect(aboutCount({ stopId: "" })).toBe(0);
  });
});

describe("replaceAbout", () => {
  it("a patch naming no about key is returned unchanged", () => {
    const p = { title: "x" };
    expect(replaceAbout(p)).toBe(p);
  });
  it("naming one about key clears the other two", () => {
    expect(replaceAbout({ title: "x", itemId: "i1" })).toEqual({ title: "x", itemId: "i1", stopId: null, transportId: null });
  });
  it("a null on one key clears all three (about the Trip as a whole)", () => {
    expect(replaceAbout({ stopId: null })).toEqual({ stopId: null, itemId: null, transportId: null });
  });
});

describe("aboutFromPick / aboutPickValue", () => {
  it("round-trips each kind", () => {
    expect(aboutFromPick(aboutPickValue({ stopId: "s1" }))).toEqual({ stopId: "s1" });
    expect(aboutFromPick(aboutPickValue({ itemId: "i1" }))).toEqual({ itemId: "i1" });
    expect(aboutFromPick(aboutPickValue({ transportId: "t1" }))).toEqual({ transportId: "t1" });
  });
  it("the empty pick and anything unknown mean about the Trip as a whole", () => {
    expect(aboutFromPick("")).toEqual({});
    expect(aboutFromPick("chapter:c1")).toEqual({});
    expect(aboutFromPick("stop:")).toEqual({});
  });
});

describe("reminderTransportLabel", () => {
  it("names the mode and both ends, Stops before typed places", () => {
    expect(reminderTransportLabel(leg({ fromStop: { name: "Paris" }, depPlace: "Paris Gare de Lyon", arrPlace: "Lyon Part-Dieu" }))).toBe("Train Paris → Lyon Part-Dieu");
  });
  it("a Home end is the Home base's name, or 'home'", () => {
    expect(reminderTransportLabel(leg({ mode: "FLIGHT", depIsHome: true, trip: { homeName: "Brisbane" }, toStop: { name: "Rome" } }))).toBe("Flight Brisbane → Rome");
    expect(reminderTransportLabel(leg({ mode: "FLIGHT", arrIsHome: true, fromStop: { name: "Rome" } }))).toBe("Flight Rome → home");
  });
  it("with an end missing it is the mode alone; an unknown mode reads Transport", () => {
    expect(reminderTransportLabel(leg({ fromStop: { name: "Paris" } }))).toBe("Train");
    expect(reminderTransportLabel(leg({ mode: "HOVERCRAFT" }))).toBe("Transport");
  });
});

describe("toReminderItem / reminderAboutLabel", () => {
  const base = { id: "r1", title: "T", date: "2027-01-01", notes: null, stopId: null, stop: null, itemId: null, item: null, transportId: null, transport: null };
  it("a Reminder about the Trip as a whole has every about field null and no label", () => {
    const r = toReminderItem(base);
    expect(r).toEqual({ id: "r1", title: "T", date: "2027-01-01", notes: null, stopId: null, stopName: null, itemId: null, itemTitle: null, transportId: null, transportLabel: null });
    expect(reminderAboutLabel(r)).toBeNull();
  });
  it("maps a Stop, an Item and a leg to their names", () => {
    expect(reminderAboutLabel(toReminderItem({ ...base, stopId: "s", stop: { name: "Lyon" } }))).toBe("Lyon");
    expect(toReminderItem({ ...base, itemId: "i", item: { title: "Bouchon" }, notes: "8pm" })).toMatchObject({ itemTitle: "Bouchon", notes: "8pm" });
    expect(toReminderItem({ ...base, transportId: "t", transport: leg({ depPlace: "Paris", arrPlace: "Lyon" }) }).transportLabel).toBe("Train Paris → Lyon");
  });
});
```

- [ ] **Step 2: Run it, expect FAIL**

`npx vitest run lib/reminder-about.test.ts`. Expected: `Failed to resolve import "./reminder-about"`.

- [ ] **Step 3: Implement**

Create `lib/reminder-about.ts`:

```ts
/**
 * What a Reminder is about (CONTEXT.md "Reminder", spec 2026-10-16 F8): one
 * Stop, one Item or one Transport leg — never several — or nothing (the Trip
 * as a whole). The Postgres CHECK "Reminder_about_one_thing_check" and
 * reminderSchema both hold "at most one"; this module is the shared,
 * pure half: the read shape, the leg label, and the patch rule. Client-safe
 * (no db, no zod) — components import the label helpers and the picker codec.
 */
import { TRANSPORT_MODE_META } from "@/lib/transport";

export const ABOUT_KEYS = ["stopId", "itemId", "transportId"] as const;
export type AboutKey = (typeof ABOUT_KEYS)[number];
export type ReminderAbout = { stopId: string } | { itemId: string } | { transportId: string };

/**
 * A Reminder as Home, the Checklists page, the plan's cards and get_reminders
 * render it. Each `*Id` is set when the Reminder is about that thing; its
 * name (`stopName` / `itemTitle` / `transportLabel`) is joined at read time.
 * All null (never omitted) for a Reminder about the Trip as a whole.
 */
export interface ReminderItem {
  id: string;
  title: string;
  date: string;
  notes: string | null;
  stopId: string | null;
  stopName: string | null;
  itemId: string | null;
  itemTitle: string | null;
  transportId: string | null;
  transportLabel: string | null;
}

/** What the add form's "About" picker offers (lib/reminder-reads.ts readReminderAboutOptions). */
export interface ReminderAboutOptions {
  stops: { id: string; name: string }[];
  items: { id: string; title: string }[];
  transports: { id: string; label: string }[];
}

export const REMINDER_TRANSPORT_SELECT = {
  mode: true,
  depPlace: true,
  arrPlace: true,
  depIsHome: true,
  arrIsHome: true,
  fromStop: { select: { name: true } },
  toStop: { select: { name: true } },
  trip: { select: { homeName: true } },
} as const;

export interface ReminderTransportRow {
  mode: string;
  depPlace: string | null;
  arrPlace: string | null;
  depIsHome: boolean;
  arrIsHome: boolean;
  fromStop: { name: string } | null;
  toStop: { name: string } | null;
  trip: { homeName: string | null };
}

/** The one select every Reminder read uses, so each surface shows the same thing. */
export const REMINDER_ITEM_SELECT = {
  id: true,
  title: true,
  date: true,
  notes: true,
  stopId: true,
  stop: { select: { name: true } },
  itemId: true,
  item: { select: { title: true } },
  transportId: true,
  transport: { select: REMINDER_TRANSPORT_SELECT },
} as const;

export interface ReminderReadRow {
  id: string;
  title: string;
  date: string;
  notes: string | null;
  stopId: string | null;
  stop: { name: string } | null;
  itemId: string | null;
  item: { title: string } | null;
  transportId: string | null;
  transport: ReminderTransportRow | null;
}

/** How many of the three about ids are set. reminderSchema refuses more than one. */
export function aboutCount(r: Partial<Record<AboutKey, string | null | undefined>>): number {
  return ABOUT_KEYS.filter((k) => r[k] != null && r[k] !== "").length;
}

/**
 * The update rule (ADR 0075 PATCH, spec F8): a patch that names ANY about key
 * replaces the whole about — the keys it leaves out are cleared — so a
 * Reminder moved from a Stop to an Item never holds both (the CHECK would
 * refuse the write). A patch naming none keeps the about as it is.
 */
export function replaceAbout<P extends Partial<Record<AboutKey, string | null | undefined>>>(patch: P): P {
  if (ABOUT_KEYS.every((k) => patch[k] === undefined)) return patch;
  const out: Record<string, unknown> = { ...patch };
  for (const k of ABOUT_KEYS) if (out[k] === undefined) out[k] = null;
  return out as P;
}

const PICK_PREFIX: Record<AboutKey, string> = { stopId: "stop", itemId: "item", transportId: "transport" };

/** The picker's option value for a thing: "stop:<id>", "item:<id>" or "transport:<id>". */
export function aboutPickValue(about: ReminderAbout): string {
  const key = ABOUT_KEYS.find((k) => k in about)!;
  return `${PICK_PREFIX[key]}:${(about as Record<AboutKey, string>)[key]}`;
}

/** The picker's value back to the action's fields; "" (the whole Trip) or anything unknown → {}. */
export function aboutFromPick(value: string): Partial<Record<AboutKey, string>> {
  const at = value.indexOf(":");
  if (at < 0) return {};
  const prefix = value.slice(0, at);
  const id = value.slice(at + 1);
  const key = ABOUT_KEYS.find((k) => PICK_PREFIX[k] === prefix);
  return key && id ? { [key]: id } : {};
}

const MODE_LABEL = TRANSPORT_MODE_META as Partial<Record<string, { label: string }>>;

/** "Train Paris → Lyon": the leg's mode and its two ends, as a Reminder's chip names it. */
export function reminderTransportLabel(t: ReminderTransportRow): string {
  const word = MODE_LABEL[t.mode]?.label ?? "Transport";
  const home = t.trip.homeName ?? "home";
  const from = t.depIsHome ? home : (t.fromStop?.name ?? t.depPlace);
  const to = t.arrIsHome ? home : (t.toStop?.name ?? t.arrPlace);
  return from && to ? `${word} ${from} → ${to}` : word;
}

export function toReminderItem(r: ReminderReadRow): ReminderItem {
  return {
    id: r.id,
    title: r.title,
    date: r.date,
    notes: r.notes,
    stopId: r.stopId,
    stopName: r.stop?.name ?? null,
    itemId: r.itemId,
    itemTitle: r.item?.title ?? null,
    transportId: r.transportId,
    transportLabel: r.transport ? reminderTransportLabel(r.transport) : null,
  };
}

/** The name of what the Reminder is about, for its chip; null when it is about the Trip as a whole. */
export function reminderAboutLabel(r: Pick<ReminderItem, "stopName" | "itemTitle" | "transportLabel">): string | null {
  return r.stopName ?? r.itemTitle ?? r.transportLabel ?? null;
}
```

- [ ] **Step 4: Run it, expect PASS**

`npx vitest run lib/reminder-about.test.ts`

- [ ] **Step 5: Task-done check**

- `npx vitest related --run lib/reminder-about.ts`
- `npx tsc --noEmit`
- `npx eslint lib/reminder-about.ts lib/reminder-about.test.ts`

- [ ] **Step 6: Commit**

Files: `lib/reminder-about.ts`, `lib/reminder-about.test.ts`.

Message: `feat(reminders): one module for what a Reminder is about (F8)`.

---

### Task E.3: Surprise — a Reminder about a hidden Item is hidden; the guards follow the Item

**Files:**
- Modify: `lib/surprise-visibility.ts:202` (`where.reminder`)
- Modify: `lib/surprise-guard.ts:105-108` (`surpriseRootForEntity` REMINDER), `lib/surprise-guard.ts:126-148` (`insideSurpriseEntityIds`)
- Modify: `lib/guards.ts:217-224` (`ReminderRow`: add `itemId: string | null`), `lib/guards.ts:260` (`ROW_SELECT.reminder`: add `itemId: true`), `lib/guards.ts:314-315` (`surpriseRefFor` reminder)
- Test: `lib/surprise-visibility.test.ts:111-113` (update) + new case; `lib/surprise-guard.test.ts:198-209`, `:222-252`; `lib/guards.test.ts:498-516` (add a case)

**Interfaces:**
- Consumes: the `Reminder.itemId` column (E.1).
- Produces:
  - `SurpriseVisibility.where.reminder = { AND: [nullableNotIn("stopId", hiddenStopIds), nullableNotIn("itemId", hiddenItemIds)] }`;
  - `requireRowAccess("reminder", id)` refs `{ itemId }` when the row's `itemId` is set, else `{ stopId }`;
  - `surpriseRootForEntity("REMINDER", id)` follows the Item first;
  - `insideSurpriseEntityIds("STOP", id)` stamps Reminders about the Stop or its Items; `("ITEM", id)` stamps Reminders about the Item.

- [ ] **Step 1: Write the failing test**

`lib/surprise-visibility.test.ts`. Case 2 pins this fragment, and this task changes it, so update the assertion at `:111-113` to:

```ts
    // Reminder.stopId/itemId and Attachment.targetId are nullable, so they keep
    // the OR-with-null form. F8: a Reminder about a hidden Item is hidden too.
    expect(v.where.reminder).toEqual({
      AND: [
        { OR: [{ stopId: null }, { stopId: { notIn: ["stop-1"] } }] },
        { OR: [{ itemId: null }, { itemId: { notIn: ["item-in-1"] } }] },
      ],
    });
```

and add after case 2b:

```ts
  it("F8: a Reminder about a Surprise Item the viewer is surprised by is filtered out", async () => {
    itemFindManyMock.mockResolvedValueOnce([liveItemRow({ id: "item-root" })]); // pre-query; surprises sam
    const v = await loadSurpriseVisibility(TRIP_ID, "sam", { now: NOW });
    expect(v.where.reminder).toEqual({
      AND: [
        { OR: [{ stopId: null }, { stopId: { notIn: [] } }] },
        { OR: [{ itemId: null }, { itemId: { notIn: ["item-root"] } }] },
      ],
    });
  });
```

`lib/surprise-guard.test.ts`. In "resolves STOP, REMINDER, …" keep the loop as is (the `{ stopId: "stop-1" }` row still resolves through its Stop). Add:

```ts
  it("REMINDER about an Item resolves through the Item (F8)", async () => {
    reminderFindUniqueMock.mockResolvedValue({ stopId: null, itemId: "item-1" });
    itemFindUniqueMock.mockResolvedValue(itemRow("item-1", null, LIVE));
    expect(await surpriseRootForEntity("REMINDER", "r1", NOW)).toEqual({ type: "ITEM", id: "item-1" });
    expect(reminderFindUniqueMock).toHaveBeenCalledWith({ where: { id: "r1" }, select: { stopId: true, itemId: true } });
  });
```

In `insideSurpriseEntityIds`, these assertions pin the reminder query, which this task changes:
- Stop case: drop `"reminder"` from the `for (const m of [...])` list at `:234` and add
  `expect(findManyMocks.reminder).toHaveBeenCalledWith({ where: { OR: [{ stopId: "stop-1" }, { item: { stopId: "stop-1" } }] }, select: { id: true } });`
- Item case: replace `expect(findManyMocks.reminder).not.toHaveBeenCalled();` with
  `expect(findManyMocks.reminder).toHaveBeenCalledWith({ where: { itemId: "item-1" }, select: { id: true } });`
  and set `findManyMocks.reminder.mockResolvedValue([{ id: "rem-9" }]);` at the top of that case, with the expected ids becoming `["cost-1", "item-1", "note-1", "rem-9"]`.

`lib/guards.test.ts`, after `:516`:

```ts
  it("a reminder about an Item is checked against the Item (F8)", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } });
    findManyMock.mockResolvedValue([{ userId: "u1", role: "owner" }]);
    reminderFindUniqueMock.mockResolvedValue({ id: "r3", tripId: "trip-1", stopId: null, itemId: "i1" });

    await requireRowAccess("reminder", "r3");

    expect(requireOutsideSurpriseMock).toHaveBeenCalledWith("u1", { itemId: "i1" });
  });
```

- [ ] **Step 2: Run it, expect FAIL**

`npx vitest run lib/surprise-visibility.test.ts lib/surprise-guard.test.ts lib/guards.test.ts`. Expected:
- the `where.reminder` assertions fail (no `itemId` clause);
- the REMINDER-about-Item root is `null`;
- the insideSurpriseEntityIds reminder calls have the old shape;
- the guards case gets `{ stopId: null }`.

- [ ] **Step 3: Implement**

`lib/surprise-visibility.ts:202`:

```ts
      // F8: a Reminder about a hidden Stop or a hidden Item (a Surprise Item, or
      // any Item inside a hidden Stop) is hidden. Transport is outside every
      // Surprise, so a Reminder about a leg never is.
      reminder: { AND: [nullableNotIn("stopId", hiddenStopIds), nullableNotIn("itemId", hiddenItemIds)] },
```

`lib/surprise-guard.ts`, the REMINDER case:

```ts
    case "REMINDER": {
      const r = await db.reminder.findUnique({ where: { id: entityId }, select: { stopId: true, itemId: true } });
      if (!r) return null;
      return surpriseRootFor(r.itemId ? { itemId: r.itemId } : { stopId: r.stopId }, now);
    }
```

`insideSurpriseEntityIds`:
- in the STOP branch, replace `db.reminder.findMany(byStop)` with `db.reminder.findMany({ where: { OR: [{ stopId: id }, { item: { stopId: id } }] }, select: { id: true } })`;
- after the `if (kind === "STOP") { … }` block add
  `else { rest = ids(await db.reminder.findMany({ where: { itemId: id }, select: { id: true } })); }`;
- update its JSDoc: "for a Stop, … and Reminders about it or its Items; for an Item, the Item, its Notes, Attachments, Reminders and the Costs it owns".

`lib/guards.ts`:
- `ReminderRow`: add `itemId: string | null;`.
- `ROW_SELECT.reminder`: add `itemId: true`.
- `surpriseRefFor`:

```ts
    case "reminder": {
      const r = row as ReminderRow;
      return r.itemId ? { itemId: r.itemId } : { stopId: r.stopId };
    }
```

- [ ] **Step 4: Run it, expect PASS**

The command from Step 2.

- [ ] **Step 5: Task-done check**

- `npx vitest related --run lib/surprise-visibility.ts lib/surprise-guard.ts lib/guards.ts`
- `npx tsc --noEmit`
- `npx eslint lib/surprise-visibility.ts lib/surprise-guard.ts lib/guards.ts lib/surprise-visibility.test.ts lib/surprise-guard.test.ts lib/guards.test.ts`

- [ ] **Step 6: Commit**

Files: the six above.

Message:

```
feat(surprise): a Reminder about a hidden Item stays hidden (F8)

The insideSurpriseEntityIds reminder-query assertions are updated because
the query changed.
```

---

### Task E.4: Reminder reads carry notes and about — `listRemindersForTrip`, `readRemindersAbout`, the plan page

**Files:**
- Modify: `lib/reminder-reads.ts` (whole file: the `ReminderItem` interface `:5-18` becomes a re-export; `listRemindersForTrip` `:29-40`; new `readRemindersAbout`)
- Modify: `app/(app)/trips/[tripId]/plan/page.tsx:21` (import), `:88` and `:135-139` (the reminder query in the wave becomes `readRemindersAbout(tripId, v)`), `:292-308` (delete the grouping loop and `stopNameById` if unused elsewhere: `grep -n stopNameById` shows only `:295,:305` today), `:435` (`remindersByStopId={remindersAbout.byStopId}`)
- Create: `test/helpers/reminder-item.ts`
- Test: `lib/reminder-reads.test.ts`, `test/integration/reminder-reads.test.ts`, `app/(app)/trips/[tripId]/plan/page.test.tsx:14-40,174,353-381`
- Fixture sweep (TypeScript requires the new fields). Every site `npx tsc --noEmit` reports after Step 3, known today:
  - `app/(app)/trips/[tripId]/checklists/page.test.tsx:26`
  - `components/plan/stop-extras-dialog.test.tsx:12`
  - `components/trip/itinerary-manager.test.tsx:2327`
  - `components/trip/reminders-card.test.tsx:40,52,63,74,92,93,121,139,155,156,209,227,241,255-262,274`
  - `lib/sort-these-out.test.ts:16-24`
  - `lib/mcp/tools/reads.test.ts:376`
  - plus any in `components/trip/home/phase-planning.test.tsx` and `lib/trips/trips-page-loader.test.ts` that tsc names.

  Wrap each literal in `reminderItem({...})`, keeping its fields. This rewrites fixtures only; assertions are unchanged. At `reads.test.ts:380-382` the expected JSON becomes `reminderItem({ id: "r1", title: "Buy visa", date: "2026-03-01" })`.

**Interfaces:**
- Consumes: `REMINDER_ITEM_SELECT`, `toReminderItem`, `ReminderItem` (E.2); `where.reminder` with `itemId` (E.3); `SurpriseVisibility` (`lib/surprise-visibility.ts`).
- Produces:

```ts
export type { ReminderItem } from "@/lib/reminder-about";
export interface RemindersAbout { byStopId: Map<string, ReminderItem[]>; byItemId: Map<string, ReminderItem[]>; byTransportId: Map<string, ReminderItem[]> }
export async function listRemindersForTrip(tripId: string, fromDate: string): Promise<ReminderItem[]>;
export async function readRemindersAbout(tripId: string, v: SurpriseVisibility): Promise<RemindersAbout>;
```

  and `test/helpers/reminder-item.ts`: `reminderItem(over: Pick<ReminderItem, "id" | "title" | "date"> & Partial<ReminderItem>): ReminderItem`.

- [ ] **Step 1: Write the failing test**

Create `test/helpers/reminder-item.ts`:

```ts
import type { ReminderItem } from "@/lib/reminder-about";

/** A ReminderItem fixture: about the Trip as a whole, no notes, unless overridden. */
export function reminderItem(over: Pick<ReminderItem, "id" | "title" | "date"> & Partial<ReminderItem>): ReminderItem {
  return { notes: null, stopId: null, stopName: null, itemId: null, itemTitle: null, transportId: null, transportLabel: null, ...over };
}
```

`lib/reminder-reads.test.ts`:
- Mock `db.reminder.findMany` as now.
- Import `REMINDER_ITEM_SELECT` from `@/lib/reminder-about` and `reminderItem` from `@/test/helpers/reminder-item`.
- In "returns reminders dated on or after fromDate…", change `select: {...}` to `select: REMINDER_ITEM_SELECT`. The mocked row becomes `{ id: "r1", title: "Print docs", date: "2026-07-02", notes: null, stopId: null, stop: null, itemId: null, item: null, transportId: null, transport: null }` and the expected result `[reminderItem({ id: "r1", title: "Print docs", date: "2026-07-02" })]`.
- Apply the same row/result rewrite to the stopName case below it.
- Add:

```ts
  it("returns notes and what the Reminder is about — an Item or a leg — by name (F8)", async () => {
    reminderFindManyMock.mockResolvedValue([
      { id: "r2", title: "Book table", date: "2026-07-03", notes: "window seat", stopId: null, stop: null, itemId: "i1", item: { title: "Bouchon" }, transportId: null, transport: null },
      { id: "r3", title: "Seats", date: "2026-07-04", notes: null, stopId: null, stop: null, itemId: null, item: null, transportId: "t1",
        transport: { mode: "TRAIN", depPlace: "Paris", arrPlace: "Lyon", depIsHome: false, arrIsHome: false, fromStop: null, toStop: null, trip: { homeName: null } } },
    ]);
    const result = await listRemindersForTrip(TRIP_ID, "2026-07-01");
    expect(result).toEqual([
      reminderItem({ id: "r2", title: "Book table", date: "2026-07-03", notes: "window seat", itemId: "i1", itemTitle: "Bouchon" }),
      reminderItem({ id: "r3", title: "Seats", date: "2026-07-04", transportId: "t1", transportLabel: "Train Paris → Lyon" }),
    ]);
  });

describe("readRemindersAbout", () => {
  it("reads every Reminder about a thing, whatever its date, behind the viewer's Surprise filter, grouped by the thing", async () => {
    const row = (id: string, o: object) => ({ id, title: id, date: "2026-07-01", notes: null, stopId: null, stop: null, itemId: null, item: null, transportId: null, transport: null, ...o });
    reminderFindManyMock.mockResolvedValue([
      row("a", { stopId: "s1", stop: { name: "Lyon" } }),
      row("b", { itemId: "i1", item: { title: "Bouchon" } }),
      row("c", { stopId: "s1", stop: { name: "Lyon" } }),
    ]);
    const v = hiddenVisibility();
    const out = await readRemindersAbout(TRIP_ID, v);
    expect(requireTripAccessMock).toHaveBeenCalledWith(TRIP_ID);
    expect(reminderFindManyMock).toHaveBeenCalledWith({
      where: { tripId: TRIP_ID, OR: [{ stopId: { not: null } }, { itemId: { not: null } }, { transportId: { not: null } }], ...MARKER_WHERE.reminder },
      orderBy: { date: "asc" },
      select: REMINDER_ITEM_SELECT,
    });
    expect(out.byStopId.get("s1")?.map((r) => r.id)).toEqual(["a", "c"]);
    expect(out.byItemId.get("i1")?.map((r) => r.itemTitle)).toEqual(["Bouchon"]);
    expect(out.byTransportId.size).toBe(0);
  });
});
```

Before writing the `readRemindersAbout` case, check how `hiddenVisibility()` and `MARKER_WHERE` are used by the existing Surprise test in this file, and follow the same pattern.

`test/integration/reminder-reads.test.ts`. In `beforeEach`, after the stops, create:

```ts
    await db.item.create({ data: { id: "it-rem-secret-item", tripId: TRIP_ID, stopId: SECRET, title: "IT Secret show", category: "OTHER" } });
    await db.item.create({ data: { id: "it-rem-tram", tripId: TRIP_ID, stopId: "it-rem-porto", title: "IT Tram 28", category: "OTHER" } });
    await db.transport.create({ data: { id: "it-rem-leg", tripId: TRIP_ID, mode: "TRAIN", fromStopId: "it-rem-porto", toStopId: SECRET } });
```

and add to the `createMany`:

```ts
        { tripId: TRIP_ID, itemId: "it-rem-tram", title: "IT Tram tickets", date: "2027-06-03", notes: "Buy a Viva card" },
        { tripId: TRIP_ID, itemId: "it-rem-secret-item", title: "IT Secret tickets", date: "2027-06-05" },
        { tripId: TRIP_ID, transportId: "it-rem-leg", title: "IT Seats", date: "2027-06-04" },
```

Update the two existing expectations:
- planner `["IT Visa", "IT Port tour", "IT Tram tickets", "IT Seats", "IT Secret dinner", "IT Secret tickets"]`;
- member `["IT Visa", "IT Port tour", "IT Tram tickets", "IT Seats"]`. The leg's label names the Secret Stop; Stop names aren't hidden.

Add:

```ts
  it("returns notes and the Item / leg by name (F8)", async () => {
    const rows = await listRemindersForTrip(TRIP_ID, "2027-01-01");
    expect(rows.find((r) => r.title === "IT Tram tickets")).toMatchObject({ notes: "Buy a Viva card", itemId: "it-rem-tram", itemTitle: "IT Tram 28" });
    expect(rows.find((r) => r.title === "IT Seats")).toMatchObject({ transportId: "it-rem-leg", transportLabel: "Train IT Porto → IT Secret" });
  });

  it("readRemindersAbout groups by thing, any date, and hides a Reminder about an Item inside a Surprise Stop from the surprised Traveller", async () => {
    const forOwner = await readRemindersAbout(TRIP_ID, await loadSurpriseVisibility(TRIP_ID, OWNER));
    expect(forOwner.byItemId.get("it-rem-secret-item")?.map((r) => r.title)).toEqual(["IT Secret tickets"]);
    expect(forOwner.byStopId.get("it-rem-porto")?.map((r) => r.title)).toEqual(["IT Port tour"]);
    expect(forOwner.byTransportId.get("it-rem-leg")?.map((r) => r.title)).toEqual(["IT Seats"]);
    viewer.id = MEMBER;
    const forMember = await readRemindersAbout(TRIP_ID, await loadSurpriseVisibility(TRIP_ID, MEMBER));
    expect(forMember.byItemId.has("it-rem-secret-item")).toBe(false);
    expect(forMember.byStopId.has(SECRET)).toBe(false);
    expect(forMember.byItemId.get("it-rem-tram")?.length).toBe(1);
  });
```

Import `readRemindersAbout` and `loadSurpriseVisibility` (from `@/lib/surprise-visibility`).

`app/(app)/trips/[tripId]/plan/page.test.tsx`:
- Add `vi.mock("@/lib/reminder-reads", () => ({ readRemindersAbout }))` with a hoisted `readRemindersAbout = vi.fn(async () => ({ byStopId: new Map(), byItemId: new Map(), byTransportId: new Map() }))`.
- Drop `reminder` from the db mock and from `:174`.
- In the Task 7 case (`:356`), seed `readRemindersAbout.mockResolvedValueOnce({ byStopId: new Map([["s1", [reminderItem({ id: "r1", title: "Reconfirm the tour", date: "2026-01-02", stopId: "s1", stopName: "Rome" })]]]), byItemId: new Map(), byTransportId: new Map() })`.
- Replace the `mockDb.reminder.findMany` call-shape assertion with `expect(readRemindersAbout).toHaveBeenCalledWith("trip-1", expect.anything())`. The query now lives in `lib/reminder-reads.ts` and is pinned there and in integration; say so in the commit.
- Keep the `remindersByStopId.get("s1")` assertion, its expected value wrapped in `reminderItem(...)`.

- [ ] **Step 2: Run it, expect FAIL**

`npx vitest run lib/reminder-reads.test.ts "app/(app)/trips/[tripId]/plan/page.test.tsx"`. Expected: the select assertion fails (old select), `readRemindersAbout` is not exported, and the page test fails because `readRemindersAbout` was never called.

Integration (DB up): `DATABASE_URL=postgresql://trip:trip@localhost:5432/trip?schema=public npm run test:integration -- test/integration/reminder-reads.test.ts`. It fails on the missing `notes`/`itemTitle` and the import.

- [ ] **Step 3: Implement**

`lib/reminder-reads.ts`:

```ts
import { db } from "@/lib/db";
import { requireTripAccess } from "@/lib/guards";
import { loadSurpriseVisibility, type SurpriseVisibility } from "@/lib/surprise-visibility";
import { REMINDER_ITEM_SELECT, toReminderItem, type ReminderItem } from "@/lib/reminder-about";

export type { ReminderItem } from "@/lib/reminder-about";

/**
 * Reminders for a trip dated on or after `fromDate`, soonest first.
 *
 * Called by the trip Home, the Checklists page, the Trips page loader and the
 * Claude connection's get_reminders. Access-checked: `requireTripAccess` is
 * the first statement. Surprise (ADR 0051, spec F8): a Reminder about a Stop
 * or Item hidden from the viewer stays in the database. A lib read (spec
 * 2026-10-14 card 3.N), no longer a published action.
 */
export async function listRemindersForTrip(tripId: string, fromDate: string): Promise<ReminderItem[]> {
  const { user } = await requireTripAccess(tripId);
  const v = await loadSurpriseVisibility(tripId, user.id);

  const rows = await db.reminder.findMany({
    where: { tripId, date: { gte: fromDate }, ...v.where.reminder },
    orderBy: { date: "asc" },
    take: 20,
    select: REMINDER_ITEM_SELECT,
  });
  return rows.map(toReminderItem);
}

/** Every Reminder about a Stop, Item or Transport leg, grouped by the thing (spec F8: the thing's card lists it). */
export interface RemindersAbout {
  byStopId: Map<string, ReminderItem[]>;
  byItemId: Map<string, ReminderItem[]>;
  byTransportId: Map<string, ReminderItem[]>;
}

/**
 * The plan editor's card lists: every Reminder about a thing, whatever its
 * date (unlike the "upcoming" feed above), soonest first. The page passes the
 * Surprise visibility it already loaded for this viewer (readPlan's) so the
 * pre-query isn't run twice; access is still checked first (memoised).
 */
export async function readRemindersAbout(tripId: string, v: SurpriseVisibility): Promise<RemindersAbout> {
  await requireTripAccess(tripId);
  const rows = await db.reminder.findMany({
    where: {
      tripId,
      OR: [{ stopId: { not: null } }, { itemId: { not: null } }, { transportId: { not: null } }],
      ...v.where.reminder,
    },
    orderBy: { date: "asc" },
    select: REMINDER_ITEM_SELECT,
  });
  const out: RemindersAbout = { byStopId: new Map(), byItemId: new Map(), byTransportId: new Map() };
  const push = (m: Map<string, ReminderItem[]>, id: string, r: ReminderItem) => m.set(id, [...(m.get(id) ?? []), r]);
  for (const r of rows.map(toReminderItem)) {
    if (r.stopId) push(out.byStopId, r.stopId, r);
    else if (r.itemId) push(out.byItemId, r.itemId, r);
    else if (r.transportId) push(out.byTransportId, r.transportId, r);
  }
  return out;
}
```

`app/(app)/trips/[tripId]/plan/page.tsx`:
- Change the import at `:21` to `import { readRemindersAbout } from "@/lib/reminder-reads";`. If `ReminderItem` is no longer used on the page, remove it.
- Rename the wave's 4th binding `stopReminders` → `remindersAbout` and replace its `db.reminder.findMany({...})` (`:135-139`) with `readRemindersAbout(tripId, v),`.
- Delete `:292-308` (the comment, `stopNameById` if now unused, and the loop).
- At `:435` pass `remindersByStopId={remindersAbout.byStopId}`.

Then run `npx tsc --noEmit` and fix every reported ReminderItem fixture with `reminderItem(...)` (the site list under Files).

- [ ] **Step 4: Run it, expect PASS**

`npx vitest run lib/reminder-reads.test.ts "app/(app)/trips/[tripId]/plan/page.test.tsx"`. Then the integration command from Step 2.

- [ ] **Step 5: Task-done check**

- `npx vitest related --run lib/reminder-reads.ts "app/(app)/trips/[tripId]/plan/page.tsx" test/helpers/reminder-item.ts`
- `npx tsc --noEmit` (clean)
- `npx eslint lib/reminder-reads.ts "app/(app)/trips/[tripId]/plan/page.tsx" test/helpers/reminder-item.ts <every fixture file touched>`
- the integration file

- [ ] **Step 6: Commit**

Files: `lib/reminder-reads.ts`, `lib/reminder-reads.test.ts`, `app/(app)/trips/[tripId]/plan/page.tsx`, `app/(app)/trips/[tripId]/plan/page.test.tsx`, `test/helpers/reminder-item.ts`, `test/integration/reminder-reads.test.ts`, and the fixture files.

Message:

```
feat(reminders): reads carry notes and the Item or leg a Reminder is about (F8)

The plan page's reminder query moved into readRemindersAbout, so its
call-shape assertion now lives in lib/reminder-reads.test.ts.
```

---

### Task E.5: `readReminderAboutOptions` — what the "About" picker offers

**Files:**
- Modify: `lib/reminder-reads.ts` (append)
- Test: `lib/reminder-reads.test.ts` (append; extend the `@/lib/db` mock with `stop.findMany`, `item.findMany`, `transport.findMany`), `test/integration/reminder-reads.test.ts` (append)

**Interfaces:**
- Consumes: `REMINDER_TRANSPORT_SELECT`, `reminderTransportLabel`, `ReminderAboutOptions` (E.2); `REAL_PLAN` (`lib/plan-scope`).
- Produces: `export async function readReminderAboutOptions(tripId: string): Promise<ReminderAboutOptions>`. Real plan only. Stops omit the viewer's hidden Stops; Items omit every hidden Item (`v.where.item`); legs are all real-plan legs. Stops and legs come in `sortOrder` order, Items by `date` then `sortOrder`.

- [ ] **Step 1: Write the failing test**

`lib/reminder-reads.test.ts`:

```ts
describe("readReminderAboutOptions", () => {
  it("offers the real plan's Stops, Items and legs the viewer can see, labelled", async () => {
    stopFindManyMock.mockResolvedValue([{ id: "s1", name: "Lyon" }]);
    itemFindManyMock.mockResolvedValue([{ id: "i1", title: "Bouchon" }]);
    transportFindManyMock.mockResolvedValue([
      { id: "t1", mode: "TRAIN", depPlace: "Paris", arrPlace: "Lyon", depIsHome: false, arrIsHome: false, fromStop: null, toStop: null, trip: { homeName: null } },
    ]);
    const v = hiddenVisibility({ hiddenStopIds: ["s-secret"] });
    loadSurpriseVisibilityMock.mockResolvedValueOnce(v);

    const out = await readReminderAboutOptions(TRIP_ID);

    expect(requireTripAccessMock).toHaveBeenCalledWith(TRIP_ID);
    expect(stopFindManyMock).toHaveBeenCalledWith({
      where: { tripId: TRIP_ID, forkId: null, id: { notIn: ["s-secret"] } },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true },
    });
    expect(itemFindManyMock).toHaveBeenCalledWith({
      where: { tripId: TRIP_ID, forkId: null, ...MARKER_WHERE.item },
      orderBy: [{ date: "asc" }, { sortOrder: "asc" }],
      select: { id: true, title: true },
    });
    expect(transportFindManyMock).toHaveBeenCalledWith(expect.objectContaining({ where: { tripId: TRIP_ID, forkId: null }, orderBy: { sortOrder: "asc" } }));
    expect(out).toEqual({
      stops: [{ id: "s1", name: "Lyon" }],
      items: [{ id: "i1", title: "Bouchon" }],
      transports: [{ id: "t1", label: "Train Paris → Lyon" }],
    });
  });
});
```

Check whether `hiddenVisibility` (`test/helpers/surprise-visibility.ts`) takes overrides. If it doesn't, spread: `({ ...hiddenVisibility(), hiddenStopIds: ["s-secret"] })`.

`test/integration/reminder-reads.test.ts`:

```ts
  it("readReminderAboutOptions never offers the surprised Traveller the Surprise Stop or anything inside it", async () => {
    const forOwner = await readReminderAboutOptions(TRIP_ID);
    expect(forOwner.stops.map((s) => s.id)).toEqual(["it-rem-porto", SECRET]);
    expect(forOwner.items.map((i) => i.id).sort()).toEqual(["it-rem-secret-item", "it-rem-tram"]);
    expect(forOwner.transports).toEqual([{ id: "it-rem-leg", label: "Train IT Porto → IT Secret" }]);
    viewer.id = MEMBER;
    const forMember = await readReminderAboutOptions(TRIP_ID);
    expect(forMember.stops.map((s) => s.id)).toEqual(["it-rem-porto"]);
    expect(forMember.items.map((i) => i.id)).toEqual(["it-rem-tram"]);
  });
```

- [ ] **Step 2: Run it, expect FAIL**

`npx vitest run lib/reminder-reads.test.ts`. Expected: `readReminderAboutOptions is not a function` (not exported).

- [ ] **Step 3: Implement**

Append to `lib/reminder-reads.ts`. Add imports for `REAL_PLAN` from `@/lib/plan-scope`, and `REMINDER_TRANSPORT_SELECT`, `reminderTransportLabel`, `type ReminderAboutOptions` from `@/lib/reminder-about`.

```ts
/**
 * What the Reminders card's "About" picker offers (spec F8): the real plan's
 * Stops, Items and Transport legs — a Reminder hangs off the real plan only —
 * minus whatever a live Surprise hides from this viewer (they could not write
 * a Reminder about it anyway: requireOutsideSurprise refuses).
 */
export async function readReminderAboutOptions(tripId: string): Promise<ReminderAboutOptions> {
  const { user } = await requireTripAccess(tripId);
  const v = await loadSurpriseVisibility(tripId, user.id);
  const [stops, items, transports] = await Promise.all([
    db.stop.findMany({
      where: { tripId, ...REAL_PLAN, id: { notIn: v.hiddenStopIds } },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true },
    }),
    db.item.findMany({
      where: { tripId, ...REAL_PLAN, ...v.where.item },
      orderBy: [{ date: "asc" }, { sortOrder: "asc" }],
      select: { id: true, title: true },
    }),
    db.transport.findMany({
      where: { tripId, ...REAL_PLAN },
      orderBy: { sortOrder: "asc" },
      select: { id: true, ...REMINDER_TRANSPORT_SELECT },
    }),
  ]);
  return {
    stops,
    items,
    transports: transports.map((t) => ({ id: t.id, label: reminderTransportLabel(t) })),
  };
}
```

- [ ] **Step 4: Run it, expect PASS**

`npx vitest run lib/reminder-reads.test.ts`. Then the integration file (DB up).

- [ ] **Step 5: Task-done check**

- `npx vitest related --run lib/reminder-reads.ts`
- `npx tsc --noEmit`
- `npx eslint lib/reminder-reads.ts lib/reminder-reads.test.ts test/integration/reminder-reads.test.ts`
- the integration file

- [ ] **Step 6: Commit**

Message: `feat(reminders): read what a Reminder can be about, Surprise-aware (F8)`.

---

### Task E.6: `ReminderNotes` — notes folded, tap to expand

**Files:**
- Create: `components/trip/reminder-notes.tsx`
- Test: Create `components/trip/reminder-notes.test.tsx`

**Interfaces:**
- Produces: `export function ReminderNotes({ notes }: { notes: string }): JSX.Element`. A native `<details>`/`<summary>Notes</summary>`, collapsed by default, with the notes in `whitespace-pre-wrap`.

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReminderNotes } from "./reminder-notes";

describe("ReminderNotes (spec F8: folded, tap to expand)", () => {
  it("starts folded and opens on tap", async () => {
    const user = userEvent.setup();
    render(<ReminderNotes notes={"Door code 4411\nRing twice"} />);
    expect(screen.getByText(/Door code 4411/)).not.toBeVisible();
    await user.click(screen.getByText("Notes"));
    expect(screen.getByText(/Door code 4411/)).toBeVisible();
  });
});
```

- [ ] **Step 2: Run it, expect FAIL**

`npx vitest run components/trip/reminder-notes.test.tsx`. Expected: the import fails.

- [ ] **Step 3: Implement**

```tsx
/**
 * A Reminder's notes (spec 2026-10-16 F8): folded under a "Notes" tap target
 * wherever a Reminder is listed, so the list stays a list of titles. Native
 * <details> — keyboard and screen-reader behaviour for free, no state.
 */
export function ReminderNotes({ notes }: { notes: string }) {
  return (
    <details className="group mt-1">
      <summary className="min-h-11 cursor-pointer list-none py-2 text-xs font-semibold text-muted-foreground hover:text-foreground sm:min-h-0 sm:py-0">
        Notes
      </summary>
      <p className="mt-1 whitespace-pre-wrap break-words text-xs text-foreground">{notes}</p>
    </details>
  );
}
```

- [ ] **Step 4: Run it, expect PASS** — same command.

- [ ] **Step 5: Task-done check**

- `npx vitest related --run components/trip/reminder-notes.tsx`
- `npx tsc --noEmit`
- `npx eslint components/trip/reminder-notes.tsx components/trip/reminder-notes.test.tsx`

- [ ] **Step 6: Commit**

Message: `feat(reminders): fold a Reminder's notes behind a tap (F8)`.

---

### Task E.7: `reminderSchema` + client gate — notes, `itemId`, `transportId`, at most one about

**Files:**
- Modify: `lib/validations/reminder.ts` (whole schema)
- Modify: `lib/reminder-input.ts:10-22`
- Test: `lib/reminder-input.test.ts`; Create `lib/validations/reminder.test.ts`

**Interfaces:**
- Produces:

```ts
export const REMINDER_ONE_THING = "A Reminder is about one thing at most: a Stop, a thing to do or a Transport leg.";
export const reminderFieldsSchema: z.ZodObject<{ title; date; notes?: string (trim, max 2000); stopId?; itemId?; transportId? (each cuid) }>;
export const reminderSchema; // reminderFieldsSchema.refine(at most one about id), form-level message REMINDER_ONE_THING (errors key "_")
export type ReminderInput = z.infer<typeof reminderSchema>; // { title; date; notes?; stopId?; itemId?; transportId? }
export function checkReminderInput(input: { title: string; date: string; notes?: string }): { success: true; data: { title: string; date: string; notes?: string } } | ActionFailure;
```

- [ ] **Step 1: Write the failing test**

Create `lib/validations/reminder.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { reminderSchema, REMINDER_ONE_THING } from "./reminder";
import { flattenZodErrors } from "@/lib/action-result";

const CUID_A = "cst0p00000000000000000001";
const CUID_B = "cit3m00000000000000000001";

describe("reminderSchema (spec F8)", () => {
  it("takes optional notes, trimmed, up to 2000 characters", () => {
    expect(reminderSchema.parse({ title: "T", date: "2026-12-05", notes: "  door code  " })).toEqual({ title: "T", date: "2026-12-05", notes: "door code" });
    const r = reminderSchema.safeParse({ title: "T", date: "2026-12-05", notes: "x".repeat(2001) });
    expect(r.success).toBe(false);
    if (!r.success) expect(flattenZodErrors(r.error)).toEqual({ notes: ["Notes must be 2000 characters or fewer"] });
  });
  it("is about one Stop, one Item or one leg", () => {
    for (const about of [{ stopId: CUID_A }, { itemId: CUID_A }, { transportId: CUID_A }]) {
      expect(reminderSchema.safeParse({ title: "T", date: "2026-12-05", ...about }).success).toBe(true);
    }
  });
  it("refuses a Reminder about two things, form-level", () => {
    const r = reminderSchema.safeParse({ title: "T", date: "2026-12-05", stopId: CUID_A, itemId: CUID_B });
    expect(r.success).toBe(false);
    if (!r.success) expect(flattenZodErrors(r.error)).toEqual({ _: [REMINDER_ONE_THING] });
  });
});
```

`lib/reminder-input.test.ts`:
- Change the zod side of the parity test to `reminderFieldsSchema.omit({ stopId: true, itemId: true, transportId: true })`. A refined schema can't be `.omit`ted, so the parity runs against the plain fields schema.
- Import `reminderFieldsSchema`.
- Add to `CASES`:

```ts
  { title: "Ok", date: "2026-12-05", notes: "  door code 4411  " },
  { title: "Ok", date: "2026-12-05", notes: "" },
  { title: "Ok", date: "2026-12-05", notes: "x".repeat(2001) },
```

- [ ] **Step 2: Run it, expect FAIL**

`npx vitest run lib/validations/reminder.test.ts lib/reminder-input.test.ts`. Expected: `REMINDER_ONE_THING`/`reminderFieldsSchema` are undefined, and `notes` is stripped from parsed output.

- [ ] **Step 3: Implement**

`lib/validations/reminder.ts`:

```ts
import { z } from "zod";
import { isoDateWith } from "@/lib/validations/primitives";

export const REMINDER_ONE_THING = "A Reminder is about one thing at most: a Stop, a thing to do or a Transport leg.";

/**
 * Zod schema for creating / updating a Reminder.
 *
 * A Reminder is a dated note — it carries a *date and never a time*
 * (CONTEXT.md "Reminder"): TEEPEE dispatches only a few times a day, so a
 * promised 14:30 would be a lie. That is why `date` is a plain "YYYY-MM-DD"
 * string and there is no `fireAt`.
 *
 * - title: non-empty trimmed string, max 200 chars
 * - date: a calendar date, "YYYY-MM-DD"
 * - notes: optional detail shown in the app, never in the Digest (spec F8)
 * - stopId / itemId / transportId: what the Reminder is about — at most one
 *   (spec F8; the DB CHECK "Reminder_about_one_thing_check" agrees). All
 *   omitted means "about the Trip as a whole".
 *
 * `reminderFieldsSchema` is the plain object (lib/reminder-input.test.ts
 * omits fields from it); `reminderSchema` adds the one-thing rule.
 */
export const reminderFieldsSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Reminder title is required")
    .max(200, "Title must be 200 characters or fewer"),
  date: isoDateWith("Reminder date must be a date (YYYY-MM-DD)", "Reminder date must be a real date"),
  notes: z.string().trim().max(2000, "Notes must be 2000 characters or fewer").optional(),
  stopId: z.string().cuid().optional(),
  itemId: z.string().cuid().optional(),
  transportId: z.string().cuid().optional(),
});

export const reminderSchema = reminderFieldsSchema.refine(
  (r) => [r.stopId, r.itemId, r.transportId].filter(Boolean).length <= 1,
  { message: REMINDER_ONE_THING },
);

export type ReminderInput = z.infer<typeof reminderSchema>;
```

`lib/reminder-input.ts`:

```ts
export function checkReminderInput(input: { title: string; date: string; notes?: string }):
  | { success: true; data: { title: string; date: string; notes?: string } }
  | ActionFailure {
  const errors: FieldErrors = {};
  const title = input.title.trim();
  const notes = input.notes?.trim();
  if (title.length < 1) errors.title = ["Reminder title is required"];
  else if (title.length > 200) errors.title = ["Title must be 200 characters or fewer"];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) errors.date = ["Reminder date must be a date (YYYY-MM-DD)"];
  else if (!isRealCalendarDate(input.date)) errors.date = ["Reminder date must be a real date"];
  if (notes !== undefined && notes.length > 2000) errors.notes = ["Notes must be 2000 characters or fewer"];
  if (Object.keys(errors).length > 0) return { success: false, errors };
  return { success: true, data: { title, date: input.date, ...(notes !== undefined ? { notes } : {}) } };
}
```

Update its JSDoc: "the same rules and messages as `reminderFieldsSchema` (title, date, notes) … the about ids are never typed: they come from a fixed prop or the picker".

- [ ] **Step 4: Run it, expect PASS** — same command.

- [ ] **Step 5: Task-done check**

- `npx vitest related --run lib/validations/reminder.ts lib/reminder-input.ts`
- `npx tsc --noEmit`
- `npx eslint lib/validations/reminder.ts lib/reminder-input.ts lib/validations/reminder.test.ts lib/reminder-input.test.ts`

- [ ] **Step 6: Commit**

Message: `feat(reminders): validate notes and one thing to be about (F8)`.

---

### Task E.8: Reminder actions — notes and about on add / update; Activity names the thing

**Files:**
- Modify: `server/actions/reminders.ts` (whole file body: `requireReminderAccess` `:37-49`, `activityRow` `:52-54`, `assertStopOnTrip` `:56-75` → `assertAboutOnTrip`, `addReminder` `:87-127`, `updateReminder` `:136-179`)
- Modify: `lib/guards.ts:217-224` (`ReminderRow`), `lib/guards.ts:260` (`ROW_SELECT.reminder`)
- Modify: `lib/activity.ts:230-234` (REMINDER diff fields)
- Test: `server/actions/reminders.test.ts` (db mock: add `item: { findFirst }`, `transport: { findFirst }`; new describe; the exact-`data`/`select` assertions at `:337-344` and `:475-491` follow the new shape)
- Test (integration): `test/integration/patch-updates.test.ts` (add a Reminder case; the `requireRowAccess` mock's reminder `include` at `:27` becomes `{ stop: { select: { name: true } }, item: { select: { title: true } }, transport: { select: REMINDER_TRANSPORT_SELECT } }`)

**Interfaces:**
- Consumes: `reminderSchema`, `REMINDER_ONE_THING`, `ReminderInput` (E.7); `ABOUT_KEYS`, `replaceAbout`, `reminderTransportLabel`, `REMINDER_TRANSPORT_SELECT`, `ReminderTransportRow` (E.2); `requireOutsideSurprise(viewerId, { itemId } | { stopId })`; `requireRowAccess("reminder")`'s row grows `notes`, `transportId`, `item`, `transport`.
- Produces:
  - `addReminder(tripId, input: ReminderInput)` writes `notes` (non-empty only), `stopId` / `itemId` / `transportId` (whichever is given).
  - `updateReminder(id, patch: Patch<ReminderInput>)`:
    - `notes` is written when the patch names it (`""`/`null` → `null`);
    - when the patch names any about key, all three are written (`replaceAbout`);
    - a named `itemId`/`transportId` must be a real-plan row on this Trip: `{ itemId: ["That thing to do isn't on this trip"] }` / `{ transportId: ["That Transport leg isn't on this trip"] }`;
    - two about ids → `{ _: [REMINDER_ONE_THING] }`.
  - Activity REMINDER diff keys: `title`, `date`, `notes`, `about`.

- [ ] **Step 1: Write the failing test**

In `server/actions/reminders.test.ts`, add `itemFindFirstMock` and `transportFindFirstMock` to the hoisted block and `item: { findFirst: itemFindFirstMock }, transport: { findFirst: transportFindFirstMock }` to the db mock. Then append:

```ts
// ---------------------------------------------------------------------------
// Spec F8 — notes, and about an Item or a Transport leg
// ---------------------------------------------------------------------------

describe("notes and about (F8)", () => {
  const ITEM_ID = "cit3m00000000000000000001";
  const LEG_ID = "ctr4n00000000000000000001";
  const STOP_ID = "cst0p00000000000000000001";
  const ROW = { id: "r1", tripId: TRIP_ID, title: "Book table", date: "2026-07-02", notes: null, stopId: STOP_ID, itemId: null, transportId: null, stop: { name: "Lyon" }, item: null, transport: null };

  it("addReminder writes notes and the Item, after checking it is a real-plan Item on this trip and the caller isn't surprised by it", async () => {
    itemFindFirstMock.mockResolvedValue({ id: ITEM_ID });
    reminderCreateMock.mockResolvedValue({ id: "r9" });
    const r = await addReminder(TRIP_ID, { title: "Book table", date: "2026-07-02", notes: "  window  ", itemId: ITEM_ID });
    expect(r).toEqual({ success: true, id: "r9" });
    expect(itemFindFirstMock).toHaveBeenCalledWith({ where: { id: ITEM_ID, tripId: TRIP_ID, forkId: null }, select: { id: true } });
    expect(requireOutsideSurpriseMock).toHaveBeenCalledWith("user-1", { itemId: ITEM_ID });
    expect(reminderCreateMock).toHaveBeenCalledWith({
      data: { tripId: TRIP_ID, title: "Book table", date: "2026-07-02", notes: "window", itemId: ITEM_ID },
      select: { id: true },
    });
  });

  it("addReminder refuses a leg that isn't this trip's real plan's, and writes nothing", async () => {
    transportFindFirstMock.mockResolvedValue(null);
    const r = await addReminder(TRIP_ID, { title: "Seats", date: "2026-07-02", transportId: LEG_ID });
    expect(r).toEqual({ success: false, errors: { transportId: ["That Transport leg isn't on this trip"] } });
    expect(reminderCreateMock).not.toHaveBeenCalled();
  });

  it("addReminder refuses a Reminder about two things before any lookup", async () => {
    const r = await addReminder(TRIP_ID, { title: "T", date: "2026-07-02", stopId: STOP_ID, itemId: ITEM_ID });
    expect(r).toEqual({ success: false, errors: { _: [REMINDER_ONE_THING] } });
    expect(stopFindFirstMock).not.toHaveBeenCalled();
    expect(itemFindFirstMock).not.toHaveBeenCalled();
    expect(reminderCreateMock).not.toHaveBeenCalled();
  });

  it("updateReminder moving a Reminder from a Stop to an Item clears the Stop", async () => {
    reminderFindUniqueMock.mockResolvedValue(ROW);
    itemFindFirstMock.mockResolvedValue({ id: ITEM_ID });
    reminderUpdateMock.mockResolvedValue({ ...ROW, stop: null, item: { title: "Bouchon" } });
    await updateReminder("r1", { itemId: ITEM_ID });
    expect(reminderUpdateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: { title: "Book table", date: "2026-07-02", stopId: null, itemId: ITEM_ID, transportId: null },
    }));
    expect(stopFindFirstMock).not.toHaveBeenCalled();
  });

  it("updateReminder with a null about makes it about the Trip as a whole", async () => {
    reminderFindUniqueMock.mockResolvedValue(ROW);
    reminderUpdateMock.mockResolvedValue({ ...ROW, stop: null });
    await updateReminder("r1", { stopId: null });
    expect(reminderUpdateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: { title: "Book table", date: "2026-07-02", stopId: null, itemId: null, transportId: null },
    }));
  });

  it("updateReminder writes notes only when the patch names them; null or empty clears", async () => {
    reminderFindUniqueMock.mockResolvedValue({ ...ROW, notes: "old" });
    reminderUpdateMock.mockResolvedValue(ROW);
    await updateReminder("r1", { title: "New" });
    expect(reminderUpdateMock.mock.calls[0][0].data).toEqual({ title: "New", date: "2026-07-02" });
    await updateReminder("r1", { notes: null });
    expect(reminderUpdateMock.mock.calls[1][0].data).toEqual({ title: "Book table", date: "2026-07-02", notes: null });
    await updateReminder("r1", { notes: "  " });
    expect(reminderUpdateMock.mock.calls[2][0].data).toEqual({ title: "Book table", date: "2026-07-02", notes: null });
  });

  it("Activity names what the Reminder is about, and diffs its notes", async () => {
    reminderFindUniqueMock.mockResolvedValue(ROW);
    itemFindFirstMock.mockResolvedValue({ id: ITEM_ID });
    reminderUpdateMock.mockResolvedValue({ title: "Book table", date: "2026-07-02", notes: "8pm", stop: null, item: { title: "Bouchon" }, transport: null });
    await updateReminder("r1", { itemId: ITEM_ID, notes: "8pm" });
    expect(recordActivityMock.mock.calls[0][0].changes).toEqual([
      { field: "notes", label: "Notes", from: "", to: "8pm" },
      { field: "about", label: "About", from: "Lyon", to: "Bouchon" },
    ]);
  });
});
```

Import `REMINDER_ONE_THING` from `@/lib/validations/reminder`.

Existing assertions this task changes (they pin the old write shape):
- `:337-344` "passes stopId through…": the expected `data` becomes `{ title, date, stopId: "cst0p…", itemId: null, transportId: null }`, and `select` becomes `expect.any(Object)`. The select is pinned by the Activity cases instead.
- `:475-491` "editing records field diffs with the Stop by name": the expected `{ field: "stopName", … }` becomes `{ field: "about", label: "About", from: "", to: "Lisbon" }`.

Check the order of `describeChanges` output against the `REMINDER` field list (title, date, notes, about).

`test/integration/patch-updates.test.ts` (inside its Reminder describe, or a new `describe("Reminder about (F8)")`):

```ts
    it("moving a Reminder from a Stop to an Item clears the Stop (the CHECK never trips); notes clear with null", async () => {
      const stop = await db.stop.create({ data: { tripId: TRIP_ID, name: "Lyon", sortOrder: 40 } });
      const item = await db.item.create({ data: { tripId: TRIP_ID, title: "Bouchon", category: "OTHER" } });
      const r = await db.reminder.create({ data: { tripId: TRIP_ID, title: "Book table", date: "2026-05-03", stopId: stop.id, notes: "window" } });
      expect(await updateReminder(r.id, { itemId: item.id })).toEqual({ success: true });
      expect(await db.reminder.findUnique({ where: { id: r.id } })).toMatchObject({ stopId: null, itemId: item.id, notes: "window" });
      expect(await updateReminder(r.id, { notes: null })).toEqual({ success: true });
      expect(await db.reminder.findUnique({ where: { id: r.id } })).toMatchObject({ notes: null, itemId: item.id });
    });
```

- [ ] **Step 2: Run it, expect FAIL**

`npx vitest run server/actions/reminders.test.ts`. Expected:
- `notes` and `itemId` are missing from the create `data`;
- the leg check isn't run;
- the update `data` lacks `stopId: null`;
- the Activity field is `stopName`.

- [ ] **Step 3: Implement**

`lib/guards.ts`:
- `ReminderRow` becomes `{ id; tripId; title; date; notes: string | null; stopId: string | null; itemId: string | null; transportId: string | null; stop: { name: string } | null; item: { title: string } | null; transport: ReminderTransportRow | null }`. Import the type from `@/lib/reminder-about`.
- `ROW_SELECT.reminder` becomes `{ id: true, tripId: true, title: true, date: true, notes: true, stopId: true, itemId: true, transportId: true, stop: { select: { name: true } }, item: { select: { title: true } }, transport: { select: REMINDER_TRANSPORT_SELECT } }`.

`lib/activity.ts:230-234`:

```ts
  REMINDER: [
    { key: "title", label: "Reminder" },
    { key: "date", label: "Date", format: (v) => dateFormat(v) },
    { key: "notes", label: "Notes" },
    { key: "about", label: "About" },
  ],
```

`server/actions/reminders.ts`. Replace the helpers and the two write actions; `deleteReminder` is unchanged.

```ts
import { ABOUT_KEYS, replaceAbout, reminderTransportLabel, REMINDER_TRANSPORT_SELECT, type ReminderTransportRow } from "@/lib/reminder-about";

type AboutRow = {
  title: string;
  date: string;
  notes: string | null;
  stop: { name: string } | null;
  item: { title: string } | null;
  transport: ReminderTransportRow | null;
};

/** The select for an update's `after` row: what Activity diffs. */
const ACTIVITY_SELECT = {
  title: true,
  date: true,
  notes: true,
  stop: { select: { name: true } },
  item: { select: { title: true } },
  transport: { select: REMINDER_TRANSPORT_SELECT },
} as const;

async function requireReminderAccess(reminderId: string) {
  const { row, user, surpriseOf } = await requireRowAccess("reminder", reminderId);
  return { ...row, viewerId: user.id, surpriseOf };
}

/** Diff row — what the Reminder is about by name, never by id. */
function activityRow(r: AboutRow) {
  return {
    title: r.title,
    date: r.date,
    notes: r.notes ?? null,
    about: r.stop?.name ?? r.item?.title ?? (r.transport ? reminderTransportLabel(r.transport) : null),
  };
}

/**
 * Guard against a cross-trip about id (Task 7, spec F8): without it a member
 * of trip A could pass trip B's Stop / Item / leg id, linking the two. An
 * Item or leg must also be the real plan's (a Reminder hangs off the real
 * plan only). Returns null when nothing is named or all belong; else the
 * field-error dict for the caller.
 */
async function assertAboutOnTrip(
  about: { stopId?: string; itemId?: string; transportId?: string },
  tripId: string,
): Promise<FieldErrors | null> {
  if (about.stopId !== undefined) {
    const stop = await db.stop.findFirst({ where: { id: about.stopId, tripId }, select: { id: true } });
    if (!stop) return { stopId: ["That Stop isn't on this trip"] };
  }
  if (about.itemId !== undefined) {
    const item = await db.item.findFirst({ where: { id: about.itemId, tripId, forkId: null }, select: { id: true } });
    if (!item) return { itemId: ["That thing to do isn't on this trip"] };
  }
  if (about.transportId !== undefined) {
    const leg = await db.transport.findFirst({ where: { id: about.transportId, tripId, forkId: null }, select: { id: true } });
    if (!leg) return { transportId: ["That Transport leg isn't on this trip"] };
  }
  return null;
}

/** The Surprise a Reminder's about is inside: an Item's own (or its Stop's), else a Stop's. Transport is outside every Surprise. */
function surpriseRef(about: { stopId?: string; itemId?: string }) {
  return about.itemId !== undefined ? { itemId: about.itemId } : { stopId: about.stopId };
}

export async function addReminder(tripId: string, input: ReminderInput): Promise<ReminderActionResult> {
  const { user } = await requireTripAccess(tripId);

  const parsed = reminderSchema.safeParse(input);
  if (!parsed.success) return validationResult(parsed.error);

  const { title, date, notes, stopId, itemId, transportId } = parsed.data;

  const aboutError = await assertAboutOnTrip({ stopId, itemId, transportId }, tripId);
  if (aboutError) return fail(aboutError);
  await requireOutsideSurprise(user.id, surpriseRef({ stopId, itemId }));

  const reminder = await db.reminder.create({
    // Omit-when-absent (never `undefined`): an unset about leaves the column
    // NULL — "about the Trip as a whole" — and empty notes are no notes.
    data: {
      tripId,
      title,
      date,
      ...(notes ? { notes } : {}),
      ...(stopId !== undefined ? { stopId } : {}),
      ...(itemId !== undefined ? { itemId } : {}),
      ...(transportId !== undefined ? { transportId } : {}),
    },
    select: { id: true },
  });

  await recordActivity({ tripId, verb: "CREATED", entityType: "REMINDER", entityId: reminder.id, entityLabel: entityLabel("REMINDER", { title }) });
  revalidateTrip(tripId, "plan", "lists");
  revalidateTripsList();
  return { success: true, id: reminder.id };
}

/**
 * Update a Reminder (PATCH, ADR 0075): title, date and notes merge onto the
 * held row (null or "" clears the notes). A patch naming any of stopId /
 * itemId / transportId replaces the whole about (lib/reminder-about.ts
 * replaceAbout) — the others are cleared, so the one-thing CHECK never
 * trips; null on all of them makes it about the Trip as a whole. A patch
 * naming none leaves the about as it is.
 */
export async function updateReminder(id: string, patch: Patch<ReminderInput>): Promise<ReminderActionResult> {
  const reminder = await requireReminderAccess(id);
  const aboutNamed = ABOUT_KEYS.some((k) => patch[k] !== undefined);

  const parsed = reminderSchema.safeParse(
    applyPatch<ReminderInput>({ title: reminder.title, date: reminder.date, notes: reminder.notes }, replaceAbout(patch)),
  );
  if (!parsed.success) return validationResult(parsed.error);

  const { title, date, notes, stopId, itemId, transportId } = parsed.data;

  if (aboutNamed) {
    const aboutError = await assertAboutOnTrip({ stopId, itemId, transportId }, reminder.tripId);
    if (aboutError) return fail(aboutError);
    await requireOutsideSurprise(reminder.viewerId, surpriseRef({ stopId, itemId }));
  }

  const after = await db.reminder.update({
    where: { id },
    data: {
      title,
      date,
      ...(patch.notes !== undefined ? { notes: notes ? notes : null } : {}),
      ...(aboutNamed ? { stopId: stopId ?? null, itemId: itemId ?? null, transportId: transportId ?? null } : {}),
    },
    select: ACTIVITY_SELECT,
  });

  // Checklists and Reminders sit outside any Plan (plan: null): always recorded.
  await recordUpdate("REMINDER", { tripId: reminder.tripId, plan: null, entityId: id, before: activityRow(reminder), after: activityRow(after) });

  revalidateTrip(reminder.tripId, "plan", "lists");
  revalidateTripsList();
  return { success: true };
}
```

Remove the now-unused `type SurpriseRoot` import if `requireReminderAccess`'s explicit return type goes. Inference keeps `surpriseOf` typed for `deleteReminder`. `lib/server-action-exports.test.ts` needs no change: no new exports.

Two existing tests read the Surprise refusal and would change if `requireOutsideSurprise` were skipped on an un-named update:
- "refuses a surprised viewer before the write" (`:521`): it goes through the guard (`requireRowAccess`), so it is unaffected.
- "addReminder refuses a Stop the caller is surprised by" (`:531`): unchanged, `{ stopId }`.

- [ ] **Step 4: Run it, expect PASS**

`npx vitest run server/actions/reminders.test.ts lib/activity.test.ts lib/guards.test.ts`. Then the integration file `test/integration/patch-updates.test.ts` (DB up).

- [ ] **Step 5: Task-done check**

- `npx vitest related --run server/actions/reminders.ts lib/guards.ts lib/activity.ts`
- `npx tsc --noEmit`
- `npx eslint server/actions/reminders.ts lib/guards.ts lib/activity.ts server/actions/reminders.test.ts test/integration/patch-updates.test.ts`
- the integration file

- [ ] **Step 6: Commit**

Message:

```
feat(reminders): add/update take notes and an Item or leg to be about (F8)

Write-shape assertions follow the new data/select; the Activity diff key
stopName becomes about.
```

---

### Task E.9: Digest keeps reading only the title — pin it

**Files:**
- Test: `lib/digest-dispatch.test.ts` (next to "reads out tomorrow's reminders in the evening slot", `:967-980`), `lib/digest.test.ts` (one case)

**Interfaces:**
- Consumes: `collectDigestInput` (unchanged); `DigestReminderLine = { id, title }` (unchanged).
- Produces: nothing; a guard test. **This test passes on first run.** It pins existing behaviour the spec now names ("never read out in the Digest"). That's expected; say so in the report.

- [ ] **Step 1: Write the failing test**

`lib/digest-dispatch.test.ts`:

```ts
  it("never reads a Reminder's notes or what it is about — the query selects id and title only (spec F8)", async () => {
    dbData.reminder = [
      { id: "rem-notes", tripId: TRIP_ID, title: "Ring the landlord", date: TOMORROW, notes: "Door code 4411", itemId: "item-1" },
    ];
    const input = await collect({ slot: "EVENING" });
    expect(input.reminders).toEqual([{ id: "rem-notes", title: "Ring the landlord" }]);
    const call = reminderFindManyMock.mock.calls.at(-1)![0] as { select: unknown };
    expect(call.select).toEqual({ id: true, title: true });
  });
```

`lib/digest.test.ts`:

```ts
  it("a Reminder line is its title alone (spec F8: notes are never read out)", () => {
    const d = buildDigest(input({ slot: "EVENING", reminders: [{ id: "r", title: "Ring the landlord" }] }));
    expect(d?.body).toContain("Ring the landlord");
  });
```

Adapt `input(...)` to the file's own builder: check `:17-40` for its signature and the evening-slot fields it needs.

- [ ] **Step 2: Run it**

`npx vitest run lib/digest-dispatch.test.ts lib/digest.test.ts`. Expected: PASS (a pin, see above). If it fails, the Digest is reading more than the title: stop and report.

- [ ] **Step 3: Implement** — none.

- [ ] **Step 4: Run it, expect PASS** — same command.

- [ ] **Step 5: Task-done check**

- `npx vitest run lib/digest-dispatch.test.ts lib/digest.test.ts` (no source changed)
- `npx tsc --noEmit`
- `npx eslint lib/digest-dispatch.test.ts lib/digest.test.ts`

- [ ] **Step 6: Commit**

Message: `test(digest): a Reminder's notes are never read out (F8)`.

---

### Task E.10: Reminders card — the about chip, folded notes, and Notes + About in the add form

**Files:**
- Modify: `components/trip/reminders-card.tsx:19-36` (props: `stops?` becomes `about?: ReminderAboutOptions`), `:95-208` (`AddReminderForm`), `:214-273` (`ReminderRow`), `:288` (pass `about`)
- Modify: `app/(app)/trips/[tripId]/checklists/page.tsx:18` (import), `:66-90` (add `readReminderAboutOptions(tripId)` to the wave), `:134-139` (`about={aboutOptions}` instead of `stops=…`)
- Test: `components/trip/reminders-card.test.tsx:250-320` (chip and picker cases), `app/(app)/trips/[tripId]/checklists/page.test.tsx:25-35,77-90`

**Interfaces:**
- Consumes: `ReminderNotes` (E.6); `reminderAboutLabel`, `aboutFromPick`, `aboutPickValue`, `ReminderAboutOptions` (E.2); `readReminderAboutOptions` (E.5); `addReminder(tripId, { title, date, notes?, stopId?|itemId?|transportId? })` (E.8).
- Produces: `RemindersCard` props `{ tripId; reminders: ReminderItem[]; today: string; about?: ReminderAboutOptions }`. The picker is `<select aria-label="About">` with `<option value="">The whole trip</option>` and `<optgroup label="Stops" | "Things to do" | "Transport">`. The notes field is `<Textarea aria-label="Reminder notes">`.

- [ ] **Step 1: Write the failing test**

`components/trip/reminders-card.test.tsx`. The existing chip cases (`:250-278`) stay, fixtures wrapped in `reminderItem` (done in E.4). The two `stops=` cases (`:280-320`) are rewritten to the new prop and label; their assertions stay (a select is offered; the chosen Stop is submitted as `stopId`). Add:

```tsx
  it("a chip names the Item or leg a Reminder is about (F8)", () => {
    render(
      <RemindersCard tripId="trip-1" today={TODAY} reminders={[
        reminderItem({ id: "r1", title: "Book table", date: "2026-11-29", itemId: "i1", itemTitle: "Bouchon" }),
        reminderItem({ id: "r2", title: "Seats", date: "2026-11-30", transportId: "t1", transportLabel: "Train Paris → Lyon" }),
      ]} />,
    );
    expect(screen.getByText("Bouchon")).toBeInTheDocument();
    expect(screen.getByText("Train Paris → Lyon")).toBeInTheDocument();
  });

  it("folds a Reminder's notes until tapped (F8)", async () => {
    const user = userEvent.setup();
    render(<RemindersCard tripId="trip-1" today={TODAY} reminders={[reminderItem({ id: "r1", title: "Ring", date: "2026-11-29", notes: "Door code 4411" })]} />);
    expect(screen.getByText("Door code 4411")).not.toBeVisible();
    await user.click(screen.getByText("Notes"));
    expect(screen.getByText("Door code 4411")).toBeVisible();
  });

  const ABOUT = {
    stops: [{ id: "s1", name: "Denpasar" }],
    items: [{ id: "i1", title: "Temple visit" }],
    transports: [{ id: "t1", label: "Flight Brisbane → Denpasar" }],
  };

  it("offers one About picker over Stops, things to do and legs, and submits the one picked plus notes (F8)", async () => {
    const user = userEvent.setup();
    render(<RemindersCard tripId="trip-1" today={TODAY} reminders={[]} about={ABOUT} />);
    await user.click(screen.getByRole("button", { name: "Add Reminder" }));
    const select = screen.getByLabelText("About");
    expect(within(select).getByRole("option", { name: "The whole trip" })).toBeInTheDocument();
    expect(within(select).getByRole("option", { name: "Temple visit" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Reminder title"), { target: { value: "Bring a sarong" } });
    fireEvent.change(screen.getByLabelText("Reminder date"), { target: { value: "2026-12-01" } });
    fireEvent.change(screen.getByLabelText("Reminder notes"), { target: { value: "Shoulders covered" } });
    fireEvent.change(select, { target: { value: "item:i1" } });
    fireEvent.submit(select.closest("form")!);
    await waitFor(() =>
      expect(addReminder).toHaveBeenCalledWith("trip-1", { title: "Bring a sarong", date: "2026-12-01", notes: "Shoulders covered", itemId: "i1" }),
    );
  });

  it("with no notes and no pick it submits only title and date", async () => {
    const user = userEvent.setup();
    render(<RemindersCard tripId="trip-1" today={TODAY} reminders={[]} about={ABOUT} />);
    await user.click(screen.getByRole("button", { name: "Add Reminder" }));
    fireEvent.change(screen.getByLabelText("Reminder title"), { target: { value: "Pack" } });
    fireEvent.change(screen.getByLabelText("Reminder date"), { target: { value: "2026-12-01" } });
    fireEvent.submit(screen.getByLabelText("Reminder date").closest("form")!);
    await waitFor(() => expect(addReminder).toHaveBeenCalledWith("trip-1", { title: "Pack", date: "2026-12-01" }));
  });
```

Import `within`, `waitFor` and `reminderItem` as needed.

`app/(app)/trips/[tripId]/checklists/page.test.tsx`:
- Mock `@/lib/reminder-reads` as `({ listRemindersForTrip, readReminderAboutOptions })` with `readReminderAboutOptions = vi.fn(async () => ({ stops: [{ id: "s1", name: "Lisbon" }], items: [], transports: [] }))`.
- In the `RemindersCard` mock, read `p.about?.stops` in place of `p.stops`.
- The existing assertion that the Stops' names reach the card stays.

- [ ] **Step 2: Run it, expect FAIL**

`npx vitest run components/trip/reminders-card.test.tsx "app/(app)/trips/[tripId]/checklists/page.test.tsx"`. Expected: no "Bouchon" chip, no "Notes" summary, no "About" label, and the page passes no `about`.

- [ ] **Step 3: Implement**

`components/trip/reminders-card.tsx`:

```tsx
import { Textarea } from "@/components/ui/textarea";
import { ReminderNotes } from "@/components/trip/reminder-notes";
import { aboutFromPick, aboutPickValue, reminderAboutLabel, type ReminderAboutOptions } from "@/lib/reminder-about";
```

Check the `Textarea` path: `transport-form-dialog.tsx` imports it.

Props: replace `stops?` and its doc with:

```tsx
  /**
   * What a new Reminder can be about (spec F8): the real plan's Stops, things
   * to do and Transport legs the viewer can see (readReminderAboutOptions).
   * Omitted hides the picker — a Reminder created here is then about the Trip
   * as a whole (Home's card).
   */
  about?: ReminderAboutOptions;
```

`AddReminderForm`:
- Rename state `stopId` → `pick`.
- Add `const [notes, setNotes] = useState("");` and reset both in `reset()`.
- Submit:

```tsx
      const result = await addReminder(tripId, {
        title,
        date,
        ...(notes.trim() ? { notes } : {}),
        ...aboutFromPick(pick),
      });
```

- After the date input:

```tsx
      <Textarea
        placeholder="Notes (optional)"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        aria-label="Reminder notes"
        rows={2}
      />
      {hasAbout(about) && (
        <select
          value={pick}
          onChange={(e) => setPick(e.target.value)}
          aria-label="About"
          className="flex h-12 w-full rounded-md border-2 border-input bg-card px-4 text-base font-semibold text-foreground sm:text-[15px]"
        >
          <option value="">The whole trip</option>
          {about.stops.length > 0 && (
            <optgroup label="Stops">
              {about.stops.map((s) => <option key={s.id} value={aboutPickValue({ stopId: s.id })}>{s.name}</option>)}
            </optgroup>
          )}
          {about.items.length > 0 && (
            <optgroup label="Things to do">
              {about.items.map((i) => <option key={i.id} value={aboutPickValue({ itemId: i.id })}>{i.title}</option>)}
            </optgroup>
          )}
          {about.transports.length > 0 && (
            <optgroup label="Transport">
              {about.transports.map((t) => <option key={t.id} value={aboutPickValue({ transportId: t.id })}>{t.label}</option>)}
            </optgroup>
          )}
        </select>
      )}
```

with, at module level:

```tsx
function hasAbout(a: ReminderAboutOptions | undefined): a is ReminderAboutOptions {
  return !!a && a.stops.length + a.items.length + a.transports.length > 0;
}
```

`ReminderRow`:
- Replace `reminder.stopName &&` with `const about = reminderAboutLabel(reminder);` … `{about && (<span …>{about}</span>)}`.
- After the date `<p>` add `{reminder.notes && <ReminderNotes notes={reminder.notes} />}`.

`RemindersCard`: destructure `about` and pass `<AddReminderForm tripId={tripId} about={about} onAdded={() => {}} />`.

`app/(app)/trips/[tripId]/checklists/page.tsx`:
- Import `readReminderAboutOptions` beside `listRemindersForTrip`.
- Add `readReminderAboutOptions(tripId)` as the wave's last element, bound as `aboutOptions`.
- At `:134-139` replace `stops={stops.map(...)}` with `about={aboutOptions}`.
- `stops` stays: it is still used for `today`/ordering. Keep or drop the `orderPlanStops` line by whether it is otherwise used.

- [ ] **Step 4: Run it, expect PASS** — same command.

- [ ] **Step 5: Task-done check**

- `npx vitest related --run components/trip/reminders-card.tsx "app/(app)/trips/[tripId]/checklists/page.tsx"`
- `npx tsc --noEmit`
- `npx eslint components/trip/reminders-card.tsx "app/(app)/trips/[tripId]/checklists/page.tsx" components/trip/reminders-card.test.tsx "app/(app)/trips/[tripId]/checklists/page.test.tsx"`

- [ ] **Step 6: Commit**

Message:

```
feat(reminders): the card shows notes and what it's about; the add form picks it (F8)

The picker tests query by its new label "About".
```

---

### Task E.11: Desktop Home "Sort these out" — the Reminder row names its thing and folds its notes

**Files:**
- Modify: `lib/sort-these-out.ts:29-37` (`SortRow`: add `notes?: string`), `lib/sort-these-out.ts:105-115` (reminder rows)
- Modify: `components/trip/home/desktop/sort-these-out-tile.tsx:92-107` (render `ReminderNotes` under a row, outside its link)
- Test: `lib/sort-these-out.test.ts`; `components/trip/home/desktop/sort-these-out-tile.test.tsx` (create the file if it doesn't exist; otherwise append)

**Interfaces:**
- Consumes: `reminderAboutLabel` (E.2), `ReminderNotes` (E.6).
- Produces: a reminder `SortRow`:
  - `subtitle` is `"Due <day>"`, plus `" · <about>"` when about something;
  - `notes` is set when the Reminder has notes;
  - `href` is `/plan#stop-<id>` for a Stop (unchanged), else `/plan`.

- [ ] **Step 1: Write the failing test**

`lib/sort-these-out.test.ts`:

```ts
  it("a Reminder row names what it is about and carries its notes (F8)", () => {
    const { rows } = sortTheseOut({
      basePath: BASE, today: "2026-12-01", steps: [],
      reminders: [
        reminder("r1", "2026-12-02", { itemId: "i1", itemTitle: "Temple visit", notes: "Bring a sarong" }),
        reminder("r2", "2026-12-03", { stopId: "s9", stopName: "Ubud" }),
      ],
    });
    expect(rows[0]).toMatchObject({ subtitle: "Due Wed 2 Dec · Temple visit", notes: "Bring a sarong", href: `${BASE}/plan` });
    expect(rows[1]).toMatchObject({ subtitle: "Due Thu 3 Dec · Ubud" });
    expect(rows[1].notes).toBeUndefined();
  });
```

The existing "Due Tue 8 Dec" case (no about) stays as is. Confirm `BASE` and the `href` format against the existing "links a reminder about a Stop" case.

`components/trip/home/desktop/sort-these-out-tile.test.tsx`:

```tsx
  it("folds a row's notes under it, outside the row's link (F8)", async () => {
    const user = userEvent.setup();
    render(<SortTheseOutTile total={1} seeAllHref={"/trips/t/summary" as Route} rows={[
      { id: "reminder-r1", title: "Ring", subtitle: "Due Wed 2 Dec", href: "/trips/t/plan" as Route, tone: "coral", icon: "bell", notes: "Door code 4411" },
    ]} />);
    expect(screen.getByText("Door code 4411")).not.toBeVisible();
    expect(screen.getByRole("link", { name: /Ring/ })).not.toContainElement(screen.getByText("Notes"));
    await user.click(screen.getByText("Notes"));
    expect(screen.getByText("Door code 4411")).toBeVisible();
  });
```

- [ ] **Step 2: Run it, expect FAIL**

`npx vitest run lib/sort-these-out.test.ts components/trip/home/desktop/sort-these-out-tile.test.tsx`. Expected: subtitle lacks `· Temple visit`; `notes` is undefined; no "Notes" in the tile.

- [ ] **Step 3: Implement**

`lib/sort-these-out.ts`:
- `SortRow` gains `/** A Reminder's notes, folded under the row (spec F8). */ notes?: string;`.
- In the map:

```ts
    .map((r) => {
      const about = reminderAboutLabel(r);
      return {
        id: `reminder-${r.id}`,
        title: r.title,
        subtitle: `Due ${formatDayLabel(r.date)}${about ? ` · ${about}` : ""}`,
        href: r.stopId ? tripSubPath(basePath, `/plan#stop-${r.stopId}`) : tripSubPath(basePath, "/plan"),
        tone: "coral" as const,
        icon: "bell" as const,
        ...(r.notes ? { notes: r.notes } : {}),
      };
    });
```

- Import `reminderAboutLabel` from `@/lib/reminder-about`. Pure: the module only does type imports today; this is a pure value import, which is fine.

`sort-these-out-tile.tsx`: inside each `<li>`, after the link/div, add

```tsx
            {row.notes ? <div className="pb-2 pl-[54px]"><ReminderNotes notes={row.notes} /></div> : null}
```

and the import `import { ReminderNotes } from "@/components/trip/reminder-notes";`.

- [ ] **Step 4: Run it, expect PASS** — same command.

- [ ] **Step 5: Task-done check**

- `npx vitest related --run lib/sort-these-out.ts components/trip/home/desktop/sort-these-out-tile.tsx`
- `npx tsc --noEmit`
- `npx eslint lib/sort-these-out.ts components/trip/home/desktop/sort-these-out-tile.tsx lib/sort-these-out.test.ts components/trip/home/desktop/sort-these-out-tile.test.tsx`

- [ ] **Step 6: Commit**

Message: `feat(home): Sort these out names a Reminder's thing and folds its notes (F8)`.

---

### Task E.12: `AddReminderDialog` — a fixed `about` (Stop, Item or leg) and a Notes field

**Files:**
- Modify: `components/trip/add-reminder-dialog.tsx:21-34` (props), `:44-62`, `:68-125`
- Modify: `components/trip/itinerary-manager.tsx:605-607` (state), `:1424`, `:2100-2109`, `:2248-2255` (the Stop sites move to `about`)
- Test: `components/trip/add-reminder-dialog.test.tsx` (`baseProps.stopId` becomes `about: { stopId: "s1" }`; add cases), `components/trip/itinerary-manager.test.tsx:2279-2304` (unchanged assertions)

**Interfaces:**
- Consumes: `ReminderAbout` (E.2); `checkReminderInput({ title, date, notes? })` (E.7); `addReminder` (E.8).
- Produces:
  - `AddReminderDialogProps = { tripId: string; about: ReminderAbout; open: boolean; onOpenChange(open: boolean): void; onSaved?(): void }`;
  - in `itinerary-manager.tsx`, state `addReminderAbout: ReminderAbout | null` with setter `setAddReminderAbout`, replacing `addReminderStop`.

- [ ] **Step 1: Write the failing test**

`components/trip/add-reminder-dialog.test.tsx`: set `baseProps` to `{ tripId: "trip-1", about: { stopId: "s1" } as const, open: true, onOpenChange: vi.fn() }`. The existing three cases stay, including "no Stop picker" and the exact `{ title, date, stopId: "s1" }` call. Add:

```tsx
  it("about an Item or a leg, it submits that id (F8)", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<AddReminderDialog {...baseProps} about={{ itemId: "i1" }} />);
    await user.type(screen.getByLabelText(/reminder title/i), "Book table");
    fireEvent.change(screen.getByLabelText(/date/i), { target: { value: "2026-12-05" } });
    await user.click(screen.getByRole("button", { name: /add reminder/i }));
    await waitFor(() => expect(addReminder).toHaveBeenCalledWith("trip-1", { title: "Book table", date: "2026-12-05", itemId: "i1" }));
    unmount();
    vi.mocked(addReminder).mockClear();
    render(<AddReminderDialog {...baseProps} about={{ transportId: "t1" }} />);
    await user.type(screen.getByLabelText(/reminder title/i), "Seats");
    fireEvent.change(screen.getByLabelText(/date/i), { target: { value: "2026-12-05" } });
    await user.click(screen.getByRole("button", { name: /add reminder/i }));
    await waitFor(() => expect(addReminder).toHaveBeenCalledWith("trip-1", { title: "Seats", date: "2026-12-05", transportId: "t1" }));
  });

  it("sends notes when given (F8)", async () => {
    const user = userEvent.setup();
    render(<AddReminderDialog {...baseProps} />);
    await user.type(screen.getByLabelText(/reminder title/i), "Reconfirm the tour");
    fireEvent.change(screen.getByLabelText(/date/i), { target: { value: "2026-12-05" } });
    await user.type(screen.getByLabelText(/^notes/i), "Ask for Wayan");
    await user.click(screen.getByRole("button", { name: /add reminder/i }));
    await waitFor(() =>
      expect(addReminder).toHaveBeenCalledWith("trip-1", { title: "Reconfirm the tour", date: "2026-12-05", notes: "Ask for Wayan", stopId: "s1" }),
    );
  });
```

`/date/i` must still match only the date field: the new label is "Notes", so it doesn't collide.

- [ ] **Step 2: Run it, expect FAIL**

`npx vitest run components/trip/add-reminder-dialog.test.tsx`. Expected: TypeScript-free runtime failure. The dialog ignores `about` and sends `stopId: undefined`, and there is no Notes field.

- [ ] **Step 3: Implement**

`components/trip/add-reminder-dialog.tsx`:
- Import `Textarea` and `type ReminderAbout` from `@/lib/reminder-about`.
- Props: replace `stopId: string` and its doc with:

```tsx
  /**
   * What this Reminder is about — the Stop, thing to do or Transport leg whose
   * card opened the dialog (spec F8). Fixed and hidden, never a picker: the
   * Reminders card's add form is where a Traveller picks.
   */
  about: ReminderAbout;
```

- Thread `about` through `AddReminderDialog` → `AddReminderForm`.
- In the form add `const [notes, setNotes] = React.useState("");`. The submit:

```tsx
      const checked = checkReminderInput({ title, date, ...(notes.trim() ? { notes } : {}) });
      if (!checked.success) return checked;
      return addReminder(tripId, { ...checked.data, ...about });
```

  (update the comment: "`about` is the fixed value this dialog was opened with …").
- After the `DateField`:

```tsx
      <Field label="Notes" error={errors.notes?.[0]}>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Anything to remember with it (optional)"
          disabled={isPending}
        />
      </Field>
```

`components/trip/itinerary-manager.tsx`:
- `:605-607`: `const [addReminderAbout, setAddReminderAbout] = React.useState<ReminderAbout | null>(null);`. Add `import type { ReminderAbout } from "@/lib/reminder-about";`.
- `:1424`: `onAddReminder: () => setAddReminderAbout({ stopId: stop.id }),`.
- `:2100-2109`:

```tsx
      {/* Add a reminder (Task 7, spec F8) — what it is about is preset, hidden. */}
      {addReminderAbout && (
        <AddReminderDialog
          tripId={tripId}
          about={addReminderAbout}
          open={true}
          onOpenChange={(open) => {
            if (!open) setAddReminderAbout(null);
          }}
        />
      )}
```

- `:2253`: `setAddReminderAbout({ stopId: extrasStop.id });`.

- [ ] **Step 4: Run it, expect PASS**

`npx vitest run components/trip/add-reminder-dialog.test.tsx components/trip/itinerary-manager.test.tsx -t "reminder"`

- [ ] **Step 5: Task-done check**

- `npx vitest related --run components/trip/add-reminder-dialog.tsx components/trip/itinerary-manager.tsx`
- `npx tsc --noEmit`
- `npx eslint components/trip/add-reminder-dialog.tsx components/trip/itinerary-manager.tsx components/trip/add-reminder-dialog.test.tsx`

- [ ] **Step 6: Commit**

Message: `feat(reminders): the Add a Reminder dialog can be about an Item or leg, with notes (F8)`.

---

### Task E.13: `ReminderList` — one list for a thing's Reminders; the Stop's extras dialog uses it

**Files:**
- Create: `components/trip/reminder-list.tsx`
- Modify: `components/plan/stop-extras-dialog.tsx:64-83` (use `ReminderList`)
- Test: Create `components/trip/reminder-list.test.tsx`; `components/plan/stop-extras-dialog.test.tsx` (existing assertions unchanged)

**Interfaces:**
- Consumes: `ReminderItem` (E.2), `ReminderNotes` (E.6), `formatDayLabel` (`lib/dates`).
- Produces: `export function ReminderList({ reminders, onAdd }: { reminders: ReminderItem[]; onAdd?: () => void }): JSX.Element`. It renders a `<ul aria-label="Reminders">` (omitted when empty), each row a title + date + folded notes, then a `type="button"` "Add a reminder" button when `onAdd` is given. `type="button"` matters because it sits inside the Item/Transport `<form>` in E.14.

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { reminderItem } from "@/test/helpers/reminder-item";
import { ReminderList } from "./reminder-list";

describe("ReminderList", () => {
  it("lists each Reminder with its day and folded notes", () => {
    render(<ReminderList reminders={[reminderItem({ id: "r1", title: "Book the Louvre", date: "2026-11-20", notes: "Timed entry" })]} />);
    expect(screen.getByRole("list", { name: "Reminders" })).toBeInTheDocument();
    expect(screen.getByText("Book the Louvre")).toBeInTheDocument();
    expect(screen.getByText("Fri 20 Nov")).toBeInTheDocument();
    expect(screen.getByText("Timed entry")).not.toBeVisible();
  });

  it("offers Add a reminder only when it can, as a non-submitting button", async () => {
    const onAdd = vi.fn();
    const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
    const { rerender } = render(<ReminderList reminders={[]} />);
    expect(screen.queryByRole("button", { name: "Add a reminder" })).not.toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    rerender(<form onSubmit={onSubmit}><ReminderList reminders={[]} onAdd={onAdd} /></form>);
    await userEvent.setup().click(screen.getByRole("button", { name: "Add a reminder" }));
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
```

Check `formatDayLabel("2026-11-20")`'s exact output against `lib/dates.test.ts`. The existing `stop-extras-dialog.test.tsx` shows the format.

- [ ] **Step 2: Run it, expect FAIL**

`npx vitest run components/trip/reminder-list.test.tsx`. Expected: the import fails.

- [ ] **Step 3: Implement**

```tsx
"use client";

import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ReminderNotes } from "@/components/trip/reminder-notes";
import { formatDayLabel } from "@/lib/dates";
import type { ReminderItem } from "@/lib/reminder-about";

/**
 * The Reminders about one thing — a Stop, a thing to do or a Transport leg
 * (spec F8: "the thing's card lists the Reminder"). Notes fold (ReminderNotes).
 * "Add a reminder" is a plain button (type="button") so it never submits the
 * Item or Transport form it sits inside.
 */
export function ReminderList({ reminders, onAdd }: { reminders: ReminderItem[]; onAdd?: () => void }) {
  return (
    <div className="flex flex-col gap-2">
      {reminders.length > 0 && (
        <ul aria-label="Reminders" className="flex flex-col gap-1">
          {reminders.map((r) => (
            <li key={r.id} className="flex flex-col text-sm">
              <div className="flex items-center gap-2">
                <Bell className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="min-w-0 flex-1 break-words text-foreground">{r.title}</span>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{formatDayLabel(r.date)}</span>
              </div>
              {r.notes && <div className="pl-5.5"><ReminderNotes notes={r.notes} /></div>}
            </li>
          ))}
        </ul>
      )}
      {onAdd && (
        <Button type="button" variant="outline" size="sm" className="self-start" onClick={onAdd}>
          <Bell className="size-3.5" aria-hidden="true" />
          Add a reminder
        </Button>
      )}
    </div>
  );
}
```

`components/plan/stop-extras-dialog.tsx`: replace the `kind === "reminders"` block (`:64-83`) with:

```tsx
        {kind === "reminders" && <ReminderList reminders={reminders} onAdd={onAddReminder} />}
```

Remove the now-unused `Bell`, `Button` and `formatDayLabel` imports. Import `ReminderList`.

- [ ] **Step 4: Run it, expect PASS**

`npx vitest run components/trip/reminder-list.test.tsx components/plan/stop-extras-dialog.test.tsx`

- [ ] **Step 5: Task-done check**

- `npx vitest related --run components/trip/reminder-list.tsx components/plan/stop-extras-dialog.tsx`
- `npx tsc --noEmit`
- `npx eslint components/trip/reminder-list.tsx components/plan/stop-extras-dialog.tsx components/trip/reminder-list.test.tsx`

Also check `components/plan/banned-classes.test.ts` stays green (it scans `components/plan`): it is in `related`.

- [ ] **Step 6: Commit**

Message: `refactor(reminders): one ReminderList for a thing's Reminders (F8)`.

---

### Task E.14: An Item's and a Transport leg's edit dialog list their Reminders and offer "Add a reminder"

**Files:**
- Modify: `components/trip/item-form-dialog.tsx:51-90` (props), `:333,362` (thread through), `:449-471` (inner props), after `:844` (a "Reminders" field after Attachments)
- Modify: `components/trip/transport-form-dialog.tsx:67-116` (props), `:165-223` (thread through), `:248-289` (inner props), after `:874` (a "Reminders" field after Attachments, inside the form)
- Modify: `components/trip/itinerary-manager.tsx:175-219` (props: `remindersByItemId?`, `remindersByTransportId?`), `:473-486` (destructure), `:2031-2054` (Transport edit), `:2128-2146` (Item edit)
- Modify: `app/(app)/trips/[tripId]/plan/page.tsx:435` (pass `remindersByItemId={remindersAbout.byItemId}` and `remindersByTransportId={remindersAbout.byTransportId}`)
- Test: `components/trip/item-form-dialog.test.tsx`, `components/trip/transport-form-dialog.test.tsx`, `components/trip/itinerary-manager.test.tsx` (the Task 7 describe at `:2279`), `app/(app)/trips/[tripId]/plan/page.test.tsx` (the E.4 case: assert the two new props)

**Interfaces:**
- Consumes: `ReminderList` (E.13); `AddReminderDialog` with `about` (E.12); `RemindersAbout` maps (E.4).
- Produces:
  - `ItemFormDialogProps` and `TransportFormDialogProps` gain `reminders?: ReminderItem[]` and `onAddReminder?: () => void`. The field renders in edit mode only, when either is given.
  - `ItineraryManagerProps` gains `remindersByItemId?: Map<string, ReminderItem[]>` and `remindersByTransportId?: Map<string, ReminderItem[]>`. Real plan only: with `forkId` set, neither list nor "Add a reminder" is passed.

- [ ] **Step 1: Write the failing test**

`components/trip/transport-form-dialog.test.tsx`: render in edit mode the way the file's existing edit cases do, then add:

```tsx
  it("lists the leg's Reminders and offers Add a reminder without saving the leg (F8)", async () => {
    const user = userEvent.setup();
    const onAddReminder = vi.fn();
    render(<TransportFormDialog {...editProps} reminders={[reminderItem({ id: "r1", title: "Reconfirm seats", date: "2026-08-01", transportId: editProps.transport.id })]} onAddReminder={onAddReminder} />);
    expect(screen.getByText("Reconfirm seats")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add a reminder" }));
    expect(onAddReminder).toHaveBeenCalledTimes(1);
    expect(updateTransport).not.toHaveBeenCalled();
  });

  it("shows no Reminders field when creating a leg", () => {
    render(<TransportFormDialog {...createProps} onAddReminder={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Add a reminder" })).not.toBeInTheDocument();
  });
```

`editProps`/`createProps` stand for the file's own edit/create fixtures; reuse whatever names it uses.

`components/trip/item-form-dialog.test.tsx`: the same two cases against `ItemFormDialog`, with `item=`, a Reminder `"Book a slot"` with `itemId`, and the action mock `updateItem` not called.

`components/trip/itinerary-manager.test.tsx`, in the Task 7 describe. The `deleteViaSheet` neighbours show how the leg pill opens the edit sheet.

```tsx
  it("a leg's edit sheet lists its Reminders, and Add a reminder opens the dialog about that leg (F8)", async () => {
    const user = userEvent.setup();
    const stopA = makeStop({ id: "s-a", name: "Sydney", sortOrder: 0 });
    const stopB = makeStop({ id: "s-b", name: "Paris", sortOrder: 1 });
    renderPlan(
      <ItineraryManager
        {...baseProps}
        initialStops={[stopA, stopB]}
        initialTransports={[makeTransportBetweenStops("s-a", "s-b")]}
        remindersByTransportId={new Map([["tr-opt-1", [reminderItem({ id: "rem-9", title: "Reconfirm seats", date: "2026-08-01", transportId: "tr-opt-1" })]]])}
      />,
    );
    await user.click(desktop().getByRole("button", { name: /^Flight from Sydney to Paris/ }));
    expect(await screen.findByText("Reconfirm seats")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add a reminder" }));
    expect(await screen.findByRole("heading", { name: /add a reminder/i })).toBeInTheDocument();
    await user.type(screen.getByLabelText(/reminder title/i), "Print boarding passes");
    await user.type(screen.getByLabelText(/^date/i), "2026-08-02");
    await user.click(screen.getByRole("button", { name: /^add reminder$/i }));
    await waitFor(() =>
      expect(addReminder).toHaveBeenCalledWith(TRIP_ID, { title: "Print boarding passes", date: "2026-08-02", transportId: "tr-opt-1" }),
    );
  });

  it("a Fork's leg offers no Add a reminder", async () => {
    const user = userEvent.setup();
    const stopA = makeStop({ id: "s-a", name: "Sydney", sortOrder: 0 });
    const stopB = makeStop({ id: "s-b", name: "Paris", sortOrder: 1 });
    renderPlan(<ItineraryManager {...baseProps} forkId={FORK_ID} initialStops={[stopA, stopB]} initialTransports={[makeTransportBetweenStops("s-a", "s-b")]} />);
    await user.click(desktop().getByRole("button", { name: /^Flight from Sydney to Paris/ }));
    await screen.findByRole("dialog");
    expect(screen.queryByRole("button", { name: "Add a reminder" })).not.toBeInTheDocument();
  });
```

The leg pill's accessible name and the transport id come from `makeTransportBetweenStops` (see `:1861-1883`). If the edit sheet for that leg is a different component in this file's harness, follow the harness. The assertions stay as written.

`app/(app)/trips/[tripId]/plan/page.test.tsx`, in the E.4 case:

```ts
    expect(itineraryManagerCapture.props?.remindersByItemId).toBeInstanceOf(Map);
    expect(itineraryManagerCapture.props?.remindersByTransportId).toBeInstanceOf(Map);
```

- [ ] **Step 2: Run it, expect FAIL**

`npx vitest run components/trip/transport-form-dialog.test.tsx components/trip/item-form-dialog.test.tsx components/trip/itinerary-manager.test.tsx "app/(app)/trips/[tripId]/plan/page.test.tsx"`. Expected: "Reconfirm seats" is not found, and the page props are undefined.

- [ ] **Step 3: Implement**

`components/trip/transport-form-dialog.tsx`:
- Add to both prop interfaces:

```tsx
  /** Reminders about this leg (edit mode, real plan only — spec F8). */
  reminders?: ReminderItem[];
  /** Opens Add a Reminder about this leg; omitted on a Fork's leg. */
  onAddReminder?: () => void;
```

- Thread both through the wrapper's JSX (`:214-223` pattern).
- After the Attachments `Field` (`:874`):

```tsx
        {isEdit && transport && (reminders || onAddReminder) && (
          <Field label="Reminders">
            <ReminderList reminders={reminders ?? []} onAdd={onAddReminder} />
          </Field>
        )}
```

- Import `ReminderList` from `@/components/trip/reminder-list` and `type ReminderItem` from `@/lib/reminder-about`.

`components/trip/item-form-dialog.tsx`: the same, placed after the Attachments field at `:844`, with `className="sm:col-span-2"` on the `Field` and `isEdit && item` as the guard.

`components/trip/itinerary-manager.tsx`:
- Props: after `remindersByStopId` (`:218-219`) add

```tsx
  /** Reminders keyed by itemId / transportId (spec F8) — listed in the edit dialogs. */
  remindersByItemId?: Map<string, ReminderItem[]>;
  remindersByTransportId?: Map<string, ReminderItem[]>;
```

  and destructure both at `:486`.
- Transport edit (`:2031`), add:

```tsx
          reminders={forkId ? undefined : (remindersByTransportId?.get(editingTransport.id) ?? [])}
          onAddReminder={
            forkId
              ? undefined
              : () => {
                  const id = editingTransport.id;
                  setEditingTransport(null);
                  setEditingTransportCosts(undefined);
                  setAddReminderAbout({ transportId: id });
                }
          }
```

- Item edit (`:2128`), add:

```tsx
          reminders={forkId ? undefined : (remindersByItemId?.get(itemForm.item.id) ?? [])}
          onAddReminder={
            forkId
              ? undefined
              : () => {
                  const id = itemForm.item.id;
                  setItemForm(null);
                  setAddReminderAbout({ itemId: id });
                }
          }
```

`app/(app)/trips/[tripId]/plan/page.tsx:435`: after `remindersByStopId={remindersAbout.byStopId}` add

```tsx
              remindersByItemId={remindersAbout.byItemId}
              remindersByTransportId={remindersAbout.byTransportId}
```

- [ ] **Step 4: Run it, expect PASS** — the command from Step 2.

- [ ] **Step 5: Task-done check**

- `npx vitest related --run components/trip/item-form-dialog.tsx components/trip/transport-form-dialog.tsx components/trip/itinerary-manager.tsx "app/(app)/trips/[tripId]/plan/page.tsx"`
- `npx tsc --noEmit`
- `npx eslint` on those four sources and their four tests

- [ ] **Step 6: Commit**

Message: `feat(reminders): an Item's and a leg's card list their Reminders (F8)`.

---

### Task E.15: MCP — `add_reminder` / `update_reminder` take notes, `itemId`, `transportId`; one thing only; `get_reminders` shows them

**Files:**
- Modify: `lib/mcp/tools/lists-write.ts:1-27` (header comment: the about rule and clearing), `:56-80` (imports), `:85-126` (the two tools)
- Modify: `lib/mcp/tools/reads.ts:278-287` (`get_reminders` description only)
- Test: `lib/mcp/tools/lists-write.test.ts:1-98` (hoisted `itemFindUnique`, `transportFindUnique`; `db` mock; the `requireRowAccessMock` handles `"item"` and `"transport"`), new cases; `lib/mcp/tools/reads.test.ts:375-383`

**Interfaces:**
- Consumes: `addReminder`, `updateReminder` (E.8); `aboutCount` (E.2); `requireRealPlanRows([[kind, id], …])` (`lib/mcp/real-plan.ts`); `listRemindersForTrip` (E.4).
- Produces:
  - `add_reminder` input `{ tripId, title, date, notes?, stopId?, itemId?, transportId? }`;
  - `update_reminder` input `{ reminderId, title?, date?, notes?: string | null, stopId?: string | null, itemId?: string | null, transportId?: string | null }`;
  - with more than one about id the result is the error text `Couldn't do that: Pass at most one of stopId, itemId or transportId — a Reminder is about one thing.`, and nothing is looked up or written;
  - `get_reminders` rows carry `notes`, `itemId`, `itemTitle`, `transportId`, `transportLabel`.
- Return values: unchanged here (section F's F6 makes them return the row).

- [ ] **Step 1: Write the failing test**

`lib/mcp/tools/lists-write.test.ts`:
- Add `itemFindUnique: vi.fn()` and `transportFindUnique: vi.fn()` to the hoisted block.
- Add `item: { findUnique: itemFindUnique }, transport: { findUnique: transportFindUnique }` to the db mock.
- In `requireRowAccessMock`, pick the delegate by kind:

```ts
    const finder = ({ stop: stopFindUnique, item: itemFindUnique, transport: transportFindUnique } as Record<string, typeof stopFindUnique>)[kind];
    const row = finder ? await finder(args) : null;
```

- In `beforeEach`, default `itemFindUnique.mockResolvedValue({ tripId: TRIP_ID }); transportFindUnique.mockResolvedValue({ tripId: TRIP_ID });`.

Add:

```ts
  describe("notes and about (F8)", () => {
    it("add_reminder forwards notes and an itemId after a real-plan check on the Item", async () => {
      addReminder.mockResolvedValue({ success: true, id: "r1" });
      const c = await connectTestClient();
      await c.callTool({ name: "add_reminder", arguments: { tripId: TRIP_ID, title: "Book table", date: "2026-07-02", notes: "window", itemId: ITEM_ID } });
      expect(itemFindUnique).toHaveBeenCalledWith({ where: { id: ITEM_ID, forkId: null }, select: { tripId: true } });
      expect(addReminder).toHaveBeenCalledWith(TRIP_ID, { title: "Book table", date: "2026-07-02", notes: "window", itemId: ITEM_ID });
    });

    it("add_reminder with a Fork's transportId is NOT_FOUND_TEXT and adds nothing", async () => {
      transportFindUnique.mockImplementation(({ where }: { where: { forkId?: unknown } }) => Promise.resolve(where.forkId === null ? null : { tripId: TRIP_ID }));
      const c = await connectTestClient();
      const r = await c.callTool({ name: "add_reminder", arguments: { tripId: TRIP_ID, title: "Seats", date: "2026-07-02", transportId: "fork-leg" } });
      expect((r.content as { text: string }[])[0].text).toBe(NOT_FOUND_TEXT);
      expect(addReminder).not.toHaveBeenCalled();
    });

    it.each(["add_reminder", "update_reminder"] as const)("%s refuses more than one about id, before any lookup", async (name) => {
      const c = await connectTestClient();
      const base = name === "add_reminder" ? { tripId: TRIP_ID, title: "T", date: "2026-07-02" } : { reminderId: REMINDER_ID };
      const r = await c.callTool({ name, arguments: { ...base, stopId: STOP_ID, itemId: ITEM_ID } });
      expect(r.isError).toBe(true);
      expect((r.content as { text: string }[])[0].text).toContain("Pass at most one of stopId, itemId or transportId");
      expect(stopFindUnique).not.toHaveBeenCalled();
      expect(itemFindUnique).not.toHaveBeenCalled();
      expect(addReminder).not.toHaveBeenCalled();
      expect(updateReminder).not.toHaveBeenCalled();
    });

    it("update_reminder forwards nulls: no notes, about the Trip as a whole", async () => {
      updateReminder.mockResolvedValue({ success: true });
      const c = await connectTestClient();
      await c.callTool({ name: "update_reminder", arguments: { reminderId: REMINDER_ID, notes: null, stopId: null } });
      expect(updateReminder).toHaveBeenCalledWith(REMINDER_ID, { notes: null, stopId: null });
    });

    it("update_reminder moves a Reminder to a leg, checking the leg is the real plan's", async () => {
      updateReminder.mockResolvedValue({ success: true });
      const c = await connectTestClient();
      await c.callTool({ name: "update_reminder", arguments: { reminderId: REMINDER_ID, transportId: "leg-1" } });
      expect(transportFindUnique).toHaveBeenCalledWith({ where: { id: "leg-1", forkId: null }, select: { tripId: true } });
      expect(updateReminder).toHaveBeenCalledWith(REMINDER_ID, { transportId: "leg-1" });
    });
  });
```

`lib/mcp/tools/reads.test.ts:375-383`: the mocked row becomes `reminderItem({ id: "r1", title: "Buy visa", date: "2026-03-01", notes: "Apply online", itemId: "i1", itemTitle: "Visa office" })`. The JSON assertion expects the same object, so the new fields reach the caller unchanged.

- [ ] **Step 2: Run it, expect FAIL**

`npx vitest run lib/mcp/tools/lists-write.test.ts lib/mcp/tools/reads.test.ts`. Expected:
- `notes`/`itemId` are stripped by the tool's zod input, so `addReminder` gets `{ title, date }`;
- no "at most one" refusal;
- nulls are refused by the input schema.

`get_reminders` passes already (no code change there).

- [ ] **Step 3: Implement**

`lib/mcp/tools/lists-write.ts`. Add the imports `import { aboutCount } from "@/lib/reminder-about";` and `import { requireRealPlanRows, type RealPlanKind } from "../real-plan";` (merging the `real-plan` import). Then, above `registerListWriteTools`:

```ts
/** Spec F8: a Reminder is about one thing at most — refused before any lookup. */
const ONE_ABOUT = {
  success: false as const,
  errors: { _: ["Pass at most one of stopId, itemId or transportId — a Reminder is about one thing."] },
};

type AboutArgs = { stopId?: string | null; itemId?: string | null; transportId?: string | null };
const aboutRefs = (a: AboutArgs): [RealPlanKind, string | null | undefined][] => [
  ["stop", a.stopId],
  ["item", a.itemId],
  ["transport", a.transportId],
];
```

`add_reminder`:

```ts
  server.registerTool(
    "add_reminder",
    {
      title: "Add reminder",
      description:
        "Adds a dated note for the Traveller to see on Home and hear in the evening-before Digest. Carries a date, never a time. notes is optional detail shown in the app only — the Digest reads out the title alone. Pass at most one of stopId, itemId (a thing to do) or transportId (a Transport leg) to say what the note is about; it does not move the date.",
      inputSchema: {
        tripId: z.string(),
        title: z.string().trim().min(1),
        date: isoDate,
        notes: z.string().max(2000).optional(),
        stopId: z.string().optional(),
        itemId: z.string().optional(),
        transportId: z.string().optional(),
      },
    },
    ({ tripId, ...rest }) =>
      runTool("add_reminder", async () => {
        if (aboutCount(rest) > 1) return ONE_ABOUT;
        await requireRealPlanRows(aboutRefs(rest));
        return addReminder(tripId, rest);
      }),
  );
```

`update_reminder`:

```ts
  server.registerTool(
    "update_reminder",
    {
      title: "Update reminder",
      description:
        "Changes only the fields you pass; fields you omit keep their current value. notes: null clears them. Passing one of stopId, itemId or transportId makes the Reminder about that thing instead (the other two are cleared); null on the one it holds makes it about the Trip as a whole. Never pass more than one.",
      inputSchema: {
        reminderId: z.string(),
        title: z.string().trim().min(1).optional(),
        date: isoDate.optional(),
        notes: z.string().max(2000).nullable().optional(),
        stopId: z.string().nullable().optional(),
        itemId: z.string().nullable().optional(),
        transportId: z.string().nullable().optional(),
      },
    },
    ({ reminderId, ...patch }) =>
      runTool("update_reminder", async () => {
        if (aboutCount(patch) > 1) return ONE_ABOUT;
        await requireRealPlanRows(aboutRefs(patch));
        return updateReminder(reminderId, patch);
      }),
  );
```

Rewrite the header comment's last two paragraphs (`:19-27`):
- a Reminder's `stopId`/`itemId`/`transportId` are each checked against the real plan first, so a Fork's row reads as not found;
- more than one is refused before any lookup (spec F8);
- `update_reminder` passes only the supplied fields (PATCH, ADR 0075);
- naming any about id replaces the whole about (`replaceAbout`), and `null` clears.

`lib/mcp/tools/reads.ts:282`, the description: `"Reads this trip's Reminders dated on or after a date (today by default), soonest first. Each carries its notes and what it is about: stopId/stopName, itemId/itemTitle or transportId/transportLabel (all null when it is about the Trip as a whole)."`

- [ ] **Step 4: Run it, expect PASS** — the command from Step 2.

- [ ] **Step 5: Task-done check**

- `npx vitest related --run lib/mcp/tools/lists-write.ts lib/mcp/tools/reads.ts`
- `npx tsc --noEmit`
- `npx eslint lib/mcp/tools/lists-write.ts lib/mcp/tools/reads.ts lib/mcp/tools/lists-write.test.ts lib/mcp/tools/reads.test.ts`

If the local DB is up, also run `npm run test:integration -- test/integration/mcp.test.ts`: the tool list there may pin descriptions.

- [ ] **Step 6: Commit**

Message: `feat(mcp): add_reminder / update_reminder take notes and an Item or leg (F8)`. No `Resolves-Feedback:` trailer: the assembler places `Resolves-Feedback: cmvaifznz000t07gwfwee8lfp` on section F's last task.

---

### Task E.16: CONTEXT.md and ADR note — a Reminder's notes and "about"

**Files:**
- Modify: `CONTEXT.md` (the **Reminder** entry)
- Modify: `docs/adr/0047-*.md`: add a dated amendment at the end. Find the file with `ls docs/adr | grep 0047`.

**Interfaces:**
- Produces: vocabulary only. A Reminder may carry **notes** (shown in the app, folded on Home, never in the Digest) and be about one Stop, one thing to do or one Transport leg — never several. Deleting that thing leaves it about nothing; a Surprise Stop or Item hides it.

- [ ] **Step 1: Write the failing test** — none (docs). Run `grep -n "Reminder" CONTEXT.md` to find the entry.
- [ ] **Step 2: Run it** — n/a.
- [ ] **Step 3: Implement**

In CONTEXT.md **Reminder**, append these sentences in the entry's own style:

> A Reminder may carry **notes** — detail shown in the app (folded on Home), never read out in the Digest. It may be **about** one Stop, one thing to do or one Transport leg — never several; deleting that thing leaves the Reminder about nothing. A Surprise Stop or Item hides a Reminder about it (or anything inside it) from the Travellers it surprises.

In ADR 0047, append:

> **Amendment 2026-10-16 (spec 2026-10-16 F8).** `Reminder.notes`, `Reminder.itemId`, `Reminder.transportId` added. A DB CHECK (`Reminder_about_one_thing_check`) holds at most one of `stopId`/`itemId`/`transportId`. The Digest still reads `{ id, title }` only.

- [ ] **Step 4: Run it** — `npx eslint` is n/a. Check that `git diff --stat` shows only the two docs.
- [ ] **Step 5: Task-done check** — none beyond Step 4 (no source files).
- [ ] **Step 6: Commit**

Message: `docs(reminders): notes and one thing to be about (F8)`.
## Section F — F7 narrow reads, F6 writes return the row, F2 delete_note and descriptions

### Notes

**What this section produces (later tasks and the final gate rely on these names):**
- `lib/mcp/reads/plan-shapes.ts` (pure). Types: `McpSurprise`, `McpAccommodation`, `McpThingToDo`, `McpDayItem`, `McpItem`, `McpStopDay`, `McpUnplacedDatedItem`, `McpStop`, `McpTransportEndpoint`, `McpLocalTime`, `McpTransport`, `McpChapter`, `McpTripSummary`, `McpStopRow`, `McpItemRow`, `McpTransportRow`, `FilesFor`. Selects: `MCP_ACCOMMODATION_SELECT`, `mcpStopSelect(accommodationWhere)`, `MCP_THING_TO_DO_SELECT`, `MCP_DATED_ITEM_SELECT`, `MCP_TRANSPORT_SELECT`, `MCP_CHAPTER_SELECT`, `MCP_TRIP_SELECT`. Functions: `toMcpSurprise`, `toMcpAccommodation`, `toMcpThingToDo`, `toMcpDayItem`, `toMcpItem`, `withPlaceholders`, `buildMcpStops`, `toMcpTransport`, `toMcpTrip`.
- `lib/mcp/reads/notes.ts`: `McpNote`, `readMcpNotes(tripId, v, where?)`, `loadNotesForMcp(tripId)`, `loadNoteForMcp(noteId)`.
- `lib/mcp/reads/costs.ts` (extended): `McpCost` (now exported), `readMcpCosts(tripId, v, where?)`, `loadCostForMcp(costId)`.
- `lib/mcp/reads/attachments.ts` (extended): `loadTripAttachments(tripId, visibility?, opts?: { targetIds?: string[]; tripFiles?: boolean })`.
- `lib/mcp/reads/entities.ts`: `McpItemDetail`, `McpTransportDetail`, `McpAccommodationDetail`, `loadItemForMcp`, `loadTransportForMcp`, `loadAccommodationForMcp`, `loadChapterForMcp`, `loadTripSummaryForMcp`, `readMcpStops(tripId, stopIds)`, `loadStopForMcp`.
- `lib/mcp/reads/day.ts`: `McpDay`, `McpDayEntry`, `loadDayForMcp(tripId, date)`.
- `lib/mcp/reads/stop-changes.ts`: `StopSnapshot`, `snapshotPlanStops`, `changedStopIds`, `stopTracker()`, `conflictsOf`.
- `lib/mcp/reads/lists.ts`: `McpChecklistItem`, `CHECKLIST_VIEW_SELECT`, `toChecklistView`, `readChecklist`, `loadChecklistItemForMcp`, `loadChecklistOfItemForMcp`, `McpIdea`, `WISHLIST_IDEA_SELECT`, `toMcpIdea`, `loadWishlistIdeaForMcp`, `loadVotesForMcp`.
- `lib/reminder-reads.ts` (extended): `REMINDER_ITEM_SELECT`, `toReminderItem`, `readReminderItem(reminderId)`.
- `lib/mcp/run-tool.ts` (extended): `runWrite(name, write, reread)`.
- New MCP tools: `get_stop`, `get_item`, `get_transport`, `get_accommodation`, `get_day`, `delete_note`.
- Actions whose success branch gains an id (additive, still `ActionResult`, ADR 0074): `addNote` → `ActionResult<{ id: string }>`, `createChapter` → `ActionResult<{ id: string }>`, `addChecklistItem` → `ActionResult<{ id: string }>`, `addMarkerToWishlist` → `ActionResult<{ id: string }>`.

**What this section assumes from earlier sections (exact names):**
- **E (F8):** `ReminderItem` in `lib/reminder-reads.ts` carries `notes: string | null`, `itemId: string | null` and `transportId: string | null` (plus whatever labels E added), selected in `listRemindersForTrip`. `add_reminder` / `update_reminder` in `lib/mcp/tools/lists-write.ts` already accept E's new fields and check `["item", itemId]` / `["transport", transportId]` with `requireRealPlanRows`. F.11 and F.16 touch only the read-back, never E's input handling. If E already pulled the Reminder select/mapper out into named constants, F.11 uses E's names instead of adding `REMINDER_ITEM_SELECT` / `toReminderItem`.
- **A (F3):** `create_trip` takes `homeTimezone`. **C (F5):** `update_trip` has a new description. F.13 changes only these tools' handler bodies, never their schemas or descriptions.
- **B (F4):** the dating actions may grow `Trip.endDate`. Nothing here depends on that. A write's read-back shows the Stop rows, not the Trip.
- Line numbers below are as of today (before A–E land). Find the sites by tool name.

**Decisions where the spec is silent (and why):**
1. **What a write returns.** An object keyed by the entity: `{ trip }`, `{ stop }`, `{ item }`, `{ transport }`, `{ accommodation }`, `{ cost }`, `{ chapter }`, `{ note }`, `{ reminder }`, `{ checklistItem }`, `{ idea }`. Bulk writes return lists: `{ stops }`, `{ added }`, `{ kind, items }`. Deletes return `{ deleted: <id> }`. Each value is what the matching narrow read returns. Keying by entity leaves room for extras such as `shifted` and `conflicts` without changing the row's own shape.
2. **Ripples.** A Stop-dating write (add_stop, update_stop, set_stop_nights, set_stop_dates, make_stop_rough, move_stop) returns `{ stop, shifted }`. `shifted` lists every other real-plan Stop whose order, dates, nights, pin, Chapter or zone changed, found by comparing the plan's Stops before and after the write (`stopTracker`). The action's `conflicts` are passed through when there are any. `firm_up_trip` and make_it_fit_apply's trims return `{ stops }`, the Stops that changed. The action's `payload` (Undo pre-images) and `changed` are dropped, because `shifted` replaces them.
3. **Surprise in the read-back.** `get_stop` / `get_item` / `get_accommodation` on a row hidden from the acting Traveller read as not found, which is what `requireRealPlanRow` already does. `shifted` / `stops`, however, read through `readMcpStops`, which shows a hidden Stop as get_trip_plan's shell (name, dates, nights, no inside, no days). CONTEXT.md says a surprised Traveller's edit can ripple into a Surprise Stop. If the read-back refused that Stop, a write that succeeded would report "Not found".
4. **`get_item` names the Notes on it `notesOnItem`.** The Item's slice already has `notes` (the Item's own notes, its description), so reusing `notes` would put two meanings under one key. This is the confusion behind both Feedback notes.
5. **Shapes.** Every narrow read is get_trip_plan's slice for that entity plus the spec's extras: get_stop = `McpStop`, exactly. get_item = `McpItem` (the `unplacedDatedItems` entry shape, with `date` nullable) + `costs` + `notesOnItem`. get_transport = `McpTransport` + `costs`. get_accommodation = `McpAccommodation` + `stopId` + `costs`. Costs use list_costs' `McpCost` shape, Notes get_notes' shape, and files get_trip_plan's `files` list (`McpFileRef`).
6. **`get_day` shape** (spec: decide): `{ date, dayNumber, totalDays, dayTitle, stop, travelDay, tonight, timeline, anytime }`. `timeline` follows the Day view's `orderDayEntries(...).entries` order. Its entries are `item`, `departure`, `arrival`, `check-in` and `check-out`; `anytime` holds the untimed things to do. A date outside `[startDate, endDate]` is a tool error naming the trip's range. The Day view clamps such a date, but Claude should be told when it asked for the wrong day. A dateless trip is also a tool error.
7. **Per-entity write returns that aren't one row:** `set_vote` / `clear_vote` return `{ itemId, votes }`, get_wishlist's `votes` for that Item, since a Vote can be on any Item. `set_day_title` returns `{ stopId, day }`, get_trip_plan's `McpStopDay` for that date. `unschedule_thing_to_do` returns `{ deleted, ideaId }` when it removed a placed copy and `{ item }` when the Item only lost its date. `schedule_thing_to_do` and `place_idea_at_stop` return the placed copy. `save_packing_template` returns `{ template }`, get_checklists' templates entry. `apply_packing_template` returns `{ added }`, the Packing rows it created. `move_checklist_item` returns `{ kind, items }`, the whole list in its new order. `set_surprise` / `reveal_surprise` return the Stop or Item. A Trip write returns `{ trip }`, get_trip_plan's `trip` slice (`McpTripSummary`). `delete_stop` returns `{ deleted, preview }` and keeps the preview of what it removed with the Stop. `leave_feedback` is unchanged: it already returns `{ noteId, status }`.
8. **Ids that actions didn't return:** four actions gain `id` on their success branch (F.12, F.17). The alternative was having the tool find "the newest row", which races.
9. **The "no `{}`" walker** (F.18) lists the tools over a real in-memory MCP client. Every tool without `readOnlyHint` is a write. It calls each write once from a hand table of valid arguments, with every action mocked to succeed. A write tool missing from the table fails the test, so a new tool can't skip it.

**Review Focus candidates:**
1. **set_stop_dates rippling into a Surprise Stop hidden from the caller.** The tool succeeds and lists that Stop in `shifted` as a shell (no notes, things to do, Accommodation or days). It is never "Not found". Tested in F.10 (`stopTracker` reads the shifted list with `readMcpStops`) and F.8 (`readMcpStops` as the surprised member returns the shell).
2. **A Changeover day.** The day's only Day title is owned by the next Stop, and a dated thing to do with no Stop falls on it. `get_stop` for the earlier Stop shows that title and Item on its last day, and the result `toEqual`s get_trip_plan's `stops[i]`. Tested in F.8 against real Postgres.
3. **A hidden Surprise Item.** As the surprised Traveller, `get_item` on it is NOT_FOUND_TEXT, and so is a Fork's Item. `get_day` for its date shows it as a placeholder titled "Surprise" at its time. Tested in F.8, with the unit tests in F.6.

**Proposed trailers:** F.17 carries `Resolves-Feedback: cmvaecnl8000307l3wutowp1t`; F.18 (the section's last task) carries `Resolves-Feedback: cmvaifznz000t07gwfwee8lfp`.

---

### Task F.1: get_trip_plan's per-entity shapes move to `lib/mcp/reads/plan-shapes.ts`

A pure refactor. `trip-plan.ts` builds its result from shape functions that the narrow reads (F.4–F.6) will share. That shared code is what keeps the two from drifting.

**Files:**
- Create: `lib/mcp/reads/plan-shapes.ts`
- Create: `lib/mcp/reads/plan-shapes.test.ts`
- Modify: `lib/mcp/reads/trip-plan.ts:1-502`. Move the interfaces from lines 33–196 and `toItemView` from 198–227 out. Lines 229–501 become orchestration only.
- Test (must pass unchanged): `lib/mcp/reads/trip-plan.test.ts`

**Interfaces:**
- Consumes: `buildStopDays`, `groupScheduledItemsByStop`, `StopDayItem` (`lib/stop-days.ts`); `transportTimeDisplay` (`lib/time-display.ts`); `SurpriseView` (`lib/surprise.ts`); `SurpriseVisibility` type (`lib/surprise-visibility.ts`, type-only import); `McpFileRef` (`./attachments`).
- Produces: everything listed for `plan-shapes.ts` in Notes. `trip-plan.ts` keeps exporting `McpTripPlan` and `loadTripPlanForMcp` with an identical result.

- [ ] **Step 1: Write the failing test**

`lib/mcp/reads/plan-shapes.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  buildMcpStops,
  toMcpItem,
  toMcpTransport,
  withPlaceholders,
  type McpItemRow,
  type McpStopRow,
} from "./plan-shapes";

const noFiles = () => [];
const stop = (o: Partial<McpStopRow> = {}): McpStopRow => ({
  id: "s1", name: "Porto", countryCode: "pt", timezone: "Europe/Lisbon",
  arriveDate: "2027-06-01", departDate: "2027-06-04", nights: null, pinned: false,
  chapterId: null, notes: "Port lodges", sortOrder: 0, accommodations: [], surprise: null, ...o,
});
const item = (o: Partial<McpItemRow> = {}): McpItemRow => ({
  id: "i1", title: "Tour", category: "ACTIVITY", date: null, startTime: null, endTime: null,
  address: null, link: null, booking: null, notes: null, stopId: null, ...o,
});
const surpriseView = { plannerName: "Cam", forNames: ["Alex"], youAreSurprised: true } as never;

describe("buildMcpStops", () => {
  it("puts a Changeover day's Item under both Stops, each day titled once, and reports it covered", () => {
    const { stops, coveredItemIds } = buildMcpStops({
      stops: [stop(), stop({ id: "s2", name: "Lisbon", arriveDate: "2027-06-04", departDate: "2027-06-06", sortOrder: 1 })],
      thingsToDo: [item({ id: "t1", stopId: "s1" })],
      datedItems: [
        { ...item({ id: "c1", date: "2027-06-04", startTime: "09:00" }), surprise: null },
        { ...item({ id: "far", date: "2027-07-01" }), surprise: null },
      ],
      dayTitles: new Map([["2027-06-04", { title: "Changeover", stopId: "s2" }]]),
      hiddenStopIds: new Set(),
      itemView: () => null,
      filesFor: noFiles,
    });
    expect(stops[0].days.at(-1)).toMatchObject({ date: "2027-06-04", dayTitle: "Changeover", items: [expect.objectContaining({ id: "c1" })] });
    expect(stops[1].days[0]).toMatchObject({ date: "2027-06-04", dayTitle: "Changeover", items: [expect.objectContaining({ id: "c1" })] });
    expect(stops[0].thingsToDo.map((t) => t.id)).toEqual(["t1"]);
    expect([...coveredItemIds]).toEqual(["c1"]);
  });

  it("keeps a hidden Surprise Stop's shell: rough false, dates kept, no days", () => {
    const { stops } = buildMcpStops({
      stops: [stop({ notes: null, surprise: surpriseView })],
      thingsToDo: [], datedItems: [{ ...item({ id: "c1", date: "2027-06-02" }), surprise: null }],
      dayTitles: new Map(), hiddenStopIds: new Set(["s1"]), itemView: () => null, filesFor: noFiles,
    });
    expect(stops[0]).toMatchObject({ rough: false, arriveDate: "2027-06-01", days: [], notes: null, surprise: { youAreSurprised: true } });
  });

  it("a rough Stop has rough true and no days", () => {
    const { stops } = buildMcpStops({
      stops: [stop({ arriveDate: null, departDate: null, nights: 3 })],
      thingsToDo: [], datedItems: [], dayTitles: new Map(), hiddenStopIds: new Set(), itemView: () => null, filesFor: noFiles,
    });
    expect(stops[0]).toMatchObject({ rough: true, nights: 3, days: [] });
  });
});

describe("withPlaceholders", () => {
  it("adds a hidden real-plan Item as a 'Surprise' placeholder on its date, sorted by date", () => {
    const placeholder = {
      id: "p1", tripId: "t", forkId: null, stopId: "s1", date: "2027-06-01", startTime: "19:00", endTime: null,
      title: "Surprise" as const, category: "OTHER" as const, address: null, link: null, booking: null, notes: null,
      lat: null, lng: null, countryCode: null, hiddenFromShares: false, sortOrder: 0, photoAttachmentId: null,
      sourceItemId: null, surprise: surpriseView,
    };
    const forkPlaceholder = { ...placeholder, id: "p2", forkId: "f1" };
    const out = withPlaceholders([item({ id: "i2", date: "2027-06-02" })], {
      placeholderItems: [placeholder, forkPlaceholder],
      views: { stops: new Map(), items: new Map() },
    });
    expect(out.map((i) => [i.id, i.title])).toEqual([["p1", "Surprise"], ["i2", "Tour"]]);
  });
});

describe("toMcpItem / toMcpTransport", () => {
  it("toMcpItem carries the date and owning Stop alongside the day-item fields", () => {
    expect(toMcpItem({ ...item({ id: "i1", date: "2027-06-02", stopId: "s1" }), surprise: null }, noFiles)).toEqual({
      id: "i1", title: "Tour", category: "ACTIVITY", startTime: null, endTime: null, address: null, link: null,
      booking: null, notes: null, files: [], surprise: null, date: "2027-06-02", stopId: "s1",
    });
  });

  it("toMcpTransport reads a Home end in the Home timezone and a Stop end in the Stop's", () => {
    const t = toMcpTransport(
      {
        id: "t1", mode: "FLIGHT", fromStopId: null, toStopId: "s1", depIsHome: true, arrIsHome: false,
        depPlace: null, arrPlace: null, depAt: new Date("2027-05-31T22:00:00Z"), arrAt: new Date("2027-06-01T10:00:00Z"),
        reference: "QF1", notes: null,
      },
      { stopNameById: new Map([["s1", "Porto"]]), tzById: new Map([["s1", "Europe/Lisbon"]]), homeTimezone: "Australia/Sydney", filesFor: noFiles },
    );
    expect(t.from).toEqual({ home: true });
    expect(t.to).toEqual({ stopId: "s1", name: "Porto" });
    expect(t.departs).toMatchObject({ localTime: "08:00", localDate: "2027-06-01" });
    expect(t.arrives).toMatchObject({ localTime: "11:00", localDate: "2027-06-01" });
  });
});
```

- [ ] **Step 2: Run it, expect FAIL.** `npx vitest run lib/mcp/reads/plan-shapes.test.ts` fails with `Failed to resolve import "./plan-shapes"`.

- [ ] **Step 3: Implement**

Create `lib/mcp/reads/plan-shapes.ts`. Move the interfaces from `trip-plan.ts:33-196` here unchanged, exporting each of them, and **add `McpItem`**. Then add the selects and shape functions:

```ts
/**
 * The Claude connection's per-entity plan shapes (spec 2026-10-16 F7): the
 * one definition of how a Stop, its Accommodation, a thing to do, a
 * Transport leg, a Chapter and the Trip itself read. get_trip_plan
 * (./trip-plan.ts) and the narrow reads (./entities.ts, ./day.ts) build from
 * these, so a narrow read is that entity's slice of get_trip_plan by
 * construction. Pure: no db, no guards.
 */
import { buildStopDays, groupScheduledItemsByStop, type StopDayItem } from "@/lib/stop-days";
import { transportTimeDisplay } from "@/lib/time-display";
import type { SurpriseView } from "@/lib/surprise";
import type { SurpriseVisibility } from "@/lib/surprise-visibility";
import type { McpFileRef } from "./attachments";

// ── Types (moved verbatim from trip-plan.ts, now exported) ────────────────
// McpSurprise, McpAccommodation, McpThingToDo, McpDayItem, McpStopDay,
// McpUnplacedDatedItem, McpStop, McpTransportEndpoint, McpLocalTime,
// McpTransport, McpChapter — exactly as trip-plan.ts:33-155 has them today.

/** One thing to do with its date and owning Stop: a get_trip_plan `unplacedDatedItems` entry, with `date` null when undated (get_item). */
export interface McpItem extends McpDayItem {
  /** YYYY-MM-DD, or null for a thing to do with no date (or a Wishlist idea). */
  date: string | null;
  stopId: string | null;
}

export interface McpUnplacedDatedItem extends McpItem {
  /** YYYY-MM-DD */
  date: string;
}

/** get_trip_plan's `trip`; also every Trip write's read-back (F6). */
export interface McpTripSummary {
  id: string;
  name: string;
  startDate: string | null;
  endDate: string | null;
  hardEndDate: string | null;
  homeCurrency: string;
  homeBase: string | null;
  homeTimezone: string | null;
  roundTrip: boolean;
  files: McpFileRef[];
}

// ── Selects ──────────────────────────────────────────────────────────────

export const MCP_ACCOMMODATION_SELECT = {
  id: true, name: true, address: true, checkIn: true, checkOut: true, confirmation: true, notes: true,
} as const;

const MCP_STOP_FIELDS = {
  id: true, name: true, countryCode: true, timezone: true, arriveDate: true, departDate: true,
  nights: true, pinned: true, chapterId: true, notes: true, sortOrder: true,
} as const;

/** A Stop with its Accommodation; `accommodationWhere` is the Surprise fragment (`v.where.accommodation`). */
export const mcpStopSelect = (accommodationWhere: object) => ({
  ...MCP_STOP_FIELDS,
  accommodations: { where: accommodationWhere, orderBy: { checkIn: "asc" as const }, select: MCP_ACCOMMODATION_SELECT },
});

export const MCP_THING_TO_DO_SELECT = {
  id: true, title: true, category: true, startTime: true, endTime: true,
  address: true, link: true, booking: true, notes: true, stopId: true,
} as const;

export const MCP_DATED_ITEM_SELECT = { ...MCP_THING_TO_DO_SELECT, date: true } as const;

export const MCP_TRANSPORT_SELECT = {
  id: true, mode: true, fromStopId: true, toStopId: true, depIsHome: true, arrIsHome: true,
  depPlace: true, arrPlace: true, depAt: true, arrAt: true, reference: true, notes: true,
} as const;

export const MCP_CHAPTER_SELECT = { id: true, name: true, startDate: true, endDate: true } as const;

export const MCP_TRIP_SELECT = {
  name: true, startDate: true, endDate: true, hardEndDate: true, homeCurrency: true,
  homeName: true, homeTimezone: true, roundTrip: true,
} as const;

// ── Row types (what the selects above return) ────────────────────────────

type AccommodationRow = Omit<McpAccommodation, "files">;

export interface McpStopRow {
  id: string; name: string; countryCode: string | null; timezone: string | null;
  arriveDate: string | null; departDate: string | null; nights: number | null; pinned: boolean;
  chapterId: string | null; notes: string | null; sortOrder: number;
  accommodations: AccommodationRow[];
  /** maskSurpriseStops' view, null for a Stop that is no Surprise. */
  surprise: SurpriseView | null;
}

export interface McpItemRow {
  id: string; title: string; category: string; date: string | null; startTime: string | null; endTime: string | null;
  address: string | null; link: string | null; booking: string | null; notes: string | null; stopId: string | null;
}

export interface McpTransportRow {
  id: string; mode: string; fromStopId: string | null; toStopId: string | null; depIsHome: boolean; arrIsHome: boolean;
  depPlace: string | null; arrPlace: string | null; depAt: Date | null; arrAt: Date | null; reference: string | null; notes: string | null;
}

export type FilesFor = (kind: "STOP" | "ACCOMMODATION" | "TRANSPORT" | "ITEM", id: string) => McpFileRef[];

// ── Shapes ───────────────────────────────────────────────────────────────

export function toMcpSurprise(view: SurpriseView | null | undefined): McpSurprise | null {
  return view ? { plannedBy: view.plannerName, for: view.forNames, youAreSurprised: view.youAreSurprised } : null;
}

export function toMcpAccommodation(a: AccommodationRow, filesFor: FilesFor): McpAccommodation {
  return { ...a, files: filesFor("ACCOMMODATION", a.id) };
}

export function toMcpThingToDo(i: McpItemRow, filesFor: FilesFor, view: SurpriseView | null | undefined): McpThingToDo {
  return {
    id: i.id, title: i.title, category: i.category, address: i.address, link: i.link, booking: i.booking,
    notes: i.notes, files: filesFor("ITEM", i.id), surprise: toMcpSurprise(view),
  };
}

/** A dated thing to do on a day (get_trip_plan's `days[].items`, get_day's timeline). */
export function toMcpDayItem(i: StopDayItem, filesFor: FilesFor): McpDayItem {
  return {
    id: i.id, title: i.title, category: i.category,
    startTime: i.startTime ?? null, endTime: i.endTime ?? null, address: i.address ?? null,
    link: i.link ?? null, booking: i.booking ?? null, notes: i.notes ?? null,
    files: filesFor("ITEM", i.id), surprise: toMcpSurprise(i.surprise),
  };
}

export function toMcpItem(i: McpItemRow & { surprise: SurpriseView | null }, filesFor: FilesFor): McpItem {
  return { ...toMcpDayItem(i, filesFor), date: i.date, stopId: i.stopId };
}

type DatedItem = McpItemRow & { surprise: SurpriseView | null };

/**
 * The real plan's dated Items with each hidden Surprise Item joined as a
 * placeholder titled "Surprise" on its date and time (ADR 0051), date order,
 * same-day order kept.
 */
export function withPlaceholders(
  scheduled: McpItemRow[],
  v: Pick<SurpriseVisibility, "placeholderItems" | "views">,
): DatedItem[] {
  return [
    ...scheduled.map((i) => ({ ...i, surprise: v.views.items.get(i.id) ?? null })),
    ...v.placeholderItems
      .filter((p) => p.forkId === null && p.date !== null)
      .map((p) => ({
        id: p.id, title: p.title, category: p.category, date: p.date, startTime: p.startTime, endTime: p.endTime,
        address: p.address, link: p.link, booking: p.booking, notes: p.notes, stopId: p.stopId, surprise: p.surprise,
      })),
  ].sort((a, b) => (a.date! < b.date! ? -1 : a.date! > b.date! ? 1 : 0));
}

/**
 * Stops as get_trip_plan reads them. `stops` arrive ordered and masked
 * (`maskSurpriseStops`). Day rows are grouped by DATE COVERAGE (ADR 0049),
 * so a Changeover day's Item sits under both Stops. A hidden Stop keeps its
 * shell: no days, and its dates neither title a day nor gather Items.
 * `coveredItemIds` names every dated Item that landed on some Stop's day.
 */
export function buildMcpStops(input: {
  stops: McpStopRow[];
  thingsToDo: McpItemRow[];
  datedItems: DatedItem[];
  dayTitles: Map<string, { title: string; stopId: string }>;
  hiddenStopIds: ReadonlySet<string>;
  itemView: (id: string) => SurpriseView | null;
  filesFor: FilesFor;
}): { stops: McpStop[]; coveredItemIds: Set<string> } {
  const { stops, thingsToDo, datedItems, dayTitles, hiddenStopIds, itemView, filesFor } = input;
  const openStops = stops.filter((s) => !hiddenStopIds.has(s.id));

  const thingsToDoByStopId = new Map<string, McpThingToDo[]>();
  for (const i of thingsToDo) {
    if (!i.stopId) continue;
    const list = thingsToDoByStopId.get(i.stopId) ?? [];
    list.push(toMcpThingToDo(i, filesFor, itemView(i.id)));
    thingsToDoByStopId.set(i.stopId, list);
  }

  const dayItemsByStopId = groupScheduledItemsByStop(openStops, datedItems as unknown as StopDayItem[]);

  const mcpStops = stops.map((stop): McpStop => {
    const rough = !(stop.arriveDate && stop.departDate);
    const days: McpStopDay[] = rough || hiddenStopIds.has(stop.id)
      ? []
      : buildStopDays(stop.arriveDate!, stop.departDate!, dayItemsByStopId.get(stop.id) ?? []).map((day) => ({
          date: day.dateISO,
          dayTitle: dayTitles.get(day.dateISO)?.title ?? null,
          items: [...day.timed, ...day.untimed].map((i) => toMcpDayItem(i, filesFor)),
        }));
    return {
      id: stop.id, name: stop.name, countryCode: stop.countryCode, rough, nights: stop.nights,
      arriveDate: stop.arriveDate, departDate: stop.departDate, pinned: stop.pinned, chapterId: stop.chapterId,
      notes: stop.notes, timezone: stop.timezone,
      accommodations: stop.accommodations.map((a) => toMcpAccommodation(a, filesFor)),
      thingsToDo: thingsToDoByStopId.get(stop.id) ?? [],
      days,
      files: filesFor("STOP", stop.id),
      surprise: toMcpSurprise(stop.surprise),
    };
  });

  return { stops: mcpStops, coveredItemIds: new Set([...dayItemsByStopId.values()].flat().map((i) => i.id)) };
}

/** One Transport leg, each end in its own zone (`transportTimeDisplay`, the Plan editor's rule). */
export function toMcpTransport(
  t: McpTransportRow,
  ctx: { stopNameById: ReadonlyMap<string, string>; tzById: ReadonlyMap<string, string | null>; homeTimezone: string | null; filesFor: FilesFor },
): McpTransport {
  const endpoint = (stopId: string | null, isHome: boolean): McpTransportEndpoint => {
    if (isHome) return { home: true };
    if (stopId) return { stopId, name: ctx.stopNameById.get(stopId) ?? stopId };
    return null;
  };
  const local = (at: Date | null, part: { time: string; zone: string; dateISO: string } | null): McpLocalTime | null =>
    at && part ? { at: at.toISOString(), localTime: part.time, localDate: part.dateISO, zone: part.zone } : null;
  const shown = transportTimeDisplay({
    depAt: t.depAt, arrAt: t.arrAt,
    fromTimezone: t.fromStopId ? ctx.tzById.get(t.fromStopId) ?? null : null,
    toTimezone: t.toStopId ? ctx.tzById.get(t.toStopId) ?? null : null,
    depIsHome: t.depIsHome, arrIsHome: t.arrIsHome, homeTimezone: ctx.homeTimezone,
  });
  return {
    id: t.id, mode: t.mode,
    from: endpoint(t.fromStopId, t.depIsHome), to: endpoint(t.toStopId, t.arrIsHome),
    depPlace: t.depPlace, arrPlace: t.arrPlace,
    depAt: t.depAt ? t.depAt.toISOString() : null, arrAt: t.arrAt ? t.arrAt.toISOString() : null,
    departs: local(t.depAt, shown.dep), arrives: local(t.arrAt, shown.arr), dayDelta: shown.dayDelta,
    reference: t.reference, notes: t.notes, files: ctx.filesFor("TRANSPORT", t.id),
  };
}

type TripRow = {
  name: string; startDate: string | null; endDate: string | null; hardEndDate: string | null; homeCurrency: string;
  homeName: string | null; homeTimezone: string | null; roundTrip: boolean;
};

export function toMcpTrip(tripId: string, trip: TripRow | null, files: McpFileRef[]): McpTripSummary {
  return {
    id: tripId,
    name: trip?.name ?? "",
    startDate: trip?.startDate ?? null,
    endDate: trip?.endDate ?? null,
    hardEndDate: trip?.hardEndDate ?? null,
    homeCurrency: trip?.homeCurrency ?? "AUD",
    homeBase: trip?.homeName ?? null,
    homeTimezone: trip?.homeTimezone ?? null,
    roundTrip: trip?.roundTrip ?? false,
    files,
  };
}
```

Rewrite `loadTripPlanForMcp` in `trip-plan.ts` to build from these. Keep the file header and `McpTraveller`, and keep `McpTripPlan` with `trip: McpTripSummary`. The queries stay exactly as they are, with the selects spelled through the constants:

```ts
export async function loadTripPlanForMcp(tripId: string): Promise<McpTripPlan> {
  const { user } = await requireTripAccess(tripId);
  const v = await loadSurpriseVisibility(tripId, user.id);

  const [trip, stopsRaw, transportsRaw, chaptersRaw, thingsToDoItems, scheduledItems, members, { byOwner }] = await Promise.all([
    db.trip.findUnique({ where: { id: tripId }, select: MCP_TRIP_SELECT }),
    db.stop.findMany({ where: { tripId, ...REAL_PLAN }, orderBy: { sortOrder: "asc" }, select: mcpStopSelect(v.where.accommodation) }),
    db.transport.findMany({ where: { tripId, ...REAL_PLAN }, orderBy: { sortOrder: "asc" }, select: MCP_TRANSPORT_SELECT }),
    db.chapter.findMany({ where: { tripId, ...REAL_PLAN }, orderBy: [{ startDate: "asc" }, { sortOrder: "asc" }], select: MCP_CHAPTER_SELECT }),
    db.item.findMany({ where: { tripId, ...REAL_PLAN, ...THINGS_TO_DO_WHERE, ...v.where.item }, orderBy: { sortOrder: "asc" }, select: MCP_THING_TO_DO_SELECT }),
    // No stopId filter: a dated Item with no Stop is still on the plan (ADR 0049).
    db.item.findMany({ where: { tripId, ...REAL_PLAN, date: { not: null }, ...v.where.item }, orderBy: [{ date: "asc" }, { sortOrder: "asc" }], select: MCP_DATED_ITEM_SELECT }),
    db.tripMember.findMany({ where: { tripId }, orderBy: { createdAt: "asc" }, select: { role: true, user: { select: TRAVELLER_SELECT } } }),
    loadTripAttachments(tripId, v),
  ]);

  const filesFor: FilesFor = (kind, id) => byOwner.get(ownerKey(kind, id)) ?? [];
  const stops = maskSurpriseStops(orderPlanStops(stopsRaw), v, v.views.stops);
  const hiddenStopIds = new Set(v.hiddenStopIds);
  const openStops = stops.filter((s) => !hiddenStopIds.has(s.id));
  const datedItems = withPlaceholders(scheduledItems, v);
  const dayTitles = await loadDayTitles(openStops.map((s) => ({ id: s.id, arriveDate: s.arriveDate, departDate: s.departDate })));

  const built = buildMcpStops({
    stops, thingsToDo: thingsToDoItems, datedItems, dayTitles, hiddenStopIds,
    itemView: (id) => v.views.items.get(id) ?? null, filesFor,
  });

  const stopNameById = new Map(stops.map((s) => [s.id, s.name]));
  const tzById = new Map(stops.map((s) => [s.id, s.timezone]));
  const homeTimezone = trip?.homeTimezone ?? null;

  return {
    trip: toMcpTrip(tripId, trip, byOwner.get(ownerKey("TRIP", tripId)) ?? []),
    stops: built.stops,
    transports: transportsRaw.map((t) => toMcpTransport(t, { stopNameById, tzById, homeTimezone, filesFor })),
    chapters: chaptersRaw,
    unplacedDatedItems: datedItems
      .filter((i) => !built.coveredItemIds.has(i.id))
      .map((i) => ({ ...toMcpItem(i, filesFor), date: i.date as string })),
    travellers: members.map((m) => ({
      id: m.user.id,
      name: travellerName(m.user),
      role: m.role === "owner" ? "owner" : "traveller",
      you: m.user.id === user.id,
    })),
  };
}
```

Remove imports that `trip-plan.ts` no longer uses (`buildStopDays`, `groupScheduledItemsByStop`, `StopDayItem`, `transportTimeDisplay`, `SurpriseView`). It still imports `@/lib/surprise-visibility`, which it must: it is on `SURPRISE_VISIBILITY_READERS`.

- [ ] **Step 4: Run it, expect PASS.** `npx vitest run lib/mcp/reads/plan-shapes.test.ts lib/mcp/reads/trip-plan.test.ts`. Both pass, and trip-plan.test.ts passes **unedited**.
- [ ] **Step 5: Task-done check.** `npx vitest related --run lib/mcp/reads/plan-shapes.ts lib/mcp/reads/trip-plan.ts` + `npx tsc --noEmit` + `npx eslint lib/mcp/reads/plan-shapes.ts lib/mcp/reads/plan-shapes.test.ts lib/mcp/reads/trip-plan.ts`
- [ ] **Step 6: Commit.** Files: `lib/mcp/reads/plan-shapes.ts`, `lib/mcp/reads/plan-shapes.test.ts`, `lib/mcp/reads/trip-plan.ts`. Message: `refactor(mcp): build get_trip_plan from per-entity shapes in plan-shapes.ts`

---

### Task F.2: The Notes read moves to `lib/mcp/reads/notes.ts`, with a single-Note read

**Files:**
- Create: `lib/mcp/reads/notes.ts`
- Create: `lib/mcp/reads/notes.test.ts`
- Modify: `lib/mcp/tools/reads.ts:70-101` (delete `loadNotes`), `:275` (call `loadNotesForMcp`), and imports
- Modify: `eslint.config.mjs:81-100` (add `"lib/mcp/reads/notes.ts"` to `SURPRISE_VISIBILITY_READERS`, after `"lib/mcp/reads/attachments.ts"`)
- Test (must pass unchanged): `lib/mcp/tools/reads.test.ts` (get_notes cases ~:190-200, ~:349)

**Interfaces:**
- Consumes: `requireTripAccess`, `requireRowAccess` (`lib/guards.ts`); `loadSurpriseVisibility`, `SurpriseVisibility`; `travellerName`, `TRAVELLER_SELECT`.
- Produces:
  ```ts
  export interface McpNote { id: string; targetType: string; targetId: string; body: string; author: string; createdAt: string }
  export function readMcpNotes(tripId: string, v: SurpriseVisibility, where?: { id?: string; targetType?: string; targetId?: string }): Promise<McpNote[]>
  export function loadNotesForMcp(tripId: string): Promise<{ notes: McpNote[] }>
  export function loadNoteForMcp(noteId: string): Promise<McpNote>
  ```

- [ ] **Step 1: Write the failing test**

`lib/mcp/reads/notes.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireTripAccess, requireRowAccess, noteFindMany, loadSurpriseVisibility } = vi.hoisted(() => ({
  requireTripAccess: vi.fn(),
  requireRowAccess: vi.fn(),
  noteFindMany: vi.fn(),
  loadSurpriseVisibility: vi.fn(),
}));
vi.mock("@/lib/guards", () => ({ requireTripAccess, requireRowAccess }));
vi.mock("@/lib/db", () => ({ db: { note: { findMany: noteFindMany } } }));
vi.mock("@/lib/surprise-visibility", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/surprise-visibility")>();
  return { ...actual, loadSurpriseVisibility };
});

import { NO_SURPRISES } from "@/lib/surprise-visibility";
import { MARKER_WHERE, hiddenVisibility } from "@/test/helpers/surprise-visibility";
import { loadNoteForMcp, loadNotesForMcp } from "./notes";

const row = {
  id: "n1", targetType: "ITEM", targetId: "i1", body: "Book ahead",
  createdAt: new Date("2026-10-16T09:00:00Z"),
  author: { id: "u1", name: "Cam", displayName: null, email: null, image: null },
};
const nf = () => Object.assign(new Error("nf"), { digest: "NEXT_HTTP_ERROR_FALLBACK;404" });

describe("Notes reads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireTripAccess.mockResolvedValue({ user: { id: "u1" }, membership: {} });
    requireRowAccess.mockResolvedValue({ row: { id: "n1", tripId: "trip-1" }, user: { id: "u1" }, surpriseOf: null });
    loadSurpriseVisibility.mockResolvedValue(NO_SURPRISES);
    noteFindMany.mockResolvedValue([row]);
  });

  it("loadNotesForMcp reads the trip's Notes in get_notes' shape", async () => {
    loadSurpriseVisibility.mockResolvedValue(hiddenVisibility());
    const out = await loadNotesForMcp("trip-1");
    expect(noteFindMany.mock.calls[0][0].where).toEqual({ tripId: "trip-1", ...MARKER_WHERE.note });
    expect(out).toEqual({
      notes: [{ id: "n1", targetType: "ITEM", targetId: "i1", body: "Book ahead", author: "Cam", createdAt: "2026-10-16T09:00:00.000Z" }],
    });
  });

  it("loadNoteForMcp reads one Note through the Note guard, Surprise fragment included", async () => {
    const note = await loadNoteForMcp("n1");
    expect(requireRowAccess).toHaveBeenCalledWith("note", "n1");
    expect(noteFindMany.mock.calls[0][0].where).toMatchObject({ tripId: "trip-1", id: "n1" });
    expect(note).toMatchObject({ id: "n1", body: "Book ahead", targetType: "ITEM", targetId: "i1" });
  });

  it("loadNoteForMcp on a Note the guard refuses (missing, not yours, inside a hidden Surprise) is notFound", async () => {
    requireRowAccess.mockRejectedValue(nf());
    await expect(loadNoteForMcp("n1")).rejects.toMatchObject({ digest: expect.stringContaining("404") });
    expect(noteFindMany).not.toHaveBeenCalled();
  });

  it("loadNoteForMcp is notFound when the visibility fragment filters the Note out", async () => {
    noteFindMany.mockResolvedValue([]);
    await expect(loadNoteForMcp("n1")).rejects.toMatchObject({ digest: expect.stringContaining("404") });
  });
});
```

(If `hiddenVisibility` / `MARKER_WHERE` in `test/helpers/surprise-visibility.ts` need arguments, call them the way `lib/mcp/tools/reads.test.ts:196` does.)

- [ ] **Step 2: Run it, expect FAIL.** `npx vitest run lib/mcp/reads/notes.test.ts` fails with `Failed to resolve import "./notes"`.

- [ ] **Step 3: Implement**

`lib/mcp/reads/notes.ts`:

```ts
/**
 * Notes as the Claude connection reads them (get_notes; get_item's
 * `notesOnItem`; add_note's read-back, spec 2026-10-16 F2/F6). A Note is a
 * comment a Traveller left on a Stop, thing to do, Transport or Accommodation
 * (CONTEXT.md Note): said, never edited. Surprise (ADR 0051): Notes inside a
 * Surprise hidden from the acting Traveller stay in the database.
 */
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireRowAccess, requireTripAccess } from "@/lib/guards";
import { loadSurpriseVisibility, type SurpriseVisibility } from "@/lib/surprise-visibility";
import { travellerName, TRAVELLER_SELECT } from "@/lib/traveller";

export interface McpNote {
  id: string;
  targetType: string;
  targetId: string;
  body: string;
  author: string;
  createdAt: string;
}

/** Notes on the Trip, oldest first, filtered by `where`. Callers have checked access. */
export async function readMcpNotes(
  tripId: string,
  v: SurpriseVisibility,
  where: { id?: string; targetType?: string; targetId?: string } = {},
): Promise<McpNote[]> {
  const rows = await db.note.findMany({
    where: { tripId, ...where, ...v.where.note },
    orderBy: { createdAt: "asc" },
    select: { id: true, targetType: true, targetId: true, body: true, createdAt: true, author: { select: TRAVELLER_SELECT } },
  });
  return rows.map((n) => ({
    id: n.id, targetType: n.targetType, targetId: n.targetId, body: n.body,
    author: travellerName(n.author), createdAt: n.createdAt.toISOString(),
  }));
}

export async function loadNotesForMcp(tripId: string): Promise<{ notes: McpNote[] }> {
  const { user } = await requireTripAccess(tripId);
  const v = await loadSurpriseVisibility(tripId, user.id);
  return { notes: await readMcpNotes(tripId, v) };
}

/** One Note in get_notes' shape. The Note guard refuses a Note inside a Surprise hidden from the caller. */
export async function loadNoteForMcp(noteId: string): Promise<McpNote> {
  const { row, user } = await requireRowAccess("note", noteId);
  const v = await loadSurpriseVisibility(row.tripId, user.id);
  const [note] = await readMcpNotes(row.tripId, v, { id: noteId });
  if (!note) notFound();
  return note;
}
```

In `lib/mcp/tools/reads.ts`, delete `loadNotes` (lines 70–101) and import `loadNotesForMcp` from `"../reads/notes"`. The handler at :275 becomes `({ tripId }) => runTool("get_notes", () => loadNotesForMcp(tripId))`. Drop any import that becomes unused. In `eslint.config.mjs`, add `"lib/mcp/reads/notes.ts",` to `SURPRISE_VISIBILITY_READERS`.

- [ ] **Step 4: Run it, expect PASS.** `npx vitest run lib/mcp/reads/notes.test.ts lib/mcp/tools/reads.test.ts eslint.config.test.ts`
- [ ] **Step 5: Task-done check.** `npx vitest related --run lib/mcp/reads/notes.ts lib/mcp/tools/reads.ts eslint.config.mjs` + `npx tsc --noEmit` + `npx eslint lib/mcp/reads/notes.ts lib/mcp/reads/notes.test.ts lib/mcp/tools/reads.ts eslint.config.mjs`
- [ ] **Step 6: Commit.** Message: `refactor(mcp): Notes read in reads/notes.ts, plus a one-Note read`

---

### Task F.3: Costs and files read for one owner

**Files:**
- Modify: `lib/mcp/reads/costs.ts:21-148`. Export `McpCost`, add `readMcpCosts`, have `loadCostsForMcp` call it, and add `loadCostForMcp`.
- Modify: `lib/mcp/reads/attachments.ts:61-80`. `loadTripAttachments` gains `opts`.
- Test: `lib/mcp/reads/costs.test.ts`, `lib/mcp/reads/attachments.test.ts` (extend; the existing cases pass unchanged)
- Test: `test/integration/mcp-narrow-reads.test.ts` is created in F.8 and covers both queries against Postgres.

**Interfaces:**
- Consumes: `requireRealPlanRow` (`../real-plan`).
- Produces:
  ```ts
  export interface McpCost { … } // unchanged fields, now exported
  export function readMcpCosts(tripId: string, v: SurpriseVisibility, where?: { id?: string; ownerType?: string; ownerId?: string }): Promise<McpCostsResult> // unsorted, unfiltered
  export function loadCostForMcp(costId: string): Promise<McpCost>
  export function loadTripAttachments(tripId: string, visibility?: SurpriseVisibility, opts?: { targetIds?: string[]; tripFiles?: boolean }): Promise<TripAttachmentsResult>
  ```

- [ ] **Step 1: Write the failing tests**

Append to `lib/mcp/reads/costs.test.ts`. Add `requireRealPlanRow` to its hoisted block and `vi.mock("../real-plan", () => ({ requireRealPlanRow }))`. Reuse the file's existing cost row fixture (named `costRow` here; use whatever the file calls it):

```ts
describe("readMcpCosts / loadCostForMcp", () => {
  it("readMcpCosts narrows the query to one owner and keeps the Surprise fragment", async () => {
    await readMcpCosts(TRIP_ID, NO_SURPRISES, { ownerType: "ITEM", ownerId: "i1" });
    expect(costFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tripId: TRIP_ID, forkId: null, ownerType: "ITEM", ownerId: "i1" }) }),
    );
  });

  it("loadCostForMcp checks the Cost is a real-plan row first, then reads it in list_costs' shape", async () => {
    requireRealPlanRow.mockResolvedValue({ tripId: TRIP_ID });
    costFindMany.mockResolvedValue([costRow({ id: "c1" })]);
    const cost = await loadCostForMcp("c1");
    expect(requireRealPlanRow).toHaveBeenCalledWith("cost", "c1");
    expect(costFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: "c1" }) }));
    expect(cost.id).toBe("c1");
    expect(cost.amount).toEqual(expect.objectContaining({ minor: expect.any(Number) }));
  });

  it("loadCostForMcp on a Fork's (or hidden) Cost is notFound before any read", async () => {
    requireRealPlanRow.mockRejectedValue(Object.assign(new Error("nf"), { digest: "NEXT_HTTP_ERROR_FALLBACK;404" }));
    await expect(loadCostForMcp("c1")).rejects.toMatchObject({ digest: expect.stringContaining("404") });
    expect(costFindMany).not.toHaveBeenCalled();
  });
});
```

Append to `lib/mcp/reads/attachments.test.ts`:

```ts
it("narrows to the given owners' files when targetIds is passed", async () => {
  attachmentFindMany.mockResolvedValue([]);
  await loadTripAttachments(TRIP_ID, NO_SURPRISES, { targetIds: ["i1", "a1"] });
  expect(attachmentFindMany).toHaveBeenCalledWith(
    expect.objectContaining({ where: { tripId: TRIP_ID, targetId: { in: ["i1", "a1"] } } }),
  );
});

it("narrows to the Trip's own files when tripFiles is passed", async () => {
  attachmentFindMany.mockResolvedValue([]);
  await loadTripAttachments(TRIP_ID, NO_SURPRISES, { tripFiles: true });
  expect(attachmentFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { tripId: TRIP_ID, targetType: "TRIP" } }));
});
```

- [ ] **Step 2: Run, expect FAIL.** `npx vitest run lib/mcp/reads/costs.test.ts lib/mcp/reads/attachments.test.ts` fails: `readMcpCosts` / `loadCostForMcp` are not exported, and the `where` lacks `targetId`.

- [ ] **Step 3: Implement**

`costs.ts`: `export interface McpCost`. Split `loadCostsForMcp`:

```ts
/** Every real-plan Cost matching `where`, in list_costs' shape, unsorted. Callers have checked access. */
export async function readMcpCosts(
  tripId: string,
  v: SurpriseVisibility,
  where: { id?: string; ownerType?: string; ownerId?: string } = {},
): Promise<McpCostsResult> {
  const [trip, rawCosts, stops, items] = await Promise.all([
    db.trip.findUnique({ where: { id: tripId }, select: { homeCurrency: true } }),
    db.cost.findMany({ where: { tripId, ...REAL_PLAN, ...where, ...v.where.cost }, orderBy: { createdAt: "asc" }, select: { /* unchanged */ } }),
    db.stop.findMany({ where: { tripId, ...REAL_PLAN }, select: { timezone: true, arriveDate: true, departDate: true } }),
    db.item.findMany({ where: { tripId, ...REAL_PLAN }, select: { id: true, category: true } }),
  ]);
  // …lines 90–137 unchanged, building `mapped`…
  return { homeCurrency, today, costs: mapped };
}

export async function loadCostsForMcp(tripId: string, opts: { unpaidOnly?: boolean; dueWithinDays?: number }): Promise<McpCostsResult> {
  const { user } = await requireTripAccess(tripId);
  // Surprise (ADR 0051): lines inside a Surprise hidden from the acting
  // Traveller stay in the database. Their money still counts in get_budget.
  const v = await loadSurpriseVisibility(tripId, user.id);
  const { homeCurrency, today, costs } = await readMcpCosts(tripId, v);
  const filtered = costs
    .filter((c) => !opts.unpaidOnly || c.paid === null)
    .filter((c) => opts.dueWithinDays === undefined || (c.paid === null && c.dueDate !== null && c.daysUntilDue !== null && c.daysUntilDue <= opts.dueWithinDays));
  return { homeCurrency, today, costs: filtered.sort(compareCosts) };
}

/** One Cost in list_costs' shape (a Cost write's read-back, F6). A Fork's Cost, or one the caller is surprised by, is notFound. */
export async function loadCostForMcp(costId: string): Promise<McpCost> {
  const { tripId } = await requireRealPlanRow("cost", costId);
  const { user } = await requireTripAccess(tripId);
  const v = await loadSurpriseVisibility(tripId, user.id);
  const { costs: [cost] } = await readMcpCosts(tripId, v, { id: costId });
  if (!cost) notFound();
  return cost;
}
```

Imports to add: `notFound` from `next/navigation`, `type SurpriseVisibility`, and `requireRealPlanRow` from `"../real-plan"`.

`attachments.ts`, `loadTripAttachments`:

```ts
export async function loadTripAttachments(
  tripId: string,
  visibility: SurpriseVisibility = NO_SURPRISES,
  opts: { targetIds?: string[]; tripFiles?: boolean } = {},
): Promise<TripAttachmentsResult> {
  const narrow = opts.tripFiles ? { targetType: "TRIP" } : opts.targetIds ? { targetId: { in: opts.targetIds } } : {};
  const rows = await db.attachment.findMany({
    where: { tripId, ...narrow, ...visibility.where.attachment },
    // …unchanged
```

- [ ] **Step 4: Run, expect PASS** (same command; every existing case passes unedited).
- [ ] **Step 5: Task-done check.** `npx vitest related --run lib/mcp/reads/costs.ts lib/mcp/reads/attachments.ts` + `npx tsc --noEmit` + `npx eslint lib/mcp/reads/costs.ts lib/mcp/reads/costs.test.ts lib/mcp/reads/attachments.ts lib/mcp/reads/attachments.test.ts`
- [ ] **Step 6: Commit.** Message: `feat(mcp): read one owner's Costs and files, and one Cost`

---

### Task F.4: Narrow readers for an Item, a Transport leg, an Accommodation, a Chapter and the Trip

**Files:**
- Create: `lib/mcp/reads/entities.ts`
- Create: `lib/mcp/reads/entities.test.ts`
- Modify: `eslint.config.mjs:81-100` (add `"lib/mcp/reads/entities.ts"` to `SURPRISE_VISIBILITY_READERS`)

**Interfaces:**
- Consumes: F.1 shapes and selects; F.2 `readMcpNotes`, `McpNote`; F.3 `readMcpCosts`, `McpCost`, `loadTripAttachments(…, opts)`; `requireRealPlanRow` (`../real-plan`); `ownerKey` (`./owners`).
- Produces:
  ```ts
  export interface McpItemDetail extends McpItem { costs: McpCost[]; notesOnItem: McpNote[] }
  export interface McpTransportDetail extends McpTransport { costs: McpCost[] }
  export interface McpAccommodationDetail extends McpAccommodation { stopId: string; costs: McpCost[] }
  export function loadItemForMcp(itemId: string): Promise<McpItemDetail>
  export function loadTransportForMcp(transportId: string): Promise<McpTransportDetail>
  export function loadAccommodationForMcp(accommodationId: string): Promise<McpAccommodationDetail>
  export function loadChapterForMcp(chapterId: string): Promise<McpChapter>
  export function loadTripSummaryForMcp(tripId: string): Promise<McpTripSummary>
  ```

- [ ] **Step 1: Write the failing test**

`lib/mcp/reads/entities.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  requireTripAccess: vi.fn(),
  requireRealPlanRow: vi.fn(),
  loadSurpriseVisibility: vi.fn(),
  loadTripAttachments: vi.fn(),
  readMcpCosts: vi.fn(),
  readMcpNotes: vi.fn(),
  itemFindFirst: vi.fn(),
  transportFindUnique: vi.fn(),
  tripFindUnique: vi.fn(),
  stopFindMany: vi.fn(),
  accommodationFindFirst: vi.fn(),
  chapterFindUnique: vi.fn(),
}));
vi.mock("@/lib/guards", () => ({ requireTripAccess: m.requireTripAccess }));
vi.mock("../real-plan", () => ({ requireRealPlanRow: m.requireRealPlanRow }));
vi.mock("./attachments", () => ({ loadTripAttachments: m.loadTripAttachments }));
vi.mock("./costs", () => ({ readMcpCosts: m.readMcpCosts }));
vi.mock("./notes", () => ({ readMcpNotes: m.readMcpNotes }));
vi.mock("@/lib/db", () => ({
  db: {
    item: { findFirst: m.itemFindFirst },
    transport: { findUnique: m.transportFindUnique },
    trip: { findUnique: m.tripFindUnique },
    stop: { findMany: m.stopFindMany },
    accommodation: { findFirst: m.accommodationFindFirst },
    chapter: { findUnique: m.chapterFindUnique },
  },
}));
vi.mock("@/lib/surprise-visibility", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/surprise-visibility")>();
  return { ...actual, loadSurpriseVisibility: m.loadSurpriseVisibility };
});

import { NO_SURPRISES } from "@/lib/surprise-visibility";
import { loadAccommodationForMcp, loadChapterForMcp, loadItemForMcp, loadTransportForMcp, loadTripSummaryForMcp } from "./entities";

const nf = () => Object.assign(new Error("nf"), { digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
const file = { id: "f1", title: "Ticket.pdf" };
const cost = { id: "c1" };
const note = { id: "n1", body: "Book ahead" };

beforeEach(() => {
  vi.clearAllMocks();
  m.requireRealPlanRow.mockResolvedValue({ tripId: "trip-1" });
  m.requireTripAccess.mockResolvedValue({ user: { id: "u1" }, membership: {} });
  m.loadSurpriseVisibility.mockResolvedValue(NO_SURPRISES);
  m.readMcpCosts.mockResolvedValue({ homeCurrency: "AUD", today: "2026-10-16", costs: [cost] });
  m.readMcpNotes.mockResolvedValue([note]);
});

describe("loadItemForMcp", () => {
  it("returns the Item's get_trip_plan slice with its date and Stop, Costs, files and the Notes on it", async () => {
    m.itemFindFirst.mockResolvedValue({
      id: "i1", title: "Castle", category: "SIGHTSEEING", date: "2027-06-02", startTime: "10:00", endTime: null,
      address: "Sintra", link: null, booking: "#448", notes: "Be there 15 min early", stopId: "s1",
    });
    m.loadTripAttachments.mockResolvedValue({ attachments: [], byOwner: new Map([["ITEM:i1", [file]]]) });
    const out = await loadItemForMcp("i1");
    expect(m.requireRealPlanRow).toHaveBeenCalledWith("item", "i1");
    expect(m.loadTripAttachments).toHaveBeenCalledWith("trip-1", NO_SURPRISES, { targetIds: ["i1"] });
    expect(m.readMcpCosts).toHaveBeenCalledWith("trip-1", NO_SURPRISES, { ownerType: "ITEM", ownerId: "i1" });
    expect(m.readMcpNotes).toHaveBeenCalledWith("trip-1", NO_SURPRISES, { targetType: "ITEM", targetId: "i1" });
    expect(out).toEqual({
      id: "i1", title: "Castle", category: "SIGHTSEEING", startTime: "10:00", endTime: null, address: "Sintra",
      link: null, booking: "#448", notes: "Be there 15 min early", files: [file], surprise: null,
      date: "2027-06-02", stopId: "s1", costs: [cost], notesOnItem: [note],
    });
  });

  it("a Fork's Item, a hidden Surprise Item or a made-up id is notFound before any read", async () => {
    m.requireRealPlanRow.mockRejectedValue(nf());
    await expect(loadItemForMcp("i1")).rejects.toMatchObject({ digest: expect.stringContaining("404") });
    expect(m.itemFindFirst).not.toHaveBeenCalled();
  });
});

describe("loadTransportForMcp", () => {
  it("returns the leg's get_trip_plan slice, each end in its own zone, with its Costs", async () => {
    m.tripFindUnique.mockResolvedValue({ homeTimezone: "Australia/Sydney" });
    m.transportFindUnique.mockResolvedValue({
      id: "t1", mode: "FLIGHT", fromStopId: null, toStopId: "s1", depIsHome: true, arrIsHome: false,
      depPlace: null, arrPlace: null, depAt: new Date("2027-05-31T22:00:00Z"), arrAt: new Date("2027-06-01T10:00:00Z"),
      reference: "QF1", notes: null,
    });
    m.stopFindMany.mockResolvedValue([{ id: "s1", name: "Porto", timezone: "Europe/Lisbon" }]);
    m.loadTripAttachments.mockResolvedValue({ attachments: [], byOwner: new Map() });
    const out = await loadTransportForMcp("t1");
    expect(m.requireRealPlanRow).toHaveBeenCalledWith("transport", "t1");
    expect(out).toMatchObject({
      id: "t1", from: { home: true }, to: { stopId: "s1", name: "Porto" },
      departs: { localTime: "08:00" }, arrives: { localTime: "11:00" }, reference: "QF1", files: [], costs: [cost],
    });
  });
});

describe("loadAccommodationForMcp", () => {
  it("returns the stay's get_trip_plan slice plus its Stop and Costs, Surprise fragment applied", async () => {
    m.accommodationFindFirst.mockResolvedValue({
      id: "a1", stopId: "s1", name: "Casa", address: null, checkIn: "2027-06-01", checkOut: "2027-06-04", confirmation: "X1", notes: null,
    });
    m.loadTripAttachments.mockResolvedValue({ attachments: [], byOwner: new Map() });
    const out = await loadAccommodationForMcp("a1");
    expect(m.requireRealPlanRow).toHaveBeenCalledWith("accommodation", "a1");
    expect(out).toEqual({
      id: "a1", name: "Casa", address: null, checkIn: "2027-06-01", checkOut: "2027-06-04", confirmation: "X1", notes: null,
      files: [], stopId: "s1", costs: [cost],
    });
  });

  it("is notFound when the visibility fragment filters it out", async () => {
    m.accommodationFindFirst.mockResolvedValue(null);
    m.loadTripAttachments.mockResolvedValue({ attachments: [], byOwner: new Map() });
    await expect(loadAccommodationForMcp("a1")).rejects.toMatchObject({ digest: expect.stringContaining("404") });
  });
});

describe("loadChapterForMcp / loadTripSummaryForMcp", () => {
  it("reads one real-plan Chapter in get_trip_plan's chapters shape", async () => {
    m.chapterFindUnique.mockResolvedValue({ id: "ch1", name: "Portugal", startDate: null, endDate: null });
    expect(await loadChapterForMcp("ch1")).toEqual({ id: "ch1", name: "Portugal", startDate: null, endDate: null });
    expect(m.requireRealPlanRow).toHaveBeenCalledWith("chapter", "ch1");
  });

  it("reads the Trip as get_trip_plan's trip, with the Trip's own files", async () => {
    m.tripFindUnique.mockResolvedValue({
      name: "Europe", startDate: "2027-06-01", endDate: "2027-06-07", hardEndDate: null, homeCurrency: "AUD",
      homeName: "Brisbane", homeTimezone: "Australia/Brisbane", roundTrip: true,
    });
    m.loadTripAttachments.mockResolvedValue({ attachments: [], byOwner: new Map([["TRIP:trip-1", [file]]]) });
    const out = await loadTripSummaryForMcp("trip-1");
    expect(m.requireTripAccess).toHaveBeenCalledWith("trip-1");
    expect(m.loadTripAttachments).toHaveBeenCalledWith("trip-1", NO_SURPRISES, { tripFiles: true });
    expect(out).toEqual({
      id: "trip-1", name: "Europe", startDate: "2027-06-01", endDate: "2027-06-07", hardEndDate: null, homeCurrency: "AUD",
      homeBase: "Brisbane", homeTimezone: "Australia/Brisbane", roundTrip: true, files: [file],
    });
  });
});
```

(`ownerKey(kind, id)` in `./owners` decides the map keys. If it doesn't render as `"ITEM:i1"`, build the keys with `ownerKey` in the test instead of literals.)

- [ ] **Step 2: Run, expect FAIL.** `npx vitest run lib/mcp/reads/entities.test.ts` fails with `Failed to resolve import "./entities"`.

- [ ] **Step 3: Implement**

`lib/mcp/reads/entities.ts`:

```ts
/**
 * The Claude connection's narrow reads (spec 2026-10-16 F7): one Stop, thing
 * to do, Transport leg, Accommodation, Chapter or the Trip itself, each
 * exactly that entity's slice of get_trip_plan (built from the same
 * ./plan-shapes.ts functions) plus the extras F7 names. Every MCP write
 * reads its row back through these (F6).
 *
 * Real plan only: every id goes through `requireRealPlanRow`, so a Fork's
 * row, a made-up id and a non-member's id all read as `notFound()`, and so
 * does a row inside a Surprise hidden from the acting Traveller (CONTEXT.md
 * Surprise). The queries also carry the Surprise fragments, so nothing
 * hidden leaves the database.
 */
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireTripAccess } from "@/lib/guards";
import { REAL_PLAN } from "@/lib/plan-scope";
import { loadSurpriseVisibility, type SurpriseVisibility } from "@/lib/surprise-visibility";
import { requireRealPlanRow } from "../real-plan";
import { loadTripAttachments, type TripAttachmentsResult } from "./attachments";
import { readMcpCosts, type McpCost } from "./costs";
import { readMcpNotes, type McpNote } from "./notes";
import { ownerKey } from "./owners";
import {
  MCP_ACCOMMODATION_SELECT, MCP_CHAPTER_SELECT, MCP_DATED_ITEM_SELECT, MCP_TRANSPORT_SELECT, MCP_TRIP_SELECT,
  toMcpAccommodation, toMcpItem, toMcpTransport, toMcpTrip,
  type FilesFor, type McpAccommodation, type McpChapter, type McpItem, type McpTransport, type McpTripSummary,
} from "./plan-shapes";

export interface McpItemDetail extends McpItem {
  costs: McpCost[];
  /** The Notes the Travellers left on it (CONTEXT.md Note) — not `notes`, which is the Item's own description. */
  notesOnItem: McpNote[];
}
export interface McpTransportDetail extends McpTransport { costs: McpCost[] }
export interface McpAccommodationDetail extends McpAccommodation { stopId: string; costs: McpCost[] }

async function visibilityFor(tripId: string): Promise<SurpriseVisibility> {
  const { user } = await requireTripAccess(tripId);
  return loadSurpriseVisibility(tripId, user.id);
}

const filesFrom = ({ byOwner }: TripAttachmentsResult): FilesFor => (kind, id) => byOwner.get(ownerKey(kind, id)) ?? [];

export async function loadItemForMcp(itemId: string): Promise<McpItemDetail> {
  const { tripId } = await requireRealPlanRow("item", itemId);
  const v = await visibilityFor(tripId);
  const row = await db.item.findFirst({ where: { id: itemId, tripId, ...REAL_PLAN, ...v.where.item }, select: MCP_DATED_ITEM_SELECT });
  if (!row) notFound();
  const [files, { costs }, notesOnItem] = await Promise.all([
    loadTripAttachments(tripId, v, { targetIds: [itemId] }),
    readMcpCosts(tripId, v, { ownerType: "ITEM", ownerId: itemId }),
    readMcpNotes(tripId, v, { targetType: "ITEM", targetId: itemId }),
  ]);
  return { ...toMcpItem({ ...row, surprise: v.views.items.get(itemId) ?? null }, filesFrom(files)), costs, notesOnItem };
}

export async function loadTransportForMcp(transportId: string): Promise<McpTransportDetail> {
  const { tripId } = await requireRealPlanRow("transport", transportId);
  const v = await visibilityFor(tripId);
  const [trip, t] = await Promise.all([
    db.trip.findUnique({ where: { id: tripId }, select: { homeTimezone: true } }),
    db.transport.findUnique({ where: { id: transportId }, select: MCP_TRANSPORT_SELECT }),
  ]);
  if (!t) notFound();
  const endIds = [t.fromStopId, t.toStopId].filter((id): id is string => id !== null);
  const [ends, files, { costs }] = await Promise.all([
    // A hidden Surprise Stop keeps its name (its shell), so no fragment here — same as get_trip_plan's endpoints.
    db.stop.findMany({ where: { id: { in: endIds }, tripId, ...REAL_PLAN }, select: { id: true, name: true, timezone: true } }),
    loadTripAttachments(tripId, v, { targetIds: [transportId] }),
    readMcpCosts(tripId, v, { ownerType: "TRANSPORT", ownerId: transportId }),
  ]);
  return {
    ...toMcpTransport(t, {
      stopNameById: new Map(ends.map((s) => [s.id, s.name])),
      tzById: new Map(ends.map((s) => [s.id, s.timezone])),
      homeTimezone: trip?.homeTimezone ?? null,
      filesFor: filesFrom(files),
    }),
    costs,
  };
}

export async function loadAccommodationForMcp(accommodationId: string): Promise<McpAccommodationDetail> {
  const { tripId } = await requireRealPlanRow("accommodation", accommodationId);
  const v = await visibilityFor(tripId);
  const row = await db.accommodation.findFirst({
    where: { id: accommodationId, tripId, ...REAL_PLAN, ...v.where.accommodation },
    select: { ...MCP_ACCOMMODATION_SELECT, stopId: true },
  });
  if (!row) notFound();
  const { stopId, ...stay } = row;
  const [files, { costs }] = await Promise.all([
    loadTripAttachments(tripId, v, { targetIds: [accommodationId] }),
    readMcpCosts(tripId, v, { ownerType: "ACCOMMODATION", ownerId: accommodationId }),
  ]);
  return { ...toMcpAccommodation(stay, filesFrom(files)), stopId, costs };
}

export async function loadChapterForMcp(chapterId: string): Promise<McpChapter> {
  await requireRealPlanRow("chapter", chapterId);
  const chapter = await db.chapter.findUnique({ where: { id: chapterId }, select: MCP_CHAPTER_SELECT });
  if (!chapter) notFound();
  return chapter;
}

export async function loadTripSummaryForMcp(tripId: string): Promise<McpTripSummary> {
  const v = await visibilityFor(tripId);
  const [trip, { byOwner }] = await Promise.all([
    db.trip.findUnique({ where: { id: tripId }, select: MCP_TRIP_SELECT }),
    loadTripAttachments(tripId, v, { tripFiles: true }),
  ]);
  return toMcpTrip(tripId, trip, byOwner.get(ownerKey("TRIP", tripId)) ?? []);
}
```

`eslint.config.mjs`: add `"lib/mcp/reads/entities.ts",` to `SURPRISE_VISIBILITY_READERS`.

- [ ] **Step 4: Run, expect PASS.** `npx vitest run lib/mcp/reads/entities.test.ts eslint.config.test.ts`
- [ ] **Step 5: Task-done check.** `npx vitest related --run lib/mcp/reads/entities.ts eslint.config.mjs` + `npx tsc --noEmit` + `npx eslint lib/mcp/reads/entities.ts lib/mcp/reads/entities.test.ts eslint.config.mjs`
- [ ] **Step 6: Commit.** Message: `feat(mcp): narrow readers for an Item, Transport, Accommodation, Chapter and Trip`

---

### Task F.5: The Stop reader (`readMcpStops`, `loadStopForMcp`)

**Files:**
- Modify: `lib/mcp/reads/entities.ts` (add the two functions)
- Modify: `lib/mcp/reads/entities.test.ts` (new `describe`)

**Interfaces:**
- Consumes: F.1 `buildMcpStops`, `withPlaceholders`, `mcpStopSelect`, `MCP_THING_TO_DO_SELECT`, `MCP_DATED_ITEM_SELECT`; `orderPlanStops` (`lib/plan-order.ts`); `loadDayTitles` (`lib/day-titles-loader.ts`); `maskSurpriseStops`; `THINGS_TO_DO_WHERE`.
- Produces:
  ```ts
  /** McpStops as get_trip_plan shows them, a hidden Surprise Stop as its shell. No Surprise refusal — the caller has checked access. */
  export function readMcpStops(tripId: string, stopIds: readonly string[]): Promise<McpStop[]>
  /** get_stop: one real-plan Stop; a Fork's, a made-up or a hidden-Surprise Stop is notFound. */
  export function loadStopForMcp(stopId: string): Promise<McpStop>
  ```

- [ ] **Step 1: Write the failing test**

Add `itemFindMany`, `stopFindManyStops` (the same `m.stopFindMany` mock, branched) and `loadDayTitles` to the hoisted block. Add `item.findMany` to the db mock and `vi.mock("@/lib/day-titles-loader", () => ({ loadDayTitles: m.loadDayTitles }))`. Then:

```ts
describe("readMcpStops / loadStopForMcp", () => {
  const porto = {
    id: "s1", name: "Porto", countryCode: "pt", timezone: "Europe/Lisbon", arriveDate: "2027-06-01", departDate: "2027-06-04",
    nights: null, pinned: false, chapterId: null, notes: "Port lodges", sortOrder: 0,
    accommodations: [{ id: "a1", name: "Casa", address: null, checkIn: "2027-06-01", checkOut: "2027-06-04", confirmation: null, notes: null }],
  };
  beforeEach(() => {
    // stop.findMany: the Stops asked for (selects accommodations) vs the neighbours that title their days.
    m.stopFindMany.mockImplementation(async (args: { select: Record<string, unknown> }) =>
      "accommodations" in args.select ? [porto] : [{ id: "s1", arriveDate: "2027-06-01", departDate: "2027-06-04" }, { id: "s2", arriveDate: "2027-06-04", departDate: "2027-06-06" }],
    );
    // item.findMany: things to do (date null) vs the dated Items in the Stops' ranges.
    m.itemFindMany.mockImplementation(async (args: { where: { date?: unknown } }) =>
      args.where.date === null
        ? [{ id: "t1", title: "Port tasting", category: "FOOD", startTime: null, endTime: null, address: null, link: null, booking: null, notes: null, stopId: "s1" }]
        : [{ id: "c1", title: "Train", category: "GETTING_AROUND", date: "2027-06-04", startTime: "09:00", endTime: null, address: null, link: null, booking: null, notes: null, stopId: null }],
    );
    m.loadDayTitles.mockResolvedValue(new Map([["2027-06-04", { title: "Changeover", stopId: "s2" }]]));
    m.loadTripAttachments.mockResolvedValue({ attachments: [], byOwner: new Map() });
  });

  it("builds the Stop with its Accommodation, things to do and days, titles resolved across overlapping neighbours", async () => {
    const stop = await loadStopForMcp("s1");
    expect(m.requireRealPlanRow).toHaveBeenCalledWith("stop", "s1");
    expect(m.loadDayTitles).toHaveBeenCalledWith([
      { id: "s1", arriveDate: "2027-06-01", departDate: "2027-06-04" },
      { id: "s2", arriveDate: "2027-06-04", departDate: "2027-06-06" },
    ]);
    expect(stop).toMatchObject({
      id: "s1", rough: false, notes: "Port lodges",
      accommodations: [expect.objectContaining({ id: "a1", files: [] })],
      thingsToDo: [expect.objectContaining({ id: "t1" })],
    });
    expect(stop.days.map((d) => d.date)).toEqual(["2027-06-01", "2027-06-02", "2027-06-03", "2027-06-04"]);
    expect(stop.days[3]).toMatchObject({ dayTitle: "Changeover", items: [expect.objectContaining({ id: "c1" })] });
  });

  it("readMcpStops shows a hidden Surprise Stop as its shell — no days, notes blanked — without refusing", async () => {
    m.loadSurpriseVisibility.mockResolvedValue({
      ...NO_SURPRISES, isEmpty: false, hiddenStopIds: ["s1"],
      views: { stops: new Map([["s1", { plannerName: "Cam", forNames: ["Alex"], youAreSurprised: true }]]), items: new Map() },
    });
    const [shell] = await readMcpStops("trip-1", ["s1"]);
    expect(shell).toMatchObject({ id: "s1", arriveDate: "2027-06-01", notes: null, days: [], surprise: { youAreSurprised: true } });
    expect(m.requireRealPlanRow).not.toHaveBeenCalled();
  });

  it("readMcpStops of no ids reads nothing", async () => {
    expect(await readMcpStops("trip-1", [])).toEqual([]);
    expect(m.stopFindMany).not.toHaveBeenCalled();
  });

  it("loadStopForMcp on a refused id is notFound before any read", async () => {
    m.requireRealPlanRow.mockRejectedValue(nf());
    await expect(loadStopForMcp("s1")).rejects.toMatchObject({ digest: expect.stringContaining("404") });
    expect(m.stopFindMany).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run, expect FAIL.** `npx vitest run lib/mcp/reads/entities.test.ts` fails: `loadStopForMcp` / `readMcpStops` are not exported.

- [ ] **Step 3: Implement** (append to `entities.ts`; add the imports)

```ts
/**
 * Stops as get_trip_plan shows them (the same `buildMcpStops`), in plan
 * order. A hidden Surprise Stop comes back as its shell. Day titles are
 * resolved over every open Stop whose stay overlaps one asked for, so a
 * Changeover day's title is the one get_trip_plan shows (`titlesByDate`
 * only ever compares Stops that cover the date). No Surprise refusal here:
 * `loadStopForMcp` refuses, and a write's ripple list (F6) must name a
 * Surprise Stop it moved.
 */
export async function readMcpStops(tripId: string, stopIds: readonly string[]): Promise<McpStop[]> {
  if (stopIds.length === 0) return [];
  const v = await visibilityFor(tripId);
  const rows = await db.stop.findMany({
    where: { tripId, ...REAL_PLAN, id: { in: [...stopIds] } },
    orderBy: { sortOrder: "asc" },
    select: mcpStopSelect(v.where.accommodation),
  });
  const stops = maskSurpriseStops(orderPlanStops(rows), v, v.views.stops);
  const hidden = new Set(v.hiddenStopIds);
  const open = stops.filter((s) => !hidden.has(s.id) && s.arriveDate && s.departDate);

  const [thingsToDo, scheduled, neighbours] = await Promise.all([
    db.item.findMany({
      where: { tripId, ...REAL_PLAN, ...THINGS_TO_DO_WHERE, stopId: { in: stops.map((s) => s.id) }, ...v.where.item },
      orderBy: { sortOrder: "asc" },
      select: MCP_THING_TO_DO_SELECT,
    }),
    open.length === 0
      ? Promise.resolve([])
      : db.item.findMany({
          // Date coverage, not stopId (ADR 0049): a dated Item with no Stop lands on whichever Stop covers it.
          where: { tripId, ...REAL_PLAN, OR: open.map((s) => ({ date: { gte: s.arriveDate!, lte: s.departDate! } })), ...v.where.item },
          orderBy: [{ date: "asc" }, { sortOrder: "asc" }],
          select: MCP_DATED_ITEM_SELECT,
        }),
    open.length === 0
      ? Promise.resolve([])
      : db.stop.findMany({
          where: {
            tripId, ...REAL_PLAN, id: { notIn: v.hiddenStopIds },
            OR: open.map((s) => ({ arriveDate: { lte: s.departDate! }, departDate: { gte: s.arriveDate! } })),
          },
          orderBy: { sortOrder: "asc" },
          select: { id: true, arriveDate: true, departDate: true },
        }),
  ]);

  const datedItems = withPlaceholders(scheduled, v);
  const [dayTitles, files] = await Promise.all([
    loadDayTitles(neighbours),
    loadTripAttachments(tripId, v, {
      targetIds: [
        ...stops.map((s) => s.id),
        ...stops.flatMap((s) => s.accommodations.map((a) => a.id)),
        ...thingsToDo.map((i) => i.id),
        ...datedItems.map((i) => i.id),
      ],
    }),
  ]);

  return buildMcpStops({
    stops, thingsToDo, datedItems, dayTitles, hiddenStopIds: hidden,
    itemView: (id) => v.views.items.get(id) ?? null, filesFor: filesFrom(files),
  }).stops;
}

export async function loadStopForMcp(stopId: string): Promise<McpStop> {
  const { tripId } = await requireRealPlanRow("stop", stopId);
  const [stop] = await readMcpStops(tripId, [stopId]);
  if (!stop) notFound();
  return stop;
}
```

`loadDayTitles` takes `StopSpan[]` (`{ id, arriveDate, departDate }`), which the neighbour select already is. Spreading `THINGS_TO_DO_WHERE` first and then `stopId: { in }` replaces its `stopId: { not: null }`, and `in` already implies not null.

- [ ] **Step 4: Run, expect PASS.** `npx vitest run lib/mcp/reads/entities.test.ts`
- [ ] **Step 5: Task-done check.** `npx vitest related --run lib/mcp/reads/entities.ts` + `npx tsc --noEmit` + `npx eslint lib/mcp/reads/entities.ts lib/mcp/reads/entities.test.ts`
- [ ] **Step 6: Commit.** Message: `feat(mcp): read one Stop as get_trip_plan shows it`

---

### Task F.6: The day reader (`lib/mcp/reads/day.ts`), built on the Day view's rows

**Files:**
- Create: `lib/mcp/reads/day.ts`
- Create: `lib/mcp/reads/day.test.ts`

**Interfaces:**
- Consumes: `readDayRows` (`lib/day-reads.ts`); `buildDayModel`, `nightOfStay`, `DayRows` (`lib/day-view-model.ts`); `orderDayEntries`, `ItemEntry` (`lib/itinerary.ts`); `fail`, `ActionFailure` (`lib/action-result.ts`); F.1 `toMcpDayItem`, `toMcpSurprise`, `McpDayItem`, `McpSurprise`.
- Produces:
  ```ts
  export type McpDayEntry =
    | { kind: "item"; item: McpDayItem }
    | { kind: "departure"; transportId: string; mode: string; time: string | null; from: string | null; to: string | null; arrivesOn: string | null; arrivesAt: string | null }
    | { kind: "arrival"; transportId: string; mode: string; time: string | null; from: string | null; to: string | null }
    | { kind: "check-out" | "check-in"; accommodationId: string; name: string; time: string | null };
  export interface McpDay {
    date: string; dayNumber: number; totalDays: number; dayTitle: string | null;
    stop: { id: string; name: string; timezone: string | null; arriveDate: string; departDate: string; surprise: McpSurprise | null } | null;
    travelDay: boolean;
    tonight: { id: string; name: string; address: string | null; checkIn: string; checkOut: string; confirmation: string | null; notes: string | null; nightOf: { night: number; of: number } | null } | null;
    timeline: McpDayEntry[];
    anytime: McpDayItem[];
  }
  export function loadDayForMcp(tripId: string, date: string): Promise<McpDay | ActionFailure>
  ```

- [ ] **Step 1: Write the failing test**

`lib/mcp/reads/day.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireTripAccess, readDayRows } = vi.hoisted(() => ({ requireTripAccess: vi.fn(), readDayRows: vi.fn() }));
vi.mock("@/lib/guards", () => ({ requireTripAccess }));
vi.mock("@/lib/day-reads", () => ({ readDayRows }));

import type { DayRows } from "@/lib/day-view-model";
import { loadDayForMcp } from "./day";

const surprised = { plannerName: "Cam", forNames: ["Alex"], youAreSurprised: true } as never;
const itemRow = (o: Partial<DayRows["items"][number]>): DayRows["items"][number] => ({
  id: "i", title: "T", category: "SIGHTSEEING", date: "2027-06-02", startTime: null, endTime: null, sortOrder: 0, stopId: "s1",
  lat: null, lng: null, address: null, link: null, booking: null, notes: null, hiddenFromShares: false, photoAttachmentId: null, surprise: null, ...o,
});
const rows: DayRows = {
  trip: { name: "Porto", startDate: "2027-06-01", endDate: "2027-06-04", homeCurrency: "AUD", homeName: "Brisbane", homeTimezone: "Australia/Brisbane", chaptersEnabled: false, roundTrip: true },
  startDate: "2027-06-01",
  endDate: "2027-06-04",
  stops: [{ id: "s1", name: "Porto", country: "Portugal", countryCode: "pt", timezone: "Europe/Lisbon", arriveDate: "2027-06-01", departDate: "2027-06-04", sortOrder: 0, lat: null, lng: null, surprise: null }],
  items: [
    itemRow({ id: "tour", title: "Port lodge tour", startTime: "10:00" }),
    itemRow({ id: "market", title: "Bolhão market" }),
    itemRow({ id: "p1", title: "Surprise", category: "OTHER", startTime: "19:00", surprise: surprised }),
  ],
  transports: [],
  accommodations: [{ id: "a1", stopId: "s1", name: "Casa", address: null, checkIn: "2027-06-01", checkOut: "2027-06-04", checkInTime: "15:00", checkOutTime: null, confirmation: "X1", notes: null, lat: null, lng: null }],
  wishlist: [],
  attachments: [{ id: "f1", filename: "tour.pdf", title: null, mime: "application/pdf", size: 1, url: "u", uploadedById: "u1", createdAt: new Date(), targetId: "tour" }],
  chapters: [],
  dayTitles: [{ stopId: "s1", dayIndex: 1, title: "Ribeira day" }],
  thingsToDo: [],
};

describe("loadDayForMcp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireTripAccess.mockResolvedValue({ user: { id: "u1" }, membership: {} });
    readDayRows.mockResolvedValue({ rows, visibility: {}, alongside: null });
  });

  it("reads the day as the Day view assembles it, the viewer's Surprise masking included", async () => {
    const day = await loadDayForMcp("trip-1", "2027-06-02");
    expect(readDayRows).toHaveBeenCalledWith("trip-1", "u1", expect.any(Function));
    expect(day).toMatchObject({
      date: "2027-06-02", dayNumber: 2, totalDays: 4, dayTitle: "Ribeira day", travelDay: false,
      stop: { id: "s1", name: "Porto", timezone: "Europe/Lisbon", surprise: null },
      tonight: { id: "a1", name: "Casa", nightOf: { night: 2, of: 3 } },
    });
    if ("success" in day) throw new Error("expected a day");
    expect(day.timeline.map((e) => (e.kind === "item" ? e.item.id : e.kind))).toEqual(["tour", "p1"]);
    expect(day.timeline[0]).toMatchObject({ kind: "item", item: { title: "Port lodge tour", files: [{ id: "f1", title: "tour.pdf" }] } });
    expect(day.timeline[1]).toMatchObject({ kind: "item", item: { title: "Surprise", surprise: { youAreSurprised: true } } });
    expect(day.anytime.map((i) => i.id)).toEqual(["market"]);
  });

  it("lists the check-in in the timeline on its day, timed", async () => {
    const day = await loadDayForMcp("trip-1", "2027-06-01");
    if ("success" in day) throw new Error("expected a day");
    expect(day.timeline).toContainEqual({ kind: "check-in", accommodationId: "a1", name: "Casa", time: "15:00" });
  });

  it("a date outside the trip is a tool error naming the range, not a clamp", async () => {
    expect(await loadDayForMcp("trip-1", "2027-06-09")).toEqual({
      success: false,
      errors: { date: ["2027-06-09 is outside the trip, which runs 2027-06-01 to 2027-06-04."] },
    });
  });

  it("a dateless trip is a tool error", async () => {
    readDayRows.mockResolvedValue("dateless");
    expect(await loadDayForMcp("trip-1", "2027-06-02")).toMatchObject({ success: false, errors: { date: [expect.stringMatching(/no dates yet/)] } });
  });

  it("a non-member's trip is notFound before any read", async () => {
    requireTripAccess.mockRejectedValue(Object.assign(new Error("nf"), { digest: "NEXT_HTTP_ERROR_FALLBACK;404" }));
    await expect(loadDayForMcp("trip-1", "2027-06-02")).rejects.toMatchObject({ digest: expect.stringContaining("404") });
    expect(readDayRows).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run, expect FAIL.** `npx vitest run lib/mcp/reads/day.test.ts` fails with `Failed to resolve import "./day"`.

- [ ] **Step 3: Implement**

`lib/mcp/reads/day.ts`:

```ts
/**
 * get_day (spec 2026-10-16 F7): one dated day as the Day view shows it. It
 * reads through the Day view's own rows and assembly (`readDayRows` +
 * `buildDayModel`, lib/day-reads.ts / lib/day-view-model.ts), so the two
 * agree by construction, Surprise masking included: a hidden Surprise Item
 * is a "Surprise" placeholder at its time, and a hidden Stop is its shell.
 * Real plan only: readDayRows never reads a Fork.
 */
import { notFound } from "next/navigation";
import { requireTripAccess } from "@/lib/guards";
import { readDayRows } from "@/lib/day-reads";
import { buildDayModel, nightOfStay } from "@/lib/day-view-model";
import { orderDayEntries, type ItemEntry } from "@/lib/itinerary";
import { fail, type ActionFailure } from "@/lib/action-result";
import { toMcpDayItem, toMcpSurprise, type McpDayItem, type McpSurprise } from "./plan-shapes";

// McpDayEntry and McpDay exactly as under Interfaces.

export async function loadDayForMcp(tripId: string, date: string): Promise<McpDay | ActionFailure> {
  const { user } = await requireTripAccess(tripId);
  const read = await readDayRows(tripId, user.id, async () => null);
  if (read === "missing") notFound();
  if (read === "dateless") return fail({ date: ["This trip has no dates yet, so it has no days. Read it with get_trip_plan."] });
  const { rows } = read;
  if (date < rows.startDate || date > rows.endDate) {
    return fail({ date: [`${date} is outside the trip, which runs ${rows.startDate} to ${rows.endDate}.`] });
  }

  const model = buildDayModel(rows, date);
  const dayPlan = model.dayPlan!; // non-null for a date inside the Trip
  const ordered = orderDayEntries(dayPlan);

  const filesFor = (_kind: string, id: string) =>
    (model.attachmentsByTarget[id] ?? []).map((a) => ({ id: a.id, title: a.title ?? a.filename }));
  const item = (e: ItemEntry): McpDayItem => toMcpDayItem(e.item, filesFor);
  const stopName = new Map(rows.stops.map((s) => [s.id, s.name]));
  const home = rows.trip.homeName ?? "Home";
  const endName = (isHome: boolean | null | undefined, stopId: string | null | undefined, place: string | null | undefined) =>
    isHome ? home : ((stopId ? stopName.get(stopId) : undefined) ?? place ?? null);

  const timeline: McpDayEntry[] = ordered.entries.map((e): McpDayEntry => {
    switch (e.kind) {
      case "item":
        return { kind: "item", item: item(e) };
      case "transport-departure":
        return {
          kind: "departure", transportId: e.transport.id, mode: e.transport.mode, time: e.depTimeLabel ?? null,
          from: endName(e.transport.depIsHome, e.transport.fromStopId, e.transport.depPlace),
          to: endName(e.transport.arrIsHome, e.transport.toStopId, e.transport.arrPlace),
          arrivesOn: e.arrivesSameDay ? date : (e.arrivalDateISO ?? null),
          arrivesAt: e.arrivesSameDay ? (e.arrTimeLabel ?? null) : null,
        };
      case "transport-arrival":
        return {
          kind: "arrival", transportId: e.transport.id, mode: e.transport.mode, time: e.arrTimeLabel ?? null,
          from: endName(e.transport.depIsHome, e.transport.fromStopId, e.transport.depPlace),
          to: endName(e.transport.arrIsHome, e.transport.toStopId, e.transport.arrPlace),
        };
      case "accommodation-checkout":
        return { kind: "check-out", accommodationId: e.accommodation.id, name: e.accommodation.name, time: e.accommodation.checkOutTime ?? null };
      case "accommodation-checkin":
        return { kind: "check-in", accommodationId: e.accommodation.id, name: e.accommodation.name, time: e.accommodation.checkInTime ?? null };
    }
  });

  const s = model.dayStop;
  const bed = model.tonight;
  return {
    date,
    dayNumber: model.dayNumber,
    totalDays: model.totalDays,
    dayTitle: model.dayTitle?.title ?? null,
    stop: s ? { id: s.id, name: s.name, timezone: s.timezone, arriveDate: s.arriveDate!, departDate: s.departDate!, surprise: toMcpSurprise(s.surprise) } : null,
    travelDay: dayPlan.transportEntries.length > 0, // the Day view's own rule (lib/day-view-loader.ts)
    tonight: bed
      ? { id: bed.id, name: bed.name, address: bed.address, checkIn: bed.checkIn, checkOut: bed.checkOut, confirmation: bed.confirmation, notes: bed.notes, nightOf: nightOfStay(date, bed.checkIn, bed.checkOut) }
      : null,
    timeline,
    anytime: ordered.anytime.map(item),
  };
}
```

Two adaptations are allowed. If `toMcpDayItem`'s `FilesFor` parameter type rejects the `string` kind, type `filesFor` as `FilesFor`. If `ItineraryItem` is not assignable to `StopDayItem`, map its fields explicitly in `item()`. Neither changes behaviour. `buildDayModel` already sorts timed items by start time (`orderDayEntries`), and the test's `["tour", "p1"]` order (10:00, then 19:00) pins that.

- [ ] **Step 4: Run, expect PASS.** `npx vitest run lib/mcp/reads/day.test.ts`
- [ ] **Step 5: Task-done check.** `npx vitest related --run lib/mcp/reads/day.ts` + `npx tsc --noEmit` + `npx eslint lib/mcp/reads/day.ts lib/mcp/reads/day.test.ts`
- [ ] **Step 6: Commit.** Message: `feat(mcp): read one day as the Day view assembles it`

---

### Task F.7: Register `get_stop`, `get_item`, `get_transport`, `get_accommodation` and `get_day`

**Files:**
- Modify: `lib/mcp/tools/reads.ts:243-254` (after `get_trip_plan`; its description gains a pointer to the narrow reads) and its imports
- Modify: `lib/mcp/tools/reads.test.ts` (mock the new modules; new `describe`)

**Interfaces:**
- Consumes: F.4/F.5 `loadStopForMcp`, `loadItemForMcp`, `loadTransportForMcp`, `loadAccommodationForMcp`; F.6 `loadDayForMcp`; `isoDate`.
- Produces: five read tools, each with `annotations: { readOnlyHint: true }` (F.18 relies on that).

- [ ] **Step 1: Write the failing test**

In `reads.test.ts`, add `loadStopForMcp, loadItemForMcp, loadTransportForMcp, loadAccommodationForMcp, loadDayForMcp` to the hoisted block, plus `vi.mock("../reads/entities", () => ({ loadStopForMcp, loadItemForMcp, loadTransportForMcp, loadAccommodationForMcp }))` and `vi.mock("../reads/day", () => ({ loadDayForMcp }))`. Then:

```ts
describe("narrow reads (F7)", () => {
  const text = (r: { content: unknown }) => (r.content as { text: string }[])[0].text;

  it("registers the five narrow reads as read-only", async () => {
    const c = await connectTestClient();
    const { tools } = await c.listTools();
    for (const name of ["get_stop", "get_item", "get_transport", "get_accommodation", "get_day"]) {
      const t = tools.find((x) => x.name === name);
      expect(t, name).toBeDefined();
      expect(t!.annotations?.readOnlyHint).toBe(true);
    }
  });

  it.each([
    ["get_stop", { stopId: "s1" }, () => loadStopForMcp, ["s1"]],
    ["get_item", { itemId: "i1" }, () => loadItemForMcp, ["i1"]],
    ["get_transport", { transportId: "t1" }, () => loadTransportForMcp, ["t1"]],
    ["get_accommodation", { accommodationId: "a1" }, () => loadAccommodationForMcp, ["a1"]],
    ["get_day", { tripId: TRIP_ID, date: "2027-06-02" }, () => loadDayForMcp, [TRIP_ID, "2027-06-02"]],
  ] as const)("%s reads through its loader and returns what it read", async (name, args, loader, call) => {
    loader().mockResolvedValue({ id: "row" });
    const c = await connectTestClient();
    const r = await c.callTool({ name, arguments: args });
    expect(r.isError).toBeFalsy();
    expect(loader()).toHaveBeenCalledWith(...call);
    expect(JSON.parse(text(r))).toEqual({ id: "row" });
  });

  it("a refused id (Fork's, hidden Surprise, non-member's, made-up) is NOT_FOUND_TEXT", async () => {
    loadItemForMcp.mockRejectedValue(notFoundErr());
    const c = await connectTestClient();
    const r = await c.callTool({ name: "get_item", arguments: { itemId: "fork-item" } });
    expect(r.isError).toBe(true);
    expect(text(r)).toBe(NOT_FOUND_TEXT);
  });

  it("get_day refuses a malformed date before reading, and passes a date-range refusal through", async () => {
    const c = await connectTestClient();
    expect((await c.callTool({ name: "get_day", arguments: { tripId: TRIP_ID, date: "2027-6-2" } })).isError).toBe(true);
    expect(loadDayForMcp).not.toHaveBeenCalled();
    loadDayForMcp.mockResolvedValue({ success: false, errors: { date: ["2027-06-09 is outside the trip, which runs 2027-06-01 to 2027-06-04."] } });
    const r = await c.callTool({ name: "get_day", arguments: { tripId: TRIP_ID, date: "2027-06-09" } });
    expect(r.isError).toBe(true);
    expect(text(r)).toBe("Couldn't do that: date: 2027-06-09 is outside the trip, which runs 2027-06-01 to 2027-06-04.");
  });

  it("get_item's description tells an Item's own notes from the Notes on it", async () => {
    const c = await connectTestClient();
    const { tools } = await c.listTools();
    const d = tools.find((t) => t.name === "get_item")!.description!;
    expect(d).toMatch(/notesOnItem/);
    expect(d).toMatch(/update_thing_to_do/);
    expect(d).toMatch(/add_note/);
  });
});
```

Import `NOT_FOUND_TEXT` from `"../run-tool"` if the file doesn't already.

- [ ] **Step 2: Run, expect FAIL.** `npx vitest run lib/mcp/tools/reads.test.ts` fails with `get_stop` undefined.

- [ ] **Step 3: Implement.** In `registerReadTools`, after `get_trip_plan`:

```ts
  server.registerTool(
    "get_stop",
    {
      title: "Get stop",
      description:
        "Reads one Stop of the real plan exactly as get_trip_plan shows it: nights or dates, timezone, Pinned, Chapter, its Accommodation, its things to do, and each of its days with the Day title and the things to do scheduled on it. Use it to re-check one Stop instead of reading the whole trip.",
      inputSchema: { stopId: z.string() },
      annotations: { readOnlyHint: true },
    },
    ({ stopId }) => runTool("get_stop", () => loadStopForMcp(stopId)),
  );

  server.registerTool(
    "get_item",
    {
      title: "Get thing to do",
      description:
        "Reads one thing to do or see exactly as get_trip_plan shows it, with its date and Stop, its Costs (as list_costs shows them), its files, and notesOnItem: the Notes the Travellers left on it. Its own notes field is different. That is the Item's description, part of the Item, changed with update_thing_to_do. A Note is a separate comment, added with add_note and removed with delete_note.",
      inputSchema: { itemId: z.string() },
      annotations: { readOnlyHint: true },
    },
    ({ itemId }) => runTool("get_item", () => loadItemForMcp(itemId)),
  );

  server.registerTool(
    "get_transport",
    {
      title: "Get transport",
      description:
        "Reads one Transport leg exactly as get_trip_plan shows it (each end with its local time and zone, a Home end in the trip's Home timezone), with its Costs.",
      inputSchema: { transportId: z.string() },
      annotations: { readOnlyHint: true },
    },
    ({ transportId }) => runTool("get_transport", () => loadTransportForMcp(transportId)),
  );

  server.registerTool(
    "get_accommodation",
    {
      title: "Get accommodation",
      description: "Reads one Accommodation exactly as get_trip_plan shows it, with the Stop it belongs to and its Costs.",
      inputSchema: { accommodationId: z.string() },
      annotations: { readOnlyHint: true },
    },
    ({ accommodationId }) => runTool("get_accommodation", () => loadAccommodationForMcp(accommodationId)),
  );

  server.registerTool(
    "get_day",
    {
      title: "Get day",
      description:
        "Reads one day of the trip as the Day view shows it: the day's Stop (the arriving one on a Changeover day), the Day title, tonight's Accommodation, and the timeline in order. The timeline holds departures and arrivals, check-out and check-in, and timed things to do; then come the untimed things to do (anytime). date is YYYY-MM-DD within the trip's dates.",
      inputSchema: { tripId: z.string(), date: isoDate },
      annotations: { readOnlyHint: true },
    },
    ({ tripId, date }) => runTool("get_day", () => loadDayForMcp(tripId, date)),
  );
```

Append to `get_trip_plan`'s description: `" To re-check one thing, use get_stop, get_item, get_transport, get_accommodation or get_day instead of reading the whole plan again."` Update the file header comment's list of reads.

- [ ] **Step 4: Run, expect PASS.** `npx vitest run lib/mcp/tools/reads.test.ts`
- [ ] **Step 5: Task-done check.** `npx vitest related --run lib/mcp/tools/reads.ts` + `npx tsc --noEmit` + `npx eslint lib/mcp/tools/reads.ts lib/mcp/tools/reads.test.ts`
- [ ] **Step 6: Commit.** Message: `feat(mcp): get_stop, get_item, get_transport, get_accommodation and get_day`

---

### Task F.8: Narrow reads equal get_trip_plan's slices (real Postgres)

**Files:**
- Create: `test/integration/mcp-narrow-reads.test.ts`

**Interfaces:**
- Consumes: `runAsTraveller` (`lib/mcp/acting-traveller.ts`; tests are outside the ESLint zones, as `lib/guards.test.ts` shows); `loadTripPlanForMcp`; F.4–F.6 readers.
- Produces: the fixture and the `as(userId)` helper that F.10 and F.11 extend.

- [ ] **Step 1: Write the test**

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Mock only the Next boundary with no meaning outside a request; guards, the
// Surprise loader and every query run for real, as the acting Traveller.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));

import { db } from "@/lib/db";
import { runAsTraveller } from "@/lib/mcp/acting-traveller";
import { loadTripPlanForMcp } from "@/lib/mcp/reads/trip-plan";
import { loadAccommodationForMcp, loadItemForMcp, loadStopForMcp, loadTransportForMcp, readMcpStops } from "@/lib/mcp/reads/entities";
import { loadDayForMcp } from "@/lib/mcp/reads/day";

const OWNER = "it-narrow-owner";
const MEMBER = "it-narrow-member";
const TRIP_ID = "it-narrow-trip";
const FORK_ID = "it-narrow-fork";
const PORTO = "it-narrow-porto";
const SECRET = "it-narrow-secret"; // Surprise Stop, hidden from MEMBER
const TOUR = "it-narrow-tour"; // timed, Porto, 06-02
const MARKET = "it-narrow-market"; // untimed, Porto, 06-02
const TRAIN = "it-narrow-train"; // dated 06-04 (the Changeover day), no Stop
const TASTING = "it-narrow-tasting"; // undated thing to do under Porto
const GIFT = "it-narrow-gift"; // Surprise Item in Porto on 06-03, hidden from MEMBER
const FORK_ITEM = "it-narrow-fork-item";
const CASA = "it-narrow-casa";
const FLIGHT = "it-narrow-flight";

export const as = (id: string) => <T,>(fn: () => Promise<T>) =>
  runAsTraveller({ id, name: id, email: `${id}@example.test`, image: null }, fn);
const NOT_FOUND = { digest: expect.stringContaining("NEXT_HTTP_ERROR_FALLBACK;404") };
const future = JSON.stringify([MEMBER]);

describe.skipIf(process.env.INTEGRATION !== "1")("MCP narrow reads (real Postgres)", () => {
  beforeAll(async () => {
    for (const id of [OWNER, MEMBER]) {
      await db.user.upsert({ where: { id }, update: {}, create: { id, email: `${id}@example.test`, name: id } });
    }
  });

  beforeEach(async () => {
    await db.trip.deleteMany({ where: { id: TRIP_ID } });
    await db.trip.create({
      data: {
        id: TRIP_ID, name: "IT Narrow", homeCurrency: "AUD", createdById: OWNER, forksEnabled: true,
        startDate: "2027-06-01", endDate: "2027-06-07", homeName: "Brisbane", homeTimezone: "Australia/Brisbane",
        members: { create: [{ userId: OWNER, role: "owner" }, { userId: MEMBER, role: "member" }] },
      },
    });
    await db.fork.create({ data: { id: FORK_ID, tripId: TRIP_ID, name: "IT Plan B", createdById: OWNER } });
    await db.stop.createMany({
      data: [
        { id: PORTO, tripId: TRIP_ID, name: "IT Porto", countryCode: "pt", timezone: "Europe/Lisbon", arriveDate: "2027-06-01", departDate: "2027-06-04", nights: 3, sortOrder: 0, notes: "Port lodges" },
        { id: SECRET, tripId: TRIP_ID, name: "IT Secret", countryCode: "pt", timezone: "Europe/Lisbon", arriveDate: "2027-06-04", departDate: "2027-06-07", nights: 3, sortOrder: 1, notes: "the secret", surprisePlannerId: OWNER, surpriseForIds: future },
      ],
    });
    await db.item.createMany({
      data: [
        { id: TOUR, tripId: TRIP_ID, stopId: PORTO, title: "IT Lodge tour", category: "ACTIVITY", date: "2027-06-02", startTime: "10:00", notes: "Be early", sortOrder: 0 },
        { id: MARKET, tripId: TRIP_ID, stopId: PORTO, title: "IT Market", category: "FOOD", date: "2027-06-02", sortOrder: 1 },
        { id: TRAIN, tripId: TRIP_ID, title: "IT Train", category: "GETTING_AROUND", date: "2027-06-04", startTime: "09:00", sortOrder: 2 },
        { id: TASTING, tripId: TRIP_ID, stopId: PORTO, title: "IT Tasting", category: "FOOD", sortOrder: 3 },
        { id: GIFT, tripId: TRIP_ID, stopId: PORTO, title: "IT Gift dinner", category: "FOOD", date: "2027-06-03", startTime: "19:00", sortOrder: 4, surprisePlannerId: OWNER, surpriseForIds: future },
        { id: FORK_ITEM, tripId: TRIP_ID, forkId: FORK_ID, title: "IT Fork thing", category: "OTHER", date: "2027-06-02", sortOrder: 0 },
      ],
    });
    // The Changeover day's only Day title belongs to the arriving Stop.
    await db.dayTitle.createMany({ data: [{ stopId: PORTO, dayIndex: 1, title: "IT Ribeira day" }, { stopId: SECRET, dayIndex: 0, title: "IT Secret arrival" }] });
    await db.accommodation.create({ data: { id: CASA, tripId: TRIP_ID, stopId: PORTO, name: "IT Casa", checkIn: "2027-06-01", checkOut: "2027-06-04", checkInTime: "15:00" } });
    await db.transport.create({
      data: { id: FLIGHT, tripId: TRIP_ID, mode: "FLIGHT", depIsHome: true, toStopId: PORTO, depAt: new Date("2027-05-31T22:00:00Z"), arrAt: new Date("2027-06-01T10:00:00Z"), reference: "IT QF1" },
    });
    await db.cost.createMany({
      data: [
        { tripId: TRIP_ID, ownerType: "ITEM", ownerId: TOUR, costMinor: 3000, currency: "EUR" },
        { tripId: TRIP_ID, ownerType: "ACCOMMODATION", ownerId: CASA, costMinor: 45000, currency: "EUR" },
        { tripId: TRIP_ID, ownerType: "TRANSPORT", ownerId: FLIGHT, costMinor: 150000, currency: "AUD" },
      ],
    });
    await db.note.create({ data: { tripId: TRIP_ID, authorId: MEMBER, targetType: "ITEM", targetId: TOUR, body: "IT Bring the voucher" } });
  });

  afterAll(async () => {
    await db.trip.deleteMany({ where: { id: TRIP_ID } });
  });

  it.each([OWNER, MEMBER])("get_stop equals get_trip_plan's stop, Changeover title and Stopless Item included (as %s)", async (who) => {
    const plan = await as(who)(() => loadTripPlanForMcp(TRIP_ID));
    const stop = await as(who)(() => loadStopForMcp(PORTO));
    expect(stop).toEqual(plan.stops.find((s) => s.id === PORTO));
  });

  it("the owner sees the arriving Stop's title on Porto's last day; the surprised member does not", async () => {
    const lastDay = async (who: string) => (await as(who)(() => loadStopForMcp(PORTO))).days.at(-1)!;
    expect(await lastDay(OWNER)).toMatchObject({ date: "2027-06-04", dayTitle: "IT Secret arrival", items: [expect.objectContaining({ id: TRAIN })] });
    expect((await lastDay(MEMBER)).dayTitle).toBeNull();
  });

  it("get_item, get_transport and get_accommodation equal their get_trip_plan slices, plus their extras", async () => {
    const plan = await as(OWNER)(() => loadTripPlanForMcp(TRIP_ID));
    const porto = plan.stops.find((s) => s.id === PORTO)!;
    const tourOnDay = porto.days.find((d) => d.date === "2027-06-02")!.items.find((i) => i.id === TOUR)!;

    const item = await as(OWNER)(() => loadItemForMcp(TOUR));
    const { date, stopId, costs, notesOnItem, ...daySlice } = item;
    expect(daySlice).toEqual(tourOnDay);
    expect({ date, stopId }).toEqual({ date: "2027-06-02", stopId: PORTO });
    expect(costs.map((c) => c.amount.minor)).toEqual([3000]);
    expect(notesOnItem.map((n) => n.body)).toEqual(["IT Bring the voucher"]);
    expect(item.notes).toBe("Be early");

    const { costs: legCosts, ...leg } = await as(OWNER)(() => loadTransportForMcp(FLIGHT));
    expect(leg).toEqual(plan.transports.find((t) => t.id === FLIGHT));
    expect(legCosts.map((c) => c.amount.minor)).toEqual([150000]);

    const { costs: stayCosts, stopId: stayStop, ...stay } = await as(OWNER)(() => loadAccommodationForMcp(CASA));
    expect(stay).toEqual(porto.accommodations[0]);
    expect(stayStop).toBe(PORTO);
    expect(stayCosts.map((c) => c.amount.minor)).toEqual([45000]);
  });

  it("a Fork's row, and a Surprise hidden from the caller, read as not found", async () => {
    await expect(as(OWNER)(() => loadItemForMcp(FORK_ITEM))).rejects.toMatchObject(NOT_FOUND);
    await expect(as(MEMBER)(() => loadStopForMcp(SECRET))).rejects.toMatchObject(NOT_FOUND);
    await expect(as(MEMBER)(() => loadItemForMcp(GIFT))).rejects.toMatchObject(NOT_FOUND);
    await expect(as(OWNER)(() => loadStopForMcp(SECRET))).resolves.toMatchObject({ id: SECRET, notes: "the secret" });
  });

  it("readMcpStops shows the surprised member the Surprise Stop's shell, without refusing", async () => {
    const [shell] = await as(MEMBER)(() => readMcpStops(TRIP_ID, [SECRET]));
    expect(shell).toMatchObject({ id: SECRET, name: "IT Secret", arriveDate: "2027-06-04", notes: null, days: [], accommodations: [], thingsToDo: [] });
  });

  it("get_day shows the hidden Surprise Item as a 'Surprise' placeholder at its time, and the plan's day otherwise", async () => {
    const memberDay = await as(MEMBER)(() => loadDayForMcp(TRIP_ID, "2027-06-03"));
    if ("success" in memberDay) throw new Error("expected a day");
    expect(memberDay.timeline).toContainEqual(expect.objectContaining({ kind: "item", item: expect.objectContaining({ id: GIFT, title: "Surprise" }) }));

    const day = await as(OWNER)(() => loadDayForMcp(TRIP_ID, "2027-06-02"));
    if ("success" in day) throw new Error("expected a day");
    expect(day).toMatchObject({ dayTitle: "IT Ribeira day", stop: { id: PORTO }, tonight: { id: CASA, nightOf: { night: 2, of: 3 } } });
    expect(day.timeline.map((e) => (e.kind === "item" ? e.item.id : e.kind))).toEqual([TOUR]);
    expect(day.anytime.map((i) => i.id)).toEqual([MARKET]);
    expect(day.timeline.some((e) => e.kind === "item" && e.item.id === FORK_ITEM)).toBe(false);
  });
});
```

- [ ] **Step 2: Run it.** `INTEGRATION=1 npx vitest run --project integration test/integration/mcp-narrow-reads.test.ts`. Use whatever `npm run test:integration` runs, narrowed to this file. Bring the throwaway Postgres up first, as in the session's sandbox notes. It should **pass**: F.1–F.6 already built the readers, so this test is the guard against drift between them and get_trip_plan, not a red step. If a case fails, the bug is in the reader, not the test. Fix the reader and keep the assertion. If the DB is down, write the test anyway and say so in the report.
- [ ] **Step 3: Implement.** No code beyond the test. Fix only what Step 2 exposes.
- [ ] **Step 4: Run it again, expect PASS.**
- [ ] **Step 5: Task-done check.** `npx tsc --noEmit` + `npx eslint test/integration/mcp-narrow-reads.test.ts` + the integration run above
- [ ] **Step 6: Commit.** Message: `test(mcp): narrow reads equal get_trip_plan's slices against Postgres`

---

### Task F.9: `runWrite`, the one tool-layer wrapper for writes

**Files:**
- Modify: `lib/mcp/run-tool.ts:28-41` (add `runWrite` after `runTool`)
- Modify: `lib/mcp/run-tool.test.ts`

**Interfaces:**
- Produces:
  ```ts
  /** The success branch of a write's result: what `reread` receives. */
  export type Succeeded<R> = R extends { success: false } ? never : R;
  export function runWrite<R>(name: string, write: () => Promise<R>, reread: (done: Succeeded<R>) => Promise<object>): Promise<ToolResult>
  ```

- [ ] **Step 1: Write the failing test** (append to `run-tool.test.ts`; add `runWrite` to the import)

```ts
describe("runWrite", () => {
  it("returns the row the reread built, not the action's ActionResult", async () => {
    const reread = vi.fn(async (done: { success: true; id: string }) => ({ stop: { id: done.id, name: "Porto" } }));
    const r = await runWrite("t", async () => ({ success: true as const, id: "s1" }), reread);
    expect(reread).toHaveBeenCalledWith({ success: true, id: "s1" });
    expect(JSON.parse(firstText(r))).toEqual({ stop: { id: "s1", name: "Porto" } });
  });

  it("an action failure maps as runTool maps it, and nothing is re-read", async () => {
    const reread = vi.fn();
    const r = await runWrite("t", async () => ({ success: false as const, errors: { name: ["Name is required"] } }), reread);
    expect(r).toEqual({ isError: true, content: [{ type: "text", text: "Couldn't do that: name: Name is required" }] });
    expect(reread).not.toHaveBeenCalled();
  });

  it("a write that throws notFound() is NOT_FOUND_TEXT, and nothing is re-read", async () => {
    const reread = vi.fn();
    const r = await runWrite("t", async () => { throw digestErr("NEXT_HTTP_ERROR_FALLBACK;404"); }, reread);
    expect(firstText(r)).toBe(NOT_FOUND_TEXT);
    expect(reread).not.toHaveBeenCalled();
  });

  it("a write with no ActionResult (a custom success) is re-read too", async () => {
    const r = await runWrite("t", async () => ({ applied: 2 }), async () => ({ stops: [] }));
    expect(JSON.parse(firstText(r))).toEqual({ stops: [] });
  });
});
```

- [ ] **Step 2: Run, expect FAIL.** `npx vitest run lib/mcp/run-tool.test.ts` fails: `runWrite` is not exported.

- [ ] **Step 3: Implement** (after `runTool`)

```ts
/** The success branch of a write's result: what `runWrite`'s reread receives. */
export type Succeeded<R> = R extends { success: false } ? never : R;

const isFailed = (v: unknown): v is { success: false } =>
  typeof v === "object" && v !== null && (v as { success?: unknown }).success === false;

/**
 * Every MCP write tool (spec 2026-10-16 F6): run the app's own action, and on
 * success return the row as it now stands, re-read through the narrow reads
 * (lib/mcp/reads/entities.ts and friends), instead of the action's
 * `ActionResult` (ADR 0074 keeps that contract for the app). Deletes reread
 * to `{ deleted: id }`. A failure, notFound() or throw maps exactly as
 * `runTool` maps it, and nothing is re-read.
 */
export function runWrite<R>(
  name: string,
  write: () => Promise<R>,
  reread: (done: Succeeded<R>) => Promise<object>,
): Promise<ToolResult> {
  return runTool(name, async () => {
    const result = await write();
    if (isFailed(result)) return result;
    return reread(result as Succeeded<R>);
  });
}
```

Update the file header: "Writes go through `runWrite`, which returns the row as it now stands (F6)."

- [ ] **Step 4: Run, expect PASS.** `npx vitest run lib/mcp/run-tool.test.ts`
- [ ] **Step 5: Task-done check.** `npx vitest related --run lib/mcp/run-tool.ts` + `npx tsc --noEmit` + `npx eslint lib/mcp/run-tool.ts lib/mcp/run-tool.test.ts`
- [ ] **Step 6: Commit.** Message: `feat(mcp): runWrite returns the row a write left behind`

---

### Task F.10: Stop ripples for a write's read-back (`lib/mcp/reads/stop-changes.ts`)

**Files:**
- Create: `lib/mcp/reads/stop-changes.ts`
- Create: `lib/mcp/reads/stop-changes.test.ts`
- Modify: `test/integration/mcp-narrow-reads.test.ts` (one case for `snapshotPlanStops` + `stopTracker`)

**Interfaces:**
- Consumes: F.5 `loadStopForMcp`, `readMcpStops`; `McpStop`.
- Produces:
  ```ts
  export interface StopSnapshot { id: string; sortOrder: number; arriveDate: string | null; departDate: string | null; nights: number | null; pinned: boolean; chapterId: string | null; timezone: string | null }
  export function snapshotPlanStops(tripId: string): Promise<StopSnapshot[]>
  export function changedStopIds(before: readonly StopSnapshot[], after: readonly StopSnapshot[]): string[]
  export function stopTracker(): {
    start(tripId: string): Promise<void>;
    stopAndShifted(stopId: string): Promise<{ stop: McpStop; shifted: McpStop[] }>;
    changed(): Promise<McpStop[]>;
  }
  export function conflictsOf(done: { conflicts?: readonly unknown[] }): { conflicts?: readonly unknown[] }
  ```

- [ ] **Step 1: Write the failing test**

`lib/mcp/reads/stop-changes.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const { stopFindMany, loadStopForMcp, readMcpStops } = vi.hoisted(() => ({
  stopFindMany: vi.fn(), loadStopForMcp: vi.fn(), readMcpStops: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ db: { stop: { findMany: stopFindMany } } }));
vi.mock("./entities", () => ({ loadStopForMcp, readMcpStops }));

import { changedStopIds, conflictsOf, stopTracker, type StopSnapshot } from "./stop-changes";

const snap = (id: string, o: Partial<StopSnapshot> = {}): StopSnapshot => ({
  id, sortOrder: 0, arriveDate: "2027-06-01", departDate: "2027-06-04", nights: 3, pinned: false, chapterId: null, timezone: "Europe/Lisbon", ...o,
});

describe("changedStopIds", () => {
  it("names Stops that moved, re-dated, re-nighted, (un)pinned, changed Chapter or zone, or are new — in plan order", () => {
    const before = [snap("a"), snap("b", { sortOrder: 1 }), snap("c", { sortOrder: 2 })];
    const after = [snap("a"), snap("c", { sortOrder: 1 }), snap("b", { sortOrder: 2, departDate: "2027-06-05" }), snap("d", { sortOrder: 3 })];
    expect(changedStopIds(before, after)).toEqual(["c", "b", "d"]);
  });
  it("is empty when nothing changed", () => {
    expect(changedStopIds([snap("a")], [snap("a")])).toEqual([]);
  });
});

describe("stopTracker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadStopForMcp.mockImplementation(async (id: string) => ({ id }));
    readMcpStops.mockImplementation(async (_t: string, ids: string[]) => ids.map((id) => ({ id, shell: true })));
  });

  it("stopAndShifted reads the Stop through get_stop and every other Stop it moved through readMcpStops (a Surprise as its shell)", async () => {
    stopFindMany
      .mockResolvedValueOnce([snap("a"), snap("b", { sortOrder: 1, arriveDate: "2027-06-04", departDate: "2027-06-07" })])
      .mockResolvedValueOnce([snap("a", { departDate: "2027-06-05" }), snap("b", { sortOrder: 1, arriveDate: "2027-06-05", departDate: "2027-06-08" })]);
    const t = stopTracker();
    await t.start("trip-1");
    expect(await t.stopAndShifted("a")).toEqual({ stop: { id: "a" }, shifted: [{ id: "b", shell: true }] });
    expect(readMcpStops).toHaveBeenCalledWith("trip-1", ["b"]);
    expect(stopFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { tripId: "trip-1", forkId: null } }));
  });

  it("changed() reads every Stop the write changed", async () => {
    stopFindMany.mockResolvedValueOnce([snap("a", { arriveDate: null, departDate: null })]).mockResolvedValueOnce([snap("a")]);
    const t = stopTracker();
    await t.start("trip-1");
    expect(await t.changed()).toEqual([{ id: "a", shell: true }]);
  });
});

describe("conflictsOf", () => {
  it("passes non-empty conflicts through and drops an empty list", () => {
    expect(conflictsOf({ conflicts: [{ stopId: "a" }] })).toEqual({ conflicts: [{ stopId: "a" }] });
    expect(conflictsOf({ conflicts: [] })).toEqual({});
    expect(conflictsOf({})).toEqual({});
  });
});
```

(`REAL_PLAN` is `{ forkId: null }`. If it spells differently, assert with `expect.objectContaining({ tripId: "trip-1" })`.)

Append to `test/integration/mcp-narrow-reads.test.ts`:

```ts
  it("stopTracker names the Surprise Stop a date push moved, as the surprised member's shell", async () => {
    const { stopTracker } = await import("@/lib/mcp/reads/stop-changes");
    const t = stopTracker();
    await as(MEMBER)(() => t.start(TRIP_ID));
    await db.stop.update({ where: { id: SECRET }, data: { arriveDate: "2027-06-05", departDate: "2027-06-08" } });
    const out = await as(MEMBER)(() => t.stopAndShifted(PORTO));
    expect(out.stop.id).toBe(PORTO);
    expect(out.shifted).toEqual([expect.objectContaining({ id: SECRET, arriveDate: "2027-06-05", notes: null, days: [] })]);
  });
```

- [ ] **Step 2: Run, expect FAIL.** `npx vitest run lib/mcp/reads/stop-changes.test.ts` fails with `Failed to resolve import "./stop-changes"`.

- [ ] **Step 3: Implement**

`lib/mcp/reads/stop-changes.ts`:

```ts
/**
 * What a Stop-dating write moved (spec 2026-10-16 F6). A date edit can push
 * the Stops after it (ADR 0038), a move swaps two, Firm up dates many, and
 * the lone-Stop rule (ADR 0073) can date the last one. The write tools
 * snapshot the real plan's Stops before the action and compare afterwards,
 * so their result names every Stop that changed. The edited Stop is read
 * through get_stop. The others are read through `readMcpStops`, which
 * shows a Surprise Stop hidden from the caller as its shell: an edit may
 * ripple into a Surprise (CONTEXT.md), and the read-back must not report
 * "Not found" for a write that succeeded.
 *
 * Callers start the tracker only after their own access check.
 */
import { db } from "@/lib/db";
import { REAL_PLAN } from "@/lib/plan-scope";
import { loadStopForMcp, readMcpStops } from "./entities";
import type { McpStop } from "./plan-shapes";

const SNAPSHOT_SELECT = {
  id: true, sortOrder: true, arriveDate: true, departDate: true, nights: true, pinned: true, chapterId: true, timezone: true,
} as const;
const COMPARED = Object.keys(SNAPSHOT_SELECT) as (keyof StopSnapshot)[];

export interface StopSnapshot {
  id: string; sortOrder: number; arriveDate: string | null; departDate: string | null;
  nights: number | null; pinned: boolean; chapterId: string | null; timezone: string | null;
}

export async function snapshotPlanStops(tripId: string): Promise<StopSnapshot[]> {
  return db.stop.findMany({ where: { tripId, ...REAL_PLAN }, orderBy: { sortOrder: "asc" }, select: SNAPSHOT_SELECT });
}

/** Ids in `after` (its order) whose snapshot differs from `before`, or that are new. */
export function changedStopIds(before: readonly StopSnapshot[], after: readonly StopSnapshot[]): string[] {
  const was = new Map(before.map((s) => [s.id, s]));
  return after.filter((s) => {
    const b = was.get(s.id);
    return !b || COMPARED.some((k) => b[k] !== s[k]);
  }).map((s) => s.id);
}

export function stopTracker() {
  let tripId = "";
  let before: StopSnapshot[] = [];
  const changedIds = async () => changedStopIds(before, await snapshotPlanStops(tripId));
  return {
    async start(id: string): Promise<void> {
      tripId = id;
      before = await snapshotPlanStops(id);
    },
    async stopAndShifted(stopId: string): Promise<{ stop: McpStop; shifted: McpStop[] }> {
      const others = (await changedIds()).filter((id) => id !== stopId);
      const [stop, shifted] = await Promise.all([loadStopForMcp(stopId), readMcpStops(tripId, others)]);
      return { stop, shifted };
    },
    async changed(): Promise<McpStop[]> {
      return readMcpStops(tripId, await changedIds());
    },
  };
}

/** The action's flow conflicts, when there are any (they say why a date edit overlaps). */
export function conflictsOf(done: { conflicts?: readonly unknown[] }): { conflicts?: readonly unknown[] } {
  return done.conflicts && done.conflicts.length > 0 ? { conflicts: done.conflicts } : {};
}
```

- [ ] **Step 4: Run, expect PASS.** `npx vitest run lib/mcp/reads/stop-changes.test.ts`, then the integration file (DB up).
- [ ] **Step 5: Task-done check.** `npx vitest related --run lib/mcp/reads/stop-changes.ts` + `npx tsc --noEmit` + `npx eslint lib/mcp/reads/stop-changes.ts lib/mcp/reads/stop-changes.test.ts test/integration/mcp-narrow-reads.test.ts`
- [ ] **Step 6: Commit.** Message: `feat(mcp): name every Stop a dating write moved`

---

### Task F.11: Single-row readers for Reminders, Checklist items, Wishlist ideas and Votes

**Files:**
- Create: `lib/mcp/reads/lists.ts`
- Create: `lib/mcp/reads/lists.test.ts`
- Modify: `lib/reminder-reads.ts` (extract `REMINDER_ITEM_SELECT` / `toReminderItem`, add `readReminderItem`)
- Modify: `lib/reminder-reads.test.ts` (new cases)
- Modify: `lib/mcp/tools/reads.ts:40-68` (`loadWishlist` maps through `WISHLIST_IDEA_SELECT` / `toMcpIdea`) and `:103-126` (`loadChecklists` maps through `CHECKLIST_VIEW_SELECT` / `toChecklistView`)
- Modify: `eslint.config.mjs:81-100` (add `"lib/mcp/reads/lists.ts"` to `SURPRISE_VISIBILITY_READERS`)
- Modify: `test/integration/reminder-reads.test.ts` (one `readReminderItem` case), `test/integration/mcp-narrow-reads.test.ts` (one lists case)
- Test (must pass unchanged): `lib/mcp/tools/reads.test.ts`

**Interfaces:**
- Consumes: `requireRowAccess("reminder" | "checklistItem", id)`, `requireTripAccess`, `requireRealPlanRow`; `sortChecklist` (`lib/checklists.ts`); E's `ReminderItem` fields.
- Produces:
  ```ts
  // lib/reminder-reads.ts
  export const REMINDER_ITEM_SELECT: …; export function toReminderItem(row): ReminderItem
  export function readReminderItem(reminderId: string): Promise<ReminderItem>
  // lib/mcp/reads/lists.ts
  export interface McpChecklistItem { id: string; text: string; done: boolean; dueDate: string | null; buyState: string | null }
  export const CHECKLIST_VIEW_SELECT; export function toChecklistView(row): McpChecklistItem
  export function readChecklist(tripId: string, kind: string): Promise<McpChecklistItem[]>
  export function loadChecklistItemForMcp(itemId: string): Promise<McpChecklistItem & { kind: string }>
  export function loadChecklistOfItemForMcp(itemId: string): Promise<{ kind: string; items: McpChecklistItem[] }>
  export interface McpIdea { id: string; title: string; category: string; notes: string | null; link: string | null; votes: { traveller: string; level: string }[] }
  export const WISHLIST_IDEA_SELECT; export function toMcpIdea(row): McpIdea
  export function loadWishlistIdeaForMcp(itemId: string): Promise<McpIdea>
  export function loadVotesForMcp(itemId: string): Promise<{ itemId: string; votes: McpIdea["votes"] }>
  ```

- [ ] **Step 1: Write the failing tests**

Append to `lib/reminder-reads.test.ts`. Add `requireRowAccess` and `reminderFindFirst` to its hoisted mocks and to its `@/lib/guards` / `@/lib/db` factories:

```ts
describe("readReminderItem", () => {
  it("reads one Reminder through the Reminder guard, in get_reminders' shape (notes and about-links included)", async () => {
    requireRowAccess.mockResolvedValue({ row: { id: "r1", tripId: "trip-1" }, user: { id: "u1" } });
    reminderFindFirst.mockResolvedValue({ id: "r1", title: "Print tickets", date: "2027-05-30", stopId: null, stop: null, notes: "Both legs", itemId: null, transportId: "t1" });
    const r = await readReminderItem("r1");
    expect(requireRowAccess).toHaveBeenCalledWith("reminder", "r1");
    expect(reminderFindFirst.mock.calls[0][0].where).toMatchObject({ id: "r1", tripId: "trip-1" });
    expect(r).toMatchObject({ id: "r1", title: "Print tickets", stopId: null, stopName: null });
    for (const key of ["notes", "itemId", "transportId"]) expect(r).toHaveProperty(key);
  });

  it("is notFound when the Surprise fragment filters it out", async () => {
    requireRowAccess.mockResolvedValue({ row: { id: "r1", tripId: "trip-1" }, user: { id: "u1" } });
    reminderFindFirst.mockResolvedValue(null);
    await expect(readReminderItem("r1")).rejects.toMatchObject({ digest: expect.stringContaining("404") });
  });
});
```

The mock row must match E's select: add whatever relation labels E selects, e.g. `item: null, transport: {…}`.

`lib/mcp/reads/lists.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  requireRowAccess: vi.fn(), requireTripAccess: vi.fn(), requireRealPlanRow: vi.fn(), loadSurpriseVisibility: vi.fn(),
  checklistFindUnique: vi.fn(), checklistFindMany: vi.fn(), itemFindFirst: vi.fn(), voteFindMany: vi.fn(),
}));
vi.mock("@/lib/guards", () => ({ requireRowAccess: m.requireRowAccess, requireTripAccess: m.requireTripAccess }));
vi.mock("../real-plan", () => ({ requireRealPlanRow: m.requireRealPlanRow }));
vi.mock("@/lib/db", () => ({
  db: {
    checklistItem: { findUnique: m.checklistFindUnique, findMany: m.checklistFindMany },
    item: { findFirst: m.itemFindFirst },
    vote: { findMany: m.voteFindMany },
  },
}));
vi.mock("@/lib/surprise-visibility", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/surprise-visibility")>();
  return { ...actual, loadSurpriseVisibility: m.loadSurpriseVisibility };
});

import { NO_SURPRISES } from "@/lib/surprise-visibility";
import { loadChecklistItemForMcp, loadChecklistOfItemForMcp, loadVotesForMcp, loadWishlistIdeaForMcp } from "./lists";

const cam = { id: "u1", name: "Cam", displayName: null, email: null, image: null };
const ci = (id: string, sortOrder: number) => ({ id, kind: "PACKING", text: id, done: false, dueDate: null, sortOrder, buy: null });

beforeEach(() => {
  vi.clearAllMocks();
  m.requireRowAccess.mockResolvedValue({ row: { id: "ci-1", tripId: "trip-1", kind: "PACKING" }, user: { id: "u1" } });
  m.requireRealPlanRow.mockResolvedValue({ tripId: "trip-1" });
  m.requireTripAccess.mockResolvedValue({ user: { id: "u1" }, membership: {} });
  m.loadSurpriseVisibility.mockResolvedValue(NO_SURPRISES);
});

describe("Checklist readers", () => {
  it("loadChecklistItemForMcp reads one item in get_checklists' shape, plus its list", async () => {
    m.checklistFindUnique.mockResolvedValue({ ...ci("ci-1", 0), buy: "NEEDED" });
    expect(await loadChecklistItemForMcp("ci-1")).toEqual({ id: "ci-1", text: "ci-1", done: false, dueDate: null, buyState: "NEEDED", kind: "PACKING" });
    expect(m.requireRowAccess).toHaveBeenCalledWith("checklistItem", "ci-1");
  });

  it("loadChecklistOfItemForMcp reads the item's whole list in its order", async () => {
    m.checklistFindMany.mockResolvedValue([ci("b", 1), ci("a", 0)]);
    const out = await loadChecklistOfItemForMcp("ci-1");
    expect(m.checklistFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { tripId: "trip-1", kind: "PACKING" } }));
    expect(out).toEqual({ kind: "PACKING", items: [expect.objectContaining({ id: "a" }), expect.objectContaining({ id: "b" })] });
  });
});

describe("Wishlist readers", () => {
  it("loadWishlistIdeaForMcp reads one real-plan idea in get_wishlist's shape", async () => {
    m.itemFindFirst.mockResolvedValue({ id: "i1", title: "Sintra", category: "PLACE", notes: null, link: null, votes: [{ level: "KEEN", user: cam }] });
    expect(await loadWishlistIdeaForMcp("i1")).toEqual({ id: "i1", title: "Sintra", category: "PLACE", notes: null, link: null, votes: [{ traveller: "Cam", level: "KEEN" }] });
    expect(m.requireRealPlanRow).toHaveBeenCalledWith("item", "i1");
    expect(m.itemFindFirst.mock.calls[0][0].where).toMatchObject({ id: "i1", tripId: "trip-1", forkId: null, stopId: null, date: null });
  });

  it("loadVotesForMcp reads the Votes on any real-plan Item", async () => {
    m.voteFindMany.mockResolvedValue([{ level: "MUST", user: cam }]);
    expect(await loadVotesForMcp("i1")).toEqual({ itemId: "i1", votes: [{ traveller: "Cam", level: "MUST" }] });
  });
});
```

- [ ] **Step 2: Run, expect FAIL.** `npx vitest run lib/mcp/reads/lists.test.ts lib/reminder-reads.test.ts` fails: there is no `./lists`, and `readReminderItem` is not exported.

- [ ] **Step 3: Implement**

`lib/reminder-reads.ts`: pull the select and mapper out of `listRemindersForTrip`, with every field E added, unchanged. Then add:

```ts
export const REMINDER_ITEM_SELECT = {
  id: true, title: true, date: true, stopId: true, stop: { select: { name: true } },
  // …and every field section E selects (notes, itemId, transportId and their labels).
} as const;

export function toReminderItem(r: /* the select's row type */): ReminderItem {
  return { id: r.id, title: r.title, date: r.date, stopId: r.stopId, stopName: r.stop?.name ?? null /* , …E's fields */ };
}

/** One Reminder in get_reminders' shape (add_reminder / update_reminder's read-back, F6). */
export async function readReminderItem(reminderId: string): Promise<ReminderItem> {
  const { row, user } = await requireRowAccess("reminder", reminderId);
  const v = await loadSurpriseVisibility(row.tripId, user.id);
  const r = await db.reminder.findFirst({ where: { id: reminderId, tripId: row.tripId, ...v.where.reminder }, select: REMINDER_ITEM_SELECT });
  if (!r) notFound();
  return toReminderItem(r);
}
```

`listRemindersForTrip` keeps its query and maps with `toReminderItem`. Add `requireRowAccess` and `notFound` to the imports.

`lib/mcp/reads/lists.ts`:

```ts
/**
 * Single-row reads for the Checklists and the Wishlist, in get_checklists'
 * and get_wishlist's shapes: the read-back of every list write (spec
 * 2026-10-16 F6). Checklists are trip-wide and never inside a Surprise.
 * Wishlist ideas carry the Surprise fragment anyway, like get_wishlist.
 */
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireRowAccess, requireTripAccess } from "@/lib/guards";
import { REAL_PLAN, WISHLIST_IDEA_WHERE } from "@/lib/plan-scope";
import { sortChecklist } from "@/lib/checklists";
import { travellerName, TRAVELLER_SELECT } from "@/lib/traveller";
import { loadSurpriseVisibility } from "@/lib/surprise-visibility";
import { requireRealPlanRow } from "../real-plan";

export const CHECKLIST_VIEW_SELECT = { id: true, kind: true, text: true, done: true, dueDate: true, sortOrder: true, buy: true } as const;
type ChecklistRow = { id: string; kind: string; text: string; done: boolean; dueDate: string | null; sortOrder: number; buy: string | null };

export interface McpChecklistItem { id: string; text: string; done: boolean; dueDate: string | null; buyState: string | null }

export const toChecklistView = (i: ChecklistRow): McpChecklistItem => ({ id: i.id, text: i.text, done: i.done, dueDate: i.dueDate, buyState: i.buy });

/** One list in get_checklists' order. Callers have checked access. */
export async function readChecklist(tripId: string, kind: string): Promise<McpChecklistItem[]> {
  const rows = await db.checklistItem.findMany({ where: { tripId, kind }, orderBy: { sortOrder: "asc" }, select: CHECKLIST_VIEW_SELECT });
  return sortChecklist(rows).map(toChecklistView);
}

export async function loadChecklistItemForMcp(itemId: string): Promise<McpChecklistItem & { kind: string }> {
  await requireRowAccess("checklistItem", itemId);
  const row = await db.checklistItem.findUnique({ where: { id: itemId }, select: CHECKLIST_VIEW_SELECT });
  if (!row) notFound();
  return { ...toChecklistView(row), kind: row.kind };
}

export async function loadChecklistOfItemForMcp(itemId: string): Promise<{ kind: string; items: McpChecklistItem[] }> {
  const { row } = await requireRowAccess("checklistItem", itemId);
  return { kind: row.kind, items: await readChecklist(row.tripId, row.kind) };
}

export const WISHLIST_IDEA_SELECT = {
  id: true, title: true, category: true, notes: true, link: true,
  votes: { select: { level: true, user: { select: TRAVELLER_SELECT } } },
} as const;

export interface McpIdea {
  id: string; title: string; category: string; notes: string | null; link: string | null;
  votes: { traveller: string; level: string }[];
}

type VoteRow = { level: string; user: Parameters<typeof travellerName>[0] };
const toVotes = (votes: VoteRow[]) => votes.map((v) => ({ traveller: travellerName(v.user), level: v.level }));

export const toMcpIdea = (i: { id: string; title: string; category: string; notes: string | null; link: string | null; votes: VoteRow[] }): McpIdea => ({
  id: i.id, title: i.title, category: i.category, notes: i.notes, link: i.link, votes: toVotes(i.votes),
});

export async function loadWishlistIdeaForMcp(itemId: string): Promise<McpIdea> {
  const { tripId } = await requireRealPlanRow("item", itemId);
  const { user } = await requireTripAccess(tripId);
  const v = await loadSurpriseVisibility(tripId, user.id);
  const row = await db.item.findFirst({
    where: { id: itemId, tripId, ...REAL_PLAN, ...WISHLIST_IDEA_WHERE, ...v.where.item },
    select: WISHLIST_IDEA_SELECT,
  });
  if (!row) notFound();
  return toMcpIdea(row);
}

/** The Votes on one real-plan Item (set_vote / clear_vote's read-back): get_wishlist's `votes`. */
export async function loadVotesForMcp(itemId: string): Promise<{ itemId: string; votes: McpIdea["votes"] }> {
  await requireRealPlanRow("item", itemId);
  const votes = await db.vote.findMany({ where: { itemId }, orderBy: { createdAt: "asc" }, select: { level: true, user: { select: TRAVELLER_SELECT } } });
  return { itemId, votes: toVotes(votes) };
}
```

`reads.ts` `loadWishlist`: `select: WISHLIST_IDEA_SELECT`, return `{ ideas: items.map(toMcpIdea) }`. `loadChecklists`: `select: CHECKLIST_VIEW_SELECT`, `const view = toChecklistView`. The output is identical, so reads.test.ts passes unedited. `eslint.config.mjs`: add `"lib/mcp/reads/lists.ts",`.

Integration. Append to `test/integration/reminder-reads.test.ts`:

```ts
  it("readReminderItem reads one Reminder; one about a hidden Surprise Stop is notFound to the surprised member", async () => {
    const porto = await db.reminder.findFirstOrThrow({ where: { tripId: TRIP_ID, title: "IT Port tour" } });
    const secret = await db.reminder.findFirstOrThrow({ where: { tripId: TRIP_ID, title: "IT Secret dinner" } });
    expect(await readReminderItem(porto.id)).toMatchObject({ id: porto.id, stopName: "IT Porto" });
    viewer.id = MEMBER;
    await expect(readReminderItem(secret.id)).rejects.toMatchObject({ digest: expect.stringContaining("404") });
  });
```

That file mocks `@/lib/guards` with `requireTripAccess` only. Add a `requireRowAccess` to the mock that reads `db.reminder.findUnique({ where: { id }, select: { tripId: true, stopId: true } })`, then calls the real `requireOutsideSurprise` from `@/lib/surprise-guard` with `{ stopId }` and returns `{ row, user: { id: viewer.id } }`. Or switch the file to `runAsTraveller` like F.8. Either way the real Surprise check runs.

Append to `test/integration/mcp-narrow-reads.test.ts`:

```ts
  it("the list readers read real rows", async () => {
    const { loadChecklistOfItemForMcp, loadVotesForMcp } = await import("@/lib/mcp/reads/lists");
    const a = await db.checklistItem.create({ data: { tripId: TRIP_ID, kind: "PACKING", text: "IT Adapter", sortOrder: 1 } });
    await db.checklistItem.create({ data: { tripId: TRIP_ID, kind: "PACKING", text: "IT Hat", sortOrder: 0 } });
    await db.vote.create({ data: { tripId: TRIP_ID, itemId: TOUR, userId: MEMBER, level: "MUST" } });
    expect((await as(OWNER)(() => loadChecklistOfItemForMcp(a.id))).items.map((i) => i.text)).toEqual(["IT Hat", "IT Adapter"]);
    expect(await as(OWNER)(() => loadVotesForMcp(TOUR))).toEqual({ itemId: TOUR, votes: [{ traveller: expect.any(String), level: "MUST" }] });
  });
```

- [ ] **Step 4: Run, expect PASS.** `npx vitest run lib/mcp/reads/lists.test.ts lib/reminder-reads.test.ts lib/mcp/tools/reads.test.ts eslint.config.test.ts`, then both integration files (DB up).
- [ ] **Step 5: Task-done check.** `npx vitest related --run lib/mcp/reads/lists.ts lib/reminder-reads.ts lib/mcp/tools/reads.ts eslint.config.mjs` + `npx tsc --noEmit` + `npx eslint lib/mcp/reads/lists.ts lib/mcp/reads/lists.test.ts lib/reminder-reads.ts lib/reminder-reads.test.ts lib/mcp/tools/reads.ts eslint.config.mjs test/integration/reminder-reads.test.ts test/integration/mcp-narrow-reads.test.ts`
- [ ] **Step 6: Commit.** Message: `feat(mcp): one-row reads for Reminders, Checklist items, ideas and Votes`

---

### Task F.12: Three actions return the id of what they created

`createChapter`, `addChecklistItem` and `addMarkerToWishlist` return `{ success: true }` with no id, so their tools can't read the new row back. Each gains `id` on its success branch. This is additive and still an `ActionResult` (ADR 0074). App callers read only `.success`, so none change. (`addNote` gets the same change in F.17, the F2 task.)

**Files:**
- Modify: `server/actions/chapters.ts:64-103`: return type `Promise<ActionResult<{ id: string }>>`, `return { success: true, id: created.id };` at :102
- Modify: `server/actions/checklists.ts:85-147`: return type `Promise<ActionResult<{ id: string }>>`, `return { success: true, id: created.id };` at :146
- Modify: `server/actions/items.ts:260-325`: return type `Promise<ActionResult<{ id: string }>>`; `if (existing) return { success: true, id: existing.id };` at :287 and `return { success: true, id: created.id };` at :324
- Test: `server/actions/chapters.test.ts` (~:773), `server/actions/checklists.test.ts` (~:174), `server/actions/items.test.ts` (~:1960, plus a new idempotent case)

**Interfaces:**
- Produces: `createChapter(...)` → `ActionResult<{ id: string }>`; `addChecklistItem(...)` → `ActionResult<{ id: string }>`; `addMarkerToWishlist(...)` → `ActionResult<{ id: string }>`.

- [ ] **Step 1: Write the failing tests**

- `chapters.test.ts`, in "links a ROUGH origin stop" (~:773), after `expect(r.success).toBe(true);`: `expect(r).toEqual({ success: true, id: "ch-new" });`
- `checklists.test.ts`, at :180 replace `expect(result.success).toBe(true);` with `expect(result).toEqual({ success: true, id: "ci-1" });`
- `items.test.ts`, at ~:1968 replace `expect(res.success).toBe(true);` with `expect(res).toEqual({ success: true, id: "i1" });`. Add:

```ts
  it("returns the existing idea's id when the Marker is already in this trip's Wishlist", async () => {
    markerFindUniqueMock.mockResolvedValue(MARKER);
    itemFindFirstMock.mockResolvedValueOnce({ id: "already-1" });
    const res = await addMarkerToWishlist("m1", "t1");
    expect(res).toEqual({ success: true, id: "already-1" });
    expect(itemCreateMock).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run, expect FAIL.** `npx vitest run server/actions/chapters.test.ts server/actions/checklists.test.ts server/actions/items.test.ts`. Each new assertion fails: `id` is missing.
- [ ] **Step 3: Implement** the edits listed under Files.
- [ ] **Step 4: Run, expect PASS** (same command).
- [ ] **Step 5: Task-done check.** `npx vitest related --run server/actions/chapters.ts server/actions/checklists.ts server/actions/items.ts` + `npx tsc --noEmit` + `npx eslint server/actions/chapters.ts server/actions/checklists.ts server/actions/items.ts server/actions/chapters.test.ts server/actions/checklists.test.ts server/actions/items.test.ts`
- [ ] **Step 6: Commit.** Message: `feat(actions): createChapter, addChecklistItem and addMarkerToWishlist return the new id`

---

### Task F.13: Trip and Stop writes return the row (`trips-stops-write.ts`)

**Files:**
- Modify: `lib/mcp/tools/trips-stops-write.ts:151-388` (all 16 handlers) and its imports
- Modify: `lib/mcp/tools/trips-stops-write.test.ts` (mock the readers; update :196, :368, :504, :513; new `describe`)

**Interfaces:**
- Consumes: F.9 `runWrite`; F.4/F.5 `loadTripSummaryForMcp`, `loadStopForMcp`, `loadItemForMcp`; F.10 `stopTracker`, `conflictsOf`.

Site list (handler → result):

| Tool (line today) | Write | Reread |
|---|---|---|
| `create_trip` (:168) | `createTrip(input)` | `{ trip: await loadTripSummaryForMcp(done.tripId) }` |
| `update_trip` (:185) | `updateTrip(tripId, patch)` | `{ trip: await loadTripSummaryForMcp(tripId) }` |
| `set_hard_end_date` (:196) | `setTripHardEndDate(...)` | `{ trip: await loadTripSummaryForMcp(tripId) }` |
| `add_stop` (:207) | `requireTripAccess(tripId)`, then `stops.start(tripId)` after the input checks, then `createStop(...)` | `{ ...(await stops.stopAndShifted(done.id!)), ...conflictsOf(done) }` |
| `update_stop` (:224) | `requireRealPlanRow` → `stops.start(tripId)` → `updateStop` | `{ ...(await stops.stopAndShifted(stopId)), ...conflictsOf(done) }` |
| `delete_stop` (:240) | preview + delete as today, returning `{ success: true, preview }` | `{ deleted: stopId, preview: done.preview }` |
| `move_stop` (:258) | `requireRealPlanRow` → `stops.start` → `moveStop` | `await stops.stopAndShifted(stopId)` |
| `set_stop_nights` (:271) | `requireRealPlanRow` → `stops.start` → `setStopNights` | `{ ...(await stops.stopAndShifted(stopId)), ...conflictsOf(done) }` |
| `set_stop_dates` (:284) | `requireRealPlanRow` → `stops.start` → `setStopDates` | `{ ...(await stops.stopAndShifted(stopId)), ...conflictsOf(done) }` |
| `set_stop_pinned` (:298) | the toggle logic as today, returning `{ success: true }` | `{ stop: await loadStopForMcp(stopId) }` |
| `make_stop_rough` (:315) | `requireRealPlanRow` → `stops.start` → `makeStopRough` | `await stops.stopAndShifted(stopId)` |
| `set_stop_notes` (:328) | as today | `{ stop: await loadStopForMcp(stopId) }` |
| `firm_up_trip` (:342) | `requireTripAccess(tripId)` → `stops.start(tripId)` → `firmUpTrip(...)` | `{ stops: await stops.changed(), ...conflictsOf(done) }` |
| `assign_stop_to_chapter` (:352) | as today | `{ stop: await loadStopForMcp(stopId) }` |
| `set_surprise` (:371) | as today | `kind === "STOP" ? { stop: await loadStopForMcp(id) } : { item: await loadItemForMcp(id) }` |
| `reveal_surprise` (:384) | as today | same as set_surprise |

Representative before/after (`update_stop`):

```ts
// before
    ({ stopId, ...patch }) =>
      runTool("update_stop", async () => {
        await requireRealPlanRow("stop", stopId);
        return updateStop(stopId, patch);
      }),
// after
    ({ stopId, ...patch }) => {
      const stops = stopTracker();
      return runWrite(
        "update_stop",
        async () => {
          const { tripId } = await requireRealPlanRow("stop", stopId);
          await stops.start(tripId);
          return updateStop(stopId, patch);
        },
        async (done) => ({ ...(await stops.stopAndShifted(stopId)), ...conflictsOf(done) }),
      );
    },
```

`add_stop` keeps its `buildStopInput` refusal ahead of everything. A failure returns before any snapshot is taken:

```ts
    ({ tripId, afterStopId, ...rest }) => {
      const stops = stopTracker();
      return runWrite(
        "add_stop",
        async () => {
          const input = buildStopInput(rest);
          if (isFailure(input)) return input;
          await requireRealPlanRows([["stop", afterStopId]]);
          await requireTripAccess(tripId);
          await stops.start(tripId);
          return createStop(tripId, input, undefined, afterStopId ?? null);
        },
        async (done) => ({ ...(await stops.stopAndShifted(done.id!)), ...conflictsOf(done) }),
      );
    },
```

`set_stop_pinned`: `if (current === pinned) return { success: true as const };`. After a toggle, keep `if (!result.success) return result; return { success: true as const };`. Its description's "Returns the resulting state." becomes "Returns the Stop as it now stands." `delete_stop` keeps its tool description. Update the file header to say every write returns its row through `runWrite` (F6).

- [ ] **Step 1: Write the failing tests**

In `trips-stops-write.test.ts`, extend the hoisted block with `loadStopForMcp, loadItemForMcp, loadTripSummaryForMcp, stopAndShifted, trackerChanged, trackerStart`, then:

```ts
vi.mock("../reads/entities", () => ({ loadStopForMcp, loadItemForMcp, loadTripSummaryForMcp }));
vi.mock("../reads/stop-changes", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../reads/stop-changes")>()),
  stopTracker: () => ({ start: trackerStart, stopAndShifted, changed: trackerChanged }),
}));
```

In the top-level `beforeEach`:

```ts
    loadStopForMcp.mockImplementation(async (id: string) => ({ id, name: "Rome" }));
    loadItemForMcp.mockImplementation(async (id: string) => ({ id, title: "Dinner" }));
    loadTripSummaryForMcp.mockImplementation(async (id: string) => ({ id, name: "Japan" }));
    trackerStart.mockResolvedValue(undefined);
    stopAndShifted.mockImplementation(async (id: string) => ({ stop: { id }, shifted: [] }));
    trackerChanged.mockResolvedValue([{ id: STOP_ID }]);
```

Update the existing assertions:
- :196 → `toEqual({ trip: { id: "t1", name: "Japan" } })`
- :368 → also `expect(body.deleted).toBe(STOP_ID);`
- :504 and :513 → `toEqual({ stop: { id: STOP_ID, name: "Rome" } })`

Add:

```ts
describe("writes return the row (F6)", () => {
  const body = (r: { content: unknown }) => JSON.parse((r.content as { text: string }[])[0].text);

  it("set_stop_dates returns the Stop, the Stops it pushed and the action's conflicts, not { success }", async () => {
    stopFindUnique.mockResolvedValue({ tripId: TRIP_ID });
    setStopDates.mockResolvedValue({ success: true, conflicts: [{ stopId: "prev" }], changed: [{ id: "next" }], payload: { big: true } });
    stopAndShifted.mockResolvedValue({ stop: { id: STOP_ID }, shifted: [{ id: "next" }] });
    const c = await connectTestClient();
    const r = await c.callTool({ name: "set_stop_dates", arguments: { stopId: STOP_ID, arriveDate: "2027-06-01", departDate: "2027-06-04" } });
    expect(trackerStart).toHaveBeenCalledWith(TRIP_ID);
    expect(trackerStart.mock.invocationCallOrder[0]).toBeLessThan(setStopDates.mock.invocationCallOrder[0]);
    expect(body(r)).toEqual({ stop: { id: STOP_ID }, shifted: [{ id: "next" }], conflicts: [{ stopId: "prev" }] });
  });

  it("a refused write takes no snapshot and reads nothing back", async () => {
    stopFindUnique.mockResolvedValue(null);
    const c = await connectTestClient();
    const r = await c.callTool({ name: "update_stop", arguments: { stopId: "fork-stop", name: "X" } });
    expect(r.isError).toBe(true);
    expect(trackerStart).not.toHaveBeenCalled();
    expect(stopAndShifted).not.toHaveBeenCalled();
  });

  it("firm_up_trip returns every Stop it dated", async () => {
    requireTripAccess.mockResolvedValue({ user: { id: "u1" }, membership: {} });
    firmUpTrip.mockResolvedValue({ success: true, conflicts: [] });
    const c = await connectTestClient();
    expect(body(await c.callTool({ name: "firm_up_trip", arguments: { tripId: TRIP_ID } }))).toEqual({ stops: [{ id: STOP_ID }] });
  });

  it("set_surprise on an ITEM returns the Item as it now stands", async () => {
    itemFindUnique.mockResolvedValue({ tripId: TRIP_ID });
    setSurprise.mockResolvedValue({ success: true });
    const c = await connectTestClient();
    expect(body(await c.callTool({ name: "set_surprise", arguments: { kind: "ITEM", id: "item-1" } }))).toEqual({ item: { id: "item-1", title: "Dinner" } });
  });

  it("update_trip returns the Trip summary", async () => {
    updateTrip.mockResolvedValue({ success: true, slug: "japan" });
    const c = await connectTestClient();
    expect(body(await c.callTool({ name: "update_trip", arguments: { tripId: TRIP_ID, name: "Japan" } }))).toEqual({ trip: { id: TRIP_ID, name: "Japan" } });
  });
});
```

If the item fixture lacks the surprise columns, make `itemFindUnique` return whatever the file's existing set_surprise tests use, so the real `requireOutsideSurprise` passes.

- [ ] **Step 2: Run, expect FAIL.** `npx vitest run lib/mcp/tools/trips-stops-write.test.ts`. The new describe and the updated assertions fail, because the tools still return the action's fields.
- [ ] **Step 3: Implement** every row of the site table. Imports: `runWrite` (keep `runTool` only if something still uses it; nothing should), `stopTracker, conflictsOf` from `"../reads/stop-changes"`, and `loadStopForMcp, loadItemForMcp, loadTripSummaryForMcp` from `"../reads/entities"`.
- [ ] **Step 4: Run, expect PASS** (same command).
- [ ] **Step 5: Task-done check.** `npx vitest related --run lib/mcp/tools/trips-stops-write.ts` + `npx tsc --noEmit` + `npx eslint lib/mcp/tools/trips-stops-write.ts lib/mcp/tools/trips-stops-write.test.ts`
- [ ] **Step 6: Commit.** Message: `feat(mcp): Trip and Stop writes return the row as it now stands`

---

### Task F.14: Item, Wishlist, Vote, Day title and Chapter writes return the row (`plan-write.ts`)

`add_note` stays as it is here; F.17 changes it.

**Files:**
- Modify: `lib/mcp/tools/plan-write.ts:84-271` (12 handlers) and imports
- Modify: `lib/mcp/tools/plan-write.test.ts` (mock the readers; new `describe`)

**Interfaces:**
- Consumes: F.9 `runWrite`; F.4/F.5 `loadItemForMcp`, `loadStopForMcp`, `loadChapterForMcp`; F.11 `loadWishlistIdeaForMcp`, `loadVotesForMcp`; F.12 `createChapter`'s / `addMarkerToWishlist`'s `id`.

Site list:

| Tool (line today) | Reread |
|---|---|
| `add_thing_to_do` (:93) | `{ item: await loadItemForMcp(done.id) }` |
| `update_thing_to_do` (:108) | `{ item: await loadItemForMcp(itemId) }` |
| `delete_thing_to_do` (:126) | `{ deleted: itemId }` |
| `schedule_thing_to_do` (:140) | `{ item: await loadItemForMcp(done.placedItemId ?? itemId) }` |
| `unschedule_thing_to_do` (:155) | `done.mode === "placement-removed" ? { deleted: itemId, ideaId: done.sourceItemId } : { item: await loadItemForMcp(itemId) }` |
| `place_idea_at_stop` (:168) | `{ item: await loadItemForMcp(done.placedItemId ?? itemId) }` |
| `add_marker_to_wishlist` (:184) | `{ idea: await loadWishlistIdeaForMcp(done.id) }` |
| `set_vote` (:194) | `await loadVotesForMcp(itemId)` |
| `clear_vote` (:207) | `await loadVotesForMcp(itemId)` |
| `set_day_title` (:220) | `{ stopId, day: (await loadStopForMcp(stopId)).days.find((d) => d.date === date) ?? null }` |
| `add_chapter` (:250) | `{ chapter: await loadChapterForMcp(done.id) }` |
| `update_chapter` (:266) | `{ chapter: await loadChapterForMcp(chapterId) }` |

Representative before/after (`unschedule_thing_to_do`):

```ts
// before
    ({ itemId }) => runTool("unschedule_thing_to_do", async () => {
        await requireRealPlanRow("item", itemId);
        return unscheduleItem(itemId);
      }),
// after
    ({ itemId }) =>
      runWrite(
        "unschedule_thing_to_do",
        async () => {
          await requireRealPlanRow("item", itemId);
          return unscheduleItem(itemId);
        },
        async (done) =>
          done.mode === "placement-removed"
            ? { deleted: itemId, ideaId: done.sourceItemId ?? null }
            : { item: await loadItemForMcp(itemId) },
      ),
```

Each tool's write closure is today's `runTool` body, unchanged. Update the file header (F6).

- [ ] **Step 1: Write the failing tests**

In `plan-write.test.ts`, add hoisted `loadItemForMcp, loadStopForMcp, loadChapterForMcp, loadWishlistIdeaForMcp, loadVotesForMcp` and:

```ts
vi.mock("../reads/entities", () => ({ loadItemForMcp, loadStopForMcp, loadChapterForMcp }));
vi.mock("../reads/lists", () => ({ loadWishlistIdeaForMcp, loadVotesForMcp }));
```

In `beforeEach`:

```ts
    loadItemForMcp.mockImplementation(async (id: string) => ({ id }));
    loadChapterForMcp.mockImplementation(async (id: string) => ({ id }));
    loadWishlistIdeaForMcp.mockImplementation(async (id: string) => ({ id, votes: [] }));
    loadVotesForMcp.mockImplementation(async (itemId: string) => ({ itemId, votes: [] }));
    loadStopForMcp.mockResolvedValue({ id: "stop-1", days: [{ date: "2027-06-02", dayTitle: "Ribeira day", items: [] }] });
```

Existing tests that mock an action's success as a bare `{ success: true }` keep passing, because the readers above answer every id. Add:

```ts
describe("writes return the row (F6)", () => {
  const body = (r: { content: unknown }) => JSON.parse((r.content as { text: string }[])[0].text);

  it("add_thing_to_do returns the new Item through get_item", async () => {
    createItem.mockResolvedValue({ success: true, id: "new-1" });
    const c = await connectTestClient();
    expect(body(await c.callTool({ name: "add_thing_to_do", arguments: { tripId: "trip-1", title: "Castle", category: "SIGHTSEEING" } }))).toEqual({ item: { id: "new-1" } });
    expect(loadItemForMcp).toHaveBeenCalledWith("new-1");
  });

  it("schedule_thing_to_do returns the placed copy when an idea was copied onto the date", async () => {
    itemFindUnique.mockResolvedValue({ tripId: "trip-1" });
    scheduleItem.mockResolvedValue({ success: true, placedItemId: "placed-1" });
    const c = await connectTestClient();
    expect(body(await c.callTool({ name: "schedule_thing_to_do", arguments: { itemId: "idea-1", date: "2027-06-02" } }))).toEqual({ item: { id: "placed-1" } });
  });

  it.each([
    [{ success: true, mode: "placement-removed", sourceItemId: "idea-1" }, { deleted: "item-1", ideaId: "idea-1" }],
    [{ success: true, mode: "unslotted", sourceItemId: null }, { item: { id: "item-1" } }],
  ])("unschedule_thing_to_do returns %j as %j", async (result, expected) => {
    itemFindUnique.mockResolvedValue({ tripId: "trip-1" });
    unscheduleItem.mockResolvedValue(result);
    const c = await connectTestClient();
    expect(body(await c.callTool({ name: "unschedule_thing_to_do", arguments: { itemId: "item-1" } }))).toEqual(expected);
  });

  it("set_day_title returns that day of the Stop with its title", async () => {
    stopFindUnique.mockResolvedValue({ tripId: "trip-1" });
    setDayTitle.mockResolvedValue({ success: true });
    const c = await connectTestClient();
    expect(body(await c.callTool({ name: "set_day_title", arguments: { stopId: "stop-1", date: "2027-06-02", title: "Ribeira day" } }))).toEqual({
      stopId: "stop-1", day: { date: "2027-06-02", dayTitle: "Ribeira day", items: [] },
    });
  });

  it("set_vote returns the Votes on the Item; add_chapter the new Chapter; delete_thing_to_do { deleted }", async () => {
    itemFindUnique.mockResolvedValue({ tripId: "trip-1" });
    setVote.mockResolvedValue({ success: true });
    createChapter.mockResolvedValue({ success: true, id: "ch-1" });
    deleteItem.mockResolvedValue({ success: true });
    const c = await connectTestClient();
    expect(body(await c.callTool({ name: "set_vote", arguments: { tripId: "trip-1", itemId: "item-1", level: "KEEN" } }))).toEqual({ itemId: "item-1", votes: [] });
    expect(body(await c.callTool({ name: "add_chapter", arguments: { tripId: "trip-1", name: "Italy", colour: "rose" } }))).toEqual({ chapter: { id: "ch-1" } });
    expect(body(await c.callTool({ name: "delete_thing_to_do", arguments: { itemId: "item-1" } }))).toEqual({ deleted: "item-1" });
  });
});
```

- [ ] **Step 2: Run, expect FAIL.** `npx vitest run lib/mcp/tools/plan-write.test.ts`. The new describe fails.
- [ ] **Step 3: Implement** every row of the site table.
- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Task-done check.** `npx vitest related --run lib/mcp/tools/plan-write.ts` + `npx tsc --noEmit` + `npx eslint lib/mcp/tools/plan-write.ts lib/mcp/tools/plan-write.test.ts`
- [ ] **Step 6: Commit.** Message: `feat(mcp): Item, idea, Vote, Day title and Chapter writes return the row`

---

### Task F.15: Accommodation, Transport and Cost writes return the row (`bookings-write.ts`)

**Files:**
- Modify: `lib/mcp/tools/bookings-write.ts:243-443` (11 handlers) and imports
- Modify: `lib/mcp/tools/bookings-write.test.ts` (mock the readers; new `describe`)

**Interfaces:**
- Consumes: F.9 `runWrite`; F.4 `loadAccommodationForMcp`, `loadTransportForMcp`; F.3 `loadCostForMcp`.

Site list:

| Tool (line today) | Reread |
|---|---|
| `add_accommodation` (:252) | `{ accommodation: await loadAccommodationForMcp(done.id) }` |
| `update_accommodation` (:268) | `{ accommodation: await loadAccommodationForMcp(accommodationId) }` |
| `delete_accommodation` (:285) | `{ deleted: accommodationId }` |
| `add_transport` (:303) | `{ transport: await loadTransportForMcp(done.id) }` |
| `update_transport` (:333) | `{ transport: await loadTransportForMcp(transportId) }` |
| `delete_transport` (:359) | `{ deleted: transportId }` |
| `add_cost` (:375) | `{ cost: await loadCostForMcp(done.cost!.id) }` (`createCost` always returns `cost` on success, server/actions/costs.ts:178) |
| `update_cost` (:392) | `{ cost: await loadCostForMcp(costId) }` |
| `delete_cost` (:411) | `{ deleted: costId }` |
| `mark_cost_paid` (:425) | `{ cost: await loadCostForMcp(costId) }` |
| `mark_cost_unpaid` (:439) | `{ cost: await loadCostForMcp(costId) }` |

The early-return refusals (`homeContradictionError`, the "Departure needs a stop or a place" checks, `withUpdateCostGuidance`) stay inside the write closure. They return `success: false`, so `runWrite` maps them and reads nothing back. Update the file header (F6).

- [ ] **Step 1: Write the failing tests**

Add hoisted `loadAccommodationForMcp, loadTransportForMcp, loadCostForMcp`, then `vi.mock("../reads/entities", () => ({ loadAccommodationForMcp, loadTransportForMcp }))` and `vi.mock("../reads/costs", () => ({ loadCostForMcp }))`. Each defaults to `async (id) => ({ id })` in `beforeEach`. Add:

```ts
describe("writes return the row (F6)", () => {
  const body = (r: { content: unknown }) => JSON.parse((r.content as { text: string }[])[0].text);

  it("add_transport returns the new leg through get_transport", async () => {
    createTransport.mockResolvedValue({ success: true, id: "tr-new" });
    const c = await connectTestClient();
    const r = await c.callTool({ name: "add_transport", arguments: { tripId: "trip-1", mode: "TRAIN", depAt: "2027-06-04T09:00", arrAt: "2027-06-04T12:00" } });
    expect(body(r)).toEqual({ transport: { id: "tr-new" } });
  });

  it("add_cost returns the new Cost in list_costs' shape", async () => {
    createCost.mockResolvedValue({ success: true, cost: { id: "cost-new" } });
    const c = await connectTestClient();
    const r = await c.callTool({ name: "add_cost", arguments: { tripId: "trip-1", costMinor: 1000, currency: "AUD", ownerType: "OTHER", label: "Insurance" } });
    expect(body(r)).toEqual({ cost: { id: "cost-new" } });
  });

  it("a refusal before the action reads nothing back", async () => {
    const c = await connectTestClient();
    const r = await c.callTool({ name: "add_transport", arguments: { tripId: "trip-1", mode: "TRAIN", depIsHome: true, depPlace: "Central", depAt: "2027-06-04T09:00", arrAt: "2027-06-04T12:00" } });
    expect(r.isError).toBe(true);
    expect(loadTransportForMcp).not.toHaveBeenCalled();
  });
});
```

For the real-plan check to pass, prime the file's existing row mocks: `transportFindUnique` / `accommodationFindUnique` / `costFindUnique` `mockResolvedValue({ tripId: "trip-1" })`. Then extend the table pattern to `update_accommodation` → `{ accommodation: { id: "acc-1" } }`, `delete_accommodation` → `{ deleted: "acc-1" }` and `mark_cost_paid` → `{ cost: { id: "cost-1" } }`.

- [ ] **Step 2: Run, expect FAIL.** `npx vitest run lib/mcp/tools/bookings-write.test.ts`
- [ ] **Step 3: Implement** every row of the site table.
- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Task-done check.** `npx vitest related --run lib/mcp/tools/bookings-write.ts` + `npx tsc --noEmit` + `npx eslint lib/mcp/tools/bookings-write.ts lib/mcp/tools/bookings-write.test.ts`
- [ ] **Step 6: Commit.** Message: `feat(mcp): Accommodation, Transport and Cost writes return the row`

---

### Task F.16: Reminder, Checklist, template and Make it fit writes return the row

**Files:**
- Modify: `lib/mcp/tools/lists-write.ts:83-256` (12 handlers; `leave_feedback` :261-290 is unchanged) and imports
- Modify: `lib/mcp/tools/make-it-fit.ts:173-187` (`make_it_fit_apply`) and imports
- Modify: `lib/mcp/tools/lists-write.test.ts` (mock the readers; update :333; new `describe`), `lib/mcp/tools/make-it-fit.test.ts` (mock the tracker; new cases)

**Interfaces:**
- Consumes: F.9 `runWrite`; F.11 `readReminderItem`, `loadChecklistItemForMcp`, `loadChecklistOfItemForMcp`, `readChecklist`; F.12 `addChecklistItem`'s `id`; F.10 `stopTracker`; `listTemplates` (`server/actions/checklists`, which tools may import).

Site list (lists-write.ts):

| Tool (line today) | Reread |
|---|---|
| `add_reminder` (:101) | `{ reminder: await readReminderItem(done.id!) }` (`addReminder` returns `id` on success, server/actions/reminders.ts:125) |
| `update_reminder` (:120) | `{ reminder: await readReminderItem(reminderId) }` |
| `delete_reminder` (:135) | `{ deleted: reminderId }` |
| `add_checklist_item` (:155) | `{ checklistItem: await loadChecklistItemForMcp(done.id) }` |
| `add_shopping_item` (:166) | `{ checklistItem: await loadChecklistItemForMcp(done.id) }` |
| `update_checklist_item` (:181) | `{ checklistItem: await loadChecklistItemForMcp(itemId) }` |
| `tick_checklist_item` (:197) | `{ checklistItem: await loadChecklistItemForMcp(itemId) }` |
| `set_need_to_buy` (:208) | `{ checklistItem: await loadChecklistItemForMcp(itemId) }` |
| `move_checklist_item` (:218) | `await loadChecklistOfItemForMcp(itemId)` → `{ kind, items }` |
| `delete_checklist_item` (:229) | `{ deleted: itemId }` |
| `save_packing_template` (:243) | `{ template: (await listTemplates()).find((t) => t.id === done.templateId) ?? { id: done.templateId, name } }` |
| `apply_packing_template` (:254) | the write first runs `await requireTripAccess(tripId); before = new Set((await readChecklist(tripId, "PACKING")).map((i) => i.id));`, then `applyTemplate`. Reread: `{ added: (await readChecklist(tripId, "PACKING")).filter((i) => !before.has(i.id)) }` |

`add_reminder` / `update_reminder`: keep exactly the input handling section E left, real-plan checks included. Only `runTool(name, async () => {…})` becomes `runWrite(name, async () => {…}, reread)`. `listTemplates` is already imported by `reads.ts`. Add it to this file's `@/server/actions/checklists` import.

make-it-fit.ts, `make_it_fit_apply`:

```ts
    ({ tripId, trims, dropStopId }) => {
      const stops = stopTracker();
      return runWrite(
        "make_it_fit_apply",
        async () => {
          await requireTripAccess(tripId);
          await stops.start(tripId);
          return applyMakeItFit(tripId, trims, dropStopId);
        },
        async () => (dropStopId !== undefined ? { deleted: dropStopId } : { stops: await stops.changed() }),
      );
    },
```

`applyMakeItFit`'s "exactly one" refusal happens after the snapshot now. That is harmless: the snapshot is a read, and the refusal returns `success: false`. Keep the refusal where it is so the existing tests' call-order assertions hold. Update the header paragraph on what `make_it_fit_apply` returns.

- [ ] **Step 1: Write the failing tests**

`lists-write.test.ts`: add hoisted `readReminderItem, loadChecklistItemForMcp, loadChecklistOfItemForMcp, readChecklist, listTemplates`, then `vi.mock("@/lib/reminder-reads", () => ({ readReminderItem, listRemindersForTrip: vi.fn() }))` and `vi.mock("../reads/lists", () => ({ loadChecklistItemForMcp, loadChecklistOfItemForMcp, readChecklist }))`. Add `listTemplates` to the existing `@/server/actions/checklists` factory. The defaults are `async (id) => ({ id })`, `readChecklist.mockResolvedValue([])` and `listTemplates.mockResolvedValue([{ id: "tpl-1", name: "Europe winter", itemCount: 3 }])`. Update :333 to `toEqual({ template: { id: "tpl-1", name: "Europe winter", itemCount: 3 } })`. Add:

```ts
describe("writes return the row (F6)", () => {
  const body = (r: { content: unknown }) => JSON.parse((r.content as { text: string }[])[0].text);

  it("add_reminder returns the Reminder in get_reminders' shape", async () => {
    addReminder.mockResolvedValue({ success: true, id: "rem-1" });
    const c = await connectTestClient();
    expect(body(await c.callTool({ name: "add_reminder", arguments: { tripId: TRIP_ID, title: "Print tickets", date: "2027-05-30" } }))).toEqual({ reminder: { id: "rem-1" } });
  });

  it("add_shopping_item returns the new Checklist item", async () => {
    addChecklistItem.mockResolvedValue({ success: true, id: "ci-new" });
    const c = await connectTestClient();
    expect(body(await c.callTool({ name: "add_shopping_item", arguments: { tripId: TRIP_ID, text: "Snacks" } }))).toEqual({ checklistItem: { id: "ci-new" } });
  });

  it("move_checklist_item returns the whole list in its new order", async () => {
    reorderChecklistItem.mockResolvedValue({ success: true });
    loadChecklistOfItemForMcp.mockResolvedValue({ kind: "PACKING", items: [{ id: "b" }, { id: "ci-1" }] });
    const c = await connectTestClient();
    expect(body(await c.callTool({ name: "move_checklist_item", arguments: { itemId: "ci-1", direction: "down" } }))).toEqual({ kind: "PACKING", items: [{ id: "b" }, { id: "ci-1" }] });
  });

  it("apply_packing_template returns only the rows it added", async () => {
    requireTripAccess.mockResolvedValue({ user: { id: "u1" }, membership: {} });
    readChecklist.mockResolvedValueOnce([{ id: "old" }]).mockResolvedValueOnce([{ id: "old" }, { id: "new-1" }]);
    applyTemplate.mockResolvedValue({ success: true });
    const c = await connectTestClient();
    expect(body(await c.callTool({ name: "apply_packing_template", arguments: { tripId: TRIP_ID, templateId: "tpl-1" } }))).toEqual({ added: [{ id: "new-1" }] });
  });

  it("delete_reminder returns { deleted }", async () => {
    deleteReminder.mockResolvedValue({ success: true });
    const c = await connectTestClient();
    expect(body(await c.callTool({ name: "delete_reminder", arguments: { reminderId: "rem-1" } }))).toEqual({ deleted: "rem-1" });
  });
});
```

If `requireTripAccess` is not in this file's hoisted guards mock yet, add it, since `leave_feedback` already uses it.

`make-it-fit.test.ts`: add hoisted `trackerChanged`, then `vi.mock("../reads/stop-changes", () => ({ stopTracker: () => ({ start: vi.fn(async () => {}), stopAndShifted: vi.fn(), changed: trackerChanged }) }))`. Add:

```ts
    it("trims return every Stop they changed; a drop returns { deleted }", async () => {
      stopFindMany.mockResolvedValue([fitStop({ id: "stop-1" })]);
      setStopNights.mockResolvedValue({ success: true });
      deleteStop.mockResolvedValue({ success: true });
      trackerChanged.mockResolvedValue([{ id: "stop-1", nights: 2 }]);
      const c = await connectTestClient();
      const trim = await c.callTool({ name: "make_it_fit_apply", arguments: { tripId: TRIP_ID, trims: [{ stopId: "stop-1", nights: 2 }] } });
      expect(JSON.parse((trim.content as { text: string }[])[0].text)).toEqual({ stops: [{ id: "stop-1", nights: 2 }] });
      const drop = await c.callTool({ name: "make_it_fit_apply", arguments: { tripId: TRIP_ID, dropStopId: "stop-1" } });
      expect(JSON.parse((drop.content as { text: string }[])[0].text)).toEqual({ deleted: "stop-1" });
    });
```

Update any existing make-it-fit assertion that parsed `{ applied: [...] }`, ~:120 onwards, to the `{ stops }` shape.

- [ ] **Step 2: Run, expect FAIL.** `npx vitest run lib/mcp/tools/lists-write.test.ts lib/mcp/tools/make-it-fit.test.ts`
- [ ] **Step 3: Implement** every row of the site tables.
- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Task-done check.** `npx vitest related --run lib/mcp/tools/lists-write.ts lib/mcp/tools/make-it-fit.ts` + `npx tsc --noEmit` + `npx eslint lib/mcp/tools/lists-write.ts lib/mcp/tools/lists-write.test.ts lib/mcp/tools/make-it-fit.ts lib/mcp/tools/make-it-fit.test.ts`
- [ ] **Step 6: Commit.** Message: `feat(mcp): Reminder, Checklist, template and Make it fit writes return the row`

---

### Task F.17: `delete_note`; `add_note` returns the Note; the two kinds of notes, spelled out (F2)

**Files:**
- Modify: `server/actions/notes.ts:63-95`: return type `Promise<ActionResult<{ id: string }>>`, `return { success: true, id: created.id };` at :94
- Modify: `server/actions/notes.test.ts:128-132` (assert the id)
- Modify: `lib/mcp/tools/plan-write.ts:226-234` (`add_note`), plus the new `delete_note` after it; `itemCreateShape` / `itemPatchShape` `notes` (:67, :81) get `.describe(...)`; `update_thing_to_do`'s description (:104-105); file header; imports (`deleteNote`, `loadNoteForMcp`)
- Modify: `lib/mcp/tools/reads.ts:267-276` (`get_notes` description)
- Modify: `lib/mcp/server.ts:22` (`MCP_INSTRUCTIONS`, the Note sentence)
- Modify: `lib/mcp/tools/plan-write.test.ts` (`deleteNote` in the notes mock; registered-tools list ~:142-161; :303-311; new `describe`)

**Interfaces:**
- Consumes: F.2 `loadNoteForMcp`; F.9 `runWrite`; `deleteNote(noteId)` (`server/actions/notes.ts:103`, any Traveller on the Trip may delete).
- Produces: tool `delete_note({ noteId })` → `{ deleted: noteId }`; `add_note` → `{ note: McpNote }`; `addNote(...)` → `ActionResult<{ id: string }>`.

- [ ] **Step 1: Write the failing tests**

`server/actions/notes.test.ts:131-132`: `expect(result).toEqual({ success: true, id: "note-1" });`.

`plan-write.test.ts`: add `deleteNote` to the hoisted block and the notes mock, `vi.mock("@/server/actions/notes", () => ({ addNote, deleteNote }))`, and add `loadNoteForMcp` (hoisted) with `vi.mock("../reads/notes", () => ({ loadNoteForMcp }))`. Add `"delete_note"` to the registered-tools list at ~:158. Replace the `add_note` test at :303:

```ts
  it("add_note returns the new Note: id, body and what it is on", async () => {
    addNote.mockResolvedValue({ success: true, id: "note-1" });
    loadNoteForMcp.mockResolvedValue({ id: "note-1", targetType: "ITEM", targetId: "item-1", body: "Book ahead", author: "Cam", createdAt: "2026-10-16T09:00:00.000Z" });
    const c = await connectTestClient();
    const r = await c.callTool({ name: "add_note", arguments: { tripId: "trip-1", targetType: "ITEM", targetId: "item-1", body: "Book ahead" } });
    expect(addNote).toHaveBeenCalledWith("trip-1", { targetType: "ITEM", targetId: "item-1", body: "Book ahead" });
    expect(loadNoteForMcp).toHaveBeenCalledWith("note-1");
    expect(JSON.parse((r.content as { text: string }[])[0].text)).toEqual({
      note: { id: "note-1", targetType: "ITEM", targetId: "item-1", body: "Book ahead", author: "Cam", createdAt: "2026-10-16T09:00:00.000Z" },
    });
  });

  describe("delete_note (F2)", () => {
    it("calls deleteNote and returns { deleted }", async () => {
      deleteNote.mockResolvedValue({ success: true });
      const c = await connectTestClient();
      const r = await c.callTool({ name: "delete_note", arguments: { noteId: "note-1" } });
      expect(deleteNote).toHaveBeenCalledWith("note-1");
      expect(JSON.parse((r.content as { text: string }[])[0].text)).toEqual({ deleted: "note-1" });
    });

    it("a Note the caller can't reach (not on their Trip, inside a Surprise hidden from them) is NOT_FOUND_TEXT", async () => {
      deleteNote.mockRejectedValue(Object.assign(new Error("nf"), { digest: "NEXT_HTTP_ERROR_FALLBACK;404" }));
      const c = await connectTestClient();
      const r = await c.callTool({ name: "delete_note", arguments: { noteId: "note-x" } });
      expect(r.isError).toBe(true);
      expect((r.content as { text: string }[])[0].text).toBe(NOT_FOUND_TEXT);
    });

    it("is destructive and asks Claude to confirm first, like the other delete tools", async () => {
      const c = await connectTestClient();
      const { tools } = await c.listTools();
      const t = tools.find((x) => x.name === "delete_note")!;
      expect(t.annotations?.destructiveHint).toBe(true);
      expect(t.description).toMatch(/This cannot be undone\. Confirm with the person before calling this\./);
    });
  });

  it("the Note tools and update_thing_to_do tell a Note from an Item's own notes", async () => {
    const c = await connectTestClient();
    const { tools } = await c.listTools();
    const d = (n: string) => tools.find((t) => t.name === n)!.description!;
    for (const name of ["add_note", "get_notes", "delete_note"]) {
      expect(d(name), name).toMatch(/never edited/i);
      expect(d(name), name).toMatch(/update_thing_to_do/);
    }
    expect(d("update_thing_to_do")).toMatch(/add_note/);
    expect(d("update_thing_to_do")).toMatch(/not a Note/i);
    const notesField = (tools.find((t) => t.name === "update_thing_to_do")!.inputSchema as { properties: Record<string, { description?: string }> }).properties.notes;
    expect(notesField.description).toMatch(/add_note/);
  });
```

Import `NOT_FOUND_TEXT` from `"../run-tool"`. `get_notes` is registered by `reads.ts`; `connectTestClient` builds every tool, so `listTools` sees it.

- [ ] **Step 2: Run, expect FAIL.** `npx vitest run lib/mcp/tools/plan-write.test.ts server/actions/notes.test.ts`
- [ ] **Step 3: Implement**

`server/actions/notes.ts`: the `addNote` return type and its success return as listed under Files. `deleteNote` is unchanged.

`plan-write.ts`, the `notes` field in both item shapes:

```ts
const ITEM_NOTES_DESCRIPTION =
  "The Item's own notes: its description, part of the Item, edited here. Not a Note — a Note is a comment a Traveller leaves on it, added with add_note.";
// itemCreateShape.notes: z.string().optional().describe(ITEM_NOTES_DESCRIPTION),
// itemPatchShape.notes:  z.string().optional().describe(ITEM_NOTES_DESCRIPTION),
```

`update_thing_to_do` description:

```ts
        "Changes only the fields you pass; fields you omit keep their current value. Location comes from address, not from lat/lng. " +
        "notes is the Item's own notes, its description, and is edited here. That is not a Note: a Note is a separate comment a Traveller left on the Item (see get_item's notesOnItem or get_notes). A Note is never edited. Remove it with delete_note and, if it still needs saying, add it again with add_note.",
```

`add_note` and the new `delete_note`:

```ts
  server.registerTool(
    "add_note",
    {
      title: "Add note",
      description:
        "Adds a Note: a short comment to the other Traveller on the Trip, a Stop, a thing to do, a Transport leg or an Accommodation. A Note is said, not drafted. It is never edited. To change one, delete it with delete_note and add it again. Returns the new Note with its id. Not for changing what a thing to do says about itself: that is the Item's own notes, its description, edited with update_thing_to_do.",
      inputSchema: { tripId: z.string(), targetType: targetTypeSchema, targetId: z.string(), body: z.string() },
    },
    ({ tripId, targetType, targetId, body }) =>
      runWrite(
        "add_note",
        () => addNote(tripId, { targetType, targetId, body }),
        async (done) => ({ note: await loadNoteForMcp(done.id) }),
      ),
  );

  server.registerTool(
    "delete_note",
    {
      title: "Delete note",
      description:
        "Permanently deletes a Note (a comment between the Travellers, from get_notes or get_item's notesOnItem). Any Traveller on the Trip may delete any Note. A Note is never edited: to correct one, delete it and add the corrected one with add_note. An Item's own notes are its description, edited with update_thing_to_do, not deleted here. This cannot be undone. Confirm with the person before calling this.",
      inputSchema: { noteId: z.string() },
      annotations: { destructiveHint: true },
    },
    ({ noteId }) => runWrite("delete_note", () => deleteNote(noteId), async () => ({ deleted: noteId })),
  );
```

`reads.ts`, the `get_notes` description:

```ts
      description:
        "Reads the Notes on this trip: comments the Travellers left on the Trip, its Stops, things to do, Transport and Accommodation, each with its id, what it is on (targetType, targetId), who wrote it and when. A Note is never edited: remove one with delete_note and add it again with add_note. A thing to do's own notes (its description) are not Notes. They are read with get_item or get_trip_plan and changed with update_thing_to_do.",
```

`server.ts:22`, in the Note sentence of `MCP_INSTRUCTIONS`, replace "A Note is a free-text comment between the Travellers." with:

```
A Note is a free-text comment between the Travellers, left on a thing; it is never edited, only deleted (delete_note) and said again (add_note). It is not a thing to do's own notes, which are part of the Item and edited with update_thing_to_do.
```

Keep the rest of that sentence ("Never put a schedule in a Note, …"). Update the `plan-write.ts` file header's Notes line: "Notes: add (returns the Note) and delete; never edited (CONTEXT.md Note)".

- [ ] **Step 4: Run, expect PASS.** `npx vitest run lib/mcp/tools/plan-write.test.ts server/actions/notes.test.ts lib/mcp/tools/reads.test.ts lib/mcp/prompts.test.ts`. The last checks that nothing pins the old instructions text. If a test pins it, update that test's expected text.
- [ ] **Step 5: Task-done check.** `npx vitest related --run server/actions/notes.ts lib/mcp/tools/plan-write.ts lib/mcp/tools/reads.ts lib/mcp/server.ts` + `npx tsc --noEmit` + `npx eslint server/actions/notes.ts server/actions/notes.test.ts lib/mcp/tools/plan-write.ts lib/mcp/tools/plan-write.test.ts lib/mcp/tools/reads.ts lib/mcp/server.ts`
- [ ] **Step 6: Commit.** Message:
  ```
  feat(mcp): delete_note, add_note returns the Note, Notes vs an Item's notes

  Resolves-Feedback: cmvaecnl8000307l3wutowp1t
  ```

---

### Task F.18: No write tool returns `{}` — the walker test, and Claude is told

**Files:**
- Create: `lib/mcp/tools/write-returns.test.ts`
- Modify: `lib/mcp/server.ts:16-30` (`MCP_INSTRUCTIONS`: one sentence on write results and narrow reads)

**Interfaces:**
- Consumes: every write tool after F.13–F.17; `connectTestClient` (`lib/mcp/test-client.ts`).
- Produces: the guard every future write tool must pass.

- [ ] **Step 1: Write the test**

`lib/mcp/tools/write-returns.test.ts`:

```ts
/**
 * Spec 2026-10-16 F6: every MCP write tool returns the row as it now stands
 * (or `{ deleted }`), never `{}`. This walks every registered tool without
 * `readOnlyHint`, calls it once with valid arguments while every action
 * succeeds, and fails if one comes back empty. A new write tool must be added
 * to ARGS, or the first test fails.
 */
import { describe, expect, it, vi } from "vitest";

const { ok, row } = vi.hoisted(() => {
  const OK = {
    success: true, id: "new-1", placedItemId: "placed-1", cost: { id: "cost-1" }, tripId: "trip-1", href: "/trips/trip-1",
    templateId: "tpl-1", mode: "unslotted", sourceItemId: null, conflicts: [],
    preview: { accommodations: [], unpaidCosts: [], attachmentCount: 0, noteCount: 0 },
    note: { id: "fb-1", status: "OPEN" },
  };
  return {
    ok: () => vi.fn(async () => OK),
    row: () => vi.fn(async (id: string) => ({ id })),
  };
});

vi.mock("@/server/actions/trips", () => ({ createTrip: ok(), updateTrip: ok(), setTripHardEndDate: ok() }));
vi.mock("@/server/actions/stops", () => ({
  createStop: ok(), updateStop: ok(), deleteStop: ok(), previewStopDeletion: ok(), moveStop: ok(), setStopDates: ok(),
  firmUpTrip: ok(), toggleStopPin: ok(), makeStopRough: ok(), setStopNotes: ok(), setStopNights: ok(),
}));
vi.mock("@/server/actions/chapters", () => ({ assignStopToChapter: ok(), createChapter: ok(), updateChapter: ok() }));
vi.mock("@/server/actions/surprise", () => ({ setSurprise: ok(), revealSurprise: ok() }));
vi.mock("@/server/actions/items", () => ({
  createItem: ok(), updateItem: ok(), deleteItem: ok(), scheduleItem: ok(), unscheduleItem: ok(),
  placeIdeaAtStop: ok(), addMarkerToWishlist: ok(),
}));
vi.mock("@/server/actions/votes", () => ({ setVote: ok(), clearVote: ok() }));
vi.mock("@/server/actions/day-titles", () => ({ setDayTitle: ok() }));
vi.mock("@/server/actions/notes", () => ({ addNote: ok(), deleteNote: ok() }));
vi.mock("@/server/actions/accommodation", () => ({ createAccommodation: ok(), updateAccommodation: ok(), deleteAccommodation: ok() }));
vi.mock("@/server/actions/transport", () => ({ createTransport: ok(), updateTransport: ok(), deleteTransport: ok() }));
vi.mock("@/server/actions/costs", () => ({ createCost: ok(), updateCost: ok(), deleteCost: ok(), markCostPaid: ok(), markCostUnpaid: ok() }));
vi.mock("@/server/actions/reminders", () => ({ addReminder: ok(), updateReminder: ok(), deleteReminder: ok() }));
vi.mock("@/server/actions/checklists", () => ({
  addChecklistItem: ok(), updateChecklistItem: ok(), toggleChecklistItem: ok(), setBuyState: ok(), deleteChecklistItem: ok(),
  reorderChecklistItem: ok(), saveAsTemplate: ok(), applyTemplate: ok(),
  listTemplates: vi.fn(async () => [{ id: "tpl-1", name: "Beach", itemCount: 3 }]),
}));
vi.mock("@/server/actions/feedback", () => ({ createFeedbackNote: ok() }));

// Readers: each answers with a row naming the id it was asked for.
vi.mock("../reads/entities", () => ({
  loadStopForMcp: row(), loadItemForMcp: row(), loadTransportForMcp: row(), loadAccommodationForMcp: row(),
  loadChapterForMcp: row(), loadTripSummaryForMcp: row(),
  readMcpStops: vi.fn(async (_t: string, ids: string[]) => ids.map((id) => ({ id }))),
}));
vi.mock("../reads/stop-changes", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../reads/stop-changes")>()),
  stopTracker: () => ({
    start: vi.fn(async () => {}),
    stopAndShifted: vi.fn(async (id: string) => ({ stop: { id }, shifted: [] })),
    changed: vi.fn(async () => [{ id: "stop-1" }]),
  }),
}));
vi.mock("../reads/notes", () => ({ loadNoteForMcp: row(), loadNotesForMcp: vi.fn() }));
vi.mock("../reads/costs", () => ({ loadCostForMcp: row(), loadCostsForMcp: vi.fn() }));
vi.mock("../reads/lists", () => ({
  loadChecklistItemForMcp: row(),
  loadChecklistOfItemForMcp: vi.fn(async () => ({ kind: "PACKING", items: [{ id: "ci-1" }] })),
  readChecklist: vi.fn(async () => [{ id: "ci-1" }]),
  loadWishlistIdeaForMcp: row(),
  loadVotesForMcp: vi.fn(async (itemId: string) => ({ itemId, votes: [] })),
}));
vi.mock("@/lib/reminder-reads", () => ({ readReminderItem: row(), listRemindersForTrip: vi.fn() }));

// Access: every id is a real-plan row on trip-1 the caller can reach.
vi.mock("../real-plan", () => ({
  requireRealPlanRow: vi.fn(async () => ({ tripId: "trip-1" })),
  requireRealPlanRows: vi.fn(async () => {}),
}));
vi.mock("@/lib/guards", () => ({
  requireUser: vi.fn(async () => ({ id: "u1" })),
  requireTripAccess: vi.fn(async () => ({ user: { id: "u1" }, membership: { role: "owner" } })),
  requireRowAccess: vi.fn(async () => ({ row: { tripId: "trip-1", ownerType: "OTHER", ownerId: null }, user: { id: "u1" } })),
  isTripOwnerOrAdmin: vi.fn(() => true),
}));
vi.mock("@/lib/surprise-guard", () => ({ requireOutsideSurprise: vi.fn(async () => null) }));
vi.mock("@/lib/db", () => ({
  db: {
    stop: {
      findUnique: vi.fn(async () => ({ tripId: "trip-1", pinned: false })),
      findMany: vi.fn(async () => [{ id: "stop-1", name: "Rome", arriveDate: null, departDate: null, nights: 3, pinned: false, sortOrder: 0 }]),
    },
    cost: { findUnique: vi.fn(async () => ({ tripId: "trip-1" })) },
    trip: { findUnique: vi.fn(async () => ({ name: "Japan", startDate: null })) },
  },
}));
vi.mock("@/lib/error-sink", () => ({ reportError: vi.fn() }));

import { connectTestClient } from "../test-client";

/** One valid call per write tool. */
const ARGS: Record<string, Record<string, unknown>> = {
  create_trip: { name: "Japan", homeCurrency: "AUD" },
  update_trip: { tripId: "trip-1", name: "Japan" },
  set_hard_end_date: { tripId: "trip-1", hardEndDate: null },
  add_stop: { tripId: "trip-1", name: "Rome", countryCode: "it", nights: 2 },
  update_stop: { stopId: "stop-1", name: "Roma" },
  delete_stop: { stopId: "stop-1" },
  move_stop: { stopId: "stop-1", direction: "down" },
  set_stop_nights: { stopId: "stop-1", nights: 3 },
  set_stop_dates: { stopId: "stop-1", arriveDate: "2027-06-01", departDate: "2027-06-04" },
  set_stop_pinned: { stopId: "stop-1", pinned: true },
  make_stop_rough: { stopId: "stop-1" },
  set_stop_notes: { stopId: "stop-1", notes: "Ferry at 9" },
  firm_up_trip: { tripId: "trip-1" },
  assign_stop_to_chapter: { stopId: "stop-1", chapterId: null },
  set_surprise: { kind: "STOP", id: "stop-1" },
  reveal_surprise: { kind: "ITEM", id: "item-1" },
  add_thing_to_do: { tripId: "trip-1", title: "Colosseum", category: "SIGHTSEEING" },
  update_thing_to_do: { itemId: "item-1", title: "Forum" },
  delete_thing_to_do: { itemId: "item-1" },
  schedule_thing_to_do: { itemId: "item-1", date: "2027-06-02" },
  unschedule_thing_to_do: { itemId: "item-1" },
  place_idea_at_stop: { itemId: "item-1", stopId: "stop-1" },
  add_marker_to_wishlist: { markerId: "marker-1", tripId: "trip-1" },
  set_vote: { tripId: "trip-1", itemId: "item-1", level: "KEEN" },
  clear_vote: { tripId: "trip-1", itemId: "item-1" },
  set_day_title: { stopId: "stop-1", date: "2027-06-02", title: "Ribeira day" },
  add_note: { tripId: "trip-1", targetType: "ITEM", targetId: "item-1", body: "Book ahead" },
  delete_note: { noteId: "note-1" },
  add_chapter: { tripId: "trip-1", name: "Italy", colour: "rose" },
  update_chapter: { chapterId: "chapter-1", name: "Italia" },
  add_accommodation: { stopId: "stop-1", name: "Hotel", checkIn: "2027-06-01", checkOut: "2027-06-04" },
  update_accommodation: { accommodationId: "acc-1", name: "Hotel B" },
  delete_accommodation: { accommodationId: "acc-1" },
  add_transport: { tripId: "trip-1", mode: "TRAIN", fromStopId: "stop-1", toStopId: "stop-2", depAt: "2027-06-04T09:00", arrAt: "2027-06-04T12:00" },
  update_transport: { transportId: "tr-1", reference: "ICE 512" },
  delete_transport: { transportId: "tr-1" },
  add_cost: { tripId: "trip-1", costMinor: 1000, currency: "AUD", ownerType: "OTHER", label: "Insurance" },
  update_cost: { costId: "cost-1", label: "Travel insurance" },
  delete_cost: { costId: "cost-1" },
  mark_cost_paid: { costId: "cost-1", paidMinor: 1000, paidAt: "2027-05-01" },
  mark_cost_unpaid: { costId: "cost-1" },
  add_reminder: { tripId: "trip-1", title: "Print tickets", date: "2027-05-30" },
  update_reminder: { reminderId: "rem-1", title: "Print the tickets" },
  delete_reminder: { reminderId: "rem-1" },
  add_checklist_item: { tripId: "trip-1", kind: "PRETRIP", text: "Insurance" },
  add_shopping_item: { tripId: "trip-1", text: "Snacks" },
  update_checklist_item: { itemId: "ci-1", text: "Travel insurance" },
  tick_checklist_item: { itemId: "ci-1", done: true },
  set_need_to_buy: { itemId: "ci-1", buy: "NEEDED" },
  move_checklist_item: { itemId: "ci-1", direction: "up" },
  delete_checklist_item: { itemId: "ci-1" },
  save_packing_template: { tripId: "trip-1", name: "Beach" },
  apply_packing_template: { tripId: "trip-1", templateId: "tpl-1" },
  leave_feedback: { body: "Love the Day view" },
  make_it_fit_apply: { tripId: "trip-1", trims: [{ stopId: "stop-1", nights: 2 }] },
};

const text = (r: { content: unknown }) => (r.content as { type: string; text: string }[])[0].text;

describe("every MCP write returns the row it left behind (F6)", () => {
  it("ARGS names exactly the registered write tools (every tool without readOnlyHint)", async () => {
    const c = await connectTestClient();
    const { tools } = await c.listTools();
    const writes = tools.filter((t) => !t.annotations?.readOnlyHint).map((t) => t.name).sort();
    expect(writes).toEqual(Object.keys(ARGS).sort());
  });

  it.each(Object.entries(ARGS))("%s returns a row, never {}", async (name, args) => {
    const c = await connectTestClient();
    const r = await c.callTool({ name, arguments: args });
    expect(r.isError, text(r)).toBeFalsy();
    const body = JSON.parse(text(r));
    expect(body).toBeTypeOf("object");
    expect(body).not.toBeNull();
    expect(Object.keys(body).length, `${name} returned ${text(r)}`).toBeGreaterThan(0);
    expect(body).not.toHaveProperty("success");
  });
});
```

Sections A and E may add schema fields to `create_trip` / `add_reminder`. ARGS uses only fields that are optional there. If an earlier section made a field required, add it to that entry. If the first test lists a read tool that lacks `readOnlyHint` (none should, since reads.ts, trips-read.ts and make_it_fit_preview all set it), add the hint to that tool rather than to ARGS.

- [ ] **Step 2: Run it.** `npx vitest run lib/mcp/tools/write-returns.test.ts`. After F.13–F.17 it should pass. If a tool fails, that tool was missed: give it a `runWrite` read-back in its file. Never loosen the test.
- [ ] **Step 3: Implement.** Add to `MCP_INSTRUCTIONS` in `lib/mcp/server.ts`, right after "Read the plan before changing it, and say what you changed.":

```
Every write returns the thing as it now stands (a delete returns { deleted: id }; a date change also lists the other Stops it moved, in shifted), so confirm from that rather than reading the whole plan again; to re-check one thing, use get_stop, get_item, get_transport, get_accommodation or get_day.
```

If `lib/mcp/prompts.test.ts` or a server test pins the instructions text, update its expected text.
- [ ] **Step 4: Run, expect PASS.** `npx vitest run lib/mcp/tools/write-returns.test.ts lib/mcp/prompts.test.ts`
- [ ] **Step 5: Task-done check.** `npx vitest related --run lib/mcp/server.ts` + `npx tsc --noEmit` + `npx eslint lib/mcp/server.ts lib/mcp/tools/write-returns.test.ts`
- [ ] **Step 6: Commit.** Message:
  ```
  test(mcp): no write tool returns {}; tell Claude what writes return

  Resolves-Feedback: cmvaifznz000t07gwfwee8lfp
  ```

---

## Task Z: The batch gate, and the spec says what was built

**Files:**
- Modify: `docs/specs/2026-10-16-claude-connection-fixes.md`: the status line, plus an "As built (2026-10-16)" section.
- Modify: `docs/open-follow-ups.md`: strike TU-02 (D.2 already struck TU-01), update the open-items count line, and add the follow-ups the section Notes name (A: `firmUpTrip` and the rough flow take the first Stop's zone; the Booking import proposes the country zone; `createStop`'s rough append drops a picked lat/lng).

- [ ] **Step 1: The gate.** Run each of these and fix whatever fails, in its own `fix(...)` commit that names the task it came from:
  - `npm test`
  - `npx tsc --noEmit`
  - `npx eslint .` (0 errors)
  - `npm run knip`
  - the integration tier against the sandbox Postgres: start it, `npx prisma migrate deploy`, then `npm run test:integration` with the localhost URLs exported
  - `npm run build` in a throwaway copy: `git archive HEAD` into the scratchpad, symlink `node_modules`, and add a hand-written `.env` with the localhost DB, a dummy `BETTER_AUTH_SECRET`, `STORAGE_DRIVER=local` and `ALLOW_DEV_LOGIN=false`. Delete the copy afterwards. After the build, confirm the tz-lookup table appears in exactly one lazily loaded client chunk and not in any page's first-load JS: grep `.next/static/chunks` for a string unique to the package.
- [ ] **Step 2: As built.** Add an "As built (2026-10-16)" list to the spec. It holds every decision recorded in the section Notes (A, B, C, D, E, F), each as one line, plus anything an implementer reported as a deviation. Call out what a Traveller can see, including:
  - a Home base rename re-derives its zone (ADR 0030 amended);
  - Forks no longer grow the Trip window;
  - the trip header's date range refreshes when the end grows;
  - Reminders about hidden Items are hidden;
  - `get_day` refuses dates outside the Trip.
- [ ] **Step 3: Status line.** Set it to: **"Built** on `feat/feedback-tz-enddate-review` (2026-10-16); awaiting Cam's review, merge and deploy. On deploy, resolve `cmva4jnfk003l07lfhfbs92wb`, `cmvaecnl8000307l3wutowp1t` and `cmvaifznz000t07gwfwee8lfp` (trailers in git), and `cmvaigdfq000w07gw9um2kpjj` with a thank-you."
- [ ] **Step 4: Commit.** `docs: Claude connection fixes built — as-built notes, follow-ups`
