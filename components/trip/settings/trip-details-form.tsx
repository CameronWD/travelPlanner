"use client";

import * as React from "react";
import { useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { updateTrip, setForksEnabled, type UpdateTripResult } from "@/server/actions/trips";
import { tripPath } from "@/lib/trip-path";
import { CURRENCIES } from "@/lib/currencies";
import { TIMEZONES } from "@/lib/tz";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { DateField } from "@/components/ui/date-field";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
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
    homeTimezone?: string | null;
    roundTrip?: boolean;
    /** Plan variants (Forks) on for this trip — opt-in, off by default (spec B3). */
    forksEnabled?: boolean;
  };
}

type FieldErrors = Record<string, string[] | undefined>;

export function TripDetailsForm({ tripId, defaultValues }: TripDetailsFormProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const [errors, setErrors] = React.useState<FieldErrors>({});
  const [saved, setSaved] = React.useState(false);
  const savedTimerRef = React.useRef<ReturnType<typeof setTimeout>>(undefined);
  const [forksEnabled, setForksEnabledState] = React.useState(defaultValues.forksEnabled ?? false);
  const [forksError, setForksError] = React.useState<string | undefined>(undefined);
  const [forksPending, startForksTransition] = useTransition();

  // Home base timezone picker (spec 2026-10-14): only shown while a Home base
  // is set, and only submitted when the Traveller actually touched the
  // picker in this form session — otherwise a Home base rename would resend
  // the stale old zone, which wins server-side and blocks the re-guess.
  const [homeName, setHomeName] = React.useState(defaultValues.homeName ?? "");
  const [homeTimezone, setHomeTimezone] = React.useState(defaultValues.homeTimezone ?? "");
  const [homeTimezoneTouched, setHomeTimezoneTouched] = React.useState(false);

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
      homeTimezone: homeTimezoneTouched ? homeTimezone : "",
      roundTrip: data.get("roundTrip") === "on",
    };

    startTransition(async () => {
      const result: UpdateTripResult = await updateTrip(tripId, input);
      if (!result.success) {
        setErrors(result.errors);
      } else {
        setErrors({});
        setSaved(true);
        // Reset "touched" now that the picked zone has been saved: the picker
        // keeps showing it (homeTimezone state is untouched), but a later
        // rename in this same session won't resend it as if freshly picked,
        // which would win server-side and block the re-guess (spec A3).
        setHomeTimezoneTouched(false);
        savedTimerRef.current = setTimeout(() => setSaved(false), 3000);

        // A rename moved the Trip to a new slug: put it in the address bar and
        // refresh so the shell's trip list (used by every link) picks it up.
        if (result.slug) {
          const next = tripPath(result.slug, "/settings");
          if (pathname !== next) {
            router.replace(next);
            router.refresh();
          }
        }
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
        setForksError(result.errors._?.[0] ?? "Couldn't change what-if plans. Try again.");
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
        description="The trip must end by this date. Plans that run up to or past it will be flagged."
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
                {c.code} · {c.name}
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
          value={homeName}
          onChange={(e) => setHomeName(e.target.value)}
          placeholder="e.g. Sydney"
          disabled={isPending}
        />
      </Field>

      {homeName.trim() !== "" && (
        <Field
          label="Home base timezone"
          error={fieldError("homeTimezone")}
          description="Used for the times of flights from and to home."
        >
          <Select
            value={homeTimezone}
            onValueChange={(v) => {
              setHomeTimezone(v);
              setHomeTimezoneTouched(true);
            }}
          >
            <SelectTrigger disabled={isPending} aria-label="Home base timezone">
              <SelectValue placeholder="Select timezone" />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              {TIMEZONES.map((tz) => (
                <SelectItem key={tz.value} value={tz.value}>
                  {tz.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      )}

      <Field label="Round trip" id="roundTrip">
        <Checkbox
          id="roundTrip"
          name="roundTrip"
          strike={false}
          defaultChecked={defaultValues.roundTrip ?? true}
          disabled={isPending}
          className="text-sm"
          label="Nudge me to book a flight home from the last stop."
        />
      </Field>

      <div className="space-y-1.5">
        <div className="flex min-h-11 items-center justify-between gap-3">
          <label htmlFor="forksEnabled" className="min-w-0 flex-1 text-sm font-semibold text-foreground">
            What-if plans
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
          Keep what-if plans beside the real plan. Off by default.
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
