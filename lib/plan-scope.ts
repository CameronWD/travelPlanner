/**
 * A Plan is identified by its forkId. `null` is the real (live) plan;
 * a string is a Fork. (ADR 0020)
 */
export type PlanId = string | null;

/** Prisma `where` fragment selecting the real plan only. */
export const REAL_PLAN = { forkId: null } as const;

/** Build a Prisma `where`/`data` fragment for a given Plan. */
export function planScope(forkId?: PlanId): { forkId: string | null } {
  return { forkId: forkId ?? null };
}
