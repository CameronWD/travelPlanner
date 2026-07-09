"use client";

import { createMapLoader } from "@/components/ui/map-loader";
import type { WishlistMapProps } from "./wishlist-map";

export const WishlistMapLoader = createMapLoader<WishlistMapProps>(
  () => import("./wishlist-map").then((m) => m.WishlistMap),
);
