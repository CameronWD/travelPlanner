"use client";

import * as React from "react";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, X, Mail, UserMinus, LogOut } from "lucide-react";
import { inviteToTrip, cancelInvite } from "@/server/actions/invites";
import { removeTripMember, leaveTrip } from "@/server/actions/trips";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { toast } from "@/components/ui/use-toast";

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
  // Only the owner or an admin may create an Invite — it grants full,
  // transitive Trip membership (ADR 0052). The member list and pending
  // invites above stay visible to every Traveller; only this form is gated.
  // The same pair also governs whether a Remove control shows on another
  // Traveller's row — removing someone is the same authority as inviting one.
  canInvite: boolean;
  // The signed-in viewer, so their own row can be told apart from everyone
  // else's (no self-remove; the "Leave trip" control covers that instead).
  currentUserId: string;
  // Whether the *viewer* holds the trip's owner role specifically (not the
  // admin-bypass version canInvite carries) — leaving is barred only for the
  // actual owner, since that's the only case that would strand the trip.
  viewerIsOwner: boolean;
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

export function InvitePanel({
  tripId,
  members,
  pendingInvites,
  canInvite,
  currentUserId,
  viewerIsOwner,
}: InvitePanelProps) {
  const router = useRouter();
  const [emailValue, setEmailValue] = React.useState("");
  const [invitePending, startInviteTransition] = useTransition();
  const [cancelPending, startCancelTransition] = useTransition();
  const [removingUserId, setRemovingUserId] = React.useState<string | null>(null);
  const [leavePending, startLeaveTransition] = useTransition();
  const [inviteError, setInviteError] = React.useState<string | undefined>();
  const [inviteSuccess, setInviteSuccess] = React.useState(false);
  const { confirm, dialog } = useConfirm();

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

  async function handleRemove(m: Member) {
    const label = m.user.name ?? m.user.email;
    const confirmed = await confirm({
      title: `Remove ${label}?`,
      description: `They'll lose access to this trip right away. Anything they've already added stays.`,
      confirmLabel: "Remove",
      destructive: true,
    });
    if (!confirmed) return;

    setRemovingUserId(m.userId);
    const result = await removeTripMember(tripId, m.userId);
    setRemovingUserId(null);
    if (!result.success) {
      toast({ title: result.error, variant: "destructive" });
    }
  }

  async function handleLeave() {
    const confirmed = await confirm({
      title: "Leave this trip?",
      description: "You'll lose access right away. Anything you've already added stays on the trip.",
      confirmLabel: "Yes, leave",
      destructive: true,
    });
    if (!confirmed) return;

    startLeaveTransition(async () => {
      const result = await leaveTrip(tripId);
      if (result.success) {
        router.push("/trips");
      } else {
        toast({ title: result.error, variant: "destructive" });
      }
    });
  }

  return (
    <div className="space-y-5">
      {/* Travellers on this trip */}
      <ul className="space-y-0">
        {members.map((m) => {
          const label = m.user.name ?? m.user.email;
          const canRemove = canInvite && m.role !== "owner" && m.userId !== currentUserId;
          return (
            <li key={m.userId} className="flex items-center gap-3 py-1.5">
              <Avatar className="size-9">
                {m.user.image ? (
                  <AvatarImage src={m.user.image} alt={m.user.name ?? "Traveller"} />
                ) : null}
                <AvatarFallback className="text-xs">
                  {initials(m.user.name, m.user.email)}
                </AvatarFallback>
              </Avatar>
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium text-foreground">
                  {label}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {m.role === "owner" ? "Owner" : "Traveller"}
                </span>
              </div>
              {canRemove && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="tap-target size-8 text-destructive hover:bg-destructive/5"
                  onClick={() => handleRemove(m)}
                  disabled={removingUserId === m.userId}
                  aria-label={`Remove ${label} from this trip`}
                >
                  <UserMinus className="size-4" aria-hidden="true" />
                </Button>
              )}
            </li>
          );
        })}
      </ul>

      {/* Pending invites */}
      {pendingInvites.length > 0 && (
        <div>
          <ul className="space-y-2">
            {pendingInvites.map((invite) => (
              <li
                key={invite.id}
                className="flex items-center gap-3 rounded-xl border border-border bg-muted/40 px-3 py-2"
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
                  className="tap-target size-8"
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

      {/* Invite form (owner or admin) — an Invite grants full membership, ADR 0052 */}
      {canInvite && (
        <div>
          <h4 className="mb-1 text-sm font-medium text-foreground">Add a Traveller by email</h4>
          <p className="mb-3 max-w-reading text-xs text-muted-foreground">
            No email is sent. An Invite is created here, and access activates automatically the
            next time that person signs in with the matching email address.
          </p>
          <form onSubmit={handleInvite} noValidate className="flex items-end gap-2.5">
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
              variant="primary"
              size="md"
              loading={invitePending}
              disabled={!emailValue.trim()}
            >
              <UserPlus className="size-4" aria-hidden="true" />
              Invite
            </Button>
          </form>
          {inviteSuccess && (
            <p role="status" className="mt-2 text-sm text-teal-text">
              Invite created — no email was sent. They&apos;ll join automatically the next time they sign in.
            </p>
          )}
        </div>
      )}

      {/* Leave this trip — every Traveller except the owner, who cannot,
          because the Owner role does not transfer (CONTEXT.md). Told plainly
          rather than pointed at a hand-over feature that does not exist. */}
      <div className="border-t border-border pt-4">
        {viewerIsOwner ? (
          <p className="max-w-reading text-xs text-muted-foreground">
            As the owner, you can&apos;t leave this trip — the Owner role can&apos;t be transferred
            to another Traveller yet.
          </p>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="md"
            className="border-destructive text-destructive hover:bg-destructive/5"
            onClick={handleLeave}
            loading={leavePending}
          >
            <LogOut className="size-4" aria-hidden="true" />
            Leave trip
          </Button>
        )}
      </div>

      {dialog}
    </div>
  );
}
