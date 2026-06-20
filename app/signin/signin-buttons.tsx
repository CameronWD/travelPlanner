"use client";

import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";

/** "Continue with Google" — fine to render even when Google isn't configured
 * locally; it just won't complete the flow without credentials. */
export function GoogleSignInButton() {
  return (
    <Button
      variant="outline"
      size="lg"
      className="w-full"
      onClick={() => signIn("google", { callbackUrl: "/trips" })}
    >
      Continue with Google
    </Button>
  );
}

/** Dev-only quick sign-in for a seeded traveller (no password). */
export function DevSignInButton({
  email,
  label,
}: {
  email: string;
  label: string;
}) {
  return (
    <Button
      variant="secondary"
      size="md"
      className="w-full"
      onClick={() =>
        signIn("dev-login", { email, callbackUrl: "/trips" })
      }
    >
      Continue as {label}
    </Button>
  );
}
