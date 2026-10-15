import type { ZodError } from "zod";

/** Field-keyed validation errors. Form-level errors live under the "_" key. */
export type FieldErrors = Record<string, string[]>;

/**
 * The one form-level key (ADR 0074 rule 2). The old split key is retired:
 * every action writes form-level errors here, and every component reads
 * them from here via `formError`/`firstErrorMessage`
 * (`@/components/ui/action-failure`).
 */
export const FORM_ERROR_KEY = "_";

/**
 * The single failure shape every mainstream action shares (ADR 0074 rule 2).
 * `TFailure` extends the failure branch only, parallel to `ActionResult`'s
 * `TSuccess` — e.g. a conflict payload or extra ids a caller needs alongside
 * the error. `code` is an optional machine-readable reason (e.g. `"disabled"`,
 * `"rate-limited"`) for a UI that branches on *why*, not just *that* it failed.
 */
export type ActionFailure<TFailure extends object = Record<never, never>> = {
  success: false;
  errors: FieldErrors;
  code?: string;
} & TFailure;

/**
 * Discriminated result for server actions.
 *
 * The generics are the *branch extensions*: `TSuccess` adds fields to the
 * success branch only, `TFailure` to the failure branch only. This preserves
 * every existing caller contract — payload fields stay top-level (e.g.
 * `result.tripId`), never nested.
 */
export type ActionResult<
  TSuccess extends object = Record<never, never>,
  TFailure extends object = Record<never, never>,
> = ({ success: true } & TSuccess) | ActionFailure<TFailure>;

/** Build a success result, optionally spreading a payload onto it. */
export function ok(): ActionResult;
export function ok<T extends object>(data: T): ActionResult<T>;
export function ok<T extends object>(data?: T): ActionResult<T> {
  return { success: true, ...(data ?? {}) } as ActionResult<T>;
}

/** Build a failure result from a field-error dict. */
export function fail(errors: FieldErrors): ActionFailure;
/** Build a failure result from a field-error dict, with extra failure-branch fields (e.g. `code`). */
export function fail<TFailure extends object>(
  errors: FieldErrors,
  extra: { code?: string } & TFailure,
): ActionFailure<TFailure>;
export function fail<TFailure extends object>(
  errors: FieldErrors,
  extra?: { code?: string } & TFailure,
): ActionFailure<TFailure> {
  return { success: false, errors, ...(extra ?? {}) } as ActionFailure<TFailure>;
}

/**
 * A form-level failure (ADR 0074 rule 2): the message goes under the one
 * form-level key, with an optional machine-readable `code` for a UI that
 * branches on the reason (e.g. `"disabled"`, `"rate-limited"`).
 */
export function formFail(message: string, code?: string): ActionFailure {
  return fail({ [FORM_ERROR_KEY]: [message] }, { code });
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
