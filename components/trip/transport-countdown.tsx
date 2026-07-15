"use client";

import * as React from "react";
import { Timer } from "lucide-react";

interface TransportCountdownProps {
  depAt: string; // ISO string of the departure instant
  depTimeLabel?: string; // e.g. "14:30"
  depZone?: string | null; // e.g. "JST" — shown after the time label
  label: string; // e.g. "Flight BA123"
}

/**
 * Live countdown to a transport departure.
 * Recomputes every minute. Renders nothing if the departure has passed.
 */
export function TransportCountdown({ depAt, depTimeLabel, depZone, label }: TransportCountdownProps) {
  const [msLeft, setMsLeft] = React.useState(() => new Date(depAt).getTime() - Date.now());

  React.useEffect(() => {
    const tick = () => {
      setMsLeft(new Date(depAt).getTime() - Date.now());
    };
    // Tick immediately in case of clock drift between render and now
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [depAt]);

  // Already departed — don't render
  if (msLeft <= 0) return null;

  const totalMinutes = Math.floor(msLeft / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  let countdown: string;
  if (hours > 0) {
    countdown = `${hours}h ${minutes}m`;
  } else {
    countdown = `${minutes}m`;
  }

  return (
    <div className="flex items-start gap-3 rounded-2xl border border-amber-200/60 bg-amber-50 dark:border-amber-800/40 dark:bg-amber-950/30 px-4 py-3">
      <Timer className="mt-0.5 size-5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
      <div className="flex-1 min-w-0">
        <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-amber-700 dark:text-amber-300">
          Next departure
        </span>
        <p className="mt-0.5 font-display text-2xl font-bold text-foreground">
          {countdown}
        </p>
        <p className="mt-0.5 text-xs text-amber-700/90 dark:text-amber-300/80">
          {label}
          {depTimeLabel && (
            <span className="ml-1">at {depTimeLabel}{depZone ? ` ${depZone}` : ""}</span>
          )}
        </p>
      </div>
    </div>
  );
}
