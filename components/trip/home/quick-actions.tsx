"use client";

import type { Route } from "next";
import Link from "next/link";
import { MapPin, ListChecks, NotebookPen, Receipt, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { TripPhase } from "@/lib/trip-phase";
import { useTripSlug } from "@/components/trip/use-trip-href";
import { tripPath } from "@/lib/trip-path";

interface QuickAction {
  label: string;
  href: Route;
  icon: React.ComponentType<{ className?: string }>;
}

interface QuickActionsProps {
  tripId: string;
  phase: TripPhase;
}

function actionsFor(tripRef: string, phase: TripPhase): QuickAction[] {
  switch (phase) {
    case "sketching":
      return [
        { label: "Add a place", href: tripPath(tripRef, "/plan?add=stop"), icon: MapPin },
        { label: "Wishlist", href: tripPath(tripRef, "/wishlist"), icon: Plus },
      ];
    case "travelling":
      return [
        { label: "Journal", href: tripPath(tripRef, "/journal"), icon: NotebookPen },
        { label: "Add a cost", href: tripPath(tripRef, "/budget?add=cost"), icon: Receipt },
      ];
    default: // planning | final-prep | past
      return [
        { label: "Add a place", href: tripPath(tripRef, "/plan?add=stop"), icon: MapPin },
        { label: "Add a cost", href: tripPath(tripRef, "/budget?add=cost"), icon: Receipt },
        { label: "Wishlist", href: tripPath(tripRef, "/wishlist"), icon: Plus },
        { label: "Checklists", href: tripPath(tripRef, "/checklists"), icon: ListChecks },
      ];
  }
}

/** Phase-aware row of quick links onto the relevant tab. */
export function QuickActions({ tripId, phase }: QuickActionsProps) {
  const actions = actionsFor(useTripSlug(tripId), phase);
  return (
    <div className="flex flex-wrap gap-2">
      {actions.map((a, i) => (
        <Button key={a.label} asChild variant={i === 0 ? "primary" : "secondary"} shape="pill" size="md">
          <Link href={a.href}>
            <a.icon className="size-4" aria-hidden="true" />
            {a.label}
          </Link>
        </Button>
      ))}
    </div>
  );
}
