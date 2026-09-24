"use client";

import * as React from "react";
import { ShieldOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { relativeTime } from "@/lib/relative-time";
import {
  revokeAllowedEmail,
  type AllowedEmailView,
} from "@/server/actions/access-requests";

export interface AllowedEmailsPanelProps {
  initial: AllowedEmailView[];
  now: Date;
  /** The signed-in admin's own email, lowercased by the page — so their own row can be told apart and never offered a Revoke button (server-side belt-and-braces lives in revokeAllowedEmail itself). */
  viewerEmail: string | null;
}

/**
 * Who currently holds deployment-level sign-in, and the Revoke control.
 *
 * NEW requirement beyond the original ARCH-TEN-3c brief: admission via a
 * Trip Invite writes an `AllowedEmail` row (the lockout fix earlier on this
 * branch), which made revocation two-sided — `removeTripMember`/`leaveTrip`
 * delete the Invite but nothing deleted this row, so someone removed from
 * the only Trip they were ever invited to kept deployment-level sign-in with
 * no way back short of raw SQL. This panel is that way back.
 *
 * `revokeAllowedEmail` refuses an ALLOWED_EMAILS entry server-side, but this
 * panel doesn't even offer the button for one — `entry.revocable` decides
 * that before the click, not after a failed round trip.
 */
export function AllowedEmailsPanel({ initial, now, viewerEmail }: AllowedEmailsPanelProps) {
  const [entries, setEntries] = React.useState<AllowedEmailView[]>(initial);
  const [pendingId, setPendingId] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);
  const { confirm, dialog } = useConfirm();

  async function handleRevoke(entry: AllowedEmailView) {
    const confirmed = await confirm({
      title: `Revoke ${entry.email}?`,
      description:
        "They'll lose the ability to sign in to Teepee the next time their session ends. Anything they've already added stays.",
      confirmLabel: "Revoke",
      destructive: true,
    });
    if (!confirmed) return;

    setPendingId(entry.id);
    setMessage(null);
    const result = await revokeAllowedEmail(entry.id);
    setPendingId(null);
    if (result.success) {
      setEntries((prev) => prev.filter((e) => e.id !== entry.id));
    } else {
      setMessage(result.errors._form?.[0] ?? "Couldn't revoke that address.");
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {entries.length === 0 && (
        <p className="text-sm text-muted-foreground">No addresses on the allowlist yet.</p>
      )}

      {entries.map((entry) => {
        const busy = pendingId === entry.id;
        // Lowercased on the entry side too, not just the (already-lowercased
        // by the page) viewerEmail — so this client-side guard and the
        // server-side one in revokeAllowedEmail fail independently rather
        // than sharing the same "row is already lowercase" assumption. See
        // that function's doc comment for why that assumption isn't trusted.
        const isSelf = viewerEmail !== null && entry.email.trim().toLowerCase() === viewerEmail;
        return (
          <Card
            key={entry.id}
            radius="md"
            shadow={1}
            className="flex flex-col gap-2 p-3.5 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-medium text-foreground">
                {entry.email}
              </span>
              <span className="truncate text-xs text-muted-foreground">
                {entry.note}
                {entry.createdAt ? ` · added ${relativeTime(new Date(entry.createdAt), now)}` : ""}
              </span>
            </div>

            <div className="shrink-0 self-end sm:self-auto">
              {!entry.revocable ? (
                <Badge variant="muted">Not revocable here</Badge>
              ) : isSelf ? (
                // Never offered for the acting admin's own address — that is
                // the exact lockout this panel exists to fix, in reverse.
                // revokeAllowedEmail refuses it too, but the control is never
                // shown at all rather than shown-then-refused.
                <Badge variant="muted">That&rsquo;s you</Badge>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="md"
                  className="gap-1.5 border-destructive text-destructive hover:bg-destructive/10"
                  loading={busy}
                  onClick={() => handleRevoke(entry)}
                  aria-label={`Revoke ${entry.email}`}
                >
                  <ShieldOff className="size-4" aria-hidden="true" />
                  Revoke
                </Button>
              )}
            </div>
          </Card>
        );
      })}

      {message && (
        <p role="status" aria-live="polite" className="text-xs text-destructive">
          {message}
        </p>
      )}

      {dialog}
    </div>
  );
}
