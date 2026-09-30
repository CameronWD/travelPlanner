"use client";

import { useEffect, useState, type MouseEvent, type ReactNode } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PENDING_NAVIGATION_TIMEOUT_MS } from "@/components/navigation/navigation-pending";

/**
 * MOTION.md S11 — the Share CTA's primary link: the button's loading state
 * from the click until the next page takes over. Button's `loading` with
 * `asChild` dims and disables but draws no spinner, so the spinner is inline.
 */
export function PendingLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!pending) return;
    // Back from the next page restores this one from the bfcache as it was
    // left, loading; and a navigation that never lands must not pin it on.
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted) setPending(false);
    };
    window.addEventListener("pageshow", onShow);
    const t = window.setTimeout(() => setPending(false), PENDING_NAVIGATION_TIMEOUT_MS);
    return () => {
      window.removeEventListener("pageshow", onShow);
      window.clearTimeout(t);
    };
  }, [pending]);

  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    // A modifier- or middle-click opens a new tab; this page stays put.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    setPending(true);
  };

  return (
    <Button asChild variant="primary" size="lg" loading={pending} className={className}>
      <Link href={href} data-cta-button onClick={onClick}>
        {children}
        {pending && <Loader2 aria-hidden className="animate-spin motion-reduce:animate-none" />}
      </Link>
    </Button>
  );
}
