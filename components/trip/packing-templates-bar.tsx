"use client";

import * as React from "react";
import { useTransition } from "react";
import { BookmarkPlus, FolderOpen, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  saveAsTemplate,
  applyTemplate,
  deleteTemplate,
} from "@/server/actions/checklists";
import type { TemplateListItem } from "@/server/actions/checklists";

// ---------------------------------------------------------------------------
// Save-as-template dialog
// ---------------------------------------------------------------------------

/**
 * Inner form for saving a template — mounted fresh on each open via `key`.
 */
function SaveTemplateForm({
  tripId,
  onClose,
}: {
  tripId: string;
  onClose: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [name, setName] = React.useState("");
  const [error, setError] = React.useState("");

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    setError("");
    startTransition(async () => {
      const result = await saveAsTemplate(tripId, name.trim());
      if (result.success) {
        onClose();
      } else {
        const firstError = Object.values(result.errors)[0]?.[0];
        setError(firstError ?? "Something went wrong");
      }
    });
  }

  return (
    <form onSubmit={handleSave} className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Saves the current packing list as a reusable template you can apply to
        future trips.
      </p>
      <Field label="Template name" required error={error}>
        <Input
          placeholder="e.g. Weekend city break"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={pending}
          autoFocus
          maxLength={80}
        />
      </Field>
      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          onClick={onClose}
          disabled={pending}
        >
          Cancel
        </Button>
        <Button type="submit" loading={pending}>
          Save template
        </Button>
      </DialogFooter>
    </form>
  );
}

function SaveTemplateDialog({
  tripId,
  open,
  onOpenChange,
}: {
  tripId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Save as template</DialogTitle>
        </DialogHeader>
        {/* key forces remount when opened → always fresh state */}
        <SaveTemplateForm
          key={open ? "open" : "closed"}
          tripId={tripId}
          onClose={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Delete confirmation dialog
// ---------------------------------------------------------------------------

function DeleteTemplateDialog({
  template,
  open,
  onOpenChange,
}: {
  template: TemplateListItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [pending, startTransition] = useTransition();

  function handleDelete() {
    if (!template) return;
    startTransition(async () => {
      await deleteTemplate(template.id);
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete Template</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Are you sure you want to delete{" "}
          <strong className="text-foreground">{template?.name}</strong>? This
          cannot be undone.
        </p>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleDelete} loading={pending}>
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// PackingTemplatesBar
// ---------------------------------------------------------------------------

export interface PackingTemplatesBarProps {
  tripId: string;
  templates: TemplateListItem[];
}

export function PackingTemplatesBar({
  tripId,
  templates,
}: PackingTemplatesBarProps) {
  const [saveOpen, setSaveOpen] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState<TemplateListItem | null>(
    null,
  );
  const [applyPending, startApplyTransition] = useTransition();

  function handleApply(templateId: string) {
    startApplyTransition(async () => {
      await applyTemplate(tripId, templateId);
    });
  }

  return (
    <>
      <SaveTemplateDialog
        tripId={tripId}
        open={saveOpen}
        onOpenChange={setSaveOpen}
      />
      <DeleteTemplateDialog
        template={deleteTarget}
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      />

      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card px-4 py-3">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Templates
        </span>

        {/* Apply template dropdown */}
        {templates.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                loading={applyPending}
                disabled={applyPending}
              >
                <FolderOpen className="size-4" aria-hidden="true" />
                Apply Template
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-56">
              <DropdownMenuLabel>Your templates</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {templates.map((t) => (
                <div key={t.id} className="flex items-center gap-1 pr-1">
                  <DropdownMenuItem
                    className="flex-1"
                    onSelect={() => handleApply(t.id)}
                  >
                    <span className="flex-1 truncate">{t.name}</span>
                    <span className="ml-2 shrink-0 text-xs text-muted-foreground">
                      {t.itemCount} item{t.itemCount !== 1 ? "s" : ""}
                    </span>
                  </DropdownMenuItem>
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(t)}
                    aria-label={`Delete Template ${t.name}`}
                    className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="size-3.5" aria-hidden="true" />
                  </button>
                </div>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {/* Save current as template */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => setSaveOpen(true)}
        >
          <BookmarkPlus className="size-4" aria-hidden="true" />
          Save as template
        </Button>

        {templates.length === 0 && (
          <span className="text-xs text-muted-foreground">
            No templates yet — save your packing list to reuse it on future trips.
          </span>
        )}
      </div>
    </>
  );
}
