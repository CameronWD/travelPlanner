import * as React from "react";
import { MapPin } from "lucide-react";
import { cn } from "@/lib/cn";
import { mapsUrl } from "@/lib/maps";

export interface MapLinkProps {
  lat?: number | null;
  lng?: number | null;
  address?: string | null;
  label?: string | null;
  className?: string;
}

/**
 * A subtle map-pin link that opens in Google Maps.
 * Renders nothing when there is no location to link to.
 */
export function MapLink({ lat, lng, address, label, className }: MapLinkProps) {
  const href = mapsUrl({ lat, lng, address, label });
  if (!href) return null;

  const ariaLabel = label
    ? `Open ${label} in Maps`
    : address
      ? `Open ${address} in Maps`
      : "Open in Maps";

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={ariaLabel}
      className={cn(
        "inline-flex items-center gap-1 text-primary/70 hover:text-primary transition-colors",
        className,
      )}
    >
      <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
    </a>
  );
}
