"use client";

import { toast } from "@/components/ui/use-toast";
import { failureMessage } from "@/components/ui/failure-message";
import type { ActionFailure, FieldErrors } from "@/lib/action-result";

/** The one wording for a rejected change (network drop, thrown server error). */
export const SOMETHING_WENT_WRONG = "Couldn't do that. Nothing changed. Try again.";

/** Unwraps either shape down to the field-error dict (ADR 0074). */
function errorsOf(x: ActionFailure | FieldErrors | undefined): FieldErrors | undefined {
  if (!x) return undefined;
  return "success" in x ? (x as ActionFailure).errors : (x as FieldErrors);
}

/**
 * The first message across every field of a failed result, else the
 * fallback. Accepts a full `ActionFailure` or a bare `FieldErrors` dict
 * (ADR 0074): components read failures only through this and `formError`.
 */
export function firstErrorMessage(
  x: ActionFailure | FieldErrors | undefined,
  fallback: string,
): string {
  const errors = errorsOf(x);
  return (errors ? Object.values(errors).flat()[0] : undefined) ?? fallback;
}

/** The form-level message (the `"_"` key), if there is one. */
export function formError(x: ActionFailure | FieldErrors | undefined): string | undefined {
  return errorsOf(x)?.["_"]?.[0];
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
