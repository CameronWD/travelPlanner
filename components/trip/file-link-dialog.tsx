"use client";

import * as React from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { linkAttachmentToItem } from "@/server/actions/attachments";

export interface LinkTargetGroup {
  stopName: string;
  items: Array<{ id: string; title: string }>;
}

export interface FileLinkDialogProps {
  file: { id: string; itemId: string | null } | null;
  targets: LinkTargetGroup[];
  onOpenChange(open: boolean): void;
  onSaved(): void;
}

/** Link a Trip-level file to an Item, or back to Trip-level (spec 2026-10-02 §C). */
function Body({ file, targets, onOpenChange, onSaved }: Omit<FileLinkDialogProps, "file"> & { file: NonNullable<FileLinkDialogProps["file"]> }) {
  const id = React.useId();
  const [value, setValue] = React.useState(file.itemId ?? "");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();


  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    startTransition(async () => {
      const result = await linkAttachmentToItem(file.id, value === "" ? null : value);
      if (result.success) {
        onOpenChange(false);
        onSaved();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>Link to an Item</DialogTitle>
      </DialogHeader>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-item`}>Item</Label>
        <select
          id={`${id}-item`}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="h-11 rounded-md border-2 border-border bg-card px-3 text-base sm:text-sm"
        >
          <option value="">Trip-level (not linked)</option>
          {targets.map((group) => (
            <optgroup key={group.stopName} label={group.stopName}>
              {group.items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        {error && <p className="text-xs font-medium text-destructive">{error}</p>}
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" size="md" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" size="md" loading={pending} disabled={pending}>
          Save
        </Button>
      </DialogFooter>
    </form>
  );
}

export function FileLinkDialog({ file, targets, onOpenChange, onSaved }: FileLinkDialogProps) {
  return (
    <Dialog open={file !== null} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined}>
        {file && <Body key={file.id} file={file} targets={targets} onOpenChange={onOpenChange} onSaved={onSaved} />}
      </DialogContent>
    </Dialog>
  );
}
