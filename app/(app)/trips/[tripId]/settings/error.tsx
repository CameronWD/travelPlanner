"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ErrorPanel } from "@/components/ui/error-panel";

/**
 * Error boundary for the Settings page.
 *
 * Catches unexpected errors thrown while rendering this route so the
 * Traveller sees a friendly recovery UI instead of the framework's default
 * error screen. The raw error is logged but never rendered, so internal
 * details / stack traces are not leaked.
 */
export default function SettingsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[settings error boundary]", error);
    // Best-effort report to the sink (ARCH-OBS-2) alongside the console log
    // above — .catch(() => {}) so a failed report can never surface a
    // second failure on top of the one this screen is already recovering
    // from. See app/api/client-error/route.ts for what happens server-side.
    fetch("/api/client-error", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        message: error.message,
        stack: error.stack,
        route: window.location.pathname,
        // I2 (fix round 1): production React replaces a server-component
        // error's message with one fixed generic string, so `digest` is the
        // only thing left that can correlate this report back to the
        // specific server-side failure in the runtime logs.
        digest: error.digest,
      }),
    }).catch(() => {});
  }, [error]);

  return (
    <ErrorPanel
      digest={error.digest}
      actions={
        <>
          <Button onClick={reset}>Try again</Button>
          <Button asChild variant="secondary">
            <Link href="/trips">Back to trips</Link>
          </Button>
        </>
      }
    />
  );
}
