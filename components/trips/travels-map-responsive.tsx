"use client";

/**
 * One Leaflet map, not two. `TravelsMapCard` renders a full map (Leaflet
 * instance + tiles) per `variant`; the page used to mount both "mobile" and
 * "desktop" side by side and let CSS pick which one showed, which meant two
 * live Leaflet maps at once (double the tiles, double the memory, double the
 * event listeners). This picks ONE variant, in React, from the same
 * breakpoint the rest of the page uses (`md`, 768px) via
 * `useSyncExternalStore` over `matchMedia` — so it updates live if the
 * viewport crosses the breakpoint, without polling or a resize listener.
 */
import * as React from "react";
import { TravelsMapCard, type TravelsMapCardProps } from "@/components/trips/travels-map-card";

const QUERY = "(min-width: 768px)";

function subscribe(onChange: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
  const mql = window.matchMedia(QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

function getClientSnapshot(): "desktop" | "mobile" {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return "desktop";
  return window.matchMedia(QUERY).matches ? "desktop" : "mobile";
}

/** No real viewport on the server — desktop is the safer first paint (matches most visits). */
function getServerSnapshot(): "desktop" | "mobile" {
  return "desktop";
}

export function TravelsMapResponsive(props: Omit<TravelsMapCardProps, "variant">) {
  const variant = React.useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot);
  return <TravelsMapCard {...props} variant={variant} />;
}
