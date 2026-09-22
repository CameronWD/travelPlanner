"use client";

import * as React from "react";
import { Check, X } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { relativeTime } from "@/lib/relative-time";
import {
  approveAccessRequest,
  dismissAccessRequest,
  type AccessRequestView,
} from "@/server/actions/access-requests";

export interface AccessRequestsPanelProps {
  initial: AccessRequestView[];
  /** The server's instant, so a `new Date()` in this client render can't disagree with the server pass (CD-05, same as DevicesPanel). */
  now: Date;
}

function initials(name: string | null, email: string): string {
  if (name) {
    return name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0].toUpperCase())
      .join("");
  }
  return email[0]?.toUpperCase() ?? "?";
}

/**
 * Pending Access requests, with Approve / Dismiss.
 *
 * Both actions call `requireAdmin()` server-side before doing anything —
 * this panel only reflects that; it grants nothing on its own. A row is
 * removed from local state as soon as its action resolves, rather than
 * waiting on `router.refresh()`, so the queue visibly shrinks under the
 * admin's own click.
 */
/** Which row, and which of its two actions, is currently in flight. */
interface PendingAction {
  id: string;
  action: "approve" | "dismiss";
}

export function AccessRequestsPanel({ initial, now }: AccessRequestsPanelProps) {
  const [requests, setRequests] = React.useState<AccessRequestView[]>(initial);
  const [pending, setPending] = React.useState<PendingAction | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);

  async function handleApprove(request: AccessRequestView) {
    setPending({ id: request.id, action: "approve" });
    setMessage(null);
    const result = await approveAccessRequest(request.id);
    setPending(null);
    if (result.success) {
      setRequests((prev) => prev.filter((r) => r.id !== request.id));
    } else {
      setMessage(result.errors._form?.[0] ?? "Couldn't approve that request.");
    }
  }

  async function handleDismiss(request: AccessRequestView) {
    setPending({ id: request.id, action: "dismiss" });
    setMessage(null);
    const result = await dismissAccessRequest(request.id);
    setPending(null);
    if (result.success) {
      setRequests((prev) => prev.filter((r) => r.id !== request.id));
    } else {
      setMessage(result.errors._form?.[0] ?? "Couldn't dismiss that request.");
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {requests.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No Access requests waiting.
        </p>
      )}

      {requests.map((request) => {
        const label = request.name ?? request.email;
        // Keyed on row id AND action: which button shows a spinner must
        // match which one is actually running — a click on Dismiss must
        // never render Approve as in-flight (or vice versa), since this is
        // the admin surface of the sign-in door and the two actions have
        // opposite effects.
        const dismissBusy = pending?.id === request.id && pending.action === "dismiss";
        const approveBusy = pending?.id === request.id && pending.action === "approve";
        const rowBusy = dismissBusy || approveBusy;
        return (
          <div
            key={request.id}
            className="flex flex-col gap-3 rounded-md border border-border p-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex min-w-0 items-center gap-3">
              <Avatar className="size-9 shrink-0">
                {request.image ? (
                  <AvatarImage src={request.image} alt="" />
                ) : null}
                <AvatarFallback className="text-xs">
                  {initials(request.name, request.email)}
                </AvatarFallback>
              </Avatar>
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-medium text-foreground">
                  {label}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {request.email}
                </span>
                <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                  <span>First asked {relativeTime(new Date(request.createdAt), now)}</span>
                  <Badge variant="muted">
                    {request.attempts} {request.attempts === 1 ? "attempt" : "attempts"}
                  </Badge>
                </span>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2 self-end sm:self-auto">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                loading={dismissBusy}
                disabled={rowBusy}
                onClick={() => handleDismiss(request)}
              >
                <X className="size-4" aria-hidden="true" />
                Dismiss
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                className="gap-1.5"
                loading={approveBusy}
                disabled={rowBusy}
                onClick={() => handleApprove(request)}
              >
                <Check className="size-4" aria-hidden="true" />
                Approve
              </Button>
            </div>
          </div>
        );
      })}

      {message && (
        <p role="status" aria-live="polite" className="text-xs text-destructive">
          {message}
        </p>
      )}
    </div>
  );
}
