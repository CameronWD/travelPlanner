"use client";

import { useState, useTransition } from "react";
import { inviteToGlobe } from "@/server/actions/globe";
import type { GlobeMemberView } from "./types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface GlobeInviteButtonProps {
  members: GlobeMemberView[];
}

export function GlobeInviteButton({ members }: GlobeInviteButtonProps) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const res = await inviteToGlobe(email);
      if (res.success) {
        setDone(true);
        setEmail("");
      } else {
        setError(res.errors["_"]?.join(", ") ?? "Could not send invite");
      }
    });
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setEmail("");
      setError(null);
      setDone(false);
    }
  };

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        Share
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Share your Globe</DialogTitle>
            <DialogDescription>
              Invite someone to view and add markers to your Globe.
            </DialogDescription>
          </DialogHeader>

          {members.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium">Current members</p>
              <ul className="flex flex-col gap-1">
                {members.map((m) => (
                  <li
                    key={m.userId}
                    className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm"
                  >
                    <span className="flex flex-col">
                      {m.name && (
                        <span className="font-medium">{m.name}</span>
                      )}
                      {m.email && (
                        <span className="text-muted-foreground">{m.email}</span>
                      )}
                    </span>
                    <span className="text-xs capitalize text-muted-foreground">
                      {m.role}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {members.length < 2 && (
            <div className="flex flex-col gap-3">
              <p className="text-sm font-medium">Invite someone</p>
              {done ? (
                <p className="text-sm text-muted-foreground">
                  Invited — they&apos;ll join when they next sign in.
                </p>
              ) : (
                <>
                  <Input
                    type="email"
                    placeholder="their@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    invalid={!!error}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") submit();
                    }}
                  />
                  {error && (
                    <p className="text-sm text-destructive">{error}</p>
                  )}
                  <Button onClick={submit} loading={pending}>
                    Invite
                  </Button>
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
