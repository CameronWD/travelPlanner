import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ErrorPanel } from "@/components/ui/error-panel";

/**
 * Styled 404 for the authenticated app segment. Reached when a guard calls
 * notFound() — including when a traveller tries to open a trip they're not a
 * member of (we return 404 rather than 403 so we never reveal that the trip
 * exists).
 */
export default function AppNotFound() {
  return (
    <ErrorPanel
      kind="not-found"
      title="Nothing here"
      description="This page doesn’t exist, or you don’t have access to it."
      actions={
        <Button asChild>
          <Link href="/trips">Back to trips</Link>
        </Button>
      }
    />
  );
}
