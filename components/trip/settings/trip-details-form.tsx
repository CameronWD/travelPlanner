"use client";

import * as React from "react";
import { useTransition } from "react";
import { CheckCircle2 } from "lucide-react";
import { updateTrip, setForksEnabled, type UpdateTripResult } from "@/server/actions/trips";
import { CURRENCIES } from "@/lib/currencies";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { DateField } from "@/components/ui/date-field";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface TripDetailsFormProps {
  tripId: string;
  defaultValues: {
    name: string;
    startDate: string;
    endDate: string;
    hardEndDate: string;
    homeCurrency: string;
    homeName?: string | null;
    roundTrip?: boolean;
    /** Plan variants (Forks) on for this trip — opt-in, off by default (spec B3). */
    forksEnabled?: boolean;
  };
}

type FieldErrors = Record<string, string[] | undefined>;

export function TripDetailsForm({ tripId, defaultValues }: TripDetailsFormProps) {
  const [isPending, startTransition] = useTransition();
  const [errors, setErrors] = React.useState<FieldErrors>({});
  const [saved, setSaved] = React.useState(false);
  const savedTimerRef = React.useRef<ReturnType<typeof setTimeout>>(undefined);
  const [forksEnabled, setForksEnabledState] = React.useState(defaultValues.forksEnabled ?? false);
  const [forksError, setForksError] = React.useState<string | undefined>(undefined);
  const [forksPending, startForksTransition] = useTransition();

  function fieldError(name: string): string | undefined {
    return errors[name]?.[0];
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaved(false);
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current);

    const form = e.currentTarget;
    const data = new FormData(form);

    const input = {
      name: data.get("name") as string,
      startDate: data.get("startDate") as string,
      endDate: data.get("endDate") as string,
      hardEndDate: data.get("hardEndDate") as string,
      homeCurrency: data.get("homeCurrency") as string,
      homeName: data.get("homeName") as string,
      roundTrip: data.get("roundTrip") === "on",
    };

    startTransition(async () => {
      const result: UpdateTripResult = await updateTrip(tripId, input);
      if (!result.success) {
        setErrors(result.errors);
      } else {
        setErrors({});
        setSaved(true);
        savedTimerRef.current = setTimeout(() => setSaved(false), 3000);
      }
    });
  }

  // Applies immediately (a Switch, not a form field): the Fork switcher and
  // every fork-aware page read the flag, so it doesn't wait for "Save changes".
  function handleForksToggle(next: boolean) {
    setForksEnabledState(next);
    setForksError(undefined);
    startForksTransition(async () => {
      const result = await setForksEnabled(tripId, next);
      if (!result.success) {
        setForksEnabledState(!next);
        setForksError(result.errors._?.[0] ?? "Couldn't change plan variants. Try again.");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      <Field label="Trip name" required error={fieldError("name")}>
        <Input
          name="name"
          defaultValue={defaultValues.name}
          placeholder="Europe Summer 2026"
          disabled={isPending}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <DateField
          name="startDate"
          label="Start date"
          required
          defaultValue={defaultValues.startDate}
          error={fieldError("startDate")}
          disabled={isPending}
        />
        <DateField
          name="endDate"
          label="End date"
          required
          defaultValue={defaultValues.endDate}
          error={fieldError("endDate")}
          disabled={isPending}
        />
      </div>

      <DateField
        name="hardEndDate"
        label="Hard end date (optional)"
        description="The trip must end by this date — we'll flag plans that run up to or past it."
        defaultValue={defaultValues.hardEndDate}
        min={defaultValues.startDate || undefined}
        error={fieldError("hardEndDate")}
        disabled={isPending}
      />

      <Field
        label="Home currency"
        required
        error={fieldError("homeCurrency")}
        description="Trip totals will be shown in this currency. Changing this won't convert existing cost entries."
      >
        <Select name="homeCurrency" defaultValue={defaultValues.homeCurrency}>
          <SelectTrigger disabled={isPending}>
            <SelectValue placeholder="Select currency" />
          </SelectTrigger>
          <SelectContent>
            {CURRENCIES.map((c) => (
              <SelectItem key={c.code} value={c.code}>
                {c.code} — {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field
        label="Home base"
        error={fieldError("homeName")}
        description="Where this trip departs from and returns to. Leave blank if you'd rather not set one."
      >
        <Input
          name="homeName"
          defaultValue={defaultValues.homeName ?? ""}
          placeholder="e.g. Sydney"
          disabled={isPending}
        />
      </Field>

      <Field label="Round trip">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            id="roundTrip"
            name="roundTrip"
            defaultChecked={defaultValues.roundTrip ?? true}
            disabled={isPending}
          />
          Nudge me to book a flight home from the last stop.
        </label>
      </Field>

      <div className="space-y-1.5">
        <div className="flex min-h-11 items-center justify-between gap-3">
          <label htmlFor="forksEnabled" className="min-w-0 flex-1 text-sm font-semibold text-foreground">
            Plan variants
          </label>
          <Switch
            id="forksEnabled"
            checked={forksEnabled}
            disabled={forksPending}
            aria-describedby="forksEnabled-description"
            onCheckedChange={handleForksToggle}
            className="disabled:opacity-45"
          />
        </div>
        <p id="forksEnabled-description" className="text-xs text-muted-foreground">
          Keep what-if versions of the plan side by side. Off by default.
        </p>
        {forksError && <p className="text-xs text-destructive">{forksError}</p>}
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" loading={isPending}>
          Save changes
        </Button>
        {saved && (
          <span className="flex items-center gap-1.5 text-sm text-teal-text">
            <CheckCircle2 className="size-4" aria-hidden="true" />
            Saved!
          </span>
        )}
      </div>
    </form>
  );
}
