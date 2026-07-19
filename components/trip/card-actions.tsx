"use client";

import * as React from "react";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
}: {
  label: string;
  items: CardActionItem[];
}) {
  if (items.length === 0) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative size-8 pointer-coarse:after:absolute pointer-coarse:after:-inset-1.5 pointer-coarse:after:content-['']" aria-label={label}>
          <MoreHorizontal className="size-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {items.map((item) => (
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
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
