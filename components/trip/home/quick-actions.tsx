"use client";

import Link from "next/link";
import { MapPin, ListChecks, NotebookPen, Receipt, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { TripPhase } from "@/lib/trip-phase";

interface QuickAction {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface QuickActionsProps {
  tripId: string;
  phase: TripPhase;
}

function actionsFor(tripId: string, phase: TripPhase): QuickAction[] {
  const base = `/trips/${tripId}`;
  switch (phase) {
    case "sketching":
      return [
        { label: "Add a place", href: `${base}/plan`, icon: MapPin },
        { label: "Wishlist", href: `${base}/wishlist`, icon: Plus },
      ];
    case "travelling":
      return [
        { label: "Journal", href: `${base}/journal`, icon: NotebookPen },
        { label: "Add a cost", href: `${base}/budget`, icon: Receipt },
      ];
    default: // planning | final-prep | past
      return [
        { label: "Add a place", href: `${base}/plan`, icon: MapPin },
        { label: "Add a cost", href: `${base}/budget`, icon: Receipt },
        { label: "Wishlist", href: `${base}/wishlist`, icon: Plus },
        { label: "Checklists", href: `${base}/checklists`, icon: ListChecks },
      ];
  }
}

/** Phase-aware row of quick links onto the relevant tab. */
export function QuickActions({ tripId, phase }: QuickActionsProps) {
  const actions = actionsFor(tripId, phase);
  return (
    <div className="flex flex-wrap gap-2">
      {actions.map((a, i) => (
        <Button key={a.label} asChild variant={i === 0 ? "primary" : "outline"} shape="pill" size="sm">
          <Link href={a.href}>
            <a.icon className="size-4" aria-hidden="true" />
            {a.label}
          </Link>
        </Button>
      ))}
    </div>
  );
}
