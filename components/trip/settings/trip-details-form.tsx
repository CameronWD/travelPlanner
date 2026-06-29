"use client";

import * as React from "react";
import { useTransition } from "react";
import { CheckCircle2 } from "lucide-react";
import { updateTrip, type UpdateTripResult } from "@/server/actions/trips";
import { CURRENCIES } from "@/lib/currencies";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { DateField } from "@/components/ui/date-field";
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
  };
}

type FieldErrors = Record<string, string[] | undefined>;

export function TripDetailsForm({ tripId, defaultValues }: TripDetailsFormProps) {
  const [isPending, startTransition] = useTransition();
  const [errors, setErrors] = React.useState<FieldErrors>({});
  const [saved, setSaved] = React.useState(false);
  const savedTimerRef = React.useRef<ReturnType<typeof setTimeout>>(undefined);

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

      <div className="flex items-center gap-3">
        <Button type="submit" loading={isPending}>
          Save changes
        </Button>
        {saved && (
          <span className="flex items-center gap-1.5 text-sm text-success">
            <CheckCircle2 className="size-4" aria-hidden="true" />
            Saved!
          </span>
        )}
      </div>
    </form>
  );
}
