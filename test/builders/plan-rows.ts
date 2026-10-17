/**
 * `PlanRows` builder for page tests that mock `@/lib/plan-reads`'s `readPlan`
 * (spec 2026-10-14 Q10). Realistic defaults from `datedTripFixture()`;
 * override any field. `readPlan`'s own masking/placeholder/query-shape
 * behaviour is pinned in `lib/plan-reads.test.ts` — a page test only needs
 * to hand back the PlanRows a real call would have produced for its
 * scenario, not re-prove how `readPlan` got there.
 */
import { NO_SURPRISES } from "@/lib/surprise-visibility";
import type { PlanRows } from "@/lib/plan-reads";
import { parseOpeningHours } from "@/lib/validations/opening-hours";
import { datedTripFixture } from "./index";

export function planRows(o: Partial<PlanRows> = {}): PlanRows {
  const f = datedTripFixture();
  return {
    trip: { ...f.trip, members: [], stops: f.stops.map((s) => ({ id: s.id, sortOrder: s.sortOrder, timezone: s.timezone, arriveDate: s.arriveDate, departDate: s.departDate })) } as never,
    plan: null,
    fork: null,
    visibility: NO_SURPRISES,
    stops: f.stops.map((s) => ({ ...s, surprise: null })),
    transports: f.transports,
    accommodations: f.stays,
    items: f.items.map((i) => ({ ...i, surprise: null, openingHours: parseOpeningHours(i.openingHours) })),
    costs: f.costs,
    exchangeRates: [],
    chapters: [],
    budgetItems: f.items.map((i) => ({ id: i.id, stopId: i.stopId, category: i.category, date: i.date, title: i.title })),
    budgetAccommodations: f.stays.map((a) => ({ id: a.id, stopId: a.stopId, checkIn: a.checkIn, checkOut: a.checkOut, name: a.name })),
    ...o,
  };
}
