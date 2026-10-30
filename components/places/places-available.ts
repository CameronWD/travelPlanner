"use client";

import { APILoadingStatus, useApiLoadingStatus } from "@vis.gl/react-google-maps";
import { useMapsAuthFailed } from "@/components/map/maps-auth";
import { placesBrowserKey } from "@/lib/map/google-config";

// Outside an APIProvider the loading status is always NOT_LOADED, so a failed load only shows from inside one.
export function usePlacesAvailable(): boolean {
  const authFailed = useMapsAuthFailed();
  const status = useApiLoadingStatus();
  return placesBrowserKey() !== null && !authFailed && status !== APILoadingStatus.FAILED && status !== APILoadingStatus.AUTH_FAILURE;
}
