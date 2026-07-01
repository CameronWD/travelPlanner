/**
 * Activity guard — only record activity for real-plan (non-fork) mutations.
 *
 * Forks are "silent": per-entity edits inside a fork must NOT create Activity
 * feed entries. Only edits on the real plan (forkId === null) are recorded.
 * Fork lifecycle milestones (created/promoted/discarded) are recorded by the
 * fork actions directly and are NOT routed through this helper.
 */

import { recordActivity } from "@/server/actions/activity";

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
