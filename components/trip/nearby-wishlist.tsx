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
import type { NearbyResult } from "@/lib/nearby";
import { scheduleItem } from "@/server/actions/items";
import { toast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

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
    <Card>
      <div className="px-4 py-1.5">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={open ? "Collapse nearby wishlist items" : "Expand nearby wishlist items"}
          className="flex min-h-11 items-center gap-2 rounded-md text-[13px] font-extrabold text-foreground transition-colors hover:text-muted-foreground"
        >
          {open ? (
            <ChevronDown className="size-4 shrink-0" aria-hidden="true" />
          ) : (
            <ChevronRight className="size-4 shrink-0" aria-hidden="true" />
          )}
          <MapPin className="size-4 shrink-0" aria-hidden="true" />
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
                  className="flex items-center justify-between gap-3 rounded-md border-2 border-border bg-background py-1.5 pl-3 pr-1.5"
                >
                  <Link
                    href={`/trips/${tripId}/wishlist`}
                    className="min-w-0 flex-1 transition-colors hover:text-muted-foreground"
                  >
                    <span className="block truncate text-[13px] font-extrabold text-foreground">
                      {item.title}
                    </span>
                    <span className="text-xs font-semibold text-muted-foreground">
                      {distanceLabel}
                    </span>
                  </Link>

                  <Button
                    type="button"
                    variant="secondary"
                    size="md"
                    aria-label={`Add ${item.title} to today`}
                    disabled={pendingId === item.id}
                    className="shrink-0"
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
                  </Button>
                </li>
              );
            })}
          </ul>

          <div className="mt-3 border-t-2 border-border-soft pt-3">
            <Link
              href={`/trips/${tripId}/wishlist`}
              className="inline-flex min-h-11 items-center text-xs font-extrabold text-muted-foreground transition-colors hover:text-foreground"
            >
              See full wishlist
            </Link>
          </div>
        </div>
      )}
    </Card>
  );
}
