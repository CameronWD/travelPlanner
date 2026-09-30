"use client";

import * as React from "react";
import { useReducedMotion } from "motion/react";

export type MoneyEntranceState = "pending" | "play" | "static";

/** sessionStorage key gating the Cost tile's once-per-session count-up (MOTION.md M2). */
export const MONEY_COUNT_KEY = (tripId: string) => `money-count:${tripId}`;

const MoneyEntranceContext = React.createContext<MoneyEntranceState>("pending");

/**
 * "pending" is the SSR/no-`window` answer — the safe, animation-free
 * default. On the client this runs once (from `useState`'s lazy initialiser,
 * the same "compute once during render" idiom `useReducedMotion` itself
 * uses) rather than from an effect, so there's no synchronous setState to
 * avoid (react-hooks/set-state-in-effect) and the decision is already
 * settled by the very first client render — no separate "pending → play"
 * commit for the count-up to visibly skip past.
 */
function decideEntrance(tripId: string, reduce: boolean): MoneyEntranceState {
  if (typeof window === "undefined") return "pending";
  try {
    if (reduce || sessionStorage.getItem(MONEY_COUNT_KEY(tripId)) !== null) {
      return "static";
    }
    sessionStorage.setItem(MONEY_COUNT_KEY(tripId), "1");
    return "play";
  } catch {
    return "static";
  }
}

/**
 * Provides the Money page's entrance state to the Cost tile's motion (M1–M4):
 * reduced motion, or a session that has already played this trip's
 * count-up, goes straight to "static"; otherwise it marks the session and
 * this mount plays. Storage errors (private browsing, quota) also fall back
 * to "static" rather than replaying every render.
 */
export function MoneyEntrance({ tripId, children }: { tripId: string; children: React.ReactNode }) {
  const reduce = useReducedMotion();
  const [state] = React.useState<MoneyEntranceState>(() => decideEntrance(tripId, reduce === true));

  return <MoneyEntranceContext.Provider value={state}>{children}</MoneyEntranceContext.Provider>;
}

export function useMoneyEntrance(): MoneyEntranceState {
  return React.useContext(MoneyEntranceContext);
}
