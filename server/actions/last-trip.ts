"use server";

import { cookies } from "next/headers";
import { LAST_TRIP_COOKIE } from "@/lib/last-trip";

const ONE_YEAR = 60 * 60 * 24 * 365;

/** Remember the trip just opened, for the trips-level sidebar's "Back to" card. Membership is re-checked on read (pickLastTrip). */
export async function rememberLastTrip(tripId: string): Promise<void> {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(tripId)) return;
  const store = await cookies();
  if (store.get(LAST_TRIP_COOKIE)?.value === tripId) return;
  store.set(LAST_TRIP_COOKIE, tripId, { path: "/", httpOnly: true, sameSite: "lax", maxAge: ONE_YEAR, secure: process.env.NODE_ENV === "production" });
}
