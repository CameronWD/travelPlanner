"use client";

import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

/**
 * Command-palette trigger rendered in the app header.
 *
 * - Mobile (< sm): compact ghost icon button (Search icon only).
 * - Desktop (≥ sm): full search pill — Search icon + "Search or jump…" text +
 *   a bordered ⌘K kbd chip — styled with min-w-[220px], rounded-md border,
 *   bg-muted/60.
 *
 * Both presentations share the same click handler which dispatches the
 * "teepee:open-palette" custom event picked up by CommandPaletteMount.
 */
export function CommandPaletteTrigger() {
  function handleClick() {
    window.dispatchEvent(new Event("teepee:open-palette"));
  }

  return (
    <>
      {/* Mobile: icon-only ghost button */}
      <Button
        variant="ghost"
        size="icon"
        aria-label="Search (⌘K)"
        onClick={handleClick}
        className="sm:hidden"
      >
        <Search aria-hidden />
      </Button>

      {/* Desktop (sm+): full search pill */}
      <button
        type="button"
        aria-label="Search (⌘K)"
        onClick={handleClick}
        className={cn(
          "hidden sm:flex items-center gap-2",
          "min-w-[220px] rounded-md border bg-muted/60",
          "px-3 py-1.5 text-sm text-muted-foreground",
          "hover:bg-muted/80 transition-colors",
        )}
      >
        <Search className="h-4 w-4 shrink-0" aria-hidden />
        <span className="flex-1 text-left" aria-hidden="true">
          Search or jump…
        </span>
        <kbd
          className="rounded border bg-background px-1.5 py-0.5 text-[11px] font-mono leading-none text-muted-foreground"
          aria-hidden="true"
        >
          ⌘K
        </kbd>
      </button>
    </>
  );
}
