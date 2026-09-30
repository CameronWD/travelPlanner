"use client";

import * as React from "react";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface CardActionItem {
  key: string;
  label: string;
  icon?: React.ReactNode;
  onSelect: () => void;
  disabled?: boolean;
  /** Render the label/icon in the destructive color. */
  destructive?: boolean;
  /** Optional muted subtext shown below the label (e.g. to explain why an item is disabled). */
  hint?: string;
}

/**
 * A `⋯` overflow button that reveals secondary card actions in a dropdown.
 * Used on small screens where inline icon buttons would crowd the card.
 */
export function MoreActionsMenu({
  label,
  items,
  groups,
  triggerClassName,
}: {
  label: string;
  items?: CardActionItem[];
  /** Grouped items, rendered with a separator between groups. Wins over `items` when both are given. */
  groups?: CardActionItem[][];
  triggerClassName?: string;
}) {
  const sets = (groups ?? (items ? [items] : [])).filter((set) => set.length > 0);
  if (sets.length === 0) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "relative size-8 pointer-coarse:after:absolute pointer-coarse:after:-inset-1.5 pointer-coarse:after:content-['']",
            triggerClassName,
          )}
          aria-label={label}
        >
          <MoreHorizontal className="size-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {sets.map((set, i) => (
          <React.Fragment key={i}>
            {i > 0 && <DropdownMenuSeparator />}
            {set.map((item) => (
              <DropdownMenuItem
                key={item.key}
                disabled={item.disabled}
                onSelect={item.onSelect}
                className={item.destructive ? "text-destructive focus:text-destructive" : undefined}
                title={item.hint}
              >
                {item.icon}
                <span className="flex flex-col">
                  <span>{item.label}</span>
                  {item.hint && (
                    <span className="text-xs text-muted-foreground font-normal">{item.hint}</span>
                  )}
                </span>
              </DropdownMenuItem>
            ))}
          </React.Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
