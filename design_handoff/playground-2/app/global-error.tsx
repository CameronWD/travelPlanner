"use client";

import { useEffect } from "react";
import { WORDMARK_VIEWBOX, WORDMARK_ASPECT, WORDMARK_TRANSFORM, WORDMARK_WORD_D, WORDMARK_DOT_D } from "@/components/ui/logo-paths";

/**
 * Last-resort boundary for failures in the root layout. It replaces the whole document, so
 * globals.css and next/font are NOT loaded: this file is the one sanctioned inline-style +
 * hex exception (see globals.css header). Values mirror the Playground tokens; the wordmark
 * is outlined paths so no web font is needed. Light/dark via prefers-color-scheme, because
 * the theme class on <html> came from the layout that just failed.
 */
const CSS = `
:root{--bg:#FFFBF3;--fg:#1D1D1B;--muted:#6B6660;--card:#FFFFFF;--line:#1D1D1B;--shadow:#1D1D1B;--coral:#FF6B4A;--on:#1D1D1B;--btn:#1D1D1B;--btnfg:#FFFBF3}
@media (prefers-color-scheme:dark){:root{--bg:#211F1B;--fg:#EDE6D8;--muted:#A59D8F;--card:#2C2924;--line:#5A554C;--shadow:#0D0C0A;--coral:#E8866C;--on:#1C1A17;--btn:#EDE6D8;--btnfg:#211F1B}}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;background:var(--bg);color:var(--fg);font:600 15px/1.45 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased}
.tp-btn{appearance:none;border:2px solid var(--line);border-radius:999px;height:48px;padding:0 22px;font:800 15px/1 inherit;font-family:inherit;cursor:pointer;background:var(--btn);color:var(--btnfg);box-shadow:4px 4px 0 var(--coral);transition:transform 120ms cubic-bezier(.2,.8,.2,1),box-shadow 120ms cubic-bezier(.2,.8,.2,1)}
.tp-btn:active{transform:translate(2px,2px);box-shadow:1px 1px 0 var(--coral)}
.tp-btn:focus-visible,.tp-link:focus-visible{outline:3px solid var(--fg);outline-offset:3px}
.tp-link{color:var(--fg);font-weight:800;text-underline-offset:3px}
@media (prefers-reduced-motion:reduce){.tp-btn{transition:none}}
`;

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[global error boundary]", error);
    // This boundary must never itself throw: nothing sits above it.
    try {
      fetch("/api/client-error", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: error.message, stack: error.stack, route: window.location.pathname, digest: error.digest }),
      }).catch(() => {});
    } catch {}
  }, [error]);

  const h = 30;
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Teepee · something went wrong</title>
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
      </head>
      <body>
        <main style={{ width: "100%", maxWidth: 400, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 14 }}>
          <svg width={h * WORDMARK_ASPECT} height={h} viewBox={WORDMARK_VIEWBOX} role="img" aria-label="Teepee" style={{ marginBottom: 18 }}>
            <g transform={WORDMARK_TRANSFORM}><path fill="currentColor" d={WORDMARK_WORD_D} /><path fill="#FF6B4A" d={WORDMARK_DOT_D} /></g>
          </svg>
          <div aria-hidden="true" style={{ width: 64, height: 64, borderRadius: 20, border: "2px solid var(--on)", background: "var(--coral)", boxShadow: "4px 4px 0 var(--shadow)", transform: "rotate(-6deg)", display: "grid", placeItems: "center", color: "var(--on)", font: "800 30px/1 inherit" }}>!</div>
          <h1 style={{ margin: "8px 0 0", font: "800 30px/1 inherit", letterSpacing: "-0.03em" }}>Teepee fell over</h1>
          <p style={{ margin: 0, color: "var(--muted)", maxWidth: 300 }}>Something broke before the app could load. Your trips are safe — nothing was lost.</p>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "center", gap: 18, marginTop: 10 }}>
            <button type="button" className="tp-btn" onClick={reset}>Try again</button>
            {/* A full reload, not <Link>: the router may be what failed. */}
            <a className="tp-link" href="/trips">Back to trips</a>
          </div>
          {error.digest ? <p style={{ margin: "6px 0 0", color: "var(--muted)", font: "500 11px/1 ui-monospace,monospace" }}>ref {error.digest}</p> : null}
        </main>
      </body>
    </html>
  );
}
