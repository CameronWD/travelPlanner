"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { authClient } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * The Sign-in link field (CONTEXT.md "Sign-in link"; spec 2026-10-01 §B3).
 * Posts the address to Better Auth's magic-link plugin without leaving the
 * page. The gate (lib/auth/sign-in-door.ts, ADR 0057) runs before any mail is
 * sent, and the send endpoint answers a refused address with the same
 * `{status:true}` response as an accepted one, so the response itself is not
 * an oracle. An `error` that isn't a network/transport failure (e.g. the
 * literal "AccessDenied" the door's redirect-flow codes use) is still shown
 * EXACTLY like a success, so the panel never says who is on the list either
 * way. Only a configuration failure (Resend refused, offline) shows the
 * generic failure line. `errorCallbackURL: "/"` keeps a refused click on the
 * Landing rather than the callback page.
 */
const SENT = "If that address is on the list, a link is on its way. Check your inbox.";
const FAILED = "Couldn't send the link just now. Try again in a minute.";

type Status = "idle" | "sending" | "sent" | "failed";

export function EmailSignInForm({ callbackUrl }: { callbackUrl: string }) {
  const id = useId();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const input = useRef<HTMLInputElement>(null);
  // Set only by "Use a different address", so the field takes focus when the
  // form comes back — never on first mount, where the dialog title has it.
  const refocus = useRef(false);

  useEffect(() => {
    if (status === "idle" && refocus.current) {
      refocus.current = false;
      input.current?.focus();
    }
  }, [status]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (status === "sending") return;
    setStatus("sending");
    try {
      const res = await authClient.signIn.magicLink({ email, callbackURL: callbackUrl, errorCallbackURL: "/" });
      // No error: the link went out. AccessDenied: the gate refused it
      // before any mail — same words, by design. Anything else (a thrown
      // network error) is caught below and treated as a failure.
      const neutral = !res.error || res.error.code === "AccessDenied";
      setStatus(neutral ? "sent" : "failed");
    } catch {
      setStatus("failed");
    }
  }

  if (status === "sent") {
    return (
      <div className="flex flex-col gap-3" role="status">
        <p className="text-sm font-semibold leading-snug">{SENT}</p>
        <Button
          type="button"
          variant="secondary"
          size="md"
          className="w-full"
          onClick={() => {
            setEmail("");
            refocus.current = true;
            setStatus("idle");
          }}
        >
          Use a different address
        </Button>
      </div>
    );
  }

  const sending = status === "sending";
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2" noValidate={false}>
      <Label htmlFor={`${id}-email`}>Email</Label>
      <Input
        ref={input}
        id={`${id}-email`}
        type="email"
        name="email"
        required
        autoComplete="email"
        inputMode="email"
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        invalid={status === "failed"}
        aria-describedby={status === "failed" ? `${id}-error` : undefined}
      />
      {status === "failed" && (
        <p id={`${id}-error`} className="text-[13px] font-medium text-destructive">
          {FAILED}
        </p>
      )}
      <Button type="submit" variant="outline" size="lg" className="w-full" loading={sending} disabled={sending}>
        {sending ? "Sending…" : "Send me a link"}
      </Button>
    </form>
  );
}
