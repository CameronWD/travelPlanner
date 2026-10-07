"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { LG_UP, useMediaQuery } from "@/components/ui/use-media-query";

/**
 * Where a map is on screen (spec 2026-10-06 §D): always (true), never
 * (false), or only on one side of Tailwind's `lg` breakpoint — "phone" below
 * it, "desktop" from it up. A string is serialisable, so a Server Component
 * (a Home Phase) can pass it straight through.
 */
export type MapMountWhen = boolean | "phone" | "desktop";

/**
 * Whether a map should mount now. A breakpoint answer is false in the server
 * render and during hydration — a map is client-only, so its placeholder is
 * what the server drew anyway — and on the side of the breakpoint it isn't
 * shown at, so a CSS-hidden map never imports Leaflet.
 */
export function useMapMount(mountWhen: MapMountWhen = true): boolean {
  const lgUp = useMediaQuery(LG_UP);
  if (typeof mountWhen === "boolean") return mountWhen;
  if (lgUp === null) return false;
  return mountWhen === "desktop" ? lgUp : !lgUp;
}

/**
 * Build a client-only loader for a Leaflet map component. `next/dynamic` with
 * `ssr:false` must live in a Client Component; this factory is that boundary.
 *
 *   export const RouteMapLoader = createMapLoader<RouteMapProps>(
 *     () => import("./route-map").then((m) => m.RouteMap),
 *   );
 *
 * Every loader takes an optional `mountWhen` (see MapMountWhen); a map that
 * shouldn't mount renders nothing — the same placeholder `next/dynamic`
 * shows while the module loads — and its module is never requested.
 *
 * Constraint is `<P extends object>` (not `Record<string, unknown>`) so that
 * props interfaces with function members (e.g. `onSelect`, `onMapClick`)
 * remain assignable without an explicit index signature.
 */
export function createMapLoader<P extends object>(
  load: () => Promise<React.ComponentType<P>>,
): (props: P & { mountWhen?: MapMountWhen }) => React.ReactElement | null {
  const Inner = dynamic(load, { ssr: false }) as React.ComponentType<P>;
  return function MapLoader({ mountWhen = true, ...props }: P & { mountWhen?: MapMountWhen }) {
    const show = useMapMount(mountWhen);
    if (!show) return null;
    return <Inner {...(props as unknown as P)} />;
  };
}
