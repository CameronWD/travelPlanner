import type { Route } from "next";
import Link from "next/link";
import { Logo } from "@/components/ui/logo";
import { Button } from "@/components/ui/button";

// ---------------------------------------------------------------------------
// Share page top bar (SHARE.md §2). Every pill — mobile outline, desktop
// ink — opens the same door (ADR 0057): the Landing's "Want to test it?" panel.
// Server Component: `requestAccessHref` is computed up front in the page
// from lib/share-ref.ts (node:crypto), never imported here.
// ---------------------------------------------------------------------------

export function ShareTopBar({ requestAccessHref }: { requestAccessHref: Route }) {
  return (
    <header
      data-slot="share-top-bar"
      className="flex h-14 items-center justify-between gap-3 bg-background px-4 sm:px-6 lg:h-[76px] lg:border-b-2 lg:border-border lg:bg-sun lg:px-12"
    >
      <Logo size={24} className="lg:hidden" />
      <Logo size={30} className="hidden lg:inline-flex" />
      <div className="flex items-center gap-4">
        <span className="hidden text-sm font-semibold text-on-accent-muted lg:inline">
          You&apos;re viewing a shared trip
        </span>
        <Button asChild variant="outline" size="md" className="pressable h-11 lg:hidden">
          <Link href={requestAccessHref}>Plan your own</Link>
        </Button>
        <Button asChild variant="primary" size="md" className="hidden lg:inline-flex">
          <Link href={requestAccessHref}>Plan your own trip</Link>
        </Button>
      </div>
    </header>
  );
}
