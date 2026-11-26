import "server-only";
import { db } from "@/lib/db";
import { orderPlanStops } from "@/lib/plan-order";
import { REAL_PLAN } from "@/lib/plan-scope";
import type { SurpriseVisibility } from "@/lib/surprise-visibility";
import { tripCurrencies } from "@/lib/money/trip-currencies";

export async function loadTripCurrencies(
  tripId: string,
  homeCurrency: string,
  v: SurpriseVisibility,
): Promise<string[]> {
  const [stops, costs] = await Promise.all([
    db.stop.findMany({
      where: { tripId, ...REAL_PLAN, id: { notIn: v.hiddenStopIds } },
      orderBy: { sortOrder: "asc" },
      select: { id: true, countryCode: true, arriveDate: true, departDate: true, sortOrder: true },
    }),
    db.cost.findMany({
      where: { tripId, ...v.where.cost },
      distinct: ["currency"],
      orderBy: { createdAt: "asc" },
      select: { currency: true },
    }),
  ]);
  return tripCurrencies({
    homeCurrency,
    stopCountryCodes: orderPlanStops(stops).map((s) => s.countryCode),
    costCurrencies: costs.map((c) => c.currency),
  });
}
