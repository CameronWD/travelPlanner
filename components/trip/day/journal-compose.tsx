"use client";

import * as React from "react";
import { PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { JournalEditor, type JournalEditorProps } from "@/components/trip/journal-editor";

/**
 * The Day view's empty Journal (spec 2026-09-29 D6): a one-line prompt and
 * the write action, so an empty card stays small. The editor opens on demand.
 */
export function JournalCompose(props: JournalEditorProps) {
  const [writing, setWriting] = React.useState(false);
  if (writing) return <JournalEditor {...props} />;
  return (
    <div data-slot="journal-prompt" className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm font-medium text-muted-foreground">How was today? Jot a memory…</p>
      <Button variant="outline" size="sm" onClick={() => setWriting(true)}>
        <PenLine className="size-4" aria-hidden="true" />
        Write an entry
      </Button>
    </div>
  );
}
