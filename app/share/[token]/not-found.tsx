import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ErrorPanel } from "@/components/ui/error-panel";
import { Logo } from "@/components/ui/logo";

/**
 * Shown when a share token is invalid, revoked, or not found — and for a live
 * link to a trip with no dates yet. Share links never expire, so the copy stays
 * neutral about why. Lives in
 * app/share/[token]/ — outside the (app) auth group, so the page has no
 * session; its action goes to /trips rather than a sign-in-gated page.
 */
export default function ShareNotFound() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="mx-auto flex h-16 w-full max-w-4xl items-center px-5">
        <Logo size={22} />
      </header>
      <ErrorPanel
        kind="not-found"
        className="flex-1"
        title="This link isn't working"
        description="It may have been turned off or replaced. Ask the trip organiser for a fresh one."
        actions={
          <Button asChild variant="secondary">
            <Link href="/trips">Go to my trips</Link>
          </Button>
        }
      />
    </div>
  );
}
