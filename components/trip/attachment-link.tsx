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
    if (!rendersInline(mime)) return;
    if (isStandalone()) return;
    e.preventDefault();
    window.open(href, "_blank", "noopener");
  }

  return (
    <a href={href} onClick={handleClick} aria-label={label} className={className}>
      {children}
    </a>
  );
}
