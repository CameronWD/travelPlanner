"use client";

import * as React from "react";
import dynamic from "next/dynamic";

/**
 * Build a client-only loader for a Leaflet map component. `next/dynamic` with
 * `ssr:false` must live in a Client Component; this factory is that boundary.
 *
 *   export const RouteMapLoader = createMapLoader<RouteMapProps>(
 *     () => import("./route-map").then((m) => m.RouteMap),
 *   );
 *
 * Constraint is `<P extends object>` (not `Record<string, unknown>`) so that
 * props interfaces with function members (e.g. `onSelect`, `onMapClick`)
 * remain assignable without an explicit index signature.
 */
export function createMapLoader<P extends object>(
  load: () => Promise<React.ComponentType<P>>,
): (props: P) => React.ReactElement {
  const Inner = dynamic(load, { ssr: false }) as React.ComponentType<P>;
  return function MapLoader(props: P) {
    return <Inner {...props} />;
  };
}
