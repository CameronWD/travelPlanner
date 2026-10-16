import type { Route } from "next";
import type { Hue } from "@/lib/hues";
import type { SketchStop } from "@/lib/trips/route-sketch";
import type { SortRow } from "@/lib/sort-these-out";
import type { BigNumber, TripCardKind } from "@/lib/trips/trip-status";

export interface TripCoverInput {
  tripId: string;
  name: string;
  hue: Hue;
  /** Uploaded photo, or null → generated cover. `url` already carries `?v=`. */
  photo: { url: string; focalX: number | null; focalY: number | null; version?: string | null } | null;
  /** Located real-plan Stops in plan order, Home base excluded. */
  stops: SketchStop[];
  startDate: string | null;
  /** Replaces the stamp's date line — a Rough month's "APR 27". */
  stampDateLabel?: string | null;
  /** Show the Add photo / Change pill. */
  canEdit: boolean;
}

export interface TripCardModel {
  id: string;
  /** The Trip's current slug, or id fallback — its URL ref (ADR 0064). */
  ref: string;
  name: string;
  kind: TripCardKind;
  big: BigNumber;
  dateLine: string;
  href: Route;
  cover: TripCoverInput;
  /** Position among the standard cards (polaroid tilt). */
  index: number;
  /** Up next / On the road only: the first "Sort these out" row. */
  nextStep?: SortRow | null;
}

interface TravelMapPoint {
  lat: number;
  lng: number;
  name: string;
}

type TravelWhen = "past" | "now" | "upcoming";

export interface TravelMapTrip {
  id: string;
  name: string;
  hue: Hue;
  when: TravelWhen;
  points: TravelMapPoint[];
}
