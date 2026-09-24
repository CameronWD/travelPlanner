"use client";

import * as React from "react";
import { useTransition } from "react";
import { Plus, AlertCircle } from "lucide-react";
import { AiSuggestButton } from "./ai-suggest-button";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import { aiDraftPackingList } from "@/server/actions/ai";
import { addChecklistItem } from "@/server/actions/checklists";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AiPackingSuggestionsProps {
  tripId: string;
  aiConfigured: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * AI-powered packing list draft panel.
 *
 * - Shows a "Draft packing list" AiSuggestButton.
 * - On click calls the server action; shows the returned items.
 * - "Add all" and per-item "Add" buttons call addChecklistItem (kind PACKING).
 */
export function AiPackingSuggestions({
  tripId,
  aiConfigured,
}: AiPackingSuggestionsProps) {
  const [fetchPending, startFetch] = useTransition();
  const [addPending, startAdd] = useTransition();

  const [items, setItems] = React.useState<string[] | null>(null);
  const [addedItems, setAddedItems] = React.useState<Set<string>>(new Set());
  const [error, setError] = React.useState<string | null>(null);

  function handleFetch() {
    setError(null);
    startFetch(async () => {
      const result = await aiDraftPackingList(tripId);
      if (result.ok) {
        setItems(result.data.items);
        setAddedItems(new Set());
      } else if (result.reason === "disabled") {
        setError("AI features are not configured.");
      } else {
        setError(result.message ?? "Something went wrong. Please try again.");
      }
    });
  }

  function handleAdd(item: string) {
    startAdd(async () => {
      const result = await addChecklistItem(tripId, { kind: "PACKING", text: item });
      if (result.success) {
        setAddedItems((prev) => new Set([...prev, item]));
      }
    });
  }

  function handleAddAll() {
    if (!items) return;
    const toAdd = items.filter((i) => !addedItems.has(i));
    if (toAdd.length === 0) return;
    startAdd(async () => {
      // Add sequentially to respect sortOrder
      for (const item of toAdd) {
        const result = await addChecklistItem(tripId, {
          kind: "PACKING",
          text: item,
        });
        if (result.success) {
          setAddedItems((prev) => new Set([...prev, item]));
        }
      }
    });
  }

  const hasItems = items !== null && items.length > 0;
  const notYetAdded = items ? items.filter((i) => !addedItems.has(i)) : [];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 flex-wrap">
        <AiSuggestButton
          aiConfigured={aiConfigured}
          loading={fetchPending}
          label={items ? "Re-draft packing list" : "Draft packing list"}
          onClick={handleFetch}
          disabled={fetchPending || addPending}
        />
        {hasItems && notYetAdded.length > 0 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleAddAll}
            disabled={addPending || fetchPending}
            loading={addPending}
            className="relative pointer-coarse:after:absolute pointer-coarse:after:-inset-y-1 pointer-coarse:after:inset-x-0 pointer-coarse:after:content-['']"
          >
            <Plus className="size-3.5" aria-hidden="true" />
            Add all ({notYetAdded.length})
          </Button>
        )}
      </div>

      {error && (
        <div role="alert" className="flex items-center gap-2.5 rounded-md border-2 border-destructive bg-card px-3 py-2.5 text-sm font-medium text-foreground">
          <AlertCircle className="size-[18px] shrink-0 text-destructive" aria-hidden="true" />
          {error}
        </div>
      )}

      {hasItems && (
        <Card tone="lilac" className="p-3.5 sm:p-[18px]">
          <p className="text-label mb-2">
            AI suggested packing items
          </p>
          <ul className="flex flex-col">
            {items.map((item) => {
              const added = addedItems.has(item);
              return (
                <li
                  key={item}
                  className={cn(
                    "flex min-h-11 items-center justify-between gap-3 border-t border-border-soft py-1 text-sm font-semibold first:border-t-0",
                    added && "opacity-60",
                  )}
                >
                  <span className={cn("leading-snug", added && "line-through text-muted-foreground")}>
                    {item}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0 bg-card relative pointer-coarse:after:absolute pointer-coarse:after:-inset-y-1 pointer-coarse:after:inset-x-0 pointer-coarse:after:content-['']"
                    disabled={added || addPending}
                    onClick={() => handleAdd(item)}
                    title={added ? "Already added" : `Add "${item}" to packing list`}
                  >
                    {added ? "Added" : (
                      <>
                        <Plus className="size-3" aria-hidden="true" />
                        Add
                      </>
                    )}
                  </Button>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
