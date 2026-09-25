"use client";

import * as React from "react";
import Link from "next/link";
import { useTransition } from "react";
import { createTrip } from "@/server/actions/trips";
import { compressImage } from "@/lib/image-compress";
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

/**
 * Companion-column grid for the form fields (LA-034, spec §3): below `lg` a
 * single column, as today; from `lg` up, details on the left and dates/cover
 * on the right, with the actions row spanning both columns beneath. Exported
 * for tests.
 */
export const NEW_TRIP_FORM_GRID_CLASS =
  "grid grid-cols-1 gap-6 lg:grid-cols-2 lg:grid-rows-[auto_1fr_auto] lg:gap-x-8";

export function NewTripForm() {
  const [isPending, startTransition] = useTransition();
  const [errors, setErrors] = React.useState<FieldErrors>({});

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const form = e.currentTarget;
    const data = new FormData(form);

    const startDate = (data.get("startDate") as string) || undefined;
    const endDate = (data.get("endDate") as string) || undefined;
    const coverFile = (data.get("cover") as File | null) ?? null;
    const homeName = (data.get("homeName") as string)?.trim() || undefined;
    const input = {
      name: data.get("name") as string,
      homeCurrency: data.get("homeCurrency") as string,
      ...(startDate ? { startDate } : {}),
      ...(endDate ? { endDate } : {}),
      ...(homeName ? { homeName } : {}),
    };

    startTransition(async () => {
      const rawCover = coverFile && coverFile.size > 0 ? coverFile : null;
      const cover = rawCover ? await compressImage(rawCover) : null;
      const result = await createTrip(input, cover);
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
    <form onSubmit={handleSubmit} noValidate>
      <div className={NEW_TRIP_FORM_GRID_CLASS}>
        {/* DOM order is the phone order (spec §3, I-4): name, dates, currency,
            home base, cover. From lg each piece is placed into its column
            explicitly — identity on the left, dates + cover on the right. Rows
            are auto/1fr/auto so the spanning pieces cross the 1fr row and
            neither column's height opens a gap in the other. */}
        {/* Trip name */}
        <Field
          label="Trip name"
          className="lg:col-start-1 lg:row-start-1"
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

        {/* Date range (optional — sketch first, set dates as you firm up stops) */}
        <div className="space-y-2 lg:col-start-2 lg:row-span-2 lg:row-start-1">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-foreground">Dates</span>
            <span className="text-xs text-muted-foreground">optional — sketch first</span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <DateField
              name="startDate"
              label="Start date"
              error={fieldError("startDate")}
              disabled={isPending}
            />
            <DateField
              name="endDate"
              label="End date"
              error={fieldError("endDate")}
              disabled={isPending}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Leave dates blank to start planning now and add dates later as you firm up stops.
          </p>
        </div>

        {/* Currency + home base: one grid item per field below lg, a left
            column group under the name from lg. */}
        <div className="contents lg:col-start-1 lg:row-span-2 lg:row-start-2 lg:flex lg:flex-col lg:gap-6">
          {/* Home currency */}
          <Field
            id="homeCurrency"
            label="Home currency"
            required
            error={fieldError("homeCurrency")}
            description="Trip totals will be shown in this currency."
          >
            <Select name="homeCurrency" defaultValue={DEFAULT_HOME_CURRENCY}>
              <SelectTrigger id="homeCurrency" disabled={isPending}>
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

          {/* Home base (optional) */}
          <Field
            label="Home base (optional)"
            error={fieldError("homeName")}
            description="Where this trip departs from and returns to. Leave blank to add later."
          >
            <Input name="homeName" placeholder="e.g. Sydney" disabled={isPending} />
          </Field>
        </div>

        {/* Cover photo (optional) */}
        <Field
          label="Cover photo (optional)"
          className="lg:col-start-2 lg:row-start-3"
          description="Upload a photo for this trip. You can change it later in Settings."
        >
          <Input type="file" name="cover" accept="image/*" disabled={isPending} />
        </Field>

        {/* Actions — spans both columns */}
        <div className="flex items-center justify-end gap-3 pt-2 lg:col-span-2 lg:row-start-4">
          <Button variant="ghost" asChild disabled={isPending}>
            <Link href="/trips">Cancel</Link>
          </Button>
          <Button type="submit" loading={isPending}>
            Create trip
          </Button>
        </div>
      </div>
    </form>
  );
}
