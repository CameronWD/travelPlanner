"use client";

import * as React from "react";
import { ShieldOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { relativeTime } from "@/lib/relative-time";
import { formError } from "@/components/ui/action-failure";
import { revokeAllowedEmail } from "@/server/actions/access-requests";
import type { PersonSource, PersonStatus, PersonView } from "@/lib/people";

export interface PeoplePanelProps {
  initial: PersonView[];
  now: Date;
  /** The signed-in admin's own email, lowercased by the page, so their own row is never offered a Revoke button (revokeAllowedEmail refuses it server-side too). */
  viewerEmail: string | null;
}

const STATUS_BADGE: Record<PersonStatus, { label: string; variant: "success" | "warning" | "muted" }> = {
  access: { label: "Has access", variant: "success" },
  "never-signed-up": { label: "Admitted, never signed up", variant: "warning" },
  "no-access": { label: "No access (account remains)", variant: "muted" },
};

function sourceLine(source: PersonSource): string {
  switch (source.kind) {
    case "env":
      return "Set in ALLOWED_EMAILS";
    case "approved":
      return "Approved";
    case "invited":
      return `Invited to ${source.tripName} by ${source.ownerName}`;
    case "unknown":
      return "Unknown";
  }
}

export function PeoplePanel({ initial, now, viewerEmail }: PeoplePanelProps) {
  const [people, setPeople] = React.useState<PersonView[]>(initial);
  const [pendingEmail, setPendingEmail] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);
  const { confirm, dialog } = useConfirm();

  async function handleRevoke(person: PersonView) {
    if (!person.revokeId) return;
    const confirmed = await confirm({
      title: `Revoke ${person.email}?`,
      description:
        "They'll lose the ability to sign in to Teepee the next time their session ends. Anything they've already added stays.",
      confirmLabel: "Revoke",
      destructive: true,
    });
    if (!confirmed) return;

    setPendingEmail(person.email);
    setMessage(null);
    const result = await revokeAllowedEmail(person.revokeId);
    setPendingEmail(null);
    if (result.success) {
      setPeople((prev) =>
        person.userId
          ? prev.map((p) => (p.email === person.email ? { ...p, status: "no-access", revokeId: null } : p))
          : prev.filter((p) => p.email !== person.email),
      );
    } else {
      setMessage(formError(result) ?? "Couldn't revoke that address.");
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {people.length === 0 && <p className="text-sm text-muted-foreground">Nobody yet.</p>}

      {people.map((person) => {
        const badge = STATUS_BADGE[person.status];
        const isSelf = viewerEmail !== null && person.email === viewerEmail;
        const notRevocable = person.source.kind === "env" || person.revokeId?.startsWith("env:");
        return (
          <Card
            key={person.email}
            radius="md"
            shadow={1}
            className="flex flex-col gap-2 p-3.5 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="truncate text-sm font-medium text-foreground">{person.name ?? person.email}</span>
              {person.name && <span className="truncate text-xs text-muted-foreground">{person.email}</span>}
              <span>
                <Badge variant={badge.variant}>{badge.label}</Badge>
              </span>
              <span className="truncate text-xs text-muted-foreground">{sourceLine(person.source)}</span>
              <span className="text-xs text-muted-foreground">
                {person.joinedAt ? `Joined ${relativeTime(new Date(person.joinedAt), now)}` : <>Joined <span>—</span></>}
                {" · "}
                {person.lastSeenAt ? (
                  `Last seen ${relativeTime(new Date(person.lastSeenAt), now)}`
                ) : (
                  <>Last seen <span>—</span></>
                )}
                {" · "}
                {`Owns ${person.tripsOwned} · On ${person.tripsOn}`}
              </span>
            </div>

            <div className="shrink-0 self-end sm:self-auto">
              {person.status === "no-access" ? null : notRevocable ? (
                <Badge variant="muted">Not revocable here</Badge>
              ) : isSelf ? (
                <Badge variant="muted">That&rsquo;s you</Badge>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="md"
                  className="gap-1.5 border-destructive text-destructive hover:bg-destructive/10"
                  loading={pendingEmail === person.email}
                  onClick={() => handleRevoke(person)}
                  aria-label={`Revoke ${person.email}`}
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
