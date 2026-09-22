"use client";

import { useEffect } from "react";

/**
 * Last-resort error boundary for failures in the root layout itself. Replaces
 * the entire document (the root layout, and therefore globals.css, is not
 * rendered), so styling is inline. The raw error is logged, never displayed.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[global error boundary]", error);
    // Best-effort report to the sink (ARCH-OBS-2), same as the other two
    // boundaries — but this component replaces the ENTIRE document when it
    // renders (the root layout, and everything it would otherwise provide,
    // is gone), so nothing here can be allowed to throw: there is no error
    // boundary above this one left to catch it. Hence the try/catch around
    // the fetch call itself, on top of the .catch(() => {}) every boundary
    // already carries for a failed report.
    try {
      fetch("/api/client-error", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: error.message,
          stack: error.stack,
          route: window.location.pathname,
        }),
      }).catch(() => {});
    } catch {
      // See above: this boundary must never itself throw.
    }
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          padding: "1rem",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          background: "#fff",
          color: "#1c1917",
        }}
      >
        <div style={{ fontSize: "3.5rem", marginBottom: "1rem" }}>🧭</div>
        <h1 style={{ fontSize: "1.75rem", fontWeight: 700, margin: "0 0 0.75rem" }}>
          Something went wrong
        </h1>
        <p style={{ maxWidth: "24rem", color: "#78716c", margin: 0 }}>
          The app hit an unexpected error. Please try again.
        </p>
        <button
          onClick={reset}
          style={{
            marginTop: "2rem",
            border: "none",
            borderRadius: "0.75rem",
            background: "#e2725b",
            color: "#fff",
            padding: "0.625rem 1.25rem",
            fontSize: "0.875rem",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
