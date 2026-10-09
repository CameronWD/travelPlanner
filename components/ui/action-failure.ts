"use client";

import { toast } from "@/components/ui/use-toast";
import { failureMessage } from "@/components/ui/failure-message";
import type { FieldErrors } from "@/lib/action-result";

/** The one wording for a rejected change (network drop, thrown server error). */
export const SOMETHING_WENT_WRONG = "Couldn't save that. Nothing changed. Try again.";

/** The first message across every field of a failed result, else the fallback. */
export function firstErrorMessage(errors: FieldErrors | undefined, fallback: string): string {
  const first = errors ? Object.values(errors).flat()[0] : undefined;
  return first ?? fallback;
}

/**
 * The action answered `success: false` (spec 2026-10-06 §E): say what the
 * server said — a field-error dict or a plain `error` string — else the
 * fallback. The server answered, so the connection is not the reason.
 */
export function toastRefused(reason: FieldErrors | string | undefined, fallback: string): void {
  const title = typeof reason === "string" ? reason : firstErrorMessage(reason, fallback);
  toast({ variant: "destructive", title });
}

/**
 * The action rejected (network drop, thrown server error): the caller's
 * wording, or the offline message when the device is offline (ADR 0016).
 */
export function toastRejected(fallback: string = SOMETHING_WENT_WRONG): void {
  toast({ variant: "destructive", title: failureMessage(fallback) });
}
