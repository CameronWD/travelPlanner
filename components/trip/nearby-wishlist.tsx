"use client";

/**
 * Collapsible section showing located Wishlist items near today's plan.
 *
 * - Renders nothing when items array is empty.
 * - Default collapsed, aria-expanded tracks open state.
 * - Each row: title + distance, "Add to today" button, links to wishlist.
 * - Footer: "See full wishlist" link.
 */

import { useState, useTransition } from "react";
import Link from "next/link";
import { MapPin, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";
import type { NearbyResult } from "@/lib/nearby";
import { scheduleItem } from "@/server/actions/items";
import { toast } from "@/components/ui/use-toast";

export function NearbyWishlist({
  tripId,
  date,
  items,
}: {
  tripId: string;
  date: string;
  items: NearbyResult[];
}) {
  const [open, setOpen] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  if (items.length === 0) return null;

  return (
    <div className={cn("rounded-2xl border border-border bg-card shadow-sm")}>
      <div className="px-4 py-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={open ? "Collapse nearby wishlist items" : "Expand nearby wishlist items"}
          className="flex items-center gap-2 text-sm font-medium text-foreground hover:text-primary transition-colors"
        >
          {open ? (
            <ChevronDown className="size-4 shrink-0" aria-hidden="true" />
          ) : (
            <ChevronRight className="size-4 shrink-0" aria-hidden="true" />
          )}
          <MapPin className="size-4 shrink-0 text-primary" aria-hidden="true" />
          Nearby from your Wishlist ({items.length})
        </button>
      </div>

      {open && (
        <div className="flex flex-col px-4 pb-4">
          <ul className="flex flex-col gap-2">
            {items.map((item) => {
              const distanceLabel =
                item.distanceKm < 1
                  ? `≈${Math.round(item.distanceKm * 1000)} m`
                  : `${item.distanceKm.toFixed(1)} km`;

              return (
                <li
                  key={item.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2"
                >
                  <Link
                    href={`/trips/${tripId}/wishlist`}
                    className="min-w-0 flex-1 hover:text-primary transition-colors"
                  >
                    <span className="block truncate text-sm font-medium text-foreground">
                      {item.title}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {distanceLabel}
                    </span>
                  </Link>

                  <button
                    type="button"
                    aria-label={`Add ${item.title} to today`}
                    disabled={pendingId === item.id}
                    className="shrink-0 rounded-md border border-border bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                    onClick={() => {
                      setPendingId(item.id);
                      startTransition(async () => {
                        try {
                          const result = await scheduleItem(item.id, { date });
                          if (result.success) {
                            toast({
                              title: "Added to today",
                              description: `${item.title} has been added to ${date}.`,
                            });
                          } else {
                            const firstError = Object.values(result.errors)[0]?.[0];
                            toast({
                              variant: "destructive",
                              title: "Couldn't add item",
                              description: firstError,
                            });
                          }
                        } finally {
                          setPendingId(null);
                        }
                      });
                    }}
                  >
                    Add to today
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="mt-3 border-t border-border pt-3">
            <Link
              href={`/trips/${tripId}/wishlist`}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              See full wishlist
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
