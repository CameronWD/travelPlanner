"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useTripHref } from "@/components/trip/use-trip-href";

/**
 * "You're editing a variant — not live" banner. Shown on the Plan editor and
 * Wishlist (the only fork-aware screens) when a variant is active.
 */
export function VariantBanner({ tripId, variantName }: { tripId: string; variantName: string }) {
  const pathname = usePathname();
  const tripHref = useTripHref(tripId);
  return (
    <div
      role="status"
      className="flex flex-col gap-2 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"
    >
      <p className="min-w-0">
        <span className="font-medium">Editing what-if plan &ldquo;{variantName}&rdquo;</span>, not live.
        Your calendar, summary and sharing still follow your real plan.
      </p>
      <div className="flex shrink-0 items-center gap-2">
        <Button asChild size="sm" variant="outline">
          <Link href={pathname as Route}>Switch to real plan</Link>
        </Button>
        <Button asChild size="sm" variant="ghost">
          <Link href={tripHref("/compare")}>Compare</Link>
        </Button>
      </div>
    </div>
  );
}
