import * as React from "react";
import { useFieldControl } from "@/components/ui/field";
import { cn } from "@/lib/cn";

interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** Visually mark the field as invalid and wire aria-invalid. */
  invalid?: boolean;
  autoGrow?: boolean;
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, invalid, autoGrow, ...props }, ref) => {
    const fieldProps = useFieldControl();
    const inner = React.useRef<HTMLTextAreaElement>(null);
    React.useImperativeHandle(ref, () => inner.current!);
    React.useLayoutEffect(() => {
      const el = inner.current;
      if (!autoGrow || !el) return;
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight + 4}px`;
    }, [autoGrow, props.value]);
    const ariaInvalid =
      invalid || props["aria-invalid"] || fieldProps["aria-invalid"];
    return (
      <textarea
        ref={inner}
        {...fieldProps}
        {...props}
        aria-invalid={ariaInvalid}
        className={cn(
          "flex min-h-24 w-full rounded-md border-2 border-input bg-card px-3 py-2 text-base text-foreground transition-[transform,box-shadow] duration-[var(--dur-fast)] ease-pop sm:text-sm",
          "placeholder:text-muted-foreground",
          "focus-visible:-translate-x-0.5 focus-visible:-translate-y-0.5 focus-visible:border-border focus-visible:shadow-hard-2 focus-visible:outline-[3px] focus-visible:outline-offset-0 focus-visible:outline-ring",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "aria-[invalid=true]:border-destructive aria-[invalid=true]:focus-visible:outline-destructive",
          autoGrow && "min-h-12 resize-none overflow-hidden px-4 py-2.5 font-semibold sm:text-[15px]",
          className,
        )}
      />
    );
  },
);
Textarea.displayName = "Textarea";

function submitOnEnter(e: React.KeyboardEvent<HTMLTextAreaElement>) {
  if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;
  e.preventDefault();
  e.currentTarget.form?.requestSubmit();
}

export { Textarea, submitOnEnter };
