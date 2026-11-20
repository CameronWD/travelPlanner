"use client";

import { useEffect } from "react";
import { startUsage } from "@/lib/usage/client";
import { useUsageScreen } from "@/components/usage/use-usage-screen";

export function UsageRecorder({ userId }: { userId: string }) {
  useEffect(() => {
    startUsage(userId);
  }, [userId]);
  useUsageScreen(null);
  return null;
}
