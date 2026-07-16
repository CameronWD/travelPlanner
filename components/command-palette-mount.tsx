"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { CommandPalette } from "@/components/command-palette";

/**
 * Global mount for the command palette.
 *
 * - Derives the current tripId from the pathname (/trips/<id>/...).
 *   The literal segment "new" is excluded (no trip exists yet).
 * - Owns the open/close state.
 * - Registers ⌘K / Ctrl+K and a custom "teepee:open-palette" event
 *   listener on mount; cleans both up on unmount.
 */
export function CommandPaletteMount() {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);

  // Derive tripId from /trips/<id>/... — exclude the literal "new".
  const tripId = React.useMemo<string | null>(() => {
    const match = pathname.match(/^\/trips\/([^/]+)/);
    if (!match) return null;
    const id = match[1];
    return id === "new" ? null : id;
  }, [pathname]);

  React.useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
      }
    }

    function handleCustomEvent() {
      setOpen(true);
    }

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("teepee:open-palette", handleCustomEvent);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("teepee:open-palette", handleCustomEvent);
    };
  }, []);

  return (
    <CommandPalette open={open} onOpenChange={setOpen} tripId={tripId} />
  );
}
