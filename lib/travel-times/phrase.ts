export const TRAVEL_PHRASE = { walk: "walk", drive: "drive", transit: "by public transport" } as const;

export function travelPhrase(h: { minutes: number; mode: "walk" | "drive" | "transit"; estimated: boolean }): string {
  return `${h.minutes} min ${TRAVEL_PHRASE[h.mode]}${h.estimated ? " (estimated)" : ""}`;
}
