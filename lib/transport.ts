/**
 * Transport display helpers for the Trip Planner.
 *
 * Pure utility — no side effects, no imports from server code.
 */

import {
  Plane,
  Train,
  Bus,
  Car,
  Ship,
  MoreHorizontal,
  type LucideIcon,
} from "lucide-react";
import { TRANSPORT_MODES, type TransportMode } from "@/lib/enums";

// ---------------------------------------------------------------------------
// Mode metadata
// ---------------------------------------------------------------------------

export interface TransportModeMeta {
  value: TransportMode;
  label: string;
  icon: LucideIcon;
}

export const TRANSPORT_MODE_META: Record<TransportMode, TransportModeMeta> = {
  FLIGHT: { value: "FLIGHT", label: "Flight", icon: Plane },
  TRAIN: { value: "TRAIN", label: "Train", icon: Train },
  BUS: { value: "BUS", label: "Bus", icon: Bus },
  CAR: { value: "CAR", label: "Car", icon: Car },
  FERRY: { value: "FERRY", label: "Ferry", icon: Ship },
  OTHER: { value: "OTHER", label: "Other", icon: MoreHorizontal },
};

/** Ordered list of mode meta (preserving TRANSPORT_MODES order). */
export const TRANSPORT_MODE_LIST: TransportModeMeta[] = TRANSPORT_MODES.map(
  (m) => TRANSPORT_MODE_META[m],
);

// ---------------------------------------------------------------------------
// Duration helpers
// ---------------------------------------------------------------------------

/**
 * Compute the duration in whole minutes between two Date instants (or ISO
 * datetime strings). Returns null if either value is missing, or if the
 * result would be negative (arr before dep).
 */
export function durationMinutes(
  depAt: Date | string | null | undefined,
  arrAt: Date | string | null | undefined,
): number | null {
  if (depAt == null || arrAt == null) return null;

  const dep = depAt instanceof Date ? depAt : new Date(depAt);
  const arr = arrAt instanceof Date ? arrAt : new Date(arrAt);

  // Guard against invalid dates
  if (isNaN(dep.getTime()) || isNaN(arr.getTime())) return null;

  const diff = Math.floor((arr.getTime() - dep.getTime()) / 60_000);
  if (diff < 0) return null;
  return diff;
}

/**
 * Format a duration given in whole minutes to a human-readable string.
 *
 * Examples:
 *   330  → "5h 30m"
 *   45   → "45m"
 *   60   → "1h"
 *   0    → "0m"
 */
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}
