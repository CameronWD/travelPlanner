"use client";

import { WifiOff } from "lucide-react";
import { useOnlineStatus } from "@/components/ui/use-online-status";

/**
 * App-wide banner shown while the device is offline. Trip pages visited (or
 * pre-warmed) while online are served from the SW cache, so the user can still
 * read their itinerary — but edits to the plan need a connection. The one
 * exception is a Feedback note, which queues and sends itself later (ADR
 * 0041), so the copy names plan changes rather than changes in general.
 */
export function OfflineBanner() {
  const online = useOnlineStatus();
  if (online) return null;
  return (
    <div
      role="status"
      className="sticky top-0 z-30 flex items-center justify-center gap-2 bg-warning px-4 py-1.5 text-center text-sm font-medium text-warning-foreground"
    >
      <WifiOff className="size-4 shrink-0" aria-hidden />
      You&apos;re offline — showing your saved trip. Plan changes need a
      connection; feedback will send when you&apos;re back.
    </div>
  );
}
