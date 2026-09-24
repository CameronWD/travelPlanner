"use client";

import * as React from "react";
import { BellRing } from "lucide-react";
import { setDigestEnabled, type TripDigestSetting } from "@/server/actions/digest";
import { EmptyState } from "@/components/ui/empty-state";
import { Switch } from "@/components/ui/switch";

export interface TripDigestsPanelProps {
  initial: TripDigestSetting[];
}

/**
 * Every Trip this Traveller is on, with a Digest switch for each.
 *
 * The Account view of the same `DigestPreference` rows each Trip's own
 * Settings page writes (CONTEXT.md **Account**) — one fact, two places, so
 * "am I getting digests, and for what?" is answerable without opening every
 * Trip. There is deliberately no switch here that isn't also one of those
 * per-trip rows: no account-wide mute.
 */
export function TripDigestsPanel({ initial }: TripDigestsPanelProps) {
  const [trips, setTrips] = React.useState<TripDigestSetting[]>(initial);
  const [pendingId, setPendingId] = React.useState<string | null>(null);
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  async function handleToggle(tripId: string, next: boolean) {
    const previous = trips.find((t) => t.tripId === tripId)?.enabled ?? !next;

    setTrips((prev) =>
      prev.map((t) => (t.tripId === tripId ? { ...t, enabled: next } : t)),
    );
    setErrors((prev) => {
      if (!(tripId in prev)) return prev;
      const rest = { ...prev };
      delete rest[tripId];
      return rest;
    });
    setPendingId(tripId);

    try {
      await setDigestEnabled(tripId, next);
    } catch {
      // Roll the switch back rather than leave it showing a state the server
      // never accepted — same rule as the per-trip Settings switch.
      setTrips((prev) =>
        prev.map((t) => (t.tripId === tripId ? { ...t, enabled: previous } : t)),
      );
      setErrors((prev) => ({
        ...prev,
        [tripId]: "Couldn't save that — check your connection and try again.",
      }));
    } finally {
      setPendingId(null);
    }
  }

  if (trips.length === 0) {
    return (
      <EmptyState
        icon={BellRing}
        tone="sun"
        title="No trips yet"
        description={<>You&rsquo;re not on any trips yet. Each trip you join gets its own switch here.</>}
      />
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {trips.map((trip) => {
        const inputId = `trip-digest-${trip.tripId}`;
        return (
          <div key={trip.tripId} className="flex flex-col gap-1">
            {/* Kit ListRow shape with a Switch at the end. The Switch sits beside
                the row, not in ListRow's `trailing` slot, because that slot is
                aria-hidden (it's meant for a decorative chevron). */}
            <div data-slot="digest-row" className="flex min-h-11 items-center justify-between gap-3">
              <label
                htmlFor={inputId}
                className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground"
              >
                {trip.tripName}
              </label>
              <Switch
                id={inputId}
                checked={trip.enabled}
                disabled={pendingId === trip.tripId}
                onCheckedChange={(next) => handleToggle(trip.tripId, next)}
                className="disabled:opacity-45"
              />
            </div>
            {errors[trip.tripId] && (
              <p className="text-xs text-destructive">{errors[trip.tripId]}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
