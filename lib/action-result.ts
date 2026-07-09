import type { ZodError } from "zod";

/** Field-keyed validation errors. Form-level errors live under the "_" key. */
export type FieldErrors = Record<string, string[]>;

/** The single failure shape every mainstream action shares. */
export type ActionFailure = { success: false; errors: FieldErrors };

/**
 * Discriminated result for server actions.
 *
 * The generic is the *success-branch extension*: `ActionResult` is a plain
 * success|failure, `ActionResult<{ conflicts?: FlowConflict[] }>` adds fields
 * to the success branch only. This preserves every existing caller contract —
 * payload fields stay top-level (e.g. `result.tripId`), never nested.
 */
export type ActionResult<TSuccess extends object = Record<never, never>> =
  | ({ success: true } & TSuccess)
  | ActionFailure;

/** Build a success result, optionally spreading a payload onto it. */
export function ok(): ActionResult;
export function ok<T extends object>(data: T): ActionResult<T>;
export function ok<T extends object>(data?: T): ActionResult<T> {
  return { success: true, ...(data ?? {}) } as ActionResult<T>;
}

/** Build a failure result from a field-error dict. */
export function fail(errors: FieldErrors): ActionFailure {
  return { success: false, errors };
}

/**
 * Flatten a ZodError into `FieldErrors`. Missing per-field arrays become `[]`;
 * schema/form-level errors are surfaced under the "_" key. This is the superset
 * of the ~11 hand-rolled `validationErrors` helpers it replaces.
 */
export function flattenZodErrors(error: ZodError): FieldErrors {
  const flat = error.flatten();
  const fieldErrors: FieldErrors = {};
  for (const [key, msgs] of Object.entries(
    flat.fieldErrors as Record<string, string[] | undefined>,
  )) {
    fieldErrors[key] = msgs ?? [];
  }
  if (flat.formErrors.length > 0) {
    fieldErrors["_"] = flat.formErrors;
  }
  return fieldErrors;
}

/** Convenience: a failure result straight from a ZodError. */
export function validationResult(error: ZodError): ActionFailure {
  return { success: false, errors: flattenZodErrors(error) };
}
