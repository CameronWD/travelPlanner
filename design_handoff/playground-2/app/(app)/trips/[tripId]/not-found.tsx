import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ErrorPanel } from "@/components/ui/error-panel";

/** Server Component. Same copy whether the trip is missing or the viewer isn't a member. */
export default function TripNotFound() {
  return (
    <ErrorPanel
      kind="not-found"
      title="Trip not found"
      description="This trip doesn’t exist, or you haven’t been invited to it. If someone shared it with you, ask them for a fresh invite."
      actions={<Button asChild><Link href="/trips">Back to trips</Link></Button>}
    />
  );
}
