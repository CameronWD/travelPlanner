import { cn } from "@/lib/cn";

/**
 * The Admin queue's indicator (CONTEXT.md "Admin queue"; spec 2026-10-02 §B):
 * a filled dot, no number, on the avatar that opens the account menu and on
 * the phone's You tab. Decorative — the trigger it sits on carries the
 * meaning in its accessible name (lib/admin-queue.ts withAdminQueueName).
 * The parent must be `relative`; the default offset puts the dot on the
 * top-right edge of a 36px avatar centred in a 44px trigger. Server-safe
 * (no hooks) so the app layout can render it directly.
 */
export function AdminQueueDot({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      data-testid="admin-queue-dot"
      className={cn(
        "pointer-events-none absolute right-1 top-1 size-3 rounded-full border-2 border-background bg-destructive",
        className,
      )}
    />
  );
}
