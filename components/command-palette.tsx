"use client";

import * as React from "react";
import { Search } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  CommandResults,
  useCommandResults,
  useRunCommand,
} from "@/components/command-palette-results";

// ── Main component ────────────────────────────────────────────────────────────

export interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  tripId: string | null;
}

// ── Inner component — mounts fresh each time the palette opens ────────────────
// By mounting only when open=true, all state (query, hits) starts at its
// initial value on each open without needing setState inside an effect body.

interface CommandPaletteInnerProps {
  onOpenChange: (o: boolean) => void;
  tripId: string | null;
}

function CommandPaletteInner({ onOpenChange, tripId }: CommandPaletteInnerProps) {
  const [query, setQuery] = React.useState("");
  const { groups } = useCommandResults(query, tripId);
  const close = React.useCallback(() => onOpenChange(false), [onOpenChange]);
  const run = useRunCommand(close);

  const inputRef = React.useRef<HTMLInputElement>(null);
  const listboxRef = React.useRef<HTMLDivElement>(null);

  // ── Keyboard navigation — real focus moves through the options ─────────────
  function optionButtons() {
    return Array.from(
      listboxRef.current?.querySelectorAll<HTMLButtonElement>('button[role="option"]') ?? [],
    );
  }

  function handleInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const buttons = optionButtons();
      if (buttons.length === 0) return;
      if (e.key === "ArrowDown") buttons[0].focus();
      else buttons[buttons.length - 1].focus();
    }
  }

  function handleButtonKeyDown(e: React.KeyboardEvent<HTMLButtonElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const buttons = optionButtons();
      const idx = buttons.indexOf(e.currentTarget);
      if (idx === -1) return;
      const next = buttons[e.key === "ArrowDown" ? idx + 1 : idx - 1];
      if (next) next.focus();
      else inputRef.current?.focus();
    } else if (e.key === "Enter") {
      e.preventDefault();
      e.currentTarget.click();
    }
  }

  return (
    <>
      {/* Search input */}
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <Input
          ref={inputRef}
          autoFocus
          placeholder="Search commands…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleInputKeyDown}
          className="h-auto border-0 bg-transparent p-0 text-base sm:text-base shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
          aria-label="Command search"
          aria-autocomplete="list"
          aria-controls="command-listbox"
        />
      </div>

      <CommandResults
        ref={listboxRef}
        id="command-listbox"
        groups={groups}
        onSelect={run}
        onOptionKeyDown={handleButtonKeyDown}
        className="flex max-h-[60vh] flex-col gap-1 overflow-y-auto p-2"
      />
    </>
  );
}

// ── Shell — owns open/close state, renders inner only when open ───────────────

export function CommandPalette({ open, onOpenChange, tripId }: CommandPaletteProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent bare hideClose>
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        {open && (
          <CommandPaletteInner onOpenChange={onOpenChange} tripId={tripId} />
        )}
      </DialogContent>
    </Dialog>
  );
}
