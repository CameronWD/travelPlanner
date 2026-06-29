# Smarter Itinerary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Two independent "smart" additions to the itinerary: (3a) **feasibility checks** — flag when there isn't enough time to get between consecutive same-day activities; and (3b) **weather & daylight** on the day view — a forecast (or seasonal typical) plus locally-computed sunrise/sunset.

**Architecture:** 3a is a new pure `detectFlags` rule (`flagTightConnections`) reusing the existing `haversineKm`/`estimateDriveMinutes` geo helpers, surfaced as a Flag (→ Summary + Home next steps) and as an inline advisory list on the day view. 3b adds a pure offline `lib/daylight.ts` (NOAA sunrise/sunset from lat/lng + date — no network) and a `lib/weather.ts` Open-Meteo client (live forecast within ~16 days; archive "typical" beyond; in-memory cached), rendered in a `WeatherDaylightCard` on the day view. Open-Meteo is free + keyless; daylight needs no network so it always works offline.

**Tech Stack:** Next.js 16 (RSC + server `fetch`), Prisma 7, React 19, Tailwind v4, Vitest. No new deps (native `fetch`).

**Build order within this plan:** feasibility first (Tasks 1–2), then weather & daylight (Tasks 3–6).

---

### Task 1: Feasibility flag rule (`flagTightConnections`)

**Files:**
- Modify: `lib/flags.ts` (new rule + wire into `detectFlags`)
- Test: `lib/flags.test.ts` (read it for conventions)

Between consecutive same-day items that BOTH have `startTime`+`endTime` and `lat`+`lng`: estimate travel time (walk if ≤ 30 min at ~4.5 km/h, else drive via `estimateDriveMinutes`); `gap = nextStart − prevEnd` minutes. `gap < travel` → **warning**; `travel ≤ gap < travel + 15` → **info "tight"**. One flag per offending pair, DAY-targeted.

- [ ] **Step 1: Write failing tests**

Add to `lib/flags.test.ts` a `describe("flagTightConnections")`:
1. Two close items (e.g. 0.2 km apart, prev ends 12:00, next starts 12:05) → no walk time issue? 0.2km walk ≈ 3 min ≤ gap 5 → fine, no flag.
2. Impossible: items ~2 km apart (walk ≈ 27 min ≤ 30 so mode=walk, travel≈27), prev ends 12:00, next starts 12:10 (gap 10 < 27) → **warning** flag, DAY-targeted on that date.
3. Tight: travel ≈ 12 min, gap = 20 (12 ≤ 20 < 27) → **info** flag.
4. Far apart (> 30-min walk, e.g. 50 km) uses DRIVE estimate, not walk.
5. Skips pairs where either item lacks times or coords; skips items on different days.

Use `HH:MM` times. Helper to convert `HH:MM`→minutes is internal to the rule.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run lib/flags.test.ts`
Expected: FAIL (`flagTightConnections` not exported).

- [ ] **Step 3: Implement the rule**

Add to `lib/flags.ts` (it already imports `haversineKm`, `estimateDriveMinutes`, `LatLng`):

```ts
export const TIGHT_CONNECTION_BUFFER_MIN = 15;
const WALK_KMH = 4.5;
const MAX_WALK_MIN = 30;

function hhmmToMin(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

/**
 * Rule 12: tight / impossible connections (warning / info).
 * For consecutive same-day items with times + coords, estimate travel time
 * (walk if ≤30 min, else drive) and flag when the gap can't cover it.
 */
export function flagTightConnections(
  items: FlagItem[],
  opts: { windingFactor: number; avgSpeedKph: number },
): Flag[] {
  // located + fully-timed items, grouped by date
  const byDate = new Map<string, (FlagItem & { lat: number; lng: number; startTime: string; endTime: string })[]>();
  for (const it of items) {
    if (!it.date || !it.startTime || !it.endTime || it.lat == null || it.lng == null) continue;
    const arr = byDate.get(it.date) ?? [];
    arr.push(it as FlagItem & { lat: number; lng: number; startTime: string; endTime: string });
    byDate.set(it.date, arr);
  }

  const flags: Flag[] = [];
  for (const [date, dayItems] of byDate) {
    const sorted = [...dayItems].sort((a, b) => hhmmToMin(a.startTime) - hhmmToMin(b.startTime));
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const next = sorted[i];
      const km = haversineKm({ lat: prev.lat, lng: prev.lng }, { lat: next.lat, lng: next.lng });
      const walkMin = (km / WALK_KMH) * 60;
      const travel = walkMin <= MAX_WALK_MIN ? walkMin : estimateDriveMinutes(km, opts);
      const gap = hhmmToMin(next.startTime) - hhmmToMin(prev.endTime);
      if (gap < travel) {
        flags.push({
          id: `tight-${prev.id}-${next.id}`,
          severity: "warning",
          message: `Tight on ${date}: only ${Math.max(0, Math.round(gap))} min between activities, but ~${Math.round(travel)} min to get there.`,
          targetType: "DAY",
          date,
        });
      } else if (gap < travel + TIGHT_CONNECTION_BUFFER_MIN) {
        flags.push({
          id: `tight-${prev.id}-${next.id}`,
          severity: "info",
          message: `Cutting it close on ${date}: ${Math.round(gap)} min between activities (~${Math.round(travel)} min to get there).`,
          targetType: "DAY",
          date,
        });
      }
    }
  }
  return flags;
}
```

Wire into `detectFlags`'s returned array (after `flagSpreadDays`): `...flagTightConnections(items, { windingFactor: drivingWindingFactor ?? 1.5, avgSpeedKph: drivingAvgSpeedKph ?? 80 }),`.

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run lib/flags.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/flags.ts lib/flags.test.ts
git commit -m "feat(itinerary): flagTightConnections — feasibility checks between activities"
```

---

### Task 2: Inline feasibility advisory on the day view

**Files:**
- Modify: `app/(app)/trips/[tripId]/day/[date]/page.tsx`
- Create: `components/trip/day-feasibility.tsx`
- Test: `components/trip/day-feasibility.test.tsx`

Render the tight/impossible connections for *this* day as a compact advisory block on the day page (the Flag already covers Summary/Home). Reuse `flagTightConnections` filtered to `effectiveDate`.

- [ ] **Step 1: Failing test**

Create `components/trip/day-feasibility.test.tsx`: `DayFeasibility` given an array of `{severity, message}` renders one row per entry with the message; given `[]` renders nothing (`container.firstChild` null).

- [ ] **Step 2: Run to verify failure** — `npx vitest run components/trip/day-feasibility.test.tsx` → FAIL.

- [ ] **Step 3: Implement `components/trip/day-feasibility.tsx`**

```tsx
import { AlertTriangle, Clock } from "lucide-react";

export interface DayFeasibilityEntry {
  severity: "warning" | "info";
  message: string;
}

export function DayFeasibility({ entries }: { entries: DayFeasibilityEntry[] }) {
  if (entries.length === 0) return null;
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-card px-4 py-3">
      <h3 className="text-sm font-medium text-muted-foreground">Getting around</h3>
      {entries.map((e, i) => (
        <p key={i} className={`flex items-start gap-2 text-sm ${e.severity === "warning" ? "text-warning-foreground" : "text-muted-foreground"}`}>
          {e.severity === "warning" ? <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden /> : <Clock className="mt-0.5 size-4 shrink-0" aria-hidden />}
          <span>{e.message}</span>
        </p>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Wire into the day page**

In `app/(app)/trips/[tripId]/day/[date]/page.tsx`: import `flagTightConnections` from `@/lib/flags` and `DayFeasibility`. After `dayItems` is built, compute:

```ts
const feasibility = flagTightConnections(
  items.filter((it) => it.date === effectiveDate).map((it) => ({
    id: it.id, date: it.date, startTime: it.startTime, endTime: it.endTime, lat: it.lat, lng: it.lng,
  })),
  { windingFactor: 1.5, avgSpeedKph: 80 },
).map((f) => ({ severity: f.severity, message: f.message }));
```

Render `<DayFeasibility entries={feasibility} />` just above the Timeline card.

- [ ] **Step 5: Verify** — `npx vitest run components/trip/day-feasibility.test.tsx && npx tsc --noEmit && npx eslint components/trip/day-feasibility.tsx "app/(app)/trips/[tripId]/day/[date]/page.tsx"` → pass/clean.

- [ ] **Step 6: Commit**

```bash
git add components/trip/day-feasibility.tsx components/trip/day-feasibility.test.tsx "app/(app)/trips/[tripId]/day/[date]/page.tsx"
git commit -m "feat(itinerary): inline feasibility advisory on the day view"
```

---

### Task 3: Offline daylight (`lib/daylight.ts`)

**Files:**
- Create: `lib/daylight.ts`
- Test: `lib/daylight.test.ts`

Pure NOAA sunrise/sunset from lat/lng + date, returned as UTC HH:MM plus day-length minutes. No network.

- [ ] **Step 1: Failing tests**

Create `lib/daylight.test.ts`. Known references (UTC, ±6 min tolerance):
- London (51.5074, -0.1278) on 2026-06-21: sunrise ≈ 03:43 UTC, sunset ≈ 20:21 UTC, dayLengthMin ≈ 996 (±15).
- A high-arctic case (Rovaniemi 66.5, 25.73) on 2026-06-21 returns `polarDay: true` (sun never sets) — assert the function reports continuous daylight rather than NaN.
- Equator (0, 0) on 2026-03-20 (equinox): dayLengthMin ≈ 720 (±20).

Shape: `daylight(lat, lng, dateISO)` → `{ sunriseUTC: string | null; sunsetUTC: string | null; dayLengthMin: number; polarDay: boolean; polarNight: boolean }` (HH:MM strings, null on polar day/night).

- [ ] **Step 2: Run to verify failure** — `npx vitest run lib/daylight.test.ts` → FAIL.

- [ ] **Step 3: Implement `lib/daylight.ts`**

Implement the standard NOAA solar algorithm (no deps). Outline (the engineer fills in the well-known formulae):
- Day-of-year from `dateISO`. Fractional year γ. Equation of time + solar declination from γ.
- Hour angle `ha = acos( cos(90.833°)/(cos lat·cos decl) − tan lat·tan decl )`. If the `acos` argument > 1 → **polar night** (sun never rises); < −1 → **polar day** (never sets). Handle both: return `{sunriseUTC:null, sunsetUTC:null, dayLengthMin: 0|1440, polarNight|polarDay:true}`.
- Sunrise/sunset minutes (UTC) from `720 − 4·(lng ± ha°) − eqTime`. Convert to `HH:MM`. `dayLengthMin = sunsetMin − sunriseMin`.
Document the formula source in a comment. Keep it pure (no `Date.now()`; parse `dateISO` via `parseISODate` from `@/lib/dates`).

- [ ] **Step 4: Run to verify pass** — `npx vitest run lib/daylight.test.ts` → PASS (within tolerances).

- [ ] **Step 5: Commit**

```bash
git add lib/daylight.ts lib/daylight.test.ts
git commit -m "feat(itinerary): offline daylight (NOAA sunrise/sunset)"
```

---

### Task 4: Weather client (`lib/weather.ts`)

**Files:**
- Create: `lib/weather.ts`
- Test: `lib/weather.test.ts`

Open-Meteo client. Within ~16 days of `today` → live forecast; beyond → archive "typical" (same calendar date, previous year). In-memory cache by rounded coords + date. `weathercode` → a small condition label + icon key.

- [ ] **Step 1: Failing tests (mock `fetch`)**

Create `lib/weather.test.ts`. Stub global `fetch` (vi.fn). `getDayWeather({lat, lng, dateISO, today})`:
1. `dateISO` within 16 days of `today` → calls the **forecast** endpoint (`api.open-meteo.com/v1/forecast`), returns `{ source: "forecast", highC, lowC, code, label }` parsed from a mocked daily payload.
2. `dateISO` > 16 days out → calls the **archive** endpoint (`archive-api.open-meteo.com`) for the previous year's same date, returns `{ source: "typical", ... }`.
3. Second identical call within the same test hits the in-memory cache → `fetch` called only once.
4. A `fetch` rejection/non-ok → returns `null` (never throws; weather is best-effort).
Assert the URL host + that `latitude`/`longitude`/date params are present.

- [ ] **Step 2: Run to verify failure** — `npx vitest run lib/weather.test.ts` → FAIL.

- [ ] **Step 3: Implement `lib/weather.ts`**

```ts
import { daysBetween, parseISODate } from "@/lib/dates";

export interface DayWeather {
  source: "forecast" | "typical";
  highC: number | null;
  lowC: number | null;
  code: number | null;
  label: string;
}

const FORECAST_WINDOW_DAYS = 16;
const cache = new Map<string, DayWeather | null>();
const round = (n: number) => Math.round(n * 10) / 10; // ~11km grid for cache key

/** WMO weather code → short label. */
export function weatherLabel(code: number | null): string {
  if (code == null) return "—";
  if (code === 0) return "Clear";
  if (code <= 2) return "Partly cloudy";
  if (code === 3) return "Overcast";
  if (code <= 48) return "Fog";
  if (code <= 67) return "Rain";
  if (code <= 77) return "Snow";
  if (code <= 82) return "Showers";
  if (code <= 86) return "Snow showers";
  return "Thunderstorm";
}

export async function getDayWeather(args: {
  lat: number; lng: number; dateISO: string; today: string;
}): Promise<DayWeather | null> {
  const { lat, lng, dateISO, today } = args;
  const key = `${round(lat)},${round(lng)},${dateISO}`;
  if (cache.has(key)) return cache.get(key)!;

  const out = daysBetween(today, dateISO); // dateISO - today, in days
  let result: DayWeather | null = null;
  try {
    if (out >= 0 && out <= FORECAST_WINDOW_DAYS) {
      const u = new URL("https://api.open-meteo.com/v1/forecast");
      u.searchParams.set("latitude", String(lat));
      u.searchParams.set("longitude", String(lng));
      u.searchParams.set("daily", "temperature_2m_max,temperature_2m_min,weathercode");
      u.searchParams.set("start_date", dateISO);
      u.searchParams.set("end_date", dateISO);
      u.searchParams.set("timezone", "UTC");
      const res = await fetch(u, { next: { revalidate: 3600 } });
      if (res.ok) {
        const j = await res.json();
        result = {
          source: "forecast",
          highC: j.daily?.temperature_2m_max?.[0] ?? null,
          lowC: j.daily?.temperature_2m_min?.[0] ?? null,
          code: j.daily?.weathercode?.[0] ?? null,
          label: weatherLabel(j.daily?.weathercode?.[0] ?? null),
        };
      }
    } else {
      // "Typical": same calendar date, previous year, from the archive API.
      const d = parseISODate(dateISO);
      const prevYear = `${d.getUTCFullYear() - 1}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
      const u = new URL("https://archive-api.open-meteo.com/v1/archive");
      u.searchParams.set("latitude", String(lat));
      u.searchParams.set("longitude", String(lng));
      u.searchParams.set("daily", "temperature_2m_max,temperature_2m_min,weathercode");
      u.searchParams.set("start_date", prevYear);
      u.searchParams.set("end_date", prevYear);
      u.searchParams.set("timezone", "UTC");
      const res = await fetch(u, { next: { revalidate: 86400 } });
      if (res.ok) {
        const j = await res.json();
        result = {
          source: "typical",
          highC: j.daily?.temperature_2m_max?.[0] ?? null,
          lowC: j.daily?.temperature_2m_min?.[0] ?? null,
          code: j.daily?.weathercode?.[0] ?? null,
          label: weatherLabel(j.daily?.weathercode?.[0] ?? null),
        };
      }
    }
  } catch {
    result = null; // best-effort; never throw
  }

  cache.set(key, result);
  return result;
}
```

- [ ] **Step 4: Run to verify pass** — `npx vitest run lib/weather.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/weather.ts lib/weather.test.ts
git commit -m "feat(itinerary): Open-Meteo weather client (forecast/typical, cached)"
```

---

### Task 5: `WeatherDaylightCard` + render on the day view (+ Today)

**Files:**
- Create: `components/trip/weather-daylight-card.tsx`
- Test: `components/trip/weather-daylight-card.test.tsx`
- Modify: `app/(app)/trips/[tripId]/day/[date]/page.tsx` (add stop `lat`/`lng` to select; compute daylight; fetch weather; render card)

- [ ] **Step 1: Failing test**

Create `components/trip/weather-daylight-card.test.tsx` (pure presentational): given `{ weather: {source:"forecast", highC:21, lowC:12, label:"Clear"}, daylight: {sunriseUTC:"05:30", sunsetUTC:"20:10", dayLengthMin:880, polarDay:false, polarNight:false} }` renders the temps (`21`/`12`), the label, and sunrise/sunset. With `source:"typical"` it shows a "typical" qualifier. With `weather: null` it still renders the daylight section (weather best-effort). With `polarDay:true` it shows "Daylight all day".

- [ ] **Step 2: Run to verify failure** — `npx vitest run components/trip/weather-daylight-card.test.tsx` → FAIL.

- [ ] **Step 3: Implement `components/trip/weather-daylight-card.tsx`**

A presentational card (`"use client"` not needed — pure server-render). Props: `{ weather: DayWeather | null; daylight: { sunriseUTC: string | null; sunsetUTC: string | null; dayLengthMin: number; polarDay: boolean; polarNight: boolean } }` (import the types). Show: temps `{high}° / {low}°C` + label (+ "typical" chip when `source==="typical"`); daylight row "☀ {sunrise} – {sunset} · {h}h {m}m of light", or "Daylight all day"/"Polar night" for the polar cases. Keep it compact (one card). All temps in °C, no toggle.

- [ ] **Step 4: Wire into the day page**

In `app/(app)/trips/[tripId]/day/[date]/page.tsx`:
- Add `lat: true, lng: true` to the `stop` select.
- Determine the day's stop coords: `const dayStop = stops.find((s) => s.id === dayPlan.stop?.id);` (dayPlan.stop is the active stop). If it has lat/lng, compute daylight + fetch weather; else render nothing.
- `import { daylight } from "@/lib/daylight"; import { getDayWeather } from "@/lib/weather"; import { todayISO } from "@/lib/dates"; import { WeatherDaylightCard } from "@/components/trip/weather-daylight-card";`
- `const dl = (dayStop?.lat != null && dayStop?.lng != null) ? daylight(dayStop.lat, dayStop.lng, effectiveDate) : null;`
- `const wx = (dayStop?.lat != null && dayStop?.lng != null) ? await getDayWeather({ lat: dayStop.lat, lng: dayStop.lng, dateISO: effectiveDate, today: todayISO() }) : null;`
- Render `{dl && <WeatherDaylightCard weather={wx} daylight={dl} />}` near the top of the day (under the DayNav, above the map).

(Note: `Today` redirects to / renders the current day via this same page, so it inherits weather + daylight automatically.)

- [ ] **Step 5: Verify** — `npx vitest run components/trip/weather-daylight-card.test.tsx && npx tsc --noEmit && npx eslint components/trip/weather-daylight-card.tsx "app/(app)/trips/[tripId]/day/[date]/page.tsx" && npx vitest run` → all pass/clean.

- [ ] **Step 6: Commit**

```bash
git add components/trip/weather-daylight-card.tsx components/trip/weather-daylight-card.test.tsx "app/(app)/trips/[tripId]/day/[date]/page.tsx"
git commit -m "feat(itinerary): weather + daylight card on the day view"
```

---

### Task 6: ADR + Open-Meteo attribution + final green

**Files:**
- Create: `docs/adr/0015-weather-data-strategy.md`
- Modify: a small attribution note (footer of `WeatherDaylightCard` or the day page) — "Weather by Open-Meteo".

- [ ] **Step 1: ADR 0015**

Create `docs/adr/0015-weather-data-strategy.md` (match `docs/adr/0013` format): **Decision** — weather from Open-Meteo (free, keyless); live forecast within ~16 days, archive previous-year "typical" beyond, clearly labelled; daylight computed offline (NOAA) so it never needs the network. **Context** — trips are planned months out, past the forecast horizon; the app must work offline. **Alternatives** — forecast-only (blank for far-future) rejected; a keyed provider (OpenWeather) rejected (key management for a 2-person app); deriving daylight from the API rejected (wanted offline + zero rate-limit). **Consequences** — weather is best-effort (null on fetch failure) and cached; °C only; attribution required (CC-BY).

- [ ] **Step 2: Attribution**

Add a tiny "Weather by Open-Meteo" caption (link `https://open-meteo.com/`) in the `WeatherDaylightCard` footer (only when `weather` is non-null).

- [ ] **Step 3: Full green**

Run: `npx vitest run && npx tsc --noEmit && npx eslint`
Expected: all pass / 0 errors.

- [ ] **Step 4: Commit**

```bash
git add docs/adr/0015-weather-data-strategy.md components/trip/weather-daylight-card.tsx
git commit -m "docs(itinerary): ADR 0015 weather data strategy + Open-Meteo attribution"
```

---

## Self-Review

**Spec coverage:** feasibility rule (walk ≤30min else drive; warning when gap<travel; info tight within +15) ✓ (T1) · skip no-time/no-coord/cross-day ✓ (T1) · Flag → Summary+Home (via detectFlags) ✓ (T1) · inline day hint ✓ (T2) · daylight offline ✓ (T3) · weather forecast ≤16d / typical beyond / labelled ✓ (T4) · day view + Today, °C, no toggle ✓ (T5) · Open-Meteo + attribution ✓ (T4/T6) · cached, best-effort ✓ (T4) · ADR ✓ (T6).

**Type consistency:** `flagTightConnections(items, {windingFactor, avgSpeedKph})`, `DayWeather {source,highC,lowC,code,label}`, `getDayWeather({lat,lng,dateISO,today})`, `daylight(lat,lng,dateISO) → {sunriseUTC,sunsetUTC,dayLengthMin,polarDay,polarNight}`, `DayFeasibility {entries:[{severity,message}]}`. Day page must add `lat`/`lng` to the stop select (flagged in T5).

**Placeholder scan:** none for pure logic/components; T3 references the standard NOAA formula by name with reference test values + tolerances (the algorithm is well-known; complete formula left to the implementer with documented references — acceptable as it's a textbook computation verified by the tests).
