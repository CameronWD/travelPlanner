"use client";

import * as React from "react";
import { useReducedMotion } from "motion/react";

export type MoneyEntranceState = "pending" | "play" | "static";

/** sessionStorage key gating the Cost tile's once-per-session count-up (MOTION.md M2). */
export const MONEY_COUNT_KEY = (tripId: string) => `money-count:${tripId}`;

const MoneyEntranceContext = React.createContext<MoneyEntranceState>("pending");

// External store: sessionStorage observed via useSyncExternalStore, the same
// idiom as components/ui/theme-provider.tsx, so the decision is made and
// applied AFTER the initial commit rather than during render (no setState in
// an effect, no storage write during render — see decide()/commit() below).
// `decided` locks each trip's outcome for as long as its <MoneyEntrance> stays
// mounted: without it, decide()'s own write (marking the trip played) would
// make the very next read see "already played" and flip a live "play" mount
// to "static" mid-animation. Clearing it on unmount means a later fresh mount
// (navigate away and back, same session) correctly sees "static".
const decided = new Map<string, "play" | "static">();
const subscribers = new Set<() => void>();

function notify() {
  for (const fn of subscribers) fn();
}

function subscribe(callback: () => void) {
  subscribers.add(callback);
  return () => {
    subscribers.delete(callback);
  };
}

/** Pure read — no write. Safe to call from `getSnapshot` (React may call it
 * more than once per commit to check for tearing). */
function decide(tripId: string, reduce: boolean): "play" | "static" {
  const cached = decided.get(tripId);
  if (cached) return cached;
  try {
    if (reduce || sessionStorage.getItem(MONEY_COUNT_KEY(tripId)) !== null) {
      return "static";
    }
    return "play";
  } catch {
    return "static";
  }
}

/** The one-time side effect (marking the trip played): only ever run from
 * the commit-phase effect below, never from `getSnapshot`. */
function commit(tripId: string, state: "play" | "static") {
  if (decided.has(tripId)) return;
  decided.set(tripId, state);
  if (state === "play") {
    try {
      sessionStorage.setItem(MONEY_COUNT_KEY(tripId), "1");
    } catch {
      // Private browsing / quota — nothing to persist; this mount still plays.
    }
  }
  notify();
}

const getServerSnapshot = (): MoneyEntranceState => "pending";

/**
 * Provides the Money page's entrance state to the Cost tile's motion (M1–M4).
 * Stays "pending" through the server render AND the client's first
 * (hydrating) render — matching the server markup exactly, so there's no
 * hydration mismatch — then resolves to "play" or "static" once mounted:
 * reduced motion, or a session that has already played this trip's
 * count-up, goes straight to "static"; otherwise it marks the session and
 * this mount plays. Storage errors (private browsing, quota) also fall back
 * to "static" rather than replaying every render.
 */
export function MoneyEntrance({ tripId, children }: { tripId: string; children: React.ReactNode }) {
  const reduce = useReducedMotion() === true;
  const getSnapshot = React.useCallback(() => decide(tripId, reduce), [tripId, reduce]);
  const state = React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  React.useEffect(() => {
    if (state === "pending") return;
    commit(tripId, state);
    return () => {
      decided.delete(tripId);
    };
  }, [state, tripId]);

  return <MoneyEntranceContext.Provider value={state}>{children}</MoneyEntranceContext.Provider>;
}

export function useMoneyEntrance(): MoneyEntranceState {
  return React.useContext(MoneyEntranceContext);
}
