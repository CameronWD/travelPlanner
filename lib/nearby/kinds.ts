export type NearbyKind = "sights" | "food" | "cafes" | "drinks" | "shops";

export const NEARBY_KINDS: readonly { key: NearbyKind; label: string; includedTypes: string[]; category: string }[] = [
  { key: "sights", label: "Sights", includedTypes: ["tourist_attraction", "museum", "art_gallery", "historical_landmark", "park"], category: "SIGHTSEEING" },
  { key: "food", label: "Food", includedTypes: ["restaurant"], category: "FOOD" },
  { key: "cafes", label: "Cafés", includedTypes: ["cafe", "bakery"], category: "FOOD" },
  { key: "drinks", label: "Drinks", includedTypes: ["bar", "pub", "wine_bar"], category: "NIGHTLIFE" },
  { key: "shops", label: "Shops", includedTypes: ["market", "shopping_mall", "store"], category: "SHOPPING" },
];

export function nearbyKind(key: string): (typeof NEARBY_KINDS)[number] | undefined {
  return NEARBY_KINDS.find((k) => k.key === key);
}
