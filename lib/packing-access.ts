import type { Prisma } from "@prisma/client";

export type PackingViewer = { userId: string; open: boolean };
export type PackingOwnerRef = "SHARED" | string;

export function toOwnerId(ref: PackingOwnerRef): string | null {
  return ref === "SHARED" ? null : ref;
}

export function canSeePackingItem(ownerId: string | null, v: PackingViewer): boolean {
  return ownerId === null || ownerId === v.userId || v.open;
}

export function canManagePackingItem(ownerId: string | null, v: PackingViewer): boolean {
  return ownerId === null || ownerId === v.userId;
}

export function canAddPackingTo(ownerId: string | null, v: PackingViewer): boolean {
  return ownerId === null || ownerId === v.userId || v.open;
}

export function packingVisibleWhere(v: PackingViewer): Prisma.ChecklistItemWhereInput {
  if (v.open) return {};
  return { OR: [{ kind: { not: "PACKING" } }, { ownerId: null }, { ownerId: v.userId }] };
}

export function packingMineOrSharedWhere(userId: string): Prisma.ChecklistItemWhereInput {
  return { kind: "PACKING", OR: [{ ownerId: null }, { ownerId: userId }] };
}
