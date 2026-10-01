"use client";

import { useId, useState, type FormEvent } from "react";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * The Sign-in link field (CONTEXT.md "Sign-in link"; spec 2026-10-01 §B3).
 * Posts the address to Auth.js's Resend provider without leaving the page.
 * The gate (lib/auth.ts signIn callback, ADR 0057) runs before any mail is
 * sent, and Auth.js reports a refusal as `error: "AccessDenied"` — which
 * this form shows EXACTLY like a success, so the panel never says who is on
 * the list. Only a configuration failure (Resend refused, offline) shows
 * the generic failure line.
 */
const SENT = "If that address is on the list, a link is on its way. Check your inbox.";
const FAILED = "Couldn't send the link just now. Try again in a minute.";

type Status = "idle" | "sending" | "sent" | "failed";

export function EmailSignInForm({ callbackUrl }: { callbackUrl: string }) {
  const id = useId();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (status === "sending") return;
    setStatus("sending");
    try {
      const res = await signIn("resend", { email, callbackUrl, redirect: false });
      // undefined error: the link went out. AccessDenied: the gate refused
      // it before any mail — same words, by design. Anything else is ours
      // to own (bad key, unverified domain, network).
      const neutral = !res || !res.error || res.error === "AccessDenied";
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
