import { after } from "next/server";
import { hasServerKey } from "@/lib/google-fetch";

type Run = { again: boolean; done: Promise<void> };

const running = new Map<string, Run>();
let refreshModule: Promise<typeof import("./refresh")> | undefined;
let venueModule: Promise<typeof import("@/lib/venue-status/refresh")> | undefined;

function loadRefresh(): Promise<typeof import("./refresh")> {
  refreshModule ??= import("./refresh").catch((err) => {
    refreshModule = undefined;
    throw err;
  });
  return refreshModule;
}

function loadVenueRefresh(): Promise<typeof import("@/lib/venue-status/refresh")> {
  venueModule ??= import("@/lib/venue-status/refresh").catch((err) => {
    venueModule = undefined;
    throw err;
  });
  return venueModule;
}

async function refreshVenues(tripId: string): Promise<void> {
  try {
    const { refreshVenueStatuses } = await loadVenueRefresh();
    await refreshVenueStatuses(tripId);
  } catch (err) {
    console.error(`[venue-status] refresh failed for trip ${tripId}:`, err instanceof Error ? err.message : String(err));
  }
}

function logFailure(tripId: string, err: unknown): void {
  console.error(`[travel-times] refresh failed for trip ${tripId}:`, err instanceof Error ? err.message : String(err));
}

async function refreshUntilQuiet(tripId: string, run: Run): Promise<void> {
  try {
    // Loaded here, not at the top: lib/revalidate.ts is imported by nearly every action, and this pulls in the database.
    const { refreshTripTravelTimes } = await loadRefresh();
    do {
      run.again = false;
      await refreshTripTravelTimes(tripId).catch((err) => logFailure(tripId, err));
      await refreshVenues(tripId);
    } while (run.again);
  } catch (err) {
    logFailure(tripId, err);
  } finally {
    running.delete(tripId);
  }
}

function runOnce(tripId: string): Promise<void> {
  const current = running.get(tripId);
  if (current) {
    current.again = true;
    return current.done;
  }
  const run: Run = { again: false, done: Promise.resolve() };
  running.set(tripId, run);
  run.done = refreshUntilQuiet(tripId, run);
  return run.done;
}

export function scheduleTravelTimes(tripId: string): void {
  try {
    if (!hasServerKey()) return;
    after(() => runOnce(tripId));
  } catch {
    // Outside a request (a script, a test) there is nothing to defer to; the operator script refreshes instead.
  }
}
