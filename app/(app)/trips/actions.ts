"use server";

import { createTrip, type CreateTripResult } from "@/server/actions/trips";
import { DEFAULT_HOME_CURRENCY } from "@/lib/currencies";

/**
 * The first-run card's "Start planning" (TRIPS_PAGE.md §7; spec P4): a name
 * is all we ask. Delegates to the one createTrip, which validates, creates
 * the Trip and owner membership, and redirects to /trips/{id}.
 */
export async function startFirstTrip(name: string): Promise<CreateTripResult> {
  return createTrip({ name: name.trim(), homeCurrency: DEFAULT_HOME_CURRENCY }, null);
}
