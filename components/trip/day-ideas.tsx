"use client";

/**
 * Day ideas (CONTEXT.md "Day ideas"): the full free-form-day menu, shown only
 * in the Travelling phase. Resurfaces the traveller's OWN pools — the Stop's
 * things-to-do and the trip's Wishlist — never anything fetched from an
 * outside places API (ADR 0044).
 *
 * - Section 1: things to do already attached to this Stop (ADR 0022) but not
 *   yet given a day.
 * - Section 2: Wishlist ideas selected by `dayIdeasWishlist` (nearby / same
 *   country / unlocated).
 * - Renders nothing when both lists are empty.
 */

import { useState, useTransition } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import type { DayIdeaResult } from "@/lib/nearby";
import { scheduleItem } from "@/server/actions/items";
import { toast } from "@/components/ui/use-toast";
import { categoryDotClass } from "@/components/trip/category-dot";

export interface DayIdeaThingToDo {
  id: string;
  title: string;
  category: string;
  startTime: string | null;
  endTime: string | null;
}

function distanceLabel(distanceKm: number): string {
  return distanceKm < 1
    ? `≈${Math.round(distanceKm * 1000)} m`
    : `${distanceKm.toFixed(1)} km`;
}

export function DayIdeas({
  tripId,
  date,
  thingsToDo,
  wishlistIdeas,
}: {
  tripId: string;
  date: string;
  thingsToDo: DayIdeaThingToDo[];
  wishlistIdeas: DayIdeaResult[];
}) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  if (thingsToDo.length === 0 && wishlistIdeas.length === 0) return null;

  function addToToday(id: string, title: string, action: () => Promise<{ success: boolean; errors?: Record<string, string[] | undefined> }>) {
    setPendingId(id);
    startTransition(async () => {
      try {
        const result = await action();
        if (result.success) {
          toast({
            title: "Added to today",
            description: `${title} has been added to ${date}.`,
          });
        } else {
          const firstError = result.errors ? Object.values(result.errors)[0]?.[0] : undefined;
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
  }

  return (
    <div className={cn("rounded-2xl border border-border bg-card p-4")}>
      <p className="text-sm font-medium text-foreground">Day ideas</p>
      <p className="text-sm text-muted-foreground">
        Nothing planned today — some ideas from your own lists
      </p>

      {thingsToDo.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">
            Things to do in this stop
          </p>
          <ul className="mt-2 flex flex-col gap-2">
            {thingsToDo.map((thing) => (
              <li
                key={thing.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2"
              >
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <span
                    className={cn("size-2 shrink-0 rounded-full", categoryDotClass(thing.category))}
                    aria-hidden="true"
                  />
                  <span className="truncate text-sm font-medium text-foreground">
                    {thing.title}
                  </span>
                </div>
                <button
                  type="button"
                  aria-label={`Add ${thing.title} to today`}
                  disabled={pendingId === thing.id}
                  className="shrink-0 rounded-md border border-border bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                  onClick={() =>
                    addToToday(thing.id, thing.title, () =>
                      scheduleItem(thing.id, {
                        date,
                        ...(thing.startTime ? { startTime: thing.startTime } : {}),
                        ...(thing.endTime ? { endTime: thing.endTime } : {}),
                      }),
                    )
                  }
                >
                  Add to today
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {wishlistIdeas.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">
            From your wishlist
          </p>
          <ul className="mt-2 flex flex-col gap-2">
            {wishlistIdeas.map((idea) => (
              <li
                key={idea.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2"
              >
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <span
                    className={cn("size-2 shrink-0 rounded-full", categoryDotClass(idea.category))}
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">
                      {idea.title}
                    </span>
                    {idea.reason === "nearby" && idea.distanceKm != null && (
                      <span className="text-xs text-muted-foreground">
                        {distanceLabel(idea.distanceKm)}
                      </span>
                    )}
                    {idea.reason === "country" && (
                      <span className="text-xs text-muted-foreground">same country</span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  aria-label={`Add ${idea.title} to today`}
                  disabled={pendingId === idea.id}
                  className="shrink-0 rounded-md border border-border bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                  onClick={() =>
                    addToToday(idea.id, idea.title, () => scheduleItem(idea.id, { date }))
                  }
                >
                  Add to today
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-3 border-t border-border pt-3">
        <Link
          href={`/trips/${tripId}/wishlist`}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          See full wishlist
        </Link>
      </div>
    </div>
  );
}
