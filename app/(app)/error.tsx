"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

/**
 * Error boundary for the authenticated app segment. Catches unexpected errors
 * thrown in trip pages/server actions so the user sees a friendly recovery UI
 * instead of the framework's default error screen. The raw error is logged but
 * never rendered, so internal details / stack traces are not leaked.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app error boundary]", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <div className="mb-6 text-6xl" aria-hidden="true">
        🧭
      </div>
      <h1 className="mb-3 font-display text-3xl font-bold text-foreground">
        Something went wrong
      </h1>
      <p className="max-w-sm text-base text-muted-foreground">
        We hit an unexpected error loading this page. Your trip data is safe —
        try again in a moment.
      </p>
      <div className="mt-8 flex items-center gap-3">
        <Button onClick={reset}>Try again</Button>
        <Link
          href="/trips"
          className="rounded-lg border border-border bg-card px-5 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
        >
          Back to trips
        </Link>
      </div>
    </div>
  );
}
