"use client";

/**
 * Client-side wrapper that dynamically loads the Leaflet WishlistMap component.
 *
 * `next/dynamic` with `ssr: false` must live in a Client Component in Next.js 16.
 * This thin shell is the Client Component boundary; the wishlist page (Server
 * Component) imports this file instead of WishlistMap directly.
 */

import dynamic from "next/dynamic";
import type { WishlistMapProps } from "./wishlist-map";

const Inner = dynamic(
  () => import("./wishlist-map").then((m) => m.WishlistMap),
  { ssr: false },
);

export function WishlistMapLoader(props: WishlistMapProps) {
  return <Inner {...props} />;
}
