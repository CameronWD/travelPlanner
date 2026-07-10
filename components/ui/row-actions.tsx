"use client";

import * as React from "react";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

export interface RowActionsProps {
  onEdit?: () => void;
  onDelete?: () => void;
  editLabel?: string;
  deleteLabel?: string;
  disabled?: boolean;
  className?: string;
}

/** The Edit (pencil) / Delete (trash) ghost icon-button pair used on cards. */
export function RowActions({
  onEdit,
  onDelete,
  editLabel = "Edit",
  deleteLabel = "Delete",
  disabled,
  className,
}: RowActionsProps) {
  return (
    <div className={cn("flex shrink-0 items-center gap-1", className)}>
      {onEdit && (
        <Button
          variant="ghost"
          size="icon"
          className="relative size-8 pointer-coarse:after:absolute pointer-coarse:after:-inset-1.5 pointer-coarse:after:content-['']"
          onClick={onEdit}
          disabled={disabled}
          aria-label={editLabel}
          title={editLabel}
        >
          <Pencil className="size-4" aria-hidden="true" />
        </Button>
      )}
      {onDelete && (
        <Button
          variant="ghost"
          size="icon"
          className="relative size-8 text-destructive hover:bg-destructive/10 pointer-coarse:after:absolute pointer-coarse:after:-inset-1.5 pointer-coarse:after:content-['']"
          onClick={onDelete}
          disabled={disabled}
          aria-label={deleteLabel}
          title={deleteLabel}
        >
          <Trash2 className="size-4" aria-hidden="true" />
        </Button>
      )}
    </div>
  );
}
