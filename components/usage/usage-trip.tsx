"use client";

import { useEffect } from "react";
import { setUsageTrip } from "@/lib/usage/client";
import { useUsageScreen } from "@/components/usage/use-usage-screen";

export function UsageTrip({ tripId, startDate, endDate, zone }: { tripId: string; startDate: string | null; endDate: string | null; zone: string }) {
  useEffect(() => {
    setUsageTrip({ tripId, startDate, endDate, zone });
    return () => setUsageTrip(null);
  }, [tripId, startDate, endDate, zone]);
  useUsageScreen({ tripId, startDate, endDate, zone });
  return null;
}
