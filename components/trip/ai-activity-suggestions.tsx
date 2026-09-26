"use client";

import * as React from "react";
import { useTransition } from "react";
import { Plus, AlertCircle, ChevronDown, ChevronUp } from "lucide-react";
import { AiSuggestButton } from "./ai-suggest-button";
import { CategoryPill } from "./category-pill";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { aiSuggestActivities } from "@/server/actions/ai";
import { createItem } from "@/server/actions/items";
import type { Category } from "@/lib/categories";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Suggestion {
  title: string;
  category: Category;
  note: string;
}

interface AiActivitySuggestionsProps {
  tripId: string;
  stopId: string;
  stopName: string;
  aiConfigured: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Per-stop AI activity suggestions panel.
 *
 * - Shows a "Suggest activities" AiSuggestButton.
 * - On click calls the server action; displays the suggestions.
 * - Each suggestion has an "Add to wishlist" button that calls createItem.
 */
export function AiActivitySuggestions({
  tripId,
  stopId,
  stopName,
  aiConfigured,
}: AiActivitySuggestionsProps) {
  const [fetchPending, startFetch] = useTransition();
  const [addPending, startAdd] = useTransition();

  const [suggestions, setSuggestions] = React.useState<Suggestion[] | null>(null);
  const [addedTitles, setAddedTitles] = React.useState<Set<string>>(new Set());
  const [error, setError] = React.useState<string | null>(null);
  const [expanded, setExpanded] = React.useState(false);

  function handleFetch() {
    setError(null);
    startFetch(async () => {
      const result = await aiSuggestActivities(tripId, stopId);
      if (result.ok) {
        setSuggestions(result.data.suggestions);
        setExpanded(true);
      } else if (result.reason === "disabled") {
        setError("AI features are not configured.");
      } else {
        setError(result.message ?? "Something went wrong. Please try again.");
      }
    });
  }

  function handleAdd(suggestion: Suggestion) {
    startAdd(async () => {
      const result = await createItem(tripId, {
        title: suggestion.title,
        category: suggestion.category,
        stopId,
        notes: suggestion.note,
      });
      if (result.success) {
        setAddedTitles((prev) => new Set([...prev, suggestion.title]));
      }
    });
  }

  const hasSuggestions = suggestions !== null && suggestions.length > 0;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <AiSuggestButton
          aiConfigured={aiConfigured}
          loading={fetchPending}
          label={suggestions ? "Refresh suggestions" : "Suggest activities"}
          size="md"
          onClick={handleFetch}
          disabled={fetchPending || addPending}
        />
        {hasSuggestions && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex min-h-11 items-center gap-1 text-xs font-extrabold text-muted-foreground hover:text-foreground"
            aria-label={expanded ? "Collapse suggestions" : "Expand suggestions"}
          >
            {expanded ? (
              <ChevronUp className="size-3.5" aria-hidden="true" />
            ) : (
              <ChevronDown className="size-3.5" aria-hidden="true" />
            )}
            {suggestions.length} suggestions
          </button>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-md border-2 border-destructive bg-destructive/10 px-3 py-2 text-[13px] font-semibold text-foreground">
          <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
          {error}
        </div>
      )}

      {hasSuggestions && expanded && (
        <div className="flex flex-col gap-1.5 rounded-lg border-2 border-border bg-hue-lilac/25 p-3 shadow-hard-2">
          <p className="mb-1 text-[11px] font-extrabold uppercase tracking-[0.08em] text-foreground">
            AI suggestions for {stopName}
          </p>
          <ul className="flex flex-col gap-2">
            {suggestions.map((s) => {
              const added = addedTitles.has(s.title);
              return (
                <li
                  key={s.title}
                  className={cn(
                    "flex items-start justify-between gap-3 rounded-md border-2 border-border bg-card px-3 py-2.5 text-sm",
                    added && "opacity-60",
                  )}
                >
                  <div className="flex flex-col gap-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[13px] font-extrabold leading-snug">{s.title}</span>
                      <CategoryPill category={s.category} size="sm" />
                    </div>
                    {s.note && (
                      <p className="text-xs text-muted-foreground leading-snug">
                        {s.note}
                      </p>
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    size="md"
                    className="shrink-0"
                    disabled={added || addPending}
                    onClick={() => handleAdd(s)}
                    title={added ? "Already added" : `Add "${s.title}" to wishlist`}
                  >
                    {added ? (
                      "Added"
                    ) : (
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
        </div>
      )}
    </div>
  );
}
