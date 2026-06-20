"use client";

import * as React from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/cn";

type FieldContextValue = {
  controlId: string;
  descriptionId?: string;
  errorId?: string;
  invalid: boolean;
};

const FieldContext = React.createContext<FieldContextValue | null>(null);

/**
 * Hook for a control to wire itself to its surrounding <Field>: returns the
 * id to render on the control plus aria-describedby / aria-invalid. Returns
 * an empty object when used outside a Field so controls degrade gracefully.
 */
export function useFieldControl() {
  const ctx = React.useContext(FieldContext);
  if (!ctx) return {};
  const describedBy =
    [ctx.invalid ? ctx.errorId : undefined, ctx.descriptionId]
      .filter(Boolean)
      .join(" ") || undefined;
  return {
    id: ctx.controlId,
    "aria-describedby": describedBy,
    "aria-invalid": ctx.invalid || undefined,
  } as const;
}

export interface FieldProps {
  /** The label text shown above the control. */
  label: React.ReactNode;
  /** Optional helper text shown below the control. */
  description?: React.ReactNode;
  /** Error message; when set the field renders in its invalid state. */
  error?: React.ReactNode;
  /** Stable id for the control; auto-generated when omitted. */
  id?: string;
  /** Mark the field as required (adds a visual asterisk). */
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}

/**
 * Composes a Label, a control, and optional help/error text with the correct
 * aria wiring. The control reads its id/aria attributes via useFieldControl.
 */
const Field = React.forwardRef<HTMLDivElement, FieldProps>(
  (
    { label, description, error, id, required, className, children },
    ref,
  ) => {
    const generatedId = React.useId();
    const controlId = id ?? generatedId;
    const descriptionId = description ? `${controlId}-description` : undefined;
    const errorId = error ? `${controlId}-error` : undefined;
    const invalid = Boolean(error);

    const value = React.useMemo<FieldContextValue>(
      () => ({ controlId, descriptionId, errorId, invalid }),
      [controlId, descriptionId, errorId, invalid],
    );

    return (
      <FieldContext.Provider value={value}>
        <div ref={ref} className={cn("flex flex-col gap-1.5", className)}>
          <Label htmlFor={controlId}>
            {label}
            {required ? (
              <span className="ml-0.5 text-destructive" aria-hidden="true">
                *
              </span>
            ) : null}
          </Label>
          {children}
          {description && !error ? (
            <p id={descriptionId} className="text-xs text-muted-foreground">
              {description}
            </p>
          ) : null}
          {error ? (
            <p id={errorId} className="text-xs font-medium text-destructive">
              {error}
            </p>
          ) : null}
        </div>
      </FieldContext.Provider>
    );
  },
);
Field.displayName = "Field";

export { Field };
