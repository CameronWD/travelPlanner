"use client";

import { useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { GoogleMark } from "@/components/ui/google-mark";
import { cn } from "@/lib/cn";

/**
 * Press feedback for a sign-in button (spec 2026-10-01 §B): the kit Button's
 * loading state from the click until the provider's page takes over. Coming
 * back through the bfcache restores this page as it was left — loading — so
 * `pageshow` clears it; a rejected signIn (offline, blocked) clears it too.
 * Same pattern as app/share/[token]/pending-link.tsx.
 */
function useSignInPending() {
  const [pending, setPending] = useState(false);
  useEffect(() => {
    if (!pending) return;
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted) setPending(false);
    };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, [pending]);
  const start = async (go: () => Promise<unknown>) => {
    setPending(true);
    try {
      await go();
    } catch {
      setPending(false);
    }
  };
  return { pending, start };
}

/** "Continue with Google" with Google's G — fine to render even when Google
 * isn't configured locally; it just won't complete the flow without
 * credentials. The Sign in panel uses the outline look; its "Want to test it?"
 * mode uses the kit's secondary button (spec 2026-09-29 §1.3). */
export function GoogleSignInButton({
  variant = "outline",
  className,
  callbackUrl = "/trips",
}: {
  variant?: "outline" | "secondary";
  className?: string;
  callbackUrl?: string;
}) {
  const { pending, start } = useSignInPending();
  return (
    <Button
      variant={variant}
      size="lg"
      loading={pending}
      // The G is 18px by brand guidance; size="lg" would make every svg 20px
      // — scoped to the mark itself so it doesn't also shrink the kit's own
      // loading spinner (button-spinner) from 20px to 18px.
      className={cn("w-full [&_svg[data-testid=google-mark]]:size-[18px]", className)}
      onClick={() => void start(() => signIn("google", { callbackUrl }))}
    >
      {!pending && <GoogleMark />}
      {/* Wrapped so the label is its own sibling element after the mark,
          not a bare text node inside the shared gap span — otherwise
          `getByText` resolves to that ancestor span instead of the label. */}
      <span>{pending ? "Opening Google…" : "Continue with Google"}</span>
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
  const { pending, start } = useSignInPending();
  return (
    <Button
      variant="secondary"
      size="md"
      className="w-full"
      loading={pending}
      onClick={() => void start(() => signIn("dev-login", { email, callbackUrl }))}
    >
      {pending ? "Signing in…" : `Continue as ${label}`}
    </Button>
  );
}
