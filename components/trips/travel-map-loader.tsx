"use client";

import { createMapLoader } from "@/components/ui/map-loader";
import type { TravelMapProps } from "./travel-map";

export const TravelMapLoader = createMapLoader<TravelMapProps>(
  () => import("./travel-map").then((m) => m.TravelMap),
);
