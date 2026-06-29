import { AlertTriangle, Clock } from "lucide-react";

export interface DayFeasibilityEntry {
  severity: "warning" | "info";
  message: string;
}

export function DayFeasibility({ entries }: { entries: DayFeasibilityEntry[] }) {
  if (entries.length === 0) return null;
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-card px-4 py-3">
      <h3 className="text-sm font-medium text-muted-foreground">Getting around</h3>
      {entries.map((e, i) => (
        <p
          key={i}
          className={`flex items-start gap-2 text-sm ${e.severity === "warning" ? "text-warning-foreground" : "text-muted-foreground"}`}
        >
          {e.severity === "warning" ? (
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
          ) : (
            <Clock className="mt-0.5 size-4 shrink-0" aria-hidden />
          )}
          <span>{e.message}</span>
        </p>
      ))}
    </div>
  );
}
