"use client";

import * as React from "react";
import { AdvancedMarker, InfoWindow, useAdvancedMarkerRef } from "@vis.gl/react-google-maps";

export interface HtmlPinProps {
  position: google.maps.LatLngLiteral;
  html: string;
  title?: string;
  onClick?: () => void;
  zIndex?: number;
  open?: boolean;
  onClose?: () => void;
  children?: React.ReactNode;
}

export function HtmlPin({ position, html, title, onClick, zIndex, open = false, onClose, children }: HtmlPinProps) {
  const [markerRef, marker] = useAdvancedMarkerRef();
  // AdvancedMarker children become the pin itself, so the popup is a sibling anchored to the marker.
  return (
    <>
      <AdvancedMarker
        ref={markerRef}
        position={position}
        title={title}
        onClick={onClick}
        zIndex={zIndex}
        anchorLeft="-50%"
        anchorTop="-50%"
      >
        <div className="tp-map-pin" dangerouslySetInnerHTML={{ __html: html }} />
      </AdvancedMarker>
      {open ? (
        <InfoWindow anchor={marker} onClose={onClose}>
          {children}
        </InfoWindow>
      ) : null}
    </>
  );
}
