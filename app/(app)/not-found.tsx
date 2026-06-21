import Link from "next/link";

/**
 * Styled 404 for the authenticated app segment. Reached when a guard calls
 * notFound() — including when a traveller tries to open a trip they're not a
 * member of (we return 404 rather than 403 so we never reveal that the trip
 * exists).
 */
export default function AppNotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <div className="mb-6 text-6xl" aria-hidden="true">
        🗺️
      </div>
      <h1 className="mb-3 font-display text-3xl font-bold text-foreground">
        Not found
      </h1>
      <p className="max-w-sm text-base text-muted-foreground">
        This page doesn&apos;t exist, or you don&apos;t have access to it.
      </p>
      <Link
        href="/trips"
        className="mt-8 rounded-lg border border-border bg-card px-5 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
      >
        Back to trips
      </Link>
    </div>
  );
}
