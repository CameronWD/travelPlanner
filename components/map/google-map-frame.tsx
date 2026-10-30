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

declare global {
  interface Window {
    gm_authFailure?: () => void;
  }
}

export interface GoogleMapFrameProps {
  fallback: React.ReactNode;
  dark: boolean;
  className?: string;
  style?: React.CSSProperties;
  role?: string;
  "aria-label"?: string;
  mapProps?: Omit<MapProps, "mapId" | "colorScheme">;
  onFail?: () => void;
  children?: React.ReactNode;
}

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

// Google reports a refused key or referrer only through this global; the vis.gl wrapper never surfaces it.
function useGmAuthFailure(onFail: () => void) {
  const report = React.useEffectEvent(onFail);
  React.useEffect(() => {
    const previous = window.gm_authFailure;
    const handler = () => {
      previous?.();
      report();
    };
    window.gm_authFailure = handler;
    return () => {
      if (window.gm_authFailure === handler) window.gm_authFailure = previous;
    };
  }, []);
}

function FailureWatch({ onFail }: { onFail: () => void }) {
  const status = useApiLoadingStatus();
  useGmAuthFailure(onFail);
  React.useEffect(() => {
    if (status === APILoadingStatus.FAILED || status === APILoadingStatus.AUTH_FAILURE) onFail();
  }, [status, onFail]);
  return null;
}

export function GoogleMapFrame({ fallback, dark, className, style, role, "aria-label": ariaLabel, mapProps, onFail, children }: GoogleMapFrameProps) {
  const config = mapsConfig();
  const [failed, setFailed] = React.useState(false);
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
          <APIProvider apiKey={config.apiKey} onError={fail}>
            <FailureWatch onFail={fail} />
            <Map
              key={dark ? "dark" : "light"}
              mapId={config.mapId}
              colorScheme={dark ? ColorScheme.DARK : ColorScheme.LIGHT}
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
