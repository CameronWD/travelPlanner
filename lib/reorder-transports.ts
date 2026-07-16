/**
 * Pure helper for transport leg reordering across slots.
 *
 * Extracted from ItineraryManager so it can be unit-tested without
 * simulating a full dnd-kit pointer drag (jsdom limitation).
 */

import { HEAD_SLOT } from "@/lib/transport-anchor";

export interface TransportSlimItem {
  id: string;
  anchorStopId: string | null;
  sortOrder: number;
}

/**
 * Compute the new ordered transport list after a drag-and-drop.
 *
 * @param localTransports - full current transport list (any order)
 * @param activeId        - id of the leg being dragged
 * @param targetSlot      - the slot (stopId | HEAD_SLOT | null) the leg is dropped into;
 *                          null is treated as HEAD_SLOT
 * @param overId          - the dnd-kit `over.id` (another transport id or stop id)
 * @param orderedStopIds  - stop ids in their current sortOrder (available for callers; not used internally — slot membership is derived from anchorStopId)
 *
 * @returns New `{ id, anchorStopId, sortOrder }[]` for ALL transports
 *          (only anchorStopId + sortOrder fields change; other fields are untouched)
 */
export function reorderTransportItems(
  localTransports: TransportSlimItem[],
  activeId: string,
  targetSlot: string | null,
  overId: string,
  // orderedStopIds is available for callers that need stop-order context;
  // the pure helper currently derives slot membership from anchorStopId directly.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _orderedStopIds: string[],
): TransportSlimItem[] {
  // Normalise: treat null as HEAD_SLOT
  const slot = targetSlot ?? HEAD_SLOT;

  // Get the legs currently in the target slot (in sortOrder), excluding the active one.
  const slotLegs = localTransports
    .filter((t) => {
      // HEAD_SLOT legs have anchorStopId === null or anchorStopId not in stops
      // We use the slot value directly; caller must resolve slot before calling.
      const legSlot = t.anchorStopId ?? HEAD_SLOT;
      return legSlot === slot && t.id !== activeId;
    })
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));

  // Determine insertion index within the slot.
  // If `overId` is another transport in the same slot → insert at that position.
  // Otherwise → append at the end.
  let insertIdx = slotLegs.length; // default: end of slot
  const overInSlot = slotLegs.findIndex((t) => t.id === overId);
  if (overInSlot !== -1) {
    insertIdx = overInSlot;
  }

  // Build the new ordered list for the target slot
  const newSlotOrder = [...slotLegs];
  newSlotOrder.splice(insertIdx, 0, { id: activeId, anchorStopId: slot === HEAD_SLOT ? null : slot, sortOrder: 0 });

  // Compute the new anchorStopId for the active item
  const newAnchorStopId = slot === HEAD_SLOT ? null : slot;

  // Build a map of id → new { anchorStopId, sortOrder } for legs in the target slot
  const slotUpdates = new Map<string, { anchorStopId: string | null; sortOrder: number }>();
  newSlotOrder.forEach((t, idx) => {
    slotUpdates.set(t.id, { anchorStopId: newAnchorStopId, sortOrder: idx });
  });

  // Also recompute the sortOrder for the old slot (after removing the active leg)
  const oldSlot = localTransports.find((t) => t.id === activeId)?.anchorStopId ?? null;
  const oldSlotNorm = oldSlot ?? HEAD_SLOT;

  const oldSlotLegs = localTransports
    .filter((t) => {
      const legSlot = t.anchorStopId ?? HEAD_SLOT;
      return legSlot === oldSlotNorm && t.id !== activeId;
    })
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));

  // Only recompute old slot if it's different from the target slot
  if (oldSlotNorm !== slot) {
    const oldAnchorStopId = oldSlotNorm === HEAD_SLOT ? null : oldSlotNorm;
    oldSlotLegs.forEach((t, idx) => {
      // Don't overwrite if already in slotUpdates (edge case: old === new slot)
      if (!slotUpdates.has(t.id)) {
        slotUpdates.set(t.id, { anchorStopId: oldAnchorStopId, sortOrder: idx });
      }
    });
  }

  // Produce the full updated list
  return localTransports.map((t) => {
    const update = slotUpdates.get(t.id);
    if (update) {
      return { ...t, anchorStopId: update.anchorStopId, sortOrder: update.sortOrder };
    }
    return t;
  });
}
