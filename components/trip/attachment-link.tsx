"use client";

import * as React from "react";
import { rendersInline } from "@/lib/attachment-display";
import { isStandalone } from "@/lib/standalone";

/**
 * The one way an **Attachment** is linked to, everywhere.
 *
 * Opening an attachment used to navigate away from the page a Traveller was
 * working on, which is what they asked us to fix. But ADR 0043 made these
 * links same-tab on purpose: inside the installed PWA, a new tab is handed to
 * an in-app browser the service worker does not control, and an offline
 * Traveller's cached boarding pass becomes unreachable. Both concerns are
 * real — they are just about different places, so the choice is made per
 * context:
 *
 *   ordinary browser tab  → open out (same service worker, cache intact)
 *   installed PWA         → stay in-app (ADR 0043, unchanged)
 *   file the browser downloads → stay put (it never navigates anyway)
 *
 * Decided in the click handler rather than in the markup, so no `target`
 * attribute is ever rendered. That keeps ADR 0043's invariant literally true,
 * avoids a hydration-sensitive branch, degrades to today's behaviour without
 * JavaScript, and leaves ⌘-click and "Open in new tab" to the browser.
 */
export function AttachmentLink({
  href,
  mime,
  label,
  className,
  children,
}: {
  href: string;
  mime: string;
  /** Accessible name; omitted when the children already read as the name. */
  label?: string;
  className?: string;
  children: React.ReactNode;
}) {
  function handleClick(e: React.MouseEvent<HTMLAnchorElement>) {
    // A modified click (⌘-click, Ctrl-click, Shift-click, Alt-click) or a
    // non-primary mouse button is the Traveller telling the browser how to
    // open the link — background tab, new window, whatever their setup does.
    // Step aside and let the browser's own default action run.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    if (!rendersInline(mime)) return;
    if (isStandalone()) return;
    e.preventDefault();
    // Deliberately no "noopener" in the features string: per the HTML spec,
    // window.open() returns null whenever "noopener" is present — on success
    // as well as on failure — which would make the blocked-popup check below
    // always take the fallback branch, even when the tab opened fine. The
    // target is same-origin and same-app, so noopener buys nothing here; we
    // null out `opener` by hand instead, which gets the same isolation
    // without losing the return value we need to detect a real block.
    const opened = window.open(href, "_blank");
    if (opened) {
      opened.opener = null;
    } else {
      // An extension or an embedded webview can block window.open even for a
      // gesture-synchronous call like this one. If that happens, the default
      // navigation we just prevented is gone too, and the click would do
      // nothing at all — worse than the same-tab behaviour we started from.
      // Fall back to it.
      window.location.href = href;
    }
  }

  return (
    <a href={href} onClick={handleClick} aria-label={label} className={className}>
      {children}
    </a>
  );
}
