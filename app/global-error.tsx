"use client";

import { useEffect } from "react";
import {
  WORDMARK_VIEWBOX,
  WORDMARK_ASPECT,
  WORDMARK_TRANSFORM,
  WORDMARK_WORD_D,
  WORDMARK_DOT_D,
} from "@/components/ui/logo-paths";

/**
 * Last-resort error boundary for failures in the root layout itself. Replaces
 * the entire document (the root layout, and therefore globals.css, is not
 * rendered), so styling is inline. The raw error is logged, never displayed.
 *
 * Colours are `hsl(var(--x))` against CSS variables this file declares in its
 * own <style> block — never raw hex (see ADR 0060, "Exemptions to the 'no new
 * hex, no inline styles' rule"). Their HSL triples are copied exactly from
 * `app/globals.css`'s `:root` and `.dark`; light/dark switches via
 * `prefers-color-scheme` because the `.dark` class on <html> came from the
 * layout that just failed.
 */
const CSS = `
:root{
  --background: 40 100% 98%;
  --foreground: 60 4% 11%;
  --muted-foreground: 33 5% 40%;
  --coral: 11 100% 65%;
  --on-accent: 60 4% 11%;
  --card: 0 0% 100%;
}
@media (prefers-color-scheme: dark) {
  :root{
    --background: 40 10% 12%;
    --foreground: 40 37% 89%;
    --muted-foreground: 38 11% 62%;
    --coral: 13 73% 67%;
    --on-accent: 36 10% 10%;
    --card: 38 10% 16%;
  }
}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;background:hsl(var(--background));color:hsl(var(--foreground));font:600 15px/1.45 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased}
.tp-btn{appearance:none;border:2px solid hsl(var(--foreground));border-radius:999px;height:48px;padding:0 22px;font:800 15px/1 inherit;font-family:inherit;cursor:pointer;background:hsl(var(--foreground));color:hsl(var(--background));box-shadow:4px 4px 0 hsl(var(--coral));transition:transform 120ms cubic-bezier(.2,.8,.2,1),box-shadow 120ms cubic-bezier(.2,.8,.2,1)}
.tp-btn:active{transform:translate(2px,2px);box-shadow:1px 1px 0 hsl(var(--coral))}
.tp-btn:focus-visible,.tp-link:focus-visible{outline:3px solid hsl(var(--foreground));outline-offset:3px}
.tp-link{color:hsl(var(--foreground));font-weight:800;text-underline-offset:3px}
@media (prefers-reduced-motion: reduce){.tp-btn{transition:none}}
`;

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
          // I2 (fix round 1): production React replaces a server-component
          // error's message with one fixed generic string, so `digest` is
          // the only thing left that can correlate this report back to the
          // specific server-side failure in the runtime logs.
          digest: error.digest,
        }),
      }).catch(() => {});
    } catch {
      // See above: this boundary must never itself throw.
    }
  }, [error]);

  const wordmarkHeight = 30;

  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Teepee · something went wrong</title>
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
      </head>
      <body>
        <main
          style={{
            width: "100%",
            maxWidth: 400,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            textAlign: "center",
            gap: 14,
          }}
        >
          <svg
            width={wordmarkHeight * WORDMARK_ASPECT}
            height={wordmarkHeight}
            viewBox={WORDMARK_VIEWBOX}
            role="img"
            aria-label="Teepee"
            style={{ marginBottom: 18 }}
          >
            <g transform={WORDMARK_TRANSFORM}>
              <path fill="currentColor" d={WORDMARK_WORD_D} />
              <path fill="hsl(var(--coral))" d={WORDMARK_DOT_D} />
            </g>
          </svg>
          <div
            aria-hidden="true"
            style={{
              width: 64,
              height: 64,
              borderRadius: 20,
              border: "2px solid hsl(var(--on-accent))",
              background: "hsl(var(--coral))",
              boxShadow: "4px 4px 0 hsl(var(--on-accent))",
              transform: "rotate(-6deg)",
              display: "grid",
              placeItems: "center",
              color: "hsl(var(--on-accent))",
              font: "800 30px/1 inherit",
            }}
          >
            !
          </div>
          <h1 style={{ margin: "8px 0 0", font: "800 30px/1 inherit", letterSpacing: "-0.03em" }}>
            Teepee fell over
          </h1>
          <p style={{ margin: 0, color: "hsl(var(--muted-foreground))", maxWidth: 300 }}>
            Something broke before the app could load. Your trips are safe — nothing was lost.
          </p>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              justifyContent: "center",
              gap: 18,
              marginTop: 10,
            }}
          >
            <button type="button" className="tp-btn" onClick={reset}>
              Try again
            </button>
            {/* A full reload, not <Link>: the router may be what failed. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a className="tp-link" href="/trips">
              Back to trips
            </a>
          </div>
          {error.digest ? (
            <p style={{ margin: "6px 0 0", color: "hsl(var(--muted-foreground))", font: "500 11px/1 ui-monospace,monospace" }}>
              ref {error.digest}
            </p>
          ) : null}
        </main>
      </body>
    </html>
  );
}
