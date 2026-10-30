import { after } from "next/server";
import { hasServerKey } from "@/lib/google-fetch";

type Run = { again: boolean; done: Promise<void> };

const running = new Map<string, Run>();
let refreshModule: Promise<typeof import("./refresh")> | undefined;

async function refreshUntilQuiet(tripId: string, run: Run): Promise<void> {
  try {
    // Loaded here, not at the top: lib/revalidate.ts is imported by nearly every action, and this pulls in the database.
    const { refreshTripTravelTimes } = await (refreshModule ??= import("./refresh"));
    do {
      run.again = false;
      await refreshTripTravelTimes(tripId).catch(() => undefined);
    } while (run.again);
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
  run.done = refreshUntilQuiet(tripId, run).catch(() => undefined);
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
