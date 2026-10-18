"use client";

import * as React from "react";
import { ChevronDown, ChevronUp, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormError } from "@/components/ui/form-error";
import { MAX_TRY_ENTRIES, MAX_TRY_TEXT, type TryEntryInput, type TryList } from "@/lib/try-list";

/**
 * CONTEXT.md "Try list" in the Item dialog: add, rename, remove and reorder
 * the things to try there. Ticking belongs to the Day view and Today, so this
 * never sends `tried`: a tick the partner made while the dialog was open
 * survives the save (server/actions/items.ts resolves ids under the row lock).
 */
export interface TryListDraftEntry {
  /** React key: the entry's id, or a local key for a new one. */
  key: string;
  id?: string;
  text: string;
  tried: boolean;
}

export function draftFromTryList(list: TryList | null | undefined): TryListDraftEntry[] {
  return (list ?? []).map((e) => ({ key: e.id, id: e.id, text: e.text, tried: e.tried }));
}

/**
 * What the dialog sends. `pending` is text typed in "New thing to try" but not
 * yet added: a save takes it as one more entry rather than dropping it (M6).
 */
export function tryListPayload(draft: readonly TryListDraftEntry[], pending = ""): TryEntryInput[] {
  const entries = draft
    .map((e) => ({ ...(e.id !== undefined && { id: e.id }), text: e.text.trim() }))
    .filter((e) => e.text !== "");
  const extra = pending.trim();
  return extra && draft.length < MAX_TRY_ENTRIES ? [...entries, { text: extra }] : entries;
}

type MoveButton = "up" | "down";

export function TryListEditor({
  value,
  onChange,
  disabled,
  error,
  pending,
  onPendingChange,
}: {
  value: TryListDraftEntry[];
  onChange(next: TryListDraftEntry[]): void;
  disabled?: boolean;
  error?: string;
  /** The "New thing to try" text, when the dialog holds it (so a save folds it in); else the editor keeps it. */
  pending?: string;
  onPendingChange?(text: string): void;
}) {
  // Controlled like OpeningHoursEditor: once open (or opened by an error) it stays open.
  const [open, setOpen] = React.useState(Boolean(error));
  const [seenError, setSeenError] = React.useState(error);
  if (error !== seenError) {
    setSeenError(error);
    if (error && !open) setOpen(true);
  }
  const [ownPending, setOwnPending] = React.useState("");
  const newText = pending ?? ownPending;
  const setNewText = onPendingChange ?? setOwnPending;
  // A new entry's key is `new-N`; it can never collide with a saved entry's
  // key (its id), because ids are [a-z0-9] only (no hyphen).
  const nextKey = React.useRef(0);
  const idBase = React.useId();
  const listRef = React.useRef<HTMLOListElement>(null);
  // After a move, focus returns to the moved entry's button in its new place,
  // or to the other move button if that one is now disabled (top or bottom).
  const refocus = React.useRef<{ key: string; button: MoveButton } | null>(null);
  React.useEffect(() => {
    const want = refocus.current;
    if (!want || !listRef.current) return;
    refocus.current = null;
    const find = (sel: string) => listRef.current!.querySelector<HTMLElement>(`[data-try-key="${CSS.escape(want.key)}"]${sel}`);
    const other: MoveButton = want.button === "up" ? "down" : "up";
    const candidates = [find(`[data-move="${want.button}"]`), find(`[data-move="${other}"]`), find("input")];
    candidates.find((el) => el && !(el as HTMLButtonElement).disabled)?.focus();
  }, [value]);
  const full = value.length >= MAX_TRY_ENTRIES;
  const count = tryListPayload(value).length;

  function add() {
    const text = newText.trim();
    if (!text || full) return;
    onChange([...value, { key: `new-${nextKey.current++}`, text, tried: false }]);
    setNewText("");
  }
  function rename(i: number, text: string) {
    onChange(value.map((e, j) => (j === i ? { ...e, text } : e)));
  }
  function remove(i: number) {
    onChange(value.filter((_, j) => j !== i));
  }
  function move(i: number, by: -1 | 1) {
    refocus.current = { key: value[i].key, button: by === -1 ? "up" : "down" };
    const next = [...value];
    [next[i], next[i + by]] = [next[i + by], next[i]];
    onChange(next);
  }

  return (
    <details className="rounded-xl border-2 border-border-soft px-3 py-2" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary className="tap-target flex cursor-pointer flex-wrap items-baseline gap-x-2 text-sm">
        <span className="font-semibold">Try list</span>
        <span className="text-xs font-semibold text-muted-foreground">
          {count === 0 ? "Not set" : count === 1 ? "1 thing" : `${count} things`}
        </span>
      </summary>
      <div className="mt-3 flex flex-col gap-2">
        <p className="text-xs text-muted-foreground">Things to try, see or buy there. Tick them off on the day.</p>
        {value.length > 0 && (
          <ol ref={listRef} className="flex flex-col gap-1.5">
            {value.map((entry, i) => {
              const name = entry.text.trim() || `thing ${i + 1}`;
              const triedId = `${idBase}-tried-${i}`;
              return (
                <li key={entry.key} className="flex min-w-0 items-center gap-1">
                  <Input
                    aria-label={`Thing to try ${i + 1}`}
                    aria-describedby={entry.tried ? triedId : undefined}
                    data-try-key={entry.key}
                    value={entry.text}
                    maxLength={MAX_TRY_TEXT}
                    onChange={(e) => rename(i, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") e.preventDefault(); // never submits the Item dialog
                    }}
                    disabled={disabled}
                    className="min-w-0 flex-1"
                  />
                  {entry.tried && <span id={triedId} className="shrink-0 text-xs font-semibold text-muted-foreground">Tried</span>}
                  <Button type="button" variant="ghost" size="icon" aria-label={`Move ${name} up`} data-try-key={entry.key} data-move="up" disabled={disabled || i === 0} onClick={() => move(i, -1)}>
                    <ChevronUp aria-hidden="true" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" aria-label={`Move ${name} down`} data-try-key={entry.key} data-move="down" disabled={disabled || i === value.length - 1} onClick={() => move(i, 1)}>
                    <ChevronDown aria-hidden="true" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${name}`} disabled={disabled} onClick={() => remove(i)}>
                    <X aria-hidden="true" />
                  </Button>
                </li>
              );
            })}
          </ol>
        )}
        <div className="flex min-w-0 items-center gap-1.5">
          <Input
            aria-label="New thing to try"
            placeholder="Add something to try, see or buy"
            value={newText}
            maxLength={MAX_TRY_TEXT}
            onChange={(e) => setNewText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault(); // never submits the Item dialog
                add();
              }
            }}
            disabled={disabled || full}
            className="min-w-0 flex-1"
          />
          <Button type="button" variant="secondary" size="sm" onClick={add} disabled={disabled || full || newText.trim() === ""}>
            <Plus aria-hidden="true" />
            Add
          </Button>
        </div>
        {full && <p className="text-xs text-muted-foreground">A Try list holds up to {MAX_TRY_ENTRIES} things.</p>}
        {error && <FormError>{error}</FormError>}
      </div>
    </details>
  );
}
