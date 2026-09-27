"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { Search } from "lucide-react";
import {
  CommandResults,
  commandOptionId,
  useCommandResults,
  useRunCommand,
} from "@/components/command-palette-results";
import { registerSearchField } from "@/components/shell/search-focus";
import { shortcutLabel } from "@/lib/shortcut-label";

const noopSubscribe = () => () => {};

/**
 * The sidebar's Search (≥1280px; beta-feedback §B, feedback cmuhvu6z7): a real
 * text input — click it and the caret is right there — with the results in a
 * panel anchored below. Same Go to / Do / Find as the full-screen palette
 * (they share components/command-palette-results), Find only once you type.
 *
 * WAI-ARIA combobox: focus stays in the input while ArrowUp/Down move the
 * active option (aria-activedescendant); Enter runs it (or the top match);
 * Esc clears the text, then closes and leaves the field; clicking or tabbing
 * away closes the panel. ⌘K / Ctrl+K focuses it (see search-focus.ts).
 */
export function SearchField({ tripId }: { tripId: string | null }) {
  const [query, setQuery] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const [activeIndex, setActiveIndex] = React.useState(-1);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const listboxId = `${React.useId()}search-results`;

  // Read after hydration: the server has no navigator to ask.
  const shortcut = React.useSyncExternalStore(noopSubscribe, shortcutLabel, () => null);

  const { groups, options } = useCommandResults(query, tripId, {
    enabled: open,
    findWhenEmpty: false,
  });
  const active = activeIndex < options.length ? activeIndex : -1;
  const [anchor, setAnchor] = React.useState<{ top: number; left: number } | null>(null);

  React.useLayoutEffect(() => {
    if (!open) return;
    function measure() {
      const r = rootRef.current?.getBoundingClientRect();
      if (!r) return;
      // Flyout to the right of the sidebar, level with the field: the sidebar
      // is 248px wide with 16px side padding, so the field's right edge + 16px
      // + 12px gap clears the sidebar's 2px border.
      setAnchor({ top: r.top, left: r.right + 28 });
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [open]);

  React.useEffect(() => {
    const el = inputRef.current;
    return el ? registerSearchField(el) : undefined;
  }, []);

  React.useEffect(() => {
    if (!open || active < 0) return;
    document.getElementById(commandOptionId(listboxId, active))?.scrollIntoView({ block: "nearest" });
  }, [open, active, listboxId]);

  function collapse() {
    setOpen(false);
    setActiveIndex(-1);
  }

  const finish = React.useCallback(() => {
    setQuery("");
    setOpen(false);
    setActiveIndex(-1);
    inputRef.current?.blur();
  }, []);
  const run = useRunCommand(finish);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    switch (e.key) {
      case "ArrowDown":
      case "ArrowUp": {
        e.preventDefault();
        if (!open) {
          setOpen(true);
          return;
        }
        const n = options.length;
        if (n === 0) return;
        const down = e.key === "ArrowDown";
        setActiveIndex(active < 0 ? (down ? 0 : n - 1) : (active + (down ? 1 : -1) + n) % n);
        return;
      }
      case "Enter": {
        if (!open) return;
        const item = options[active >= 0 ? active : 0];
        if (!item) return;
        e.preventDefault();
        run(item);
        return;
      }
      case "Escape": {
        e.preventDefault();
        if (query !== "") {
          setQuery("");
          setActiveIndex(-1);
        } else {
          collapse();
          inputRef.current?.blur();
        }
        return;
      }
    }
  }

  return (
    <div
      ref={rootRef}
      className="relative"
      onBlur={(e) => {
        // Tabbing or clicking away (anything outside this field) closes.
        if (!rootRef.current?.contains(e.relatedTarget as Node | null)) collapse();
      }}
    >
      <div
        data-search-field
        className="flex h-11 w-full items-center gap-2 rounded-[12px] border-2 border-border bg-card px-3 text-foreground focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background"
        onMouseDown={(e) => {
          // A press on the icon or padding puts the caret in the input.
          if (e.target !== inputRef.current) {
            e.preventDefault();
            inputRef.current?.focus();
          }
        }}
      >
        <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-label="Search or jump"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-activedescendant={open && active >= 0 ? commandOptionId(listboxId, active) : undefined}
          aria-keyshortcuts={shortcut ? (shortcut === "⌘K" ? "Meta+K" : "Control+K") : undefined}
          title={shortcut ? `Search (${shortcut})` : undefined}
          placeholder="Search or jump…"
          autoComplete="off"
          spellCheck={false}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActiveIndex(-1);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          className="h-full min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
        />
      </div>
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            data-search-panel
            role="presentation"
            style={anchor ? { top: anchor.top, left: anchor.left } : undefined}
            className="fixed z-50 w-[400px] max-w-[calc(100vw-280px)] rounded-xl border-2 border-border bg-popover p-2 text-popover-foreground shadow-hard-2"
            // Presses inside the panel (headings, notices) keep the caret.
            onMouseDown={(e) => e.preventDefault()}
          >
            <CommandResults
              id={listboxId}
              groups={groups}
              activeIndex={active}
              focusableOptions={false}
              onSelect={run}
              className="flex max-h-[min(60vh,28rem)] flex-col gap-1 overflow-y-auto"
            />
          </div>,
          document.body,
        )}
    </div>
  );
}
