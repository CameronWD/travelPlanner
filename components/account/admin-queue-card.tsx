import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { adminQueueTotal, type AdminQueue } from "@/lib/admin-queue";

function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * The Admin queue on Account (CONTEXT.md "Admin queue"; spec 2026-10-02 §C):
 * what is waiting, one line per kind, and the way to /admin. Renders for an
 * Admin even when nothing is waiting, so the You tab's dot always lands on
 * a card that explains itself and Account always has a way to Admin. The
 * caller decides whether the viewer is an Admin; this never checks. Shows
 * the real numbers — the menu badge caps at 9+, this does not.
 */
export function AdminQueueCard({ queue }: { queue: AdminQueue }) {
  const lines: string[] = [];
  if (queue.accessRequests > 0) {
    lines.push(`${count(queue.accessRequests, "Access request", "Access requests")} waiting`);
  }
  if (queue.feedbackNeedingReview > 0) {
    lines.push(
      `${count(queue.feedbackNeedingReview, "Feedback note", "Feedback notes")} ${
        queue.feedbackNeedingReview === 1 ? "needs" : "need"
      } review`,
    );
  }

  return (
    <Card role="region" aria-labelledby="account-admin-queue" className="p-[18px]">
      <CardTitle id="account-admin-queue">Admin queue</CardTitle>
      <div className="mt-3.5 flex flex-col gap-3">
        {adminQueueTotal(queue) === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing waiting.</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm font-semibold text-foreground">
            {lines.map((text) => (
              <li key={text}>{text}</li>
            ))}
          </ul>
        )}
        <Button asChild variant="outline" size="md" className="self-start">
          <Link href="/admin">Open Admin</Link>
        </Button>
      </div>
    </Card>
  );
}
