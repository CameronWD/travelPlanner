import { AlertTriangle, Clock } from "lucide-react";
import { Card } from "@/components/ui/card";

export interface DayFeasibilityEntry {
  severity: "warning" | "info";
  message: string;
}

/**
 * Kit "heads up" card (DDays.jsx day panel: a sun Card under the plan). Text on
 * the sun island stays plain ink; the icon carries warning vs info.
 */
export function DayFeasibility({ entries }: { entries: DayFeasibilityEntry[] }) {
  if (entries.length === 0) return null;
  return (
    <Card tone="sun" className="flex flex-col gap-2 px-3.5 py-3">
      <h3 className="text-label">Getting around</h3>
      {entries.map((e, i) => (
        <p key={i} className="flex items-start gap-2 text-[13px] font-medium">
          {e.severity === "warning" ? (
            <AlertTriangle className="mt-0.5 size-4 shrink-0" strokeWidth={2.5} aria-label="Warning" />
          ) : (
            <Clock className="mt-0.5 size-4 shrink-0" strokeWidth={2.5} aria-hidden />
          )}
          <span>{e.message}</span>
        </p>
      ))}
    </Card>
  );
}
