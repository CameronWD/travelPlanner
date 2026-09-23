import * as React from "react";
import { useFieldControl } from "@/components/ui/field";
import { cn } from "@/lib/cn";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Visually mark the field as invalid and wire aria-invalid. */
  invalid?: boolean;
  /** Visual size. m = 48px, l = 56px. */
  inputSize?: "m" | "l";
}

/** Outlined field that lifts with a hard shadow on focus. API unchanged (+ inputSize). */
const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, invalid, inputSize = "m", type = "text", ...props }, ref) => {
  const fieldProps = useFieldControl();
  const ariaInvalid = invalid || props["aria-invalid"] || fieldProps["aria-invalid"];
  return (
    <input
      ref={ref}
      type={type}
      {...fieldProps}
      {...props}
      aria-invalid={ariaInvalid}
      className={cn(
        "flex w-full rounded-md border-2 border-input bg-card px-4 text-base font-semibold text-foreground sm:text-[15px]",
        inputSize === "l" ? "h-14 sm:text-[17px]" : "h-12",
        "placeholder:font-medium placeholder:text-muted-foreground",
        "transition-[transform,box-shadow] duration-[var(--dur-fast)] ease-pop",
        "focus-visible:-translate-x-0.5 focus-visible:-translate-y-0.5 focus-visible:border-border focus-visible:shadow-hard-2 focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring",
        "disabled:cursor-not-allowed disabled:opacity-45",
        "aria-[invalid=true]:border-destructive aria-[invalid=true]:focus-visible:outline-destructive motion-safe:aria-[invalid=true]:tp-wiggle",
        "file:border-0 file:bg-transparent file:text-sm file:font-bold",
        className,
      )}
    />
  );
});
Input.displayName = "Input";

export { Input };
