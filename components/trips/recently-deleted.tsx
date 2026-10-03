"use client";

import * as React from "react";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { restoreTrip } from "@/server/actions/trips";
import { tripPath } from "@/lib/trip-path";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/use-toast";
import type { RecentlyDeletedTrip } from "@/lib/trips/recently-deleted-loader";

const MAX_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function plural(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

function daysText(deletedAt: Date, now: Date): string {
  const elapsed = Math.floor((now.getTime() - deletedAt.getTime()) / MS_PER_DAY);
  const remaining = Math.max(0, MAX_DAYS - elapsed);
  return `Deleted ${plural(elapsed, "day")} ago · gone in ${plural(remaining, "day")}`;
}

function RestoreButton({ trip }: { trip: RecentlyDeletedTrip }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleRestore() {
    startTransition(async () => {
      const result = await restoreTrip(trip.id);
      if (result.success) {
        router.push(tripPath(result.slug ?? trip.id));
      } else {
        toast({ title: "Couldn't restore", description: result.error, variant: "destructive" });
      }
    });
  }

  return (
    <Button variant="outline" size="sm" onClick={handleRestore} loading={isPending}>
      Restore
    </Button>
  );
}

export interface RecentlyDeletedProps {
  trips: RecentlyDeletedTrip[];
  /** Injected for testability — defaults to the real current time. */
  now?: Date;
}

/** The Trips page's Recently deleted section (ADR 0067). Owner-only, empty = nothing rendered. */
export function RecentlyDeleted({ trips, now }: RecentlyDeletedProps) {
  if (trips.length === 0) return null;

  const current = now ?? new Date();

  return (
    <section aria-labelledby="recently-deleted-heading" className="mr-[18px] md:mr-10">
      <h2 id="recently-deleted-heading" className="text-[13px] font-extrabold uppercase tracking-[0.08em] text-muted-foreground">
        Recently deleted
      </h2>
      <ul className="mt-2 flex flex-col gap-2">
        {trips.map((trip) => (
          <li
            key={trip.id}
            className="island flex items-center justify-between gap-3 rounded-[16px] border-2 border-border bg-card px-4 py-3 shadow-hard-1"
          >
            <div className="min-w-0 flex-1">
              <p className="min-w-0 truncate font-extrabold">{trip.name}</p>
              <p className="text-[12px] font-semibold text-muted-foreground">{daysText(trip.deletedAt, current)}</p>
            </div>
            <RestoreButton trip={trip} />
          </li>
        ))}
      </ul>
    </section>
  );
}
