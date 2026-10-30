import * as React from "react";
import { MapPin } from "lucide-react";

export function MapUnavailable({ children }: { children?: React.ReactNode }) {
  return (
    <div data-map-fallback className="flex flex-col gap-4 rounded-lg border-2 border-dashed border-border-soft px-5 py-6">
      <div className="flex items-center gap-2 text-[13px] font-medium text-muted-foreground">
        <MapPin className="size-4 shrink-0" aria-hidden="true" />
        <span>{"The map isn't available right now."}</span>
      </div>
      {children}
    </div>
  );
}
