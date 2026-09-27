"use client";

import * as React from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { shortcutLabel } from "@/lib/shortcut-label";

const noopSubscribe = () => () => {};

/**
 * Search trigger in the phone header (the header is gone from 768px up; the
 * Dock and the sidebar's inline field take over there).
 *
 * - < sm: icon-only ghost button, named "Search".
 * - sm+: a "Search or jump…" pill, named by that visible text.
 *
 * No ⌘K keycap (beta-feedback §B): the platform shortcut is in the tooltip,
 * read after hydration since the server has no navigator. Both dispatch the
 * "teepee:open-palette" event CommandPaletteMount listens for.
 */
export function CommandPaletteTrigger() {
  const shortcut = React.useSyncExternalStore(noopSubscribe, shortcutLabel, () => null);
  const title = shortcut ? `Search (${shortcut})` : undefined;

  function handleClick() {
    window.dispatchEvent(new Event("teepee:open-palette"));
  }

  return (
    <>
      {/* Mobile: icon-only ghost button */}
      <Button
        variant="ghost"
        size="icon"
        aria-label="Search"
        title={title}
        onClick={handleClick}
        className="sm:hidden"
      >
        <Search aria-hidden />
      </Button>

      {/* sm+: search pill, named by its visible text */}
      <button
        type="button"
        title={title}
        onClick={handleClick}
        className={cn(
          "hidden sm:flex items-center gap-2",
          "min-w-[220px] rounded-md border bg-muted/60",
          "px-3 py-1.5 text-sm text-muted-foreground",
          "hover:bg-muted/80 transition-colors",
        )}
      >
        <Search className="h-4 w-4 shrink-0" aria-hidden />
        <span className="flex-1 text-left">Search or jump…</span>
      </button>
    </>
  );
}
