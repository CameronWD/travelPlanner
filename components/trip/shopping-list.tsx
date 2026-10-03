"use client";

import * as React from "react";
import { useTransition } from "react";
import { Plus, ShoppingBasket, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Card, cardVariants } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { RowActions } from "@/components/ui/row-actions";
import {
  addChecklistItem,
  toggleChecklistItem,
  deleteChecklistItem,
  setBuyState,
} from "@/server/actions/checklists";
import { AnimatedList, AnimatedItem } from "@/components/ui/animated-list";
import { useDeleteWithConfirm } from "@/components/ui/use-delete-with-confirm";
import type { ShoppingEntry } from "@/lib/shopping-list";

// ---------------------------------------------------------------------------
// AddItemForm — the Shopping tab's own quick-add box (standalone items only)
// ---------------------------------------------------------------------------

function AddShoppingItemForm({ tripId }: { tripId: string }) {
  const [pending, startTransition] = useTransition();
  const [text, setText] = React.useState("");
  const [error, setError] = React.useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) {
      setError("Text is required");
      return;
    }
    setError("");
    startTransition(async () => {
      const result = await addChecklistItem(tripId, {
        kind: "SHOPPING",
        text: text.trim(),
      });
      if (result.success) {
        setText("");
      } else {
        const firstError = Object.values(result.errors)[0]?.[0];
        setError(firstError ?? "Something went wrong");
      }
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      aria-label="Add a shopping item"
      className={cn(cardVariants({ dashed: true }), "flex flex-col gap-3 p-3.5 sm:flex-row sm:items-end sm:p-[18px]")}
    >
      <div className="flex-1 min-w-0">
        <Field label="New item" error={error}>
          <Input
            aria-label="Add a shopping item"
            placeholder="e.g. Flight snacks"
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={pending}
          />
        </Field>
      </div>
      <Button type="submit" variant="primary" loading={pending} className="shrink-0 self-end sm:self-auto">
        <Plus aria-hidden="true" />
        Add item
      </Button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// ShoppingRow — single entry row (packing-derived or standalone)
// ---------------------------------------------------------------------------

function ShoppingRow({ entry }: { entry: ShoppingEntry }) {
  const [pending, startTransition] = useTransition();
  const { requestDelete, isPending: deleteIsPending, dialog: confirmDialog } = useDeleteWithConfirm({
    action: deleteChecklistItem,
    buildConfirm: () => ({
      title: `Delete "${entry.text}"?`,
      description: "This item will be permanently removed from the checklist.",
      confirmLabel: "Delete",
      destructive: true,
    }),
  });

  function toggle() {
    startTransition(async () => {
      if (entry.source === "packing") {
        await setBuyState(entry.id, entry.bought ? "NEEDED" : "BOUGHT");
      } else {
        await toggleChecklistItem(entry.id, !entry.bought);
      }
    });
  }

  function remove() {
    startTransition(async () => {
      await setBuyState(entry.id, null);
    });
  }

  return (
    <>
      {entry.source === "standalone" && confirmDialog}
      <AnimatedItem
        as="li"
        className={cn(
          "group relative flex flex-wrap items-center gap-x-2 border-t border-border-soft first:border-t-0",
          (pending || deleteIsPending) && "opacity-60",
        )}
      >
        <Checkbox
          checked={entry.bought}
          onChange={toggle}
          disabled={pending}
          className="min-w-0 flex-1 py-1 text-sm font-semibold leading-snug"
          label={
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="break-words">{entry.text}</span>
              {entry.source === "packing" && (
                <span className="text-xs font-semibold text-muted-foreground">from Packing</span>
              )}
            </span>
          }
        />

        <div
          className={cn(
            "flex shrink-0 items-center gap-1",
            "pointer-fine:absolute pointer-fine:inset-y-0 pointer-fine:right-0 pointer-fine:bg-card pointer-fine:pl-2",
            "pointer-fine:opacity-0 pointer-fine:transition-opacity pointer-fine:group-hover:opacity-100 pointer-fine:group-focus-within:opacity-100",
            "pointer-coarse:max-sm:-mt-1 pointer-coarse:max-sm:mb-1 pointer-coarse:max-sm:basis-full pointer-coarse:max-sm:justify-end",
          )}
        >
          {entry.source === "packing" ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="relative size-8 pointer-coarse:after:absolute pointer-coarse:after:-inset-1.5 pointer-coarse:after:content-['']"
              onClick={remove}
              disabled={pending}
              aria-label="Remove"
              title="Remove"
            >
              <X className="size-4" aria-hidden="true" />
            </Button>
          ) : (
            <RowActions
              onDelete={() => requestDelete(entry.id)}
              deleteLabel="Delete"
              disabled={pending || deleteIsPending}
            />
          )}
        </div>
      </AnimatedItem>
    </>
  );
}

// ---------------------------------------------------------------------------
// ShoppingList — main component
// ---------------------------------------------------------------------------

export function ShoppingList({ tripId, entries }: { tripId: string; entries: ShoppingEntry[] }) {
  if (entries.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <EmptyState
          icon={ShoppingBasket}
          tone="teal"
          title="No shopping items yet"
          description={'Add something to buy, or flag a Packing item with "Need to buy".'}
        />
        <AddShoppingItemForm tripId={tripId} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Card data-slot="shopping-card" className="p-3.5 sm:p-[18px]">
        <AnimatedList as="ul" className="flex flex-col">
          {entries.map((entry) => (
            <ShoppingRow key={entry.id} entry={entry} />
          ))}
        </AnimatedList>
      </Card>

      <AddShoppingItemForm tripId={tripId} />
    </div>
  );
}
