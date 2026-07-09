"use client";

import { createMapLoader } from "@/components/ui/map-loader";
import type { RouteMapProps } from "./route-map";

export const RouteMapLoader = createMapLoader<RouteMapProps>(
  () => import("./route-map").then((m) => m.RouteMap),
);
