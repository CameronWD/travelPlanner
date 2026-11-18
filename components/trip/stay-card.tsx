import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

export function StayCard({
  label,
  labelAs: Label = "span",
  icon: Icon,
  name,
  children,
  className,
  ...rest
}: {
  label: string;
  labelAs?: "h3" | "span";
  icon: LucideIcon;
  name: ReactNode;
  children?: ReactNode;
  className?: string;
} & Omit<React.HTMLAttributes<HTMLDivElement>, "children" | "className">) {
  return (
    <div
      {...rest}
      className={cn("overflow-hidden rounded-3xl border-2 border-border shadow-hard-2", className)}
    >
      <div
        data-slot="stay-band"
        className="flex items-center gap-2 bg-lilac px-4 py-1.5 text-on-accent"
      >
        <Icon className="size-4 shrink-0" strokeWidth={2.5} aria-hidden="true" />
        <Label className="text-[11px] font-extrabold uppercase leading-[inherit] tracking-[0.08em] text-inherit [font-family:inherit]">{label}</Label>
      </div>
      <div data-slot="stay-body" className="flex flex-col gap-1 bg-hue-lilac/25 px-4 py-3 text-foreground">
        <div className="font-display text-[20px] font-extrabold leading-tight">{name}</div>
        {children}
      </div>
    </div>
  );
}

export function StayConfirmation({ value }: { value: string }) {
  return <span className="block min-w-0 break-all font-mono text-[13px] font-semibold">{value}</span>;
}
