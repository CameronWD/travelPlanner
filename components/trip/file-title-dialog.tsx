"use client";

import * as React from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { setAttachmentTitle } from "@/server/actions/attachments";

export interface FileTitleDialogProps {
  file: { id: string; title: string | null | undefined } | null;
  onOpenChange(open: boolean): void;
  onSaved?(): void;
}

/** Rename a file (spec 2026-10-02 §C): one Title field; empty clears it. */
function Body({ file, onOpenChange, onSaved }: Omit<FileTitleDialogProps, "file"> & { file: NonNullable<FileTitleDialogProps["file"]> }) {
  const id = React.useId();
  const [value, setValue] = React.useState(file.title ?? "");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    startTransition(async () => {
      const result = await setAttachmentTitle(file.id, value);
      if (result.success) {
        onOpenChange(false);
        onSaved?.();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>Rename file</DialogTitle>
      </DialogHeader>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-title`}>Title</Label>
        <Input id={`${id}-title`} value={value} maxLength={120} onChange={(e) => setValue(e.target.value)} autoFocus />
        <p className="text-xs text-muted-foreground">Leave empty to show the filename.</p>
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

export function FileTitleDialog({ file, onOpenChange, onSaved }: FileTitleDialogProps) {
  return (
    <Dialog open={file !== null} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined}>
        {file && <Body key={file.id} file={file} onOpenChange={onOpenChange} onSaved={onSaved} />}
      </DialogContent>
    </Dialog>
  );
}
