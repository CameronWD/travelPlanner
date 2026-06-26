"use client";

import * as React from "react";
import { updateDrivingSettings } from "@/server/actions/driving-settings";

export interface DrivingEstimatesPanelProps {
  tripId: string;
  initialWindingFactor: number;
  initialAvgSpeedKph: number;
}

export function DrivingEstimatesPanel({
  tripId,
  initialWindingFactor,
  initialAvgSpeedKph,
}: DrivingEstimatesPanelProps) {
  // Track as strings so intermediate states (empty, partial like "1.") don't
  // corrupt the DOM-managed value when the user clears and re-types.
  const [windingStr, setWindingStr] = React.useState(String(initialWindingFactor));
  const [speedStr, setSpeedStr] = React.useState(String(initialAvgSpeedKph));
  const [isPending, startTransition] = React.useTransition();

  // Refs hold the latest numeric values committed to the server so each
  // handler can send the sibling's latest value without stale-closure issues.
  const latestWinding = React.useRef(initialWindingFactor);
  const latestSpeed = React.useRef(initialAvgSpeedKph);

  const handleWindingChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setWindingStr(raw);
    const value = parseFloat(raw);
    if (isNaN(value)) return;
    latestWinding.current = value;
    startTransition(async () => {
      await updateDrivingSettings(tripId, {
        windingFactor: value,
        avgSpeedKph: latestSpeed.current,
      });
    });
  };

  const handleSpeedChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setSpeedStr(raw);
    const value = parseFloat(raw);
    if (isNaN(value)) return;
    latestSpeed.current = value;
    startTransition(async () => {
      await updateDrivingSettings(tripId, {
        windingFactor: latestWinding.current,
        avgSpeedKph: value,
      });
    });
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label className="block text-sm font-medium text-foreground" htmlFor="winding-factor">
          Road winding factor
        </label>
        <input
          id="winding-factor"
          type="number"
          min={1}
          max={3}
          step={0.1}
          value={windingStr}
          disabled={isPending}
          onChange={handleWindingChange}
          className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
        />
        <p className="text-xs text-muted-foreground">
          Multiplies straight-line distance to estimate actual road distance (1.0 = straight, 3.0 =
          very winding).
        </p>
      </div>

      <div className="space-y-1.5">
        <label className="block text-sm font-medium text-foreground" htmlFor="avg-speed">
          Average speed (km/h)
        </label>
        <input
          id="avg-speed"
          type="number"
          min={20}
          max={150}
          step={5}
          value={speedStr}
          disabled={isPending}
          onChange={handleSpeedChange}
          className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
        />
        <p className="text-xs text-muted-foreground">
          Assumed average speed for estimating drive time between stops.
        </p>
      </div>

      <p className="text-xs text-muted-foreground">
        These are rough offline estimates used to flag long driving days — not real ETAs or
        navigation guidance.
      </p>
    </div>
  );
}
