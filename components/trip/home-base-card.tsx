import Link from "next/link";
import { Home } from "lucide-react";

export interface HomeBaseCardProps {
  tripId: string;
  name: string;
  countryCode?: string | null;
  /** "origin" = trip start (rendered at the top); "return" = trip end (bottom). */
  variant: "origin" | "return";
}

/**
 * The trip's Home base shown as a card that bookends the plan editor (see
 * ADR 0030 + ADR 0032). Not a Stop: not draggable, not deletable — clicking it
 * opens trip settings, where the Home base is edited.
 */
export function HomeBaseCard({ tripId, name, countryCode, variant }: HomeBaseCardProps) {
  const label = variant === "origin" ? "Trip starts here" : "Trip ends here";
  return (
    <Link
      href={`/trips/${tripId}/settings`}
      className="flex items-center gap-3 rounded-xl border border-dashed border-border bg-muted/30 px-4 py-3 shadow-soft transition-colors hover:bg-muted/50"
      aria-label={`Home base: ${name} — edit in trip settings`}
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Home className="size-4" aria-hidden="true" />
      </span>
      <div className="flex min-w-0 flex-col">
        <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
          {name}
          {countryCode ? (
            <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono lowercase text-muted-foreground">
              {countryCode}
            </span>
          ) : null}
        </span>
        <span className="text-xs text-muted-foreground">Home base · {label}</span>
      </div>
    </Link>
  );
}
