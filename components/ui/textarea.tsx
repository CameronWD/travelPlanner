import * as React from "react";
import { useFieldControl } from "@/components/ui/field";
import { cn } from "@/lib/cn";

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** Visually mark the field as invalid and wire aria-invalid. */
  invalid?: boolean;
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, invalid, ...props }, ref) => {
    const fieldProps = useFieldControl();
    const ariaInvalid =
      invalid || props["aria-invalid"] || fieldProps["aria-invalid"];
    return (
      <textarea
        ref={ref}
        {...fieldProps}
        {...props}
        aria-invalid={ariaInvalid}
        className={cn(
          "flex min-h-24 w-full rounded-md border-2 border-input bg-card px-3 py-2 text-base text-foreground transition-[transform,box-shadow] duration-[var(--dur-fast)] ease-pop sm:text-sm",
          "placeholder:text-muted-foreground",
          "focus-visible:-translate-x-0.5 focus-visible:-translate-y-0.5 focus-visible:border-border focus-visible:shadow-hard-2 focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "aria-[invalid=true]:border-destructive aria-[invalid=true]:focus-visible:outline-destructive",
          className,
        )}
      />
    );
  },
);
Textarea.displayName = "Textarea";

export { Textarea };
