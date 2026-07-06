"use client";

/** Client boundary that dynamically loads the Leaflet GlobeMap (ssr:false). */

import dynamic from "next/dynamic";
import type { GlobeMapProps } from "./globe-map";

const Inner = dynamic(() => import("./globe-map").then((m) => m.GlobeMap), { ssr: false });

export function GlobeMapLoader(props: GlobeMapProps) {
  return <Inner {...props} />;
}
