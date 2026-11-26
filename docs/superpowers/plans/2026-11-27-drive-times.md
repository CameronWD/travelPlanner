# Drive times on a drive Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A drive's **Travel time** shows in the Transport form (with a "Set arrival to …" button), on a timed drive's Plan card, in a new Flag when the typed times are shorter than the real road time, in what a long driving day counts, and in the Claude connection's Transport reads.

**Architecture:** One pure, client-safe module (`lib/travel-times/drive-fit.ts`) owns the rule and every piece of copy: it turns a resolved drive (`ResolvedHop`) into a `DriveTime` and, with the drive's times, into a `DriveFit` (allowed minutes, `tooShort`, suggested arrival). The Plan page, the new Flag, the long driving day, Compare and the MCP read all call it on the Travel time they already resolve with `resolveDriveLeg`. The form cannot resolve a Travel time itself (it has no Home point, no winding settings, and ends may be unsaved), so it calls a new read-only server action, `driveTimeForEnds`, with end references (`{ home: true } | { stopId } | { lat, lng }`). The action resolves points server-side the way `transportEnds` does, reads the `TravelTime` cache, and on a miss fetches one route within the existing daily `routes` cap (else returns the estimate). The new Flag is Marked-fine-able, so the Marked fine predicate is widened from "a tight hop" to "a Flag with a fingerprint and `between`".

**Tech Stack:** Next.js 16 server actions (`node_modules/next/dist/docs/01-app/02-guides/server-actions.md`: actions are dispatched one at a time per client, invoke from an effect inside `startTransition`, an action that does not revalidate does not re-render the route), React 19, TypeScript, Prisma, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-27-drive-times.md`. Glossary: `CONTEXT.md` (**Travel time**, **Flag**, **Marked fine**, **Transport**, **Surprise**).

**Lanes:** Task 1 first. Then Tasks 2, 3, 5 and 6 may run at the same time (their files do not overlap). Task 4 runs after Task 3 (both read `lib/flags.ts` exports). Task 7 runs last.

## Global Constraints

- **Binding rule:** nothing changes for a Transport that is not a drive (`mode !== "CAR"`), and a drive's stored times never change unless a Traveller presses the button. Every task has a test that a non-CAR Transport gains nothing.
- No schema change, no migration, no new dependency. Writing a `TravelTime` cache row from the new action is allowed (it is what the refresh already does); writing anything else is not.
- No change under `app/share/**` and no change to the Day view (`lib/day-view-loader.ts`, `components/trip/day/**`, `components/trip/day-feasibility.tsx`). The Day view's "Getting around" stays tight-hop only because it calls `flagTightConnections` directly.
- A drive with no times (no `depAt`, no `arrAt`) looks exactly as today on the Plan card and in the form (the "The drive estimate will show once it’s saved." box and its estimate copy are untouched).
- Exact copy (no em dashes in any new string; durations via `formatDuration` from `lib/transport.ts`; km is the rounded `roadKm`):
  - Form line: `About 1h 12m · 95 km by road`; estimated: `About 1h 12m · 95 km by road (estimated)`; too short (real only): `About 1h 12m · 95 km by road. Your times allow 1h.`
  - Form button: `Set arrival to 11:12`; when the arrival's local date differs from the departure field's date: `Set arrival to Sun 6 Dec 01:42` (`formatDayLabel` then `HH:mm`).
  - Plan card second line: `95 km · about 1h 12m driving`; estimated: `95 km · about 1h 12m driving (estimated)`.
  - Flag message (date stored ISO; `flagDisplayMessage` renders it): `Drive from Brisbane to Tweed Heads on 2026-12-05: your times allow 1h but the road takes about 1h 12m.`
  - Review rule title for the new Flag: `Too little time for the drive`.
- "Real" means `estimated === false`. `tooShort`, the warning colour, the Flag and the "Your times allow" text require a real Travel time. A long driving day substitutes only a real Travel time.
- Two ends at the same point (`samePoint`) have no Travel time anywhere new (no line, no Flag, no MCP figure); `resolveDriveLeg` returns a non-estimated 0 for them, so callers exclude them.
- Zero comments unless the why is non-obvious; no JSDoc/docstrings (exception: `lib/mcp/reads/plan-shapes.ts` documents every `McpTransport` field with a one-line `/** */`; the new field follows its neighbours); no defensive checks for impossible cases. Values from the client (the action's points) are untrusted and are validated.
- Verification per task: inner loop `TZ=UTC npx vitest run <test files>`; task done `TZ=UTC npx vitest related --run <changed source files>` + `npx tsc --noEmit` + `npx eslint <changed files>`. Never `npm test`, `npm run build` or integration tests in a task.
- Commits: `git add <paths>` then `git commit -m "…" -- <paths>`; confirm with `git show --stat HEAD`. No attribution lines.

**Shared fixture** (use it wherever a test needs a drive): Stop `bne` "Brisbane" (`Australia/Brisbane`, -27.4698, 153.0251, arrive 2026-12-01, depart 2026-12-05) and Stop `twd` "Tweed Heads" (`Australia/Sydney`, -28.1766, 153.5414, arrive 2026-12-05, depart 2026-12-08). In December Sydney is UTC+11 and Brisbane UTC+10. A drive `bne → twd` departing 09:00 Brisbane (`2026-12-04T23:00:00Z`) and arriving 11:00 Sydney (`2026-12-05T00:00:00Z`) spans **60 minutes** though the clocks differ by 2h. Its real Travel time is 72 minutes, 95 km (`TravelTime` row `{ status: "OK", minutes: 72, distanceM: 95_000 }` under `driveKey(bne, twd)`). Departing 23:30 Brisbane on 2026-12-05 (`2026-12-05T13:30:00Z`) plus 72 minutes arrives `2026-12-06T01:42` Sydney.

## Review Focus

1. **A drive whose ends are in different timezones** (the fixture): the span is 60 minutes, not 120, so the Flag fires and the form says "Your times allow 1h."; the button reads 11:12 in the arrival's zone, not 10:12 (Tasks 1, 3, 5).
2. **A timed drive with only an estimate** (no row, `NONE` row, or the cap was hit): no Flag, no warning colour, no "Your times allow", and the long driving day still counts the typed span (Tasks 1, 2, 3, 5).
3. **A Surprise:** a drive departing on a day inside a Surprise Stop's stay raises no drive Flag for a viewer that Stop is hidden from, and its message never reaches that viewer's Flags, next steps or `get_flags` (Task 3).
4. **An untouched save:** opening a timed drive and saving without pressing the button sends byte-for-byte the same `updateTransport` arguments whether the lookup returned a Travel time or nothing, and the lookup never marks the form dirty (Task 5).
5. **The daily routing cap:** when `takeGoogleQuota` refuses (or there is no server key, or a `NONE`/fresh `ERROR` row exists), the action makes no Google call, writes no row and returns the estimate, and the form shows the "(estimated)" line (Task 5).

---

### Task 1: The drive-fit core

**Files:**
- Create: `lib/travel-times/drive-fit.ts`
- Test: `lib/travel-times/drive-fit.test.ts`

**Interfaces:**
- Consumes: `ResolvedHop` (`lib/travel-times/hops.ts`), `estimateRoadKm` (`lib/geo.ts`), `durationMinutes`, `formatDuration` (`lib/transport.ts`), `formatDayLabel` (`lib/dates.ts`), `instantToZonedDateISO`, `instantToZonedTime` (`lib/tz.ts`).
- Produces:
  ```ts
  export type DriveTime = { minutes: number; roadKm: number; estimated: boolean };
  export type DriveFit = DriveTime & { allowedMinutes: number | null; tooShort: boolean; arriveAt: Date | null };
  export function driveTimeOf(hop: ResolvedHop, windingFactor: number): DriveTime;
  export function driveFit(drive: DriveTime, depAt: Date | null, arrAt: Date | null): DriveFit;
  export function drivingMinutes(hop: Pick<ResolvedHop, "minutes" | "estimated">, depAt: Date | null, arrAt: Date | null): { minutes: number; estimated: boolean };
  export function planDriveLine(drive: DriveTime): string;
  export function formDriveLine(fit: DriveFit): string;
  export function setArrivalLabel(arriveAt: Date, arrZone: string, depDateISO: string): string;
  ```

Rules:
- `driveTimeOf` is exactly today's Plan-page computation: `minutes: Math.round(hop.minutes)`, `roadKm: Math.round(hop.estimated ? estimateRoadKm(hop.distanceKm, windingFactor) : hop.distanceKm)`, `estimated: hop.estimated`.
- `driveFit`: `allowedMinutes` = `durationMinutes(depAt, arrAt)` when that is > 0, else null. `tooShort` = `!estimated && allowedMinutes !== null && allowedMinutes < minutes`. `arriveAt` = `depAt + minutes` when `depAt`, else null.
- `drivingMinutes`: with both times and `arr > dep`, span = `(arr - dep) / 60000`; return `{ minutes: hop.minutes, estimated: false }` only when `!hop.estimated && hop.minutes > 0 && hop.minutes < span`, else `{ minutes: span, estimated: false }`. Without both times (or arr not after dep) return `{ minutes: hop.minutes, estimated: hop.estimated }`. (`hop.minutes > 0` keeps a same-point drive counting its span, as today.)
- `setArrivalLabel`: `Set arrival to HH:mm` in `arrZone`, with `formatDayLabel(<arrival local ISO date>) ` before the time when that date differs from `depDateISO`.

- [ ] **Step 1: Write the failing tests**

```ts
const real: DriveTime = { minutes: 72, roadKm: 95, estimated: false };
const dep = new Date("2026-12-04T23:00:00Z");
const arr = new Date("2026-12-05T00:00:00Z");

it("driveTimeOf keeps a real time's road distance and winds an estimate's", () => {
  expect(driveTimeOf({ minutes: 72.4, distanceKm: 95.2, mode: "drive", estimated: false, polyline: null }, 1.5)).toEqual(real);
  expect(driveTimeOf({ minutes: 71.6, distanceKm: 60, mode: "drive", estimated: true, polyline: null }, 1.5)).toEqual({ minutes: 72, roadKm: 90, estimated: true });
});
it("a cross-zone drive 09:00 Brisbane to 11:00 Sydney allows 60 minutes and is too short for 72", () => {
  expect(driveFit(real, dep, arr)).toEqual({ ...real, allowedMinutes: 60, tooShort: true, arriveAt: new Date("2026-12-05T00:12:00Z") });
});
it("an estimate is never too short", () => {
  expect(driveFit({ ...real, estimated: true }, dep, arr).tooShort).toBe(false);
});
it("times that allow the drive are not too short", () => {
  expect(driveFit(real, dep, new Date("2026-12-05T01:00:00Z")).tooShort).toBe(false);
});
it("no arrival, or an arrival not after departure, allows nothing and is not too short", () => {
  expect(driveFit(real, dep, null)).toMatchObject({ allowedMinutes: null, tooShort: false, arriveAt: new Date("2026-12-05T00:12:00Z") });
  expect(driveFit(real, dep, dep)).toMatchObject({ allowedMinutes: null, tooShort: false });
  expect(driveFit(real, null, null)).toMatchObject({ allowedMinutes: null, tooShort: false, arriveAt: null });
});
it("drivingMinutes counts a real time shorter than the typed span, else the span", () => {
  const six = new Date("2026-12-05T05:00:00Z");
  expect(drivingMinutes({ minutes: 290, estimated: false }, dep, six)).toEqual({ minutes: 290, estimated: false });
  expect(drivingMinutes({ minutes: 290, estimated: true }, dep, six)).toEqual({ minutes: 360, estimated: false });
  expect(drivingMinutes({ minutes: 72, estimated: false }, dep, arr)).toEqual({ minutes: 60, estimated: false });
  expect(drivingMinutes({ minutes: 0, estimated: false }, dep, arr)).toEqual({ minutes: 60, estimated: false });
  expect(drivingMinutes({ minutes: 72, estimated: true }, null, null)).toEqual({ minutes: 72, estimated: true });
});
it("the Plan card line", () => {
  expect(planDriveLine(real)).toBe("95 km · about 1h 12m driving");
  expect(planDriveLine({ ...real, estimated: true })).toBe("95 km · about 1h 12m driving (estimated)");
});
it("the form line", () => {
  expect(formDriveLine(driveFit(real, dep, null))).toBe("About 1h 12m · 95 km by road");
  expect(formDriveLine(driveFit({ ...real, estimated: true }, dep, arr))).toBe("About 1h 12m · 95 km by road (estimated)");
  expect(formDriveLine(driveFit(real, dep, arr))).toBe("About 1h 12m · 95 km by road. Your times allow 1h.");
});
it("the button names the arrival in its own zone, with the day when it is another day", () => {
  expect(setArrivalLabel(new Date("2026-12-05T00:12:00Z"), "Australia/Sydney", "2026-12-05")).toBe("Set arrival to 11:12");
  expect(setArrivalLabel(new Date("2026-12-05T14:42:00Z"), "Australia/Sydney", "2026-12-05")).toBe("Set arrival to Sun 6 Dec 01:42");
});
```

- [ ] **Step 2:** `TZ=UTC npx vitest run lib/travel-times/drive-fit.test.ts` → FAIL (module not found).
- [ ] **Step 3:** Implement the seven exports in `lib/travel-times/drive-fit.ts`. No `server-only` import: the form imports it.
- [ ] **Step 4:** Inner loop → PASS; then task-done verification.
- [ ] **Step 5: Commit** `feat(travel-times): one rule for a drive's Travel time against its times`.

---

### Task 2: The Plan card

**Files:**
- Modify: `app/(app)/trips/[tripId]/plan/page.tsx` (~306-312 `driveLegs`, ~442-459 `initialTransports`), `components/trip/itinerary-manager.tsx` (`ItineraryTransport` ~165, and wherever `driveEstimate` is threaded: `git grep -n driveEstimate components/trip`), `lib/plan/leg-label.ts`, `components/plan/leg-pill.tsx` (`TravelRowText`)
- Test: `app/(app)/trips/[tripId]/plan/page.test.tsx`, `lib/plan/leg-label.test.ts`, `components/plan/leg-pill.test.tsx`

**Interfaces:**
- Consumes: `DriveTime`, `driveTimeOf`, `driveFit`, `planDriveLine` (Task 1); `samePoint` (`lib/travel-times/hops.ts`).
- Produces: `ItineraryTransport.driveTime?: DriveTime | null` and `LegTransport.driveTime?: DriveTime | null`; `LegLabel.drive?: { text: string; tooShort: boolean }` (optional, so `missingLegLabel` and `app/share/[token]/share-travel-row.tsx` compile untouched).

Rules:
- Page: for every CAR Transport with a car leg whose points are not `samePoint`, `driveTime = driveTimeOf(leg, windingFactor)`; otherwise `null`. `driveEstimate` keeps today's condition (`CAR && !hasTimes && leg`) and becomes `driveTimeOf(leg, windingFactor)`, which is byte-identical to today's inline object.
- `legLabel`: only in the timed branch (`t.depAt` set) and only for `CAR` with a `driveTime`, set `drive = { text: planDriveLine(t.driveTime), tooShort: driveFit(t.driveTime, t.depAt, t.arrAt ?? null).tooShort }` and append ` ${text}.` to `accessibleName` after the arrival sentence. A drive with a departure but no arrival therefore shows the line but never the warning. The untimed branch is unchanged.
- `TravelRowText`: after the `when` line, `<span data-travel-line="drive" className={cn("text-xs tabular-nums", label.drive.tooShort ? "font-bold text-sun-text" : "font-medium text-muted-foreground")}>`. `text-sun-text` is the warning text colour the Flag list uses (`components/trip/flag-list.tsx` `SEVERITY_CONFIG.warning`).

- [ ] **Step 1: Failing tests**
  - `page.test.tsx`, beside the existing "a Car leg without times gets the stored DRIVE time…" test and using its key pattern: `a timed Car leg gets its driveTime and keeps a null driveEstimate` (transport with `depAt`/`arrAt` set, row `{ minutes: 190, distanceM: 275400 }` → `toMatchObject([{ driveTime: { minutes: 190, roadKm: 275, estimated: false }, driveEstimate: null }])`); `an untimed Car leg's driveEstimate is unchanged and equals its driveTime`; `a Car leg between two Stops at the same point has no driveTime`; `a timed TRAIN leg has no driveTime` (`driveTime: null`).
  - `leg-label.test.ts` (fixture Stops with their zones):
    ```ts
    const drive = { mode: "CAR", fromStopId: "bne", toStopId: "twd", depAt: new Date("2026-12-04T23:00:00Z"), arrAt: new Date("2026-12-05T00:00:00Z"), driveTime: { minutes: 72, roadKm: 95, estimated: false } } as const;
    it("a timed drive keeps its times and gains the drive line, short when the times allow less", () => {
      const l = legLabel(drive, STOPS);
      expect(l.arrival).toBe("→ 11:00 · 1h");
      expect(l.drive).toEqual({ text: "95 km · about 1h 12m driving", tooShort: true });
      expect(l.accessibleName).toContain("95 km · about 1h 12m driving.");
    });
    it("an estimated drive line is never short", () => {
      expect(legLabel({ ...drive, driveTime: { ...drive.driveTime, estimated: true } }, STOPS).drive).toEqual({ text: "95 km · about 1h 12m driving (estimated)", tooShort: false });
    });
    it("times that allow the drive are not short", () => {
      expect(legLabel({ ...drive, arrAt: new Date("2026-12-05T01:00:00Z") }, STOPS).drive?.tooShort).toBe(false);
    });
    it("a drive with no times reads exactly as before and has no drive line", () => {
      const l = legLabel({ mode: "CAR", fromStopId: "bne", toStopId: "twd", driveTime: drive.driveTime, driveEstimate: drive.driveTime }, STOPS);
      expect(l.sub).toBe("1h 12m · 95 km");
      expect(l.drive).toBeUndefined();
    });
    it("a timed train has no drive line", () => {
      expect(legLabel({ ...drive, mode: "TRAIN" }, STOPS).drive).toBeUndefined();
    });
    ```
  - `leg-pill.test.tsx`: `a short drive line takes the warning colour` (`LegPill` with `label.drive = { text: "95 km · about 1h 12m driving", tooShort: true }` → `[data-travel-line="drive"]` has text and class `text-sun-text`); `a drive line that fits is muted` (`text-muted-foreground`, not `text-sun-text`); `a LegCard with no drive renders no drive line` (`querySelector('[data-travel-line="drive"]')` is null).
- [ ] **Step 2:** run → FAIL. **Step 3:** implement. **Step 4:** inner loop PASS; task-done verification (also run `components/trip/transport-card.test.tsx` and `app/share` tests via `vitest related`).
- [ ] **Step 5: Commit** `feat(plan): a timed drive's card shows its Travel time, in the warning colour when the times are too short`.

---

### Task 3: The drive Flag, the long driving day and Compare

**Files:**
- Modify: `lib/flags.ts` (new rule; `flagLongDrivingDays` ~659; `isTightFlag` ~762; `detectFlags` assembly ~1475), `lib/compare.ts` (~486-492 `drivingMinutes`), `lib/review/from-flags.ts` (`RULES`)
- Test: `lib/flags.test.ts`, `lib/compare.test.ts`, `lib/review/from-flags.test.ts`

**Interfaces:**
- Consumes: `driveTimeOf`, `driveFit`, `drivingMinutes` (Task 1); `transportEnds`, `toPlanTransport`, `hopStopsById`, `resolveDriveLeg`, `samePoint`, `pointKey` (`hops.ts`); the file's own `legDepartureDay`, `TravelOpts`, `toDate`.
- Produces (Task 4 relies on these):
  ```ts
  export type MarkableFlag = Flag & Required<Pick<Flag, "fingerprint" | "between">>;
  export function canMarkFine(flag: Flag): flag is MarkableFlag;          // fingerprint !== undefined && between !== undefined
  export function driveShortFlagTransport(flagId: string): string | null; // "drive-short-<id>" → "<id>", else null
  export function flagDrivesShorterThanTimes(
    stops: FlagStop[],
    transports: FlagTransport[],
    opts: TravelOpts & { home?: HomeBase | null; homePoint?: Pt | null; homeTimezone?: string | null; stopNames?: ReadonlyMap<string, string> },
  ): Flag[];
  ```
  `isTightFlag` changes to require `flag.hop !== undefined` as well, so its `TightFlag` type no longer lies about a drive Flag.

Rules for the new Flag:
- For each `CAR` Transport with both times, located ends (`transportEnds` with `hopStopsById(opts.travelStops ?? stops)` and `opts.homePoint`) and not `samePoint`: `fit = driveFit(driveTimeOf(resolveDriveLeg(from, to, lookup, opts), opts.windingFactor), dep, arr)`. Flag only when `fit.tooShort`.
- The Flag: `id: \`drive-short-${t.id}\`` written inline in that literal form (the drift guard in `from-flags.test.ts` scans for it), `severity: "warning"`, `targetType: "DAY"`, `date: legDepartureDay(t, stopById, homeTimezone)` (the departure's own zone; skip when null), the message from Global Constraints, `between: { from: A, to: B }`, `fingerprint: [dep.toISOString(), arr.toISOString(), pointKey(from), pointKey(to), Math.round(fit.minutes / 5) * 5].join("|")`.
- Naming an end: Home → `home?.name ?? "Home"`; else the end's `depPlace`/`arrPlace` when set (a Stop's exact point or a place end); else the Stop's name from `opts.stopNames ?? stops`.
- `detectFlags` adds `...outsideHidden(flagDrivesShorterThanTimes(stops, transports, { ...travelOpts, home, homePoint: homePoint ?? null, homeTimezone, stopNames }))`, the same Surprise treatment as `flagTightConnections`.
- `flagLongDrivingDays`: replace the `leg` computation with `drivingMinutes(resolveDriveLeg(ends.from, ends.to, lookup, opts), dep, arr)`. Keep `if (!ends) continue` before it, and keep the arrival-zone day as today.
- `lib/compare.ts` `drivingMinutes` loop: add `drivingMinutes(resolveDriveLeg(...), dep, arr).minutes` (import the Task 1 helper under an alias, since the local variable shares its name), so Compare's Driving total uses the same rule as the long driving day.
- `lib/review/from-flags.ts`: add `{ prefix: "drive-short", category: "LOGISTICS", title: "Too little time for the drive" }`.

- [ ] **Step 1: Failing tests** in `lib/flags.test.ts` (fixture Stops as `FlagStop`s; `travel` is a `TravelLookup` holding the fixture row under `driveKey`):
  ```ts
  it("flags a cross-zone drive whose times allow 60 minutes for a 72 minute road", () => {
    const flags = flagDrivesShorterThanTimes(STOPS, [drive], { windingFactor: 1.5, avgSpeedKph: 80, lookup: travel });
    expect(flags).toEqual([expect.objectContaining({
      id: "drive-short-t1", severity: "warning", targetType: "DAY", date: "2026-12-05",
      message: "Drive from Brisbane to Tweed Heads on 2026-12-05: your times allow 1h but the road takes about 1h 12m.",
      between: { from: "Brisbane", to: "Tweed Heads" },
    })]);
    expect(canMarkFine(flags[0])).toBe(true);
    expect(isTightFlag(flags[0])).toBe(false);
  });
  ```
  - `never flags from the estimate` (empty `travel`, same times → `[]`).
  - `does not flag times that allow the road` (arrival `2026-12-05T00:15:00Z` → `[]`).
  - `does not flag a drive with one time, a same-point drive, or a timed TRAIN` (each → `[]`).
  - `names a Home end and a place end` (Home `{ name: "Mullumbimby" }` with a `homePoint`, `depPlace: "Brisbane Airport"` with its own point and no Stop, a real row under that pair's `driveKey` → message starts `Drive from Brisbane Airport to Mullumbimby on`).
  - `the fingerprint changes with either time and with a Travel time about 5 minutes longer, not with 1 minute` (72 → 77 changes it; 71 → 72 does not).
  - `detectFlags hides the drive Flag from a viewer the Surprise Stop is hidden from` (`hiddenStopIds: ["twd"]` → no `drive-short-` id; `[]` → present).
  - `a long driving day counts a real Travel time shorter than the typed span` (two `Pacific/Auckland` Stops, drive `2026-12-09T19:00Z`→`2026-12-10T01:00Z` (08:00→14:00 local), real 290 min → no `long-drive-` Flag; same drive with empty `travel` → `Long driving day on 2026-12-10: ~6h behind the wheel. Check it's doable.`).
  - `a long driving day still skips a timed drive with an unlocated end`.
  - `lib/compare.test.ts`: `drivingMinutes counts a real Travel time shorter than a drive's typed span` (290-minute row, 360-minute span → 290) and `counts the span when only an estimate exists` (→ 360).
  - `lib/review/from-flags.test.ts`: `maps a drive that does not fit its times to Logistics` (`drive-short-x` → `{ category: "LOGISTICS", title: "Too little time for the drive" }`); the existing drift guard must stay green.
- [ ] **Step 2:** run → FAIL. **Step 3:** implement. **Step 4:** inner loop PASS; task-done verification (`vitest related` picks up `flags-loader`, `next-steps-builder`, `day-view-loader` and Review tests; they must stay green untouched).
- [ ] **Step 5: Commit** `feat(flags): a drive whose times are shorter than the road is flagged, and a long driving day counts the road time`.

---

### Task 4: Marking the drive Flag fine

**Files:**
- Modify: `server/actions/flag-dismissals.ts`, `components/trip/flag-list.tsx` (~99), `lib/mcp/reads/flags.ts`
- Test: `server/actions/flag-dismissals.test.ts`, `components/trip/flag-list.test.tsx`

**Interfaces:**
- Consumes: `canMarkFine`, `MarkableFlag`, `driveShortFlagTransport`, `tightFlagItems` (Task 3 / `lib/flags.ts`).
- Produces: no new exports. `markFlagFine` and `unmarkFlagFine` keep their signatures, so `lib/server-action-exports.test.ts` is unchanged.

Rules:
- Rename `requireTightFlag` to `requireMarkableFlag(tripId, flagId)`. A `tight-` id keeps today's checks. A `drive-short-` id runs `requireRowAccess("transport", id, { realPlanOnly: true })`; when `row.tripId !== tripId` it returns `"That drive is not on this trip."`. Any other id returns today's `"Only a travel-time warning can be marked fine."`.
- `flag-list.tsx` and `lib/mcp/reads/flags.ts` switch from `isTightFlag` to `canMarkFine`, so the drive Flag gets "This is fine" (aria-label `This is fine: Brisbane to Tweed Heads`) and a `flagId`/`fingerprint` in `get_flags`.
- No new Undo surface. A Marked fine drive Flag is undone through Claude's `unmark_flag_fine`, or it returns by itself when either time, either end or the Travel time changes (the fingerprint). The Plan card's warning colour is not affected by Marked fine. This is recorded in CONTEXT.md in Task 7.

- [ ] **Step 1: Failing tests**
  - `flag-dismissals.test.ts`: `marks a drive Flag fine after checking the Transport is on the trip` (`requireRowAccessMock` called with `("transport", "t1", { realPlanOnly: true })`, `loadFlags` returns `{ id: "drive-short-t1", fingerprint: "fp", between: {…} }` → upsert with `flagId: "drive-short-t1"`); `refuses a drive Flag whose Transport is on another trip` (→ `"That drive is not on this trip."`, no upsert); `still refuses a packed-day Flag` (unchanged message); `unmarks a drive Flag`.
  - `flag-list.test.tsx`: `a drive Flag offers This is fine, named by its two ends` (button with accessible name `This is fine: Brisbane to Tweed Heads`); `a long driving day Flag offers no This is fine`.
- [ ] **Step 2:** run → FAIL. **Step 3:** implement. **Step 4:** inner loop PASS; task-done verification (also `lib/mcp/tools/marked-fine-write.test.ts`).
- [ ] **Step 5: Commit** `feat(flags): a drive that does not fit its times can be Marked fine`.

---

### Task 5: The Transport form: the lookup action, the line and the button

**Files:**
- Modify: `lib/travel-times/refresh.ts` (extract the fetch-and-store from `fetchOne`; add `driveTimeNow`), `components/trip/transport-form-dialog.tsx`, `lib/server-action-exports.test.ts` (allowlist), every test file that renders `TransportFormDialog` (at least `components/trip/transport-form-dialog.test.tsx` and `components/trip/itinerary-manager.lazy-dialogs.test.tsx`; `git grep -l "TransportFormDialog\|transport-form-dialog" -- '*.test.tsx'`)
- Create: `server/actions/drive-time.ts`
- Test: `lib/travel-times/refresh.test.ts`, `server/actions/drive-time.test.ts` (create; mock style as `server/actions/venue-details.test.ts`), `components/trip/transport-form-dialog.test.tsx`

**Interfaces:**
- Consumes: `DriveTime`, `driveTimeOf`, `driveFit`, `formDriveLine`, `setArrivalLabel` (Task 1); `driveKey`, `resolveDriveLeg`, `samePoint`, `located`, `type Pt` (`hops.ts`); `loadTravelTimes`, `settledTravelKeys`, `saveTravelTime` (`store.ts`); `computeRoute` (`lib/routes.ts`); `takeGoogleQuota`, `dailyCap("routes")`, `hasServerKey`; `requirePlanAccess`, `planScope`; `instantToWallTimeInput` (`lib/time-display.ts`).
- Produces:
  ```ts
  // lib/travel-times/refresh.ts
  export async function driveTimeNow(from: Pt, to: Pt, estimateOpts: { windingFactor: number; avgSpeedKph: number }, now?: Date): Promise<ResolvedHop>;

  // server/actions/drive-time.ts ("use server")
  export type DriveEnd = { home: true } | { stopId: string } | { lat: number; lng: number };
  export async function driveTimeForEnds(tripId: string, forkId: string | null, from: DriveEnd, to: DriveEnd): Promise<DriveTime | null>;
  ```
  Allowlist entry: `"drive-time.ts": ["driveTimeForEnds"]`.

Rules:
- `driveTimeNow`: a stored `OK` row under `driveKey` → that real hop. Otherwise, when the key is not settled (`settledTravelKeys`: a `NONE` row or an `ERROR` under 24h old is settled), `hasServerKey()` and `takeGoogleQuota("routes", dailyCap("routes"))` all hold, it fetches once with `computeRoute(from, to, "DRIVE")`, stores the result exactly as the refresh does (share one extracted helper with `fetchOne`; the refresh's counts and tests stay unchanged), and returns the real hop when `ok`. Otherwise it returns `resolveDriveLeg`'s estimate.
- `driveTimeForEnds`: `requirePlanAccess(tripId, forkId ?? undefined)`. A point end must have finite `lat` in [-90, 90] and `lng` in [-180, 180]. A Stop end is read with `db.stop.findFirst({ where: { id, tripId, ...planScope(plan) }, select: { lat: true, lng: true } })`. A Home end uses the trip's `homeLat`/`homeLng`. Any end it cannot locate returns `null`, and so does `samePoint`. Otherwise it returns `driveTimeOf(await driveTimeNow(from, to, { windingFactor, avgSpeedKph }), windingFactor)` with the trip's `drivingWindingFactor`/`drivingAvgSpeedKph`. It never calls `revalidateTrip`.
- The form, for `mode === "CAR"` and not in Proposal mode (`!onSubmitOverride`), works out each end's `DriveEnd` from what the form holds:
  - Home → `{ home: true }`.
  - A Stop with an empty point field → `{ stopId }`.
  - A Stop with a point → its pick, else (text unchanged, `samePlaceText`) the saved point, or `{ stopId }` when the saved row has no point (as `transportEnds` falls back to the Stop), else unknown.
  - A place → `placePoint(value, saved)`, else unknown.
  - `none` → unknown.

  With both ends known and not two equal points, it calls the action from an effect inside `startTransition`, keyed by a string of the two ends. It drops a reply whose key is no longer current, and treats a rejected call as `null`. The result lives in its own state, which is not passed to `useFormDirty` and not read by `buildInput`.
- Under the Leaves/Arrives cards (only while they show), with a `DriveTime`: the line `formDriveLine(driveFit(drive, depInstant, arrInstant))`, using the form's existing `depInstant`/`arrInstant` (already read in each end's own zone). With a departure entered: a `type="button"` labelled `setArrivalLabel(fit.arriveAt, currentZones.arrTz, depAt.slice(0, 10))`, which on press calls `setArrAt(instantToWallTimeInput(fit.arriveAt, currentZones.arrTz))`. Hide the button when `arrAt` already equals that value. No `DriveTime`, no line and no button. The untimed CAR box, the layover block and `buildInput` are untouched.

- [ ] **Step 1: Failing tests**
  - `refresh.test.ts` (fixture points): `driveTimeNow returns a stored real time without calling Google` (`{ minutes: 72, distanceKm: 95, estimated: false }`, `computeRoute` not called); `fetches and stores a missing drive within the daily cap` (`computeRoute` → `{ status: "ok", minutes: 72, distanceM: 95000, polyline: "" }`; one `travelTime.upsert` with `where: { key: driveKey(bne, twd) }`; returns real 72); `returns the estimate with no Google call and no write when the cap refuses` (`takeGoogleQuota` → false); `… when there is no server key`; `… when a NONE row is stored`; `re-fetches an ERROR row older than 24 hours`.
  - `drive-time.test.ts`: `checks plan access and resolves a Stop on this trip and plan` (`requirePlanAccess` called with `("trip-1", undefined)`; `stop.findFirst` where has `tripId: "trip-1", forkId: null`; `driveTimeNow` → real 72/95 → returns `{ minutes: 72, roadKm: 95, estimated: false }`); `returns null for a Stop not on the trip, without a lookup`; `returns null for a Home end when the trip has no Home point`; `returns null for two ends at the same point`; `returns null for a point with lat 91`; `winds an estimate with the trip's own factor` (`drivingWindingFactor: 1.3`, estimate `distanceKm: 100` → `roadKm: 130`).
  - `transport-form-dialog.test.tsx`: add `vi.mock("@/server/actions/drive-time", () => ({ driveTimeForEnds: vi.fn(async () => null) }))`. Do the same in every other test file that renders the dialog. Then, with the fixture Stops and a saved drive `depAt 2026-12-04T23:00Z`, `arrAt 2026-12-05T00:00Z`:
    ```ts
    it("a timed drive shows its Travel time and says the times allow 1h", async () => {
      vi.mocked(driveTimeForEnds).mockResolvedValue({ minutes: 72, roadKm: 95, estimated: false });
      render(<TransportFormDialog {...fixtureProps} transport={savedDrive} />);
      expect(await screen.findByText("About 1h 12m · 95 km by road. Your times allow 1h.")).toBeInTheDocument();
      expect(driveTimeForEnds).toHaveBeenCalledWith("trip-1", null, { stopId: "bne" }, { stopId: "twd" }); // the form passes forkId ?? null
    });
    it("Set arrival fills the arrival in its own zone and saving sends it", async () => {
      // mock as above; click "Set arrival to 11:12"; the "Arrives Tweed Heads" field reads "2026-12-05T11:12"; Save → updateTransport patch has arrAt "2026-12-05T11:12"
    });
    it("a late departure suggests an arrival on the next day", async () => {
      // new drive bne → twd, type departure "2026-12-05T23:30" → button "Set arrival to Sun 6 Dec 01:42"; press → arrival field "2026-12-06T01:42"
    });
    it("an estimate shows (estimated) and never says the times allow less", async () => {
      // mock { minutes: 72, roadKm: 95, estimated: true } → "About 1h 12m · 95 km by road (estimated)"; queryByText(/Your times allow/) is null
    });
    it("saving an untouched drive sends the same thing whatever the lookup returned", async () => {
      // render savedDrive with the mock returning null, click Save, keep updateTransport's args; clear mocks;
      // render again with the mock returning the real 72/95, wait for the line, click Save;
      // expect(second args).toEqual(first args); and the form was not dirty before Save (Escape closes without a discard prompt)
    });
    it("no line or lookup when an end cannot be located", async () => {
      // To is a typed place with no pick → driveTimeForEnds not called, no "About" text
    });
    it("switching the mode to Train removes the line", async () => { /* line shown, click Train radio → gone */ });
    it("a stale reply for ends that changed is ignored", async () => {
      // first call resolves after the To end changed; only the second reply's line shows
    });
    ```
  - `lib/server-action-exports.test.ts`: add the allowlist entry (it fails until the file exists).
- [ ] **Step 2:** run → FAIL. **Step 3:** implement in the order refresh → action → form. **Step 4:** inner loop PASS; task-done verification (also every dialog-rendering test file).
- [ ] **Step 5: Commit** `feat(transport): the drive form shows its Travel time and offers to set the arrival`.

---

### Task 6: The Claude connection reports a drive's Travel time

**Files:**
- Modify: `lib/travel-times/read.ts` (new loader), `lib/mcp/reads/plan-shapes.ts` (`McpTransport`, `toMcpTransport`), `lib/mcp/reads/entities.ts` (`loadTransportForMcp`), `lib/mcp/reads/trip-plan.ts` (`loadTripPlanView`), `lib/mcp/tools/reads.ts` (descriptions of `get_transport`, `get_trip_plan`, `get_flags`)
- Test: `lib/mcp/reads/plan-shapes.test.ts`, `lib/mcp/reads/entities.test.ts`, `lib/mcp/reads/trip-plan.test.ts`, `lib/travel-times/read.test.ts`

**Interfaces:**
- Consumes: `DriveTime`, `driveTimeOf` (Task 1); `carLegs`, `legPathKeys`, `toPlanTransport`, `hopStopsById`, `resolveDriveLeg`, `samePoint`, `homePointOf` (`hops.ts`); `loadTravelTimes`; `REAL_PLAN`.
- Produces:
  ```ts
  // lib/travel-times/read.ts
  export async function loadDriveTimes(tripId: string): Promise<Map<string, DriveTime>>;
  // lib/mcp/reads/plan-shapes.ts
  McpTransport.travelTime?: { minutes: number; roadKm: number; estimated: boolean } | null;
  toMcpTransport(t, ctx & { driveTimes?: ReadonlyMap<string, DriveTime> })
  ```

Rules:
- `loadDriveTimes` reads only, and only the real plan. It runs its own queries: the trip's `homeLat`, `homeLng`, `drivingWindingFactor` and `drivingAvgSpeedKph`; the plan's Stops `{ id, lat, lng }`; and the `CAR` Transports with their keying fields (`MCP_STOP_FIELDS` and `MCP_TRANSPORT_SELECT` hold no coordinates, so it does not lean on them). It loads `legPathKeys` with `loadTravelTimes` and maps each non-`samePoint` car leg to `driveTimeOf(resolveDriveLeg(...), windingFactor)`. It never fetches from Google.
- `toMcpTransport` adds `travelTime: ctx.driveTimes?.get(t.id) ?? null` only when `t.mode === "CAR"`; any other mode has no `travelTime` key at all. Every existing field is unchanged.
- `loadTransportForMcp` and `loadTripPlanView` call `loadDriveTimes(tripId)` in their existing `Promise.all` and pass it as `driveTimes`. Write tools that return `loadTransportForMcp` pick it up as they are.
- Existing tests that reach `loadTransportForMcp` or `loadTripPlanView` through a partial `mockDb` (`git grep -l "loadTransportForMcp\|loadTripPlanView" -- '*.test.ts'`: `write-returns`, `bookings-write`, `booking-state-write`, `nothing-to-attach`, `lib/review/**` and others) get `vi.mock` of `loadDriveTimes` returning an empty Map. A CAR fixture's `toEqual` gaining `travelTime: null` is expected: update the expectation, never drop the key.
- Descriptions (no em dashes):
  - `get_transport` and `get_trip_plan` gain: `A drive (mode CAR) also has travelTime: its minutes, road distance in km and whether it is estimated, or null when its ends are not located.`
  - `get_flags` gains to its list: `a drive whose times are shorter than the road takes`. It also says a drive flag has a flagId, like a travel-time flag.

- [ ] **Step 1: Failing tests**
  - `read.test.ts`: `loadDriveTimes gives each located drive its Travel time` (fixture row → `Map { "t1" => { minutes: 72, roadKm: 95, estimated: false } }`); `an unlooked-up drive is estimated with the trip's winding factor`; `a same-point drive and a train get no entry`.
  - `plan-shapes.test.ts`: `a drive carries its travelTime` (`toMcpTransport(car, { …ctx, driveTimes })` → `travelTime: { minutes: 72, roadKm: 95, estimated: false }`); `a drive with unlocated ends carries travelTime null`; `a flight has no travelTime key` (`expect("travelTime" in toMcpTransport(flight, ctx)).toBe(false)`).
  - `entities.test.ts`: `get_transport reports a drive's Travel time` (mock `loadDriveTimes`); `trip-plan.test.ts`: `get_trip_plan reports each drive's Travel time and nothing for other modes`.
- [ ] **Step 2:** run → FAIL. **Step 3:** implement. **Step 4:** inner loop PASS; task-done verification (also `lib/mcp/tools/*.test.ts` via `vitest related`).
- [ ] **Step 5: Commit** `feat(mcp): reading a drive reports its Travel time`.

---

### Task 7: Documents

**Files:**
- Modify: `CONTEXT.md` (**Travel time**, **Flag**, **Marked fine**), `components/trip/help-guide.tsx` (the Transport paragraph ~888 and "What a flag can be" ~1245)
- Test: `lib/help-guide.test.ts`, `components/trip/help-guide.test.tsx` (existing; must stay green)

Content:
- **Travel time:** a car Transport's Travel time is shown on its Plan card whether or not it has times (as the second line once it is timed), offered in the Transport form as the drive is entered (looked up on the spot within the daily routing allowance, else estimated), and reported by the Claude connection. A Traveller's own times are never changed by it unless they press the form's button.
- **Flag:** add "a **drive whose times are shorter than its Travel time** (only a looked-up time, never the estimate; dated by its departure day)". Then a long driving day counts a timed drive's Travel time when a looked-up one is shorter than the typed span, and the typed span otherwise.
- **Marked fine:** travel-time Flags are now a tight or close-run hop between two Items, or a drive whose times are shorter than its Travel time. The drive one comes back when either time, either end or the Travel time (by about five minutes) changes. It has no in-app Undo, because the Day view lists only hops: the Claude connection's unmark undoes it. Its Plan card line keeps the warning colour.
- Help guide, Transport paragraph: once both ends of a drive are known, the form shows how long the road takes and how far it is. With a departure in, it offers to set the arrival to match. A timed drive's card on the Plan shows the same figure, amber when your times leave too little. Describe the button in prose. Do not add `Set arrival to` to `GUIDE_UI_STRINGS`: the label is interpolated and never appears in source as a complete phrase. No new `<strong>` unless its text is already in `GUIDE_UI_STRINGS`.
- Help guide, flag list: `<li>a drive your times don&rsquo;t leave enough time for</li>`.

- [ ] **Step 1:** edit both files. **Step 2:** `TZ=UTC npx vitest run lib/help-guide.test.ts components/trip/help-guide.test.tsx` → PASS; `npx eslint components/trip/help-guide.tsx`; `npx tsc --noEmit`.
- [ ] **Step 3: Commit** `docs: a drive's Travel time in the form, on the card and in a Flag`.

---

## Once per branch (main session, not a task)

`npm test` + `npm run build` + `npm run test:integration` (when the local DB is up), per CLAUDE.md's verification tiers.
