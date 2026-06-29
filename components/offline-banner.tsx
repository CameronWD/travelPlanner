"use client";

import { WifiOff } from "lucide-react";
import { useOnlineStatus } from "@/components/ui/use-online-status";

/**
 * App-wide banner shown while the device is offline. Trip pages visited (or
 * pre-warmed) while online are served from the SW cache, so the user can still
 * read their itinerary — but edits need a connection.
 */
export function OfflineBanner() {
  const online = useOnlineStatus();
  if (online) return null;
  return (
    <div
      role="status"
      className="sticky top-0 z-50 flex items-center justify-center gap-2 bg-warning px-4 py-1.5 text-center text-sm font-medium text-warning-foreground"
    >
      <WifiOff className="size-4 shrink-0" aria-hidden />
      You&apos;re offline — showing your saved trip. Changes need a connection.
    </div>
  );
}
