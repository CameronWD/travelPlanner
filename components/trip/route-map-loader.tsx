"use client";

/**
 * Client-side wrapper that dynamically loads the Leaflet RouteMap component.
 *
 * `next/dynamic` with `ssr: false` must live in a Client Component in Next.js 16.
 * This thin shell is the Client Component boundary; the summary page (Server
 * Component) imports this file instead of RouteMap directly.
 */

import dynamic from "next/dynamic";
import type { RouteMapProps } from "./route-map";

const RouteMapInner = dynamic(
  () => import("./route-map").then((mod) => mod.RouteMap),
  { ssr: false },
);

export function RouteMapLoader(props: RouteMapProps) {
  return <RouteMapInner {...props} />;
}
