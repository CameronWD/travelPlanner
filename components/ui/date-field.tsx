"use client";

import * as React from "react";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export interface DateFieldProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  label: React.ReactNode;
  description?: React.ReactNode;
  error?: React.ReactNode;
  required?: boolean;
  /** Wrapper className (the Field container). */
  fieldClassName?: string;
}

/**
 * A native date input themed and wrapped in a <Field> so labels, help text,
 * and errors are wired consistently with the rest of the form primitives.
 */
const DateField = React.forwardRef<HTMLInputElement, DateFieldProps>(
  (
    { label, description, error, required, id, fieldClassName, ...props },
    ref,
  ) => (
    <Field
      label={label}
      description={description}
      error={error}
      required={required}
      id={id}
      className={fieldClassName}
    >
      <Input ref={ref} type="date" {...props} />
    </Field>
  ),
);
DateField.displayName = "DateField";

export { DateField };
