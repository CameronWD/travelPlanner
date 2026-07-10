"use client";

import * as React from "react";
import { updateDrivingSettings } from "@/server/actions/driving-settings";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

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
    <div className="space-y-5">
      <Field
        id="winding-factor"
        label="Road winding factor"
        description="Multiplies straight-line distance to estimate actual road distance (1.0 = straight, 3.0 = very winding)."
      >
        <Input
          type="number"
          inputMode="decimal"
          min={1}
          max={3}
          step={0.1}
          value={windingStr}
          disabled={isPending}
          onChange={handleWindingChange}
        />
      </Field>

      <Field
        id="avg-speed"
        label="Average speed (km/h)"
        description="Assumed average speed for estimating drive time between stops."
      >
        <Input
          type="number"
          inputMode="numeric"
          min={20}
          max={150}
          step={5}
          value={speedStr}
          disabled={isPending}
          onChange={handleSpeedChange}
        />
      </Field>

      <p className="text-xs text-muted-foreground">
        These are rough offline estimates used to flag long driving days — not real ETAs or
        navigation guidance.
      </p>
    </div>
  );
}
