import { cn } from "@/lib/cn";

export interface ProgressBarProps extends React.HTMLAttributes<HTMLDivElement> {
  /** 0–100 */
  value: number;
  /** Accessible name if no visible label sits next to it */
  label?: string;
  /** Tailwind bg class for the fill. Default ink. */
  fill?: string;
  size?: "s" | "m" | "l";
}

/** Server Component. Always pair with a number ("59% locked in"). */
function ProgressBar({ value, label, fill = "bg-primary", size = "m", className, ...props }: ProgressBarProps) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div role="progressbar" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100} aria-label={label}
      className={cn("overflow-hidden rounded-full border-2 border-border bg-background", size === "s" ? "h-2.5" : size === "l" ? "h-3.5" : "h-3", className)} {...props}>
      <div className={cn("h-full transition-[width] duration-[var(--dur-slow)] ease-pop", fill)} style={{ width: v + "%" }} />
    </div>
  );
}

export { ProgressBar };
