"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { saveTravellerDetails } from "@/server/actions/traveller-details";

export interface TravellerDetailsValues {
  mobile: string | null;
  emergencyName: string | null;
  emergencyPhone: string | null;
  bankDetails: string | null;
}

type Errors = Partial<Record<keyof TravellerDetailsValues, string>>;

/**
 * Traveller details on Account (CONTEXT.md; spec 2026-10-02 §E): the home
 * mobile, an emergency contact and bank details for transfers. The travel
 * number is per Trip and lives on the Trip's Settings. Each helper line says
 * exactly who sees the field, because that is the question a person has
 * before typing a bank account into a travel app.
 */
export function TravellerDetailsForm({ initial }: { initial: TravellerDetailsValues }) {
  const id = React.useId();
  const [values, setValues] = React.useState({
    mobile: initial.mobile ?? "",
    emergencyName: initial.emergencyName ?? "",
    emergencyPhone: initial.emergencyPhone ?? "",
    bankDetails: initial.bankDetails ?? "",
  });
  const [errors, setErrors] = React.useState<Errors>({});
  const [saved, setSaved] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  const set = (key: keyof TravellerDetailsValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setSaved(false);
    setValues((v) => ({ ...v, [key]: e.target.value }));
  };

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrors({});
    startTransition(async () => {
      const result = await saveTravellerDetails(values);
      if (result.success) {
        setSaved(true);
      } else {
        const next: Errors = {};
        for (const key of Object.keys(values) as Array<keyof TravellerDetailsValues>) {
          const msg = result.errors[key]?.[0];
          if (msg) next[key] = msg;
        }
        setErrors(next);
      }
    });
  }

  const field = (
    key: keyof TravellerDetailsValues,
    label: string,
    help: string,
    control: "input" | "textarea",
    extra: Record<string, unknown> = {},
  ) => (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={`${id}-${key}`}>{label}</Label>
      {control === "input" ? (
        <Input id={`${id}-${key}`} value={values[key]} onChange={set(key)} invalid={Boolean(errors[key])} {...extra} />
      ) : (
        <Textarea id={`${id}-${key}`} value={values[key]} onChange={set(key)} rows={3} {...extra} />
      )}
      <p className="text-xs text-muted-foreground">{help}</p>
      {errors[key] && <p className="text-xs font-medium text-destructive">{errors[key]}</p>}
    </div>
  );

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {field("mobile", "Mobile", "Fellow Travellers see this; a Share link only if its Contact details dial is on.", "input", { inputMode: "tel", autoComplete: "tel", maxLength: 40 })}
      {field("emergencyName", "Emergency contact name", "Only the people on your Trips ever see this.", "input", { maxLength: 80 })}
      {field("emergencyPhone", "Emergency contact number", "Only the people on your Trips ever see this.", "input", { inputMode: "tel", maxLength: 40 })}
      {field("bankDetails", "Bank details", "For transfers between Travellers. Never on a Share link.", "textarea", { maxLength: 500 })}
      <div className="flex items-center gap-3">
        <Button type="submit" variant="primary" size="md" loading={pending} disabled={pending}>
          Save details
        </Button>
        {saved && (
          <p role="status" className="text-sm font-semibold text-muted-foreground">
            Saved.
          </p>
        )}
      </div>
    </form>
  );
}
