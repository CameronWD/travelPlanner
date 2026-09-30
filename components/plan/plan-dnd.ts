import { closestCenter, pointerWithin, type CollisionDetection } from "@dnd-kit/core";

export interface ItemDragData { type: "item"; stopId: string; date: string; itemId: string; title: string; startTime: string | null; endTime: string | null }
export interface ItemDrop { itemId: string; title: string; stopId: string; from: { date: string; startTime: string | null; endTime: string | null }; to: string }

const isItem = (d: unknown): d is ItemDragData => !!d && (d as { type?: string }).type === "item";
const isSlot = (d: unknown): d is { type: "slot"; stopId: string; date: string } => !!d && (d as { type?: string }).type === "slot";

/** Spec D5: a plan moves only within its own stop's strip; a changeover day shows in two strips, but each strip is its own target. */
export function resolveItemDrop(active: unknown, over: unknown): ItemDrop | null {
  if (!isItem(active) || !isSlot(over)) return null;
  if (over.stopId !== active.stopId || over.date === active.date) return null;
  return {
    itemId: active.itemId,
    title: active.title,
    stopId: active.stopId,
    from: { date: active.date, startTime: active.startTime, endTime: active.endTime },
    to: over.date,
  };
}

/** scheduleItem overwrites times wholesale when they're absent, so an item keeps its own. */
export function scheduleInputFor(date: string, t: { startTime: string | null; endTime: string | null }) {
  return { date, ...(t.startTime ? { startTime: t.startTime } : {}), ...(t.endTime ? { endTime: t.endTime } : {}) };
}

export const planCollisionDetection: CollisionDetection = (args) => {
  if (isItem(args.active.data.current)) {
    return pointerWithin({ ...args, droppableContainers: args.droppableContainers.filter((c) => isSlot(c.data.current)) });
  }
  // A stop/chapter drag must never land on a day slot: handleDragOver would read the slot id as a chapter id.
  return closestCenter({ ...args, droppableContainers: args.droppableContainers.filter((c) => !isSlot(c.data.current)) });
};
