"use client";

import * as React from "react";

/**
 * Opens the <details> a contents link points at, for real.
 *
 * The `:target` rules in HELP_PRINT_STYLE are the no-JavaScript fallback: they
 * force the linked section's body visible even though its `open` attribute is
 * never set. That is enough to read the section — but because they are
 * `!important` and keyed on `:target` rather than on `open`, the section then
 * cannot be closed again: the reader clicks its <summary> (or "Collapse all"),
 * `open` flips to false, the chevron un-rotates, and the body stays on screen
 * until the URL fragment changes.
 *
 * So when script is available we do the honest thing instead: set `open` on the
 * targeted <details>, then `history.replaceState` the fragment away so
 * `:target` stops matching and the section behaves like every other one. Runs
 * at mount (a deep link, or a reload on a fragment) and on every `hashchange`
 * (a click in the contents nav).
 *
 * Renders nothing. Kept out of help-guide.tsx so that file stays a server
 * component.
 */
export function HelpHashOpen() {
  React.useEffect(() => {
    function openHashTarget() {
      const raw = window.location.hash.slice(1);
      if (!raw) return;

      let id = raw;
      try {
        id = decodeURIComponent(raw);
      } catch {
        // A malformed escape sequence — fall back to the raw fragment.
      }

      // `closest` covers both the section itself and any future anchor nested
      // inside one. No <details> in scope means the fragment is not ours, so
      // leave the URL alone.
      const details = document.getElementById(id)?.closest("details");
      if (!details) return;

      details.open = true;
      window.history.replaceState(
        window.history.state,
        "",
        `${window.location.pathname}${window.location.search}`,
      );
    }

    openHashTarget();
    window.addEventListener("hashchange", openHashTarget);
    return () => window.removeEventListener("hashchange", openHashTarget);
  }, []);

  return null;
}
