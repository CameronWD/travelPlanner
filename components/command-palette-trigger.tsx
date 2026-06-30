"use client";

import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Ghost icon button in the header that opens the command palette.
 * Dispatches the "teepee:open-palette" custom event picked up by
 * CommandPaletteMount.
 */
export function CommandPaletteTrigger() {
  function handleClick() {
    window.dispatchEvent(new Event("teepee:open-palette"));
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Search (⌘K)"
      onClick={handleClick}
    >
      <Search aria-hidden />
    </Button>
  );
}
