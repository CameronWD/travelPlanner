"use client";

import * as React from "react";
import { useMapsLibrary } from "@vis.gl/react-google-maps";
import type { PickedPlace } from "@/lib/picked-place";
import { usePlacesAvailable } from "./places-available";

export type PlaceKind = "region" | "venue" | "any";
export type PlaceSuggestion = { id: string; mainText: string; secondaryText: string };
export type SuggestionStatus = "idle" | "loading" | "ok" | "empty" | "error";

const DEBOUNCE_MS = 350;
const MIN_CHARS = 3;
const NEAR_RADIUS_M = 50_000;
const PICK_FIELDS = ["id", "location", "formattedAddress", "addressComponents"];

type Found = { suggestions: PlaceSuggestion[]; status: SuggestionStatus };
const NOTHING: Found = { suggestions: [], status: "idle" };

// Google abbreviates some countries in the secondary text ("OR, USA"); forms take the country from its last part.
function regionWithCountry(name: string, secondary: string | undefined, country: string | undefined): string | undefined {
  const parts = (secondary ?? "").split(",").map((p) => p.trim()).filter(Boolean);
  if (!country) return parts.join(", ") || undefined;
  if (!parts.length) return country === name ? undefined : country;
  return [...parts.slice(0, -1), country].join(", ");
}

export function usePlaceSuggestions({ kind, near }: { kind: PlaceKind; near?: google.maps.LatLngLiteral }) {
  const places = useMapsLibrary("places");
  const keyed = usePlacesAvailable();
  const [refused, setRefused] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [found, setFound] = React.useState<Found>(NOTHING);
  const token = React.useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const predictions = React.useRef(new Map<string, google.maps.places.PlacePrediction>());
  const seq = React.useRef(0);
  const nearRef = React.useRef(near);
  React.useEffect(() => {
    nearRef.current = near;
  });
  const available = keyed && !refused;

  React.useEffect(() => {
    const input = query.trim();
    if (!places || !available || input.length < MIN_CHARS) return;
    const mine = ++seq.current;
    const t = setTimeout(async () => {
      setFound((f) => ({ ...f, status: "loading" }));
      token.current ??= new places.AutocompleteSessionToken();
      const bias = nearRef.current;
      const request: google.maps.places.AutocompleteRequest = {
        input,
        sessionToken: token.current,
        ...(kind === "region" ? { includedPrimaryTypes: ["(regions)"] } : {}),
        ...(bias ? { locationBias: { center: bias, radius: NEAR_RADIUS_M } } : {}),
      };
      let result: google.maps.places.AutocompleteSuggestion[];
      try {
        ({ suggestions: result } = await places.AutocompleteSuggestion.fetchAutocompleteSuggestions(request));
      } catch {
        setRefused(true);
        setFound({ suggestions: [], status: "error" });
        return;
      }
      if (mine !== seq.current) return;
      const list = result.flatMap((s) => (s.placePrediction ? [s.placePrediction] : []));
      predictions.current = new Map(list.map((p) => [p.placeId, p]));
      const suggestions = list.map((p) => ({ id: p.placeId, mainText: p.mainText?.text ?? p.text.text, secondaryText: p.secondaryText?.text ?? "" }));
      setFound({ suggestions, status: suggestions.length ? "ok" : "empty" });
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query, places, available, kind]);

  function clear() {
    seq.current++;
    setQuery("");
    setFound(NOTHING);
  }

  function search(text: string) {
    if (text.trim().length < MIN_CHARS) {
      clear();
      return;
    }
    setQuery(text);
  }

  function reset() {
    token.current = null;
    clear();
  }

  async function pick(id: string): Promise<PickedPlace | null> {
    const prediction = predictions.current.get(id);
    reset();
    if (!prediction) return null;
    const place = prediction.toPlace();
    try {
      await place.fetchFields({ fields: PICK_FIELDS });
    } catch {
      return null;
    }
    if (!place.location) return null;
    const name = prediction.mainText?.text ?? prediction.text.text;
    const country = place.addressComponents?.find((c) => c.types.includes("country"));
    const region = regionWithCountry(name, prediction.secondaryText?.text, country?.longText ?? undefined);
    const countryCode = country?.shortText?.toLowerCase();
    return {
      name,
      ...(region ? { region } : {}),
      lat: place.location.lat(),
      lng: place.location.lng(),
      ...(countryCode ? { countryCode } : {}),
      placeId: place.id || prediction.placeId,
      ...(place.formattedAddress ? { address: place.formattedAddress } : {}),
    };
  }

  return { available, ...(available ? found : NOTHING), search, pick, reset };
}
