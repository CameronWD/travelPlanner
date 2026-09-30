"use client";

import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

/** "Continue with Google" — fine to render even when Google isn't configured
 * locally; it just won't complete the flow without credentials. The Sign in
 * panel uses the outline look; its "Ask to join" mode uses the kit's
 * secondary button (spec 2026-09-29 §1.3). */
export function GoogleSignInButton({
  variant = "outline",
  className,
  callbackUrl = "/trips",
}: {
  variant?: "outline" | "secondary";
  className?: string;
  callbackUrl?: string;
}) {
  return (
    <Button
      variant={variant}
      size="lg"
      className={cn("w-full", className)}
      onClick={() => signIn("google", { callbackUrl })}
    >
      Continue with Google
    </Button>
  );
}

/** Dev-only quick sign-in for a seeded traveller (no password). */
export function DevSignInButton({
  email,
  label,
  callbackUrl = "/trips",
}: {
  email: string;
  label: string;
  callbackUrl?: string;
}) {
  return (
    <Button
      variant="secondary"
      size="md"
      className="w-full"
      onClick={() =>
        signIn("dev-login", { email, callbackUrl })
      }
    >
      Continue as {label}
    </Button>
  );
}
