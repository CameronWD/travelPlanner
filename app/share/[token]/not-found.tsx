import Link from "next/link";

/**
 * Shown when a share token is invalid, revoked, or not found.
 * Lives in app/share/[token]/ — outside the (app) auth group.
 */
export default function ShareNotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <div className="mb-6 text-6xl" aria-hidden="true">
        🔗
      </div>
      <h1 className="font-display text-3xl font-bold text-foreground mb-3">
        Link not found
      </h1>
      <p className="text-base text-muted-foreground max-w-sm">
        This share link has been revoked or no longer exists. Ask the trip
        organiser for an updated link.
      </p>
      <Link
        href="/"
        className="mt-8 rounded-lg border border-border bg-card px-5 py-2.5 text-sm font-medium text-foreground hover:bg-muted transition-colors"
      >
        Go to TEEPEE
      </Link>
    </div>
  );
}
