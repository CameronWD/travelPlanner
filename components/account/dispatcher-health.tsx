import { TriangleAlert } from "lucide-react";
import { formatLastRun } from "@/lib/cron-health";

export interface DispatcherHealthProps {
  lastRunAt: Date | null;
  stale: boolean;
}

/**
 * Says when the Digest dispatcher last ran, inside the Devices card
 * (ADR 0047's cron heartbeat) — it explains what keeps the Devices above fed,
 * so it does not stand alone as its own card.
 *
 * The main line always renders `formatLastRun` plainly (mirrors
 * `formatLastSeen`'s register change on the Devices list above it). The
 * second line only appears once stale, and says outright that Digests are
 * not being sent: the Digest panel already taught the Traveller to read
 * silence as normal, so this is the one place that has to contradict that
 * training instead of reinforcing it.
 */
export function DispatcherHealth({ lastRunAt, stale }: DispatcherHealthProps) {
  const now = new Date();
  return (
    <div className="flex flex-col gap-1.5">
      <p
        className={
          stale ? "text-xs text-destructive" : "text-xs text-muted-foreground"
        }
      >
        Digest service — {formatLastRun(lastRunAt, now)}
      </p>
      {stale && (
        <p className="flex items-start gap-2 text-xs text-destructive">
          <TriangleAlert
            className="mt-0.5 size-3.5 shrink-0"
            aria-hidden="true"
          />
          <span>Digests are not being sent.</span>
        </p>
      )}
    </div>
  );
}
