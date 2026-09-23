"use client";

import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/cn";

export interface StepperProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  unit?: string;
  label: string;
  className?: string;
}

/** Client Component. − / value / + pill. Buttons disable at limits; value is announced. */
function Stepper({ value, onChange, min = 0, max = 99, unit, label, className }: StepperProps) {
  // The visible button is a deliberately small 36px (size-9) to match the design; the
  // `before` pseudo-element is an invisible 44px hit area centred on top of it so the
  // tap target still meets the 44px minimum. Do not remove it to "simplify" the class list.
  const btn =
    "relative grid size-9 place-items-center rounded-full border-2 border-input transition-transform duration-[var(--dur-fast)] active:scale-95 disabled:opacity-45 before:absolute before:left-1/2 before:top-1/2 before:size-11 before:-translate-x-1/2 before:-translate-y-1/2 before:content-['']";
  return (
    <span role="group" aria-label={label} className={cn("inline-flex items-center gap-1 rounded-full border-2 border-input bg-background p-1", className)}>
      <button type="button" aria-label={"Decrease " + label} disabled={value <= min} onClick={() => onChange(Math.max(min, value - 1))} className={cn(btn, "bg-card text-foreground")}><Minus className="size-[18px]" strokeWidth={2.5} /></button>
      <span aria-live="polite" className="min-w-[34px] whitespace-nowrap text-center font-display text-lg font-extrabold">{value}{unit ? <span className="ml-0.5 text-xs font-semibold">{unit}</span> : null}</span>
      <button type="button" aria-label={"Increase " + label} disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))} className={cn(btn, "bg-primary text-primary-foreground")}><Plus className="size-[18px]" strokeWidth={2.5} /></button>
    </span>
  );
}

export { Stepper };
