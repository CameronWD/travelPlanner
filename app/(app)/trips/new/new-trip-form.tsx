"use client";

import * as React from "react";
import Link from "next/link";
import { useTransition } from "react";
import { createTrip } from "@/server/actions/trips";
import { CURRENCIES, DEFAULT_HOME_CURRENCY } from "@/lib/currencies";
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

type FieldErrors = Record<string, string[] | undefined>;

export function NewTripForm() {
  const [isPending, startTransition] = useTransition();
  const [errors, setErrors] = React.useState<FieldErrors>({});

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const form = e.currentTarget;
    const data = new FormData(form);

    const input = {
      name: data.get("name") as string,
      startDate: data.get("startDate") as string,
      endDate: data.get("endDate") as string,
      homeCurrency: data.get("homeCurrency") as string,
    };

    startTransition(async () => {
      const result = await createTrip(input);
      // If createTrip redirects successfully, this line won't be reached.
      // It only resolves here on a validation error.
      if (!result.success) {
        setErrors(result.errors);
      }
    });
  }

  function fieldError(name: string): string | undefined {
    return errors[name]?.[0];
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-6">
      {/* Trip name */}
      <Field
        label="Trip name"
        required
        error={fieldError("name")}
      >
        <Input
          name="name"
          placeholder="Europe Summer 2026"
          autoFocus
          disabled={isPending}
        />
      </Field>

      {/* Date range */}
      <div className="grid gap-4 sm:grid-cols-2">
        <DateField
          name="startDate"
          label="Start date"
          required
          error={fieldError("startDate")}
          disabled={isPending}
        />
        <DateField
          name="endDate"
          label="End date"
          required
          error={fieldError("endDate")}
          disabled={isPending}
        />
      </div>

      {/* Home currency */}
      <Field
        label="Home currency"
        required
        error={fieldError("homeCurrency")}
        description="Trip totals will be shown in this currency."
      >
        <Select name="homeCurrency" defaultValue={DEFAULT_HOME_CURRENCY}>
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

      {/* Actions */}
      <div className="flex items-center justify-end gap-3 pt-2">
        <Button variant="ghost" asChild disabled={isPending}>
          <Link href="/trips">Cancel</Link>
        </Button>
        <Button type="submit" loading={isPending}>
          Create trip
        </Button>
      </div>
    </form>
  );
}
