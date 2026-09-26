import { Card } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress-bar";
import { cn } from "@/lib/cn";

export interface StatCardProps {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: "white" | "coral" | "sun" | "teal" | "lilac";
  /** 0–100, renders a bar */
  progress?: number;
  big?: boolean;
  className?: string;
}

/** Server Component. Label → value → bar → sub, in that DOM order for screen readers. */
function StatCard({ label, value, sub, tone = "sun", progress, big, className }: StatCardProps) {
  return (
    <Card tone={tone} className={cn("p-3.5", className)}>
      <div className="text-label">{label}</div>
      <div className={cn("mt-1 whitespace-nowrap font-display font-extrabold", big ? "text-[56px] leading-[0.9] tracking-[-0.05em]" : "text-[26px] leading-[1.1] tracking-[-0.03em]")}>{value}</div>
      {progress != null ? <ProgressBar value={progress} label={label} className="mt-2" /> : null}
      {sub ? <div className="mt-1.5 text-xs font-semibold">{sub}</div> : null}
    </Card>
  );
}

export { StatCard };
