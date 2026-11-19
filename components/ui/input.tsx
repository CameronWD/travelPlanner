import * as React from "react";
import { useFieldControl } from "@/components/ui/field";
import { cn } from "@/lib/cn";

export const INPUT_FRAME_CLASS = "rounded-md border-2 border-input bg-card";
export const INPUT_TEXT_CLASS = "text-base font-semibold text-foreground sm:text-[15px]";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Visually mark the field as invalid and wire aria-invalid. */
  invalid?: boolean;
  /** Visual size. m = 48px, l = 56px. */
  inputSize?: "m" | "l";
}

/** Outlined field that lifts with a hard shadow on focus. API unchanged (+ inputSize). */
const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, invalid, inputSize = "m", type = "text", ...props }, ref) => {
  const fieldProps = useFieldControl();
  const [uncontrolledEmpty, setUncontrolledEmpty] = React.useState(props.defaultValue === undefined || props.defaultValue === "");
  const empty = type === "date" && (props.value !== undefined ? props.value === "" : uncontrolledEmpty);
  const ariaInvalid = invalid || props["aria-invalid"] || fieldProps["aria-invalid"];
  return (
    <input
      ref={ref}
      type={type}
      {...fieldProps}
      {...props}
      onChange={(e) => {
        setUncontrolledEmpty(e.currentTarget.value === "");
        props.onChange?.(e);
      }}
      aria-invalid={ariaInvalid}
      data-empty={empty ? "" : undefined}
      className={cn(
        "flex w-full px-4",
        INPUT_FRAME_CLASS,
        INPUT_TEXT_CLASS,
        inputSize === "l" ? "h-14 sm:text-[17px]" : "h-12",
        "placeholder:font-medium placeholder:text-muted-foreground",
        "transition-[transform,box-shadow] duration-[var(--dur-fast)] ease-pop",
        // Offset 0, not 2: with the 2px lift a 3px ring at offset 2 reached
        // 5px past the box and over the label 6px above it (Feedback
        // cmumcjr3i000304l08xwwegwg). The lift and shadow are the focus cue;
        // the ring now hugs the border.
        "focus-visible:-translate-x-0.5 focus-visible:-translate-y-0.5 focus-visible:border-border focus-visible:shadow-hard-2 focus-visible:outline-[3px] focus-visible:outline-offset-0 focus-visible:outline-ring",
        "disabled:cursor-not-allowed disabled:opacity-45",
        "aria-[invalid=true]:border-destructive aria-[invalid=true]:focus-visible:outline-destructive motion-safe:aria-[invalid=true]:tp-wiggle",
        "file:border-0 file:bg-transparent file:text-sm file:font-bold",
        type === "date" &&
          "appearance-none text-left [&::-webkit-date-and-time-value]:min-h-[1.5em] [&::-webkit-date-and-time-value]:text-left data-[empty]:font-medium data-[empty]:text-muted-foreground",
        className,
      )}
    />
  );
});
Input.displayName = "Input";

export { Input };
