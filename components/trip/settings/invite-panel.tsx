"use client";

import * as React from "react";
import { useTransition } from "react";
import { UserPlus, X, Mail } from "lucide-react";
import { inviteToTrip, cancelInvite } from "@/server/actions/invites";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

interface Member {
  userId: string;
  role: string;
  user: {
    id: string;
    name: string | null;
    email: string;
    image: string | null;
  };
}

interface PendingInvite {
  id: string;
  email: string;
}

interface InvitePanelProps {
  tripId: string;
  members: Member[];
  pendingInvites: PendingInvite[];
}

function initials(name?: string | null, email?: string): string {
  if (name) {
    return name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0].toUpperCase())
      .join("");
  }
  return email?.[0]?.toUpperCase() ?? "?";
}

export function InvitePanel({ tripId, members, pendingInvites }: InvitePanelProps) {
  const [emailValue, setEmailValue] = React.useState("");
  const [invitePending, startInviteTransition] = useTransition();
  const [cancelPending, startCancelTransition] = useTransition();
  const [inviteError, setInviteError] = React.useState<string | undefined>();
  const [inviteSuccess, setInviteSuccess] = React.useState(false);

  function handleInvite(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setInviteError(undefined);
    setInviteSuccess(false);

    startInviteTransition(async () => {
      const result = await inviteToTrip(tripId, emailValue);
      if (!result.success) {
        setInviteError(result.error);
      } else {
        setEmailValue("");
        setInviteSuccess(true);
        setTimeout(() => setInviteSuccess(false), 3000);
      }
    });
  }

  function handleCancel(inviteId: string) {
    startCancelTransition(async () => {
      await cancelInvite(inviteId);
    });
  }

  return (
    <div className="space-y-5">
      {/* Current members */}
      <div>
        <h4 className="mb-3 text-sm font-medium text-muted-foreground">
          Current members ({members.length})
        </h4>
        <ul className="space-y-3">
          {members.map((m) => (
            <li key={m.userId} className="flex items-center gap-3">
              <Avatar className="size-9">
                {m.user.image ? (
                  <AvatarImage src={m.user.image} alt={m.user.name ?? "Member"} />
                ) : null}
                <AvatarFallback className="text-xs">
                  {initials(m.user.name, m.user.email)}
                </AvatarFallback>
              </Avatar>
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium text-foreground">
                  {m.user.name ?? m.user.email}
                </span>
                {m.user.name && (
                  <span className="truncate text-xs text-muted-foreground">
                    {m.user.email}
                  </span>
                )}
              </div>
              <Badge variant={m.role === "owner" ? "default" : "secondary"}>
                {m.role}
              </Badge>
            </li>
          ))}
        </ul>
      </div>

      {/* Pending invites */}
      {pendingInvites.length > 0 && (
        <div>
          <h4 className="mb-3 text-sm font-medium text-muted-foreground">
            Pending invites ({pendingInvites.length})
          </h4>
          <ul className="space-y-2">
            {pendingInvites.map((invite) => (
              <li
                key={invite.id}
                className="flex items-center gap-3 rounded-md border border-border bg-muted/40 px-3 py-2"
              >
                <Mail className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="flex-1 truncate text-sm text-foreground">
                  {invite.email}
                </span>
                <Badge variant="warning">Pending</Badge>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  onClick={() => handleCancel(invite.id)}
                  disabled={cancelPending}
                  aria-label={`Cancel invite for ${invite.email}`}
                >
                  <X className="size-4" aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Invite form */}
      <div>
        <h4 className="mb-1 text-sm font-medium text-foreground">Add a Traveller by email</h4>
        <p className="mb-3 text-xs text-muted-foreground">
          No email is sent. An Invite is created here, and access activates automatically the
          next time that person signs in with the matching email address.
        </p>
        <form onSubmit={handleInvite} noValidate className="flex items-end gap-2">
          <Field
            label="Email address"
            error={inviteError}
            className="flex-1"
          >
            <Input
              type="email"
              name="email"
              placeholder="partner@example.com"
              value={emailValue}
              onChange={(e) => setEmailValue(e.target.value)}
              disabled={invitePending}
            />
          </Field>
          <Button
            type="submit"
            size="md"
            loading={invitePending}
            disabled={!emailValue.trim()}
          >
            <UserPlus className="size-4" aria-hidden="true" />
            Invite
          </Button>
        </form>
        {inviteSuccess && (
          <p role="status" className="mt-2 text-sm text-success">
            Invite created — no email was sent. They&apos;ll join automatically the next time they sign in.
          </p>
        )}
      </div>
    </div>
  );
}
