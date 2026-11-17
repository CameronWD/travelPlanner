import * as React from "react";
import { Plus } from "lucide-react";
import { cn } from "@/lib/cn";

export interface AddCardProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  label: string;
}

export function AddCard({ label, className, type = "button", ...props }: AddCardProps) {
  return (
    <button
      type={type}
      {...props}
      className={cn(
        "tap-target hidden min-h-10 w-full items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-border px-3.5 text-[13px] font-bold text-coral-text hover:bg-muted/50 focus-visible:outline-[3px] focus-visible:outline-ring lg:flex",
        className,
      )}
    >
      <Plus className="size-3.5" aria-hidden="true" />
      {label}
    </button>
  );
}
