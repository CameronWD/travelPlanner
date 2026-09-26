import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ErrorPanel } from "@/components/ui/error-panel";

/**
 * Styled 404 for the trip segment. Reached when a guard calls notFound() —
 * including when a traveller tries to open a trip they're not a member of
 * (we return 404 rather than 403 so we never reveal that the trip exists).
 * Same copy for "trip doesn't exist" and "not a member" on purpose.
 */
export default function TripNotFound() {
  return (
    <ErrorPanel
      kind="not-found"
      title="Trip not found"
      description="This trip doesn’t exist, or you don’t have access to it."
      actions={
        <Button asChild>
          <Link href="/trips">Back to trips</Link>
        </Button>
      }
    />
  );
}
