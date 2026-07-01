"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";

/**
 * "You're editing a variant — not live" banner. Shown on the Plan editor and
 * Wishlist (the only fork-aware screens) when a variant is active. Never render
 * in discreet mode — the caller gates that.
 */
export function VariantBanner({ tripId, variantName }: { tripId: string; variantName: string }) {
  const pathname = usePathname();
  return (
    <div
      role="status"
      className="flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200"
    >
      <p className="min-w-0">
        <span className="font-medium">Editing variant &ldquo;{variantName}&rdquo;</span> — not live.
        Your calendar, summary and sharing still follow your real plan.
      </p>
      <div className="flex shrink-0 items-center gap-2">
        <Button asChild size="sm" variant="outline">
          <Link href={pathname}>Switch to real plan</Link>
        </Button>
        <Button asChild size="sm" variant="ghost">
          <Link href={`/trips/${tripId}/compare`}>Compare</Link>
        </Button>
      </div>
    </div>
  );
}
