"use client";

import * as React from "react";
import { Card } from "@/components/ui/card";
import { Segmented, SegmentedItem } from "@/components/ui/segmented";
import { formError } from "@/components/ui/action-failure";
import { REVIEW_PERMISSIONS, type ReviewPermission } from "@/lib/enum-values";
import { setReviewPermission, type ReviewPermissionView } from "@/server/actions/review-permission";

const LABEL: Record<ReviewPermission, string> = { OFF: "Off", LIMITED: "Limited", UNLIMITED: "Unlimited" };

/**
 * Who may start a Review (spec 2026-10-17 R12): Off shows no Review option
 * anywhere, Limited is 1 a day and 2 a week, Unlimited has no cap. Saves on
 * click, optimistically; a refused save puts the old value back and says why.
 * setReviewPermission calls requireAdmin() itself.
 */
export function ReviewPermissionsPanel({ initial }: { initial: ReviewPermissionView[] }) {
  const [rows, setRows] = React.useState(initial);
  // A Set, not one id: a save still in flight for row A must not make row B's
  // control (re-)enable when row B's own save finishes first (fix round 1).
  const [pendingIds, setPendingIds] = React.useState<ReadonlySet<string>>(new Set());
  const [message, setMessage] = React.useState<string | null>(null);

  const put = (userId: string, permission: ReviewPermission) =>
    setRows((prev) => prev.map((r) => (r.userId === userId ? { ...r, permission } : r)));

  const setPending = (userId: string, pending: boolean) =>
    setPendingIds((prev) => {
      const next = new Set(prev);
      if (pending) next.add(userId);
      else next.delete(userId);
      return next;
    });

  async function change(row: ReviewPermissionView, value: string) {
    // Radix sends "" when the item already on is clicked again: nothing to do.
    if (!value || value === row.permission) return;
    const next = value as ReviewPermission;
    const before = row.permission;
    put(row.userId, next);
    setPending(row.userId, true);
    setMessage(null);
    const result = await setReviewPermission(row.userId, next);
    setPending(row.userId, false);
    if (!result.success) {
      put(row.userId, before);
      setMessage(`${row.name}: ${formError(result) ?? "Couldn't change that."}`);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {rows.length === 0 && <p className="text-sm text-muted-foreground">No accounts yet.</p>}

      {rows.map((row) => (
        <Card
          key={row.userId}
          radius="md"
          shadow={1}
          className="flex flex-col gap-2 p-3.5 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-medium text-foreground">{row.name}</span>
            <span className="truncate text-xs text-muted-foreground">{row.email}</span>
          </div>
          <Segmented
            type="single"
            tone="ink"
            aria-label={`Reviews for ${row.email}`}
            value={row.permission}
            disabled={pendingIds.has(row.userId)}
            onValueChange={(v) => void change(row, v)}
            className="shrink-0 self-end sm:self-auto"
          >
            {REVIEW_PERMISSIONS.map((p) => (
              <SegmentedItem key={p} value={p}>
                {LABEL[p]}
              </SegmentedItem>
            ))}
          </Segmented>
        </Card>
      ))}

      {message && (
        <p role="status" aria-live="polite" className="text-xs text-destructive">
          {message}
        </p>
      )}
    </div>
  );
}
