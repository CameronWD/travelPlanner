"use client";

/**
 * The desktop Travelling Home's Day map tile (spec 2026-10-06 §D): an h2
 * "Day map" over the mounted map, keeping its grid cell with a quiet line on
 * a day with nothing to map. "Open" lands on the Day view with the Day map
 * dialog open.
 */

import Link from "next/link";
import type { Route } from "next";
import { Map } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { DayMapModel } from "@/lib/day-map";
import { DayMap } from "./day-map";
import { useMapMount, type MapMountWhen } from "@/components/ui/map-loader";

export function DayMapPanel({
  tripId,
  model,
  mountWhen = true,
  openHref,
}: {
  tripId: string;
  model: DayMapModel;
  mountWhen?: MapMountWhen;
  openHref?: Route;
}) {
  const showTile = useMapMount(mountWhen);
  return (
    <Card radius="xl" shadow={3} className="flex h-full min-h-0 flex-col p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-display text-lg font-extrabold leading-tight tracking-[-0.03em]">
          <Map className="size-[18px] shrink-0" aria-hidden="true" />
          Day map
        </h2>
        {openHref && model.points.length > 0 ? (
          <Link href={openHref} className="text-[13px] font-extrabold text-primary hover:underline">
            Open
          </Link>
        ) : null}
      </div>
      {model.points.length === 0 ? (
        <p className="mt-3 text-sm font-semibold text-muted-foreground">Nothing to map today</p>
      ) : (
        <div className="mt-3 min-h-0 flex-1">{showTile ? <DayMap tripId={tripId} model={model} /> : null}</div>
      )}
    </Card>
  );
}
