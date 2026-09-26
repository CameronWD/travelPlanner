"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";

/**
 * `Button size="sm"` is 36px to match the kit's small button; on a coarse
 * pointer this invisible overlay grows the hit area to 44px (same technique as
 * devices-panel / Segmented / RowActions — design-ask D1).
 */
const SM_HIT =
  "relative pointer-coarse:after:absolute pointer-coarse:after:inset-x-0 pointer-coarse:after:-inset-y-1 pointer-coarse:after:content-['']";

/**
 * Expand all / Collapse all for the guide's <details> sections.
 *
 * Holds no client-side DISCLOSURE state — it toggles the `open` attribute on
 * the already-rendered <details> elements — so help-guide.tsx stays a server
 * component, browser find-in-page still reaches collapsed text, and the guard
 * in help-guide.test.tsx ("uses no client-side disclosure state") still
 * holds: this adds no <details> and no accordion dependency.
 *
 * (This used to claim to be the only client component in the guide. That
 * stopped being true when help-hash-open.tsx arrived; the property actually
 * worth protecting is the one stated above, and it still holds — see the
 * "uses no client-side disclosure state" guard in help-guide.test.tsx.)
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
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => setAll(true)}
        className={SM_HIT}
      >
        Expand all
      </Button>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => setAll(false)}
        className={SM_HIT}
      >
        Collapse all
      </Button>
    </div>
  );
}
