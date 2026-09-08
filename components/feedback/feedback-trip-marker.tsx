"use client";

import { useEffect } from "react";
import { clearCurrentTrip, setCurrentTrip } from "@/lib/feedback-trip-store";

/**
 * Renders nothing; tells the Feedback panel which Trip is on screen so a note
 * written here carries the trip's name (snapshotted, see ADR 0040).
 */
export function FeedbackTripMarker({
  tripId,
  tripName,
}: {
  tripId: string;
  tripName: string;
}) {
  useEffect(() => {
    setCurrentTrip({ tripId, tripName });
    return () => clearCurrentTrip();
  }, [tripId, tripName]);

  return null;
}
