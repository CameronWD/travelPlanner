/**
 * Pure helpers for the Shopping list (spec 2026-10-02 §G, CONTEXT.md
 * "Shopping list"): one row, two views. A Packing item with a `buy` state
 * ("NEEDED" | "BOUGHT") shows here too, alongside standalone SHOPPING items.
 */

export type ShoppingEntry =
  | { source: "packing"; id: string; text: string; bought: boolean } // from a PACKING item with buy set
  | { source: "standalone"; id: string; text: string; bought: boolean }; // a SHOPPING item (bought = done)

/**
 * Builds the Shopping tab's entries: packing-derived rows first (in packing
 * sortOrder), then standalone rows (in their own sortOrder). Packing items
 * with no `buy` state are omitted entirely.
 */
export function buildShoppingEntries(
  packing: Array<{ id: string; text: string; buy: string | null; sortOrder: number }>,
  shopping: Array<{ id: string; text: string; done: boolean; sortOrder: number }>,
): ShoppingEntry[] {
  const packingEntries: ShoppingEntry[] = [...packing]
    .filter((item) => item.buy === "NEEDED" || item.buy === "BOUGHT")
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((item) => ({
      source: "packing" as const,
      id: item.id,
      text: item.text,
      bought: item.buy === "BOUGHT",
    }));

  const standaloneEntries: ShoppingEntry[] = [...shopping]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((item) => ({
      source: "standalone" as const,
      id: item.id,
      text: item.text,
      bought: item.done,
    }));

  return [...packingEntries, ...standaloneEntries];
}

/** Count of unbought entries (NEEDED packing entries + unticked standalone). */
export function shoppingOpenCount(entries: ShoppingEntry[]): number {
  return entries.filter((e) => !e.bought).length;
}
