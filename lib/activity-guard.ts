/**
 * Activity guard — only record activity for real-plan (non-fork) mutations.
 *
 * Forks are "silent": per-entity edits inside a fork must NOT create Activity
 * feed entries. Only edits on the real plan (forkId === null) are recorded.
 * Fork lifecycle milestones (created/promoted/discarded) are recorded by the
 * fork actions directly and are NOT routed through this helper.
 */

import { recordActivity } from "@/server/actions/activity";
import { describeChanges, entityLabel, type ActivityEntityType } from "@/lib/activity";
import type { PlanId } from "@/lib/plan-scope";

type RecordActivityInput = Parameters<typeof recordActivity>[0];

/**
 * Call recordActivity only when forkId is null (real plan).
 * When forkId is a non-null string (fork edit) this is a no-op.
 */
export async function recordPlanActivity(
  forkId: string | null | undefined,
  input: RecordActivityInput,
): Promise<void> {
  if ((forkId ?? null) !== null) return;
  await recordActivity(input);
}

/** The two Prisma delegate methods an audited update needs. */
export interface AuditedDelegate<Row, Data> {
  findUnique(args: { where: { id: string } }): PromiseLike<Row | null>;
  update(args: { where: { id: string }; data: Data }): PromiseLike<Row>;
}

/**
 * Read-before → update → record UPDATED (Fork edits stay silent). Returns
 * both rows. Activity is recorded only after the update succeeds: a thrown
 * update records nothing.
 */
export async function auditedUpdate<Row extends { tripId: string }, Data>(
  entityType: ActivityEntityType,
  delegate: AuditedDelegate<Row, Data>,
  id: string,
  data: Data,
  plan: PlanId,
): Promise<{ before: Row | null; after: Row }> {
  const before = await delegate.findUnique({ where: { id } });
  const after = await delegate.update({ where: { id }, data });
  await recordUpdate(entityType, { tripId: after.tripId, plan, entityId: id, before, after });
  return { before, after };
}

/**
 * For writes inside a transaction or with a built `after`: record UPDATED
 * once the write has committed. A Fork (non-null plan) records nothing.
 */
export async function recordUpdate(
  entityType: ActivityEntityType,
  args: { tripId: string; plan: PlanId; entityId: string; before: object | null; after: object },
): Promise<void> {
  const { tripId, plan, entityId, before, after } = args;
  await recordPlanActivity(plan, {
    tripId,
    verb: "UPDATED",
    entityType,
    entityId,
    entityLabel: entityLabel(entityType, after),
    changes: describeChanges(entityType, before ?? {}, after),
  });
}
