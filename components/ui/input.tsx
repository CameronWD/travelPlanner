import * as React from "react";
import { useFieldControl } from "@/components/ui/field";
import { cn } from "@/lib/cn";

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Visually mark the field as invalid and wire aria-invalid. */
  invalid?: boolean;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, invalid, type = "text", ...props }, ref) => {
    const fieldProps = useFieldControl();
    const ariaInvalid =
      invalid || props["aria-invalid"] || fieldProps["aria-invalid"];
    return (
      <input
        ref={ref}
        type={type}
        {...fieldProps}
        {...props}
        aria-invalid={ariaInvalid}
        className={cn(
          "flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-soft transition-colors",
          "placeholder:text-muted-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "aria-[invalid=true]:border-destructive aria-[invalid=true]:focus-visible:ring-destructive",
          "file:border-0 file:bg-transparent file:text-sm file:font-medium",
          className,
        )}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
