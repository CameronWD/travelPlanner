"use client";

import * as React from "react";

/**
 * Expand all / Collapse all for the guide's <details> sections.
 *
 * Deliberately the ONLY client component in the guide. It holds no disclosure
 * state of its own — it toggles the `open` attribute on the already-rendered
 * <details> elements — so help-guide.tsx stays a server component, browser
 * find-in-page still reaches collapsed text, and the guard in
 * help-guide.test.tsx ("uses no client-side disclosure state") still holds:
 * this adds no <details> and no accordion dependency.
 *
 * Hidden from print, where HELP_PRINT_STYLE already forces everything open.
 */
export function HelpExpandAll() {
  function setAll(open: boolean) {
    for (const d of document.querySelectorAll<HTMLDetailsElement>(
      "details[id]",
    )) {
      d.open = open;
    }
  }

  return (
    <div className="help-print-hide flex items-center gap-2">
      <button
        type="button"
        onClick={() => setAll(true)}
        className="text-sm font-medium text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary"
      >
        Expand all
      </button>
      <span aria-hidden="true" className="text-muted-foreground">
        ·
      </span>
      <button
        type="button"
        onClick={() => setAll(false)}
        className="text-sm font-medium text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary"
      >
        Collapse all
      </button>
    </div>
  );
}
