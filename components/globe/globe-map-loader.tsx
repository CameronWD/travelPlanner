"use client";

import { createMapLoader } from "@/components/ui/map-loader";
import type { GlobeMapProps } from "./globe-map";

export const GlobeMapLoader = createMapLoader<GlobeMapProps>(
  () => import("./globe-map").then((m) => m.GlobeMap),
);
