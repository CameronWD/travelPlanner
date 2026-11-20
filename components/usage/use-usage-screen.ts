"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { PENDING_NAVIGATION_TIMEOUT_MS, useNavigationPending, type PendingNavigation } from "@/components/navigation/navigation-pending";
import { dayFromPathname } from "@/lib/day-path";
import { dayOffsetFrom, recordUsageScreen, type UsageTripContext } from "@/lib/usage/client";
import { isTripScreen, screenForPath } from "@/lib/usage/screens";
import { afterNextPaint, appearMs, probeSavedCopy, resetHiddenForTests, trackHidden, wasHiddenSince } from "@/lib/usage/timing";

let lastScreenKey: string | null = null;
let lastPending: PendingNavigation | null = null;
let firstPathname: string | null = null;
let movedOn = false;

export function resetUsageScreenForTests(): void {
  lastScreenKey = null;
  lastPending = null;
  firstPathname = null;
  movedOn = false;
  resetHiddenForTests();
}

export function useUsageScreen(trip: UsageTripContext | null): void {
  const pathname = usePathname();
  const pending = useNavigationPending();
  const tripRef = useRef(trip);
  const tripId = trip?.tripId ?? null;

  useEffect(() => {
    tripRef.current = trip;
  });

  useEffect(() => {
    if (pending) lastPending = pending;
  }, [pending]);

  useEffect(() => {
    try {
      if (!pathname) return;
      trackHidden();
      if (firstPathname === null) firstPathname = pathname;
      else if (pathname !== firstPathname) movedOn = true;
      const current = tripRef.current;
      const screen = screenForPath(pathname);
      if (!screen) {
        lastScreenKey = null;
        return;
      }
      if (isTripScreen(screen) !== (current !== null)) return;
      const key = `${screen}|${current?.tripId ?? ""}`;
      if (key === lastScreenKey) {
        if (lastPending?.pathname === pathname) lastPending = null;
        return;
      }
      lastScreenKey = key;

      const firstOfDocument = !movedOn;
      const entry = lastPending;
      lastPending = null;
      const startedAt =
        entry && entry.pathname === pathname && Date.now() - entry.startedAt <= PENDING_NAVIGATION_TIMEOUT_MS ? entry.startedAt : null;

      afterNextPaint(() => {
        try {
          const ms = wasHiddenSince(firstOfDocument ? null : startedAt) ? null : appearMs(startedAt, firstOfDocument);
          const dayIso = screen === "day" ? dayFromPathname(pathname) : null;
          const dayOffset = current && dayIso ? dayOffsetFrom(dayIso, current.zone) : null;
          const send = (saved: boolean) => recordUsageScreen({ screen, ms, saved, dayOffset, trip: current });
          if (firstOfDocument) probeSavedCopy(pathname).then(send, () => send(false)).catch(() => {});
          else send(false);
        } catch {}
      });
    } catch {}
  }, [pathname, tripId]);
}
