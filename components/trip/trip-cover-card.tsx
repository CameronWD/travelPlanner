import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";

/**
 * Frame for a cover used as its own standalone surface (trip Home) — kit
 * shape (2px border, hard shadow, rounded-2xl). NOT used by the trips-list
 * card (`trip-card.tsx`): there, `TripCover` sits inside the card's own top
 * section and must stay a bare, border/shadow-less fill, or the list card
 * would render two nested Card borders.
 */
export function TripCoverCard({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <Card radius="2xl" className={cn("relative overflow-hidden bg-muted", className)}>
      {children}
    </Card>
  );
}
