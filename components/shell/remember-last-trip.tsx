"use client";

import { useEffect } from "react";
import { rememberLastTrip } from "@/server/actions/last-trip";

let lastSent: string | null = null;

/** Mounted by the trip layout: one tiny action per trip opened, never per page. */
export function RememberLastTrip({ tripId }: { tripId: string }) {
  useEffect(() => {
    if (lastSent === tripId) return;
    lastSent = tripId;
    rememberLastTrip(tripId).catch(() => { lastSent = null; });
  }, [tripId]);
  return null;
}
