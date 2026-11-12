"use client";

import * as React from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { moveAttachment } from "@/server/actions/attachments";
import { firstErrorMessage } from "@/components/ui/action-failure";
import type { MoveTargetGroup } from "@/lib/attachment-move";

export interface FileMoveDialogProps {
  attachmentId: string;
  targets: MoveTargetGroup[];
  onDone(): void;
}

export function FileMoveDialog({ attachmentId, targets, onDone }: FileMoveDialogProps) {
  const id = React.useId();
  const [value, setValue] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const option = targets.flatMap((g) => g.options).find((o) => o.value === value);
    if (!option) return;
    startTransition(async () => {
      const result = await moveAttachment(attachmentId, option.target);
      if (result.success) onDone();
      else setError(firstErrorMessage(result, "Couldn't move that file."));
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onDone()}>
      <DialogContent aria-describedby={undefined}>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Move file</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-target`}>Move to</Label>
            <select
              id={`${id}-target`}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="h-11 rounded-md border-2 border-border bg-card px-3 text-base sm:text-sm"
            >
              <option value="" disabled>
                Choose where it goes
              </option>
              {targets.map((group) => (
                <optgroup key={group.label} label={group.label}>
                  {group.options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            {error && <p className="text-xs font-medium text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" size="md" onClick={onDone}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="md" loading={pending} disabled={pending || value === ""}>
              Move
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
