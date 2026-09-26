"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ErrorPanel } from "@/components/ui/error-panel";

/**
 * Pattern for every error.tsx (app/(app)/error.tsx shown; trips/[tripId]/error.tsx is identical
 * with the secondary action "Back to this trip" → `/trips/${tripId}` via useParams).
 * Logging/reporting is unchanged from the repo.
 */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[app error boundary]", error);
    fetch("/api/client-error", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: error.message, stack: error.stack, route: window.location.pathname, digest: error.digest }),
    }).catch(() => {});
  }, [error]);

  return (
    <ErrorPanel
      kind="error"
      digest={error.digest}
      actions={<>
        <Button onClick={reset}>Try again</Button>
        <Button asChild variant="ghost"><Link href="/trips">Back to trips</Link></Button>
      </>}
    />
  );
}
