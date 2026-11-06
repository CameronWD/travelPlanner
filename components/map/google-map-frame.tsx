"use client";

import * as React from "react";
import {
  APILoadingStatus,
  APIProvider,
  ColorScheme,
  Map,
  useApiLoadingStatus,
  type MapProps,
} from "@vis.gl/react-google-maps";
import { cn } from "@/lib/cn";
import { mapsConfig } from "@/lib/map/google-config";
import { useMapsAuthFailed } from "./maps-auth";

export interface GoogleMapFrameProps {
  fallback: React.ReactNode;
  dark: boolean;
  className?: string;
  style?: React.CSSProperties;
  role?: string;
  "aria-label"?: string;
  mapProps?: Omit<MapProps, "mapId" | "colorScheme" | "style">;
  onFail?: () => void;
  children?: React.ReactNode;
}

const WORLD_CENTER = { lat: 20, lng: 0 };

// With a refused key, a client-side navigation mounts markers on a dead Maps library and they throw.
class MapBoundary extends React.Component<
  { fallback: React.ReactNode; onError: () => void; children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function FailureWatch({ onFail }: { onFail: () => void }) {
  const status = useApiLoadingStatus();
  React.useEffect(() => {
    if (status === APILoadingStatus.FAILED) onFail();
  }, [status, onFail]);
  return null;
}

export function GoogleMapFrame({ fallback, dark, className, style, role, "aria-label": ariaLabel, mapProps, onFail, children }: GoogleMapFrameProps) {
  const config = mapsConfig();
  const authFailed = useMapsAuthFailed();
  const [renderFailed, setFailed] = React.useState(false);
  const failed = renderFailed || authFailed;
  const unavailable = !config || failed;
  const reportFail = React.useEffectEvent(() => onFail?.());
  React.useEffect(() => {
    if (unavailable) reportFail();
  }, [unavailable]);
  const fail = React.useCallback(() => setFailed(true), []);

  if (!config) return <>{fallback}</>;

  // vis.gl's Map drops `style` (and its default full size) once it has a className, so the caller's box is a wrapper.
  // The boundary stays mounted when `failed` flips: unmounting markers on a dead map throws, and that must land here.
  return (
    <MapBoundary fallback={fallback} onError={fail}>
      {failed ? (
        fallback
      ) : (
        <div className={className} style={style} role={role} aria-label={ariaLabel}>
          <APIProvider apiKey={config.apiKey} language="en" onError={fail}>
            <FailureWatch onFail={fail} />
            <Map
              key={dark ? "dark" : "light"}
              mapId={config.mapId}
              colorScheme={dark ? ColorScheme.DARK : ColorScheme.LIGHT}
              defaultCenter={WORLD_CENTER}
              defaultZoom={2}
              disableDefaultUI
              zoomControl
              clickableIcons={false}
              {...mapProps}
              className={cn("tp-map h-full w-full", mapProps?.className)}
            >
              {children}
            </Map>
          </APIProvider>
        </div>
      )}
    </MapBoundary>
  );
}
