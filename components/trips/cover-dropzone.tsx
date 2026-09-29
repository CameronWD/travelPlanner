"use client";

import * as React from "react";
import { ImagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFieldControl } from "@/components/ui/field";
import { SM_HIT } from "@/components/ui/touch-target";
import { cn } from "@/lib/cn";

/**
 * Cover-photo field for New trip (Feedback cmumckjjn000404l08xwwegwg): a
 * dashed dropzone whose prompt is centred, and a preview once a file is
 * chosen. Uncontrolled on purpose — the form reads `FormData.get(name)`
 * exactly as it did from the bare <input type="file">. A drop is written
 * into the input's `files` so the same read works.
 */
export function CoverDropzone({ name, disabled }: { name: string; disabled?: boolean }) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [preview, setPreview] = React.useState<string | null>(null);
  const [dragOver, setDragOver] = React.useState(false);
  // Inside a <Field>, take its control id + aria-describedby so the visible
  // label and description are wired to the (visually hidden) input.
  const fieldProps = useFieldControl();

  React.useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  function show(file: File | null) {
    setPreview(file && file.type.startsWith("image/") ? URL.createObjectURL(file) : null);
  }

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    show(e.target.files?.[0] ?? null);
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    if (disabled) return;
    const file = e.dataTransfer.files?.[0];
    if (!file || !inputRef.current) return;
    const dt = new DataTransfer();
    dt.items.add(file);
    inputRef.current.files = dt.files;
    show(file);
  }

  function clear() {
    if (inputRef.current) inputRef.current.value = "";
    show(null);
  }

  return (
    <div
      data-testid="cover-dropzone"
      data-dragging={dragOver ? "" : undefined}
      onDragOver={(e) => { e.preventDefault(); if (!disabled) setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      className={cn(
        "flex min-h-40 flex-col items-center justify-center gap-3 rounded-md border-2 border-dashed p-4 text-center transition-colors motion-reduce:transition-none",
        dragOver ? "border-border bg-muted" : "border-border-soft",
      )}
    >
      <input
        {...fieldProps}
        ref={inputRef}
        type="file"
        name={name}
        accept="image/*"
        aria-label="Cover photo"
        className="sr-only"
        onChange={onChange}
        disabled={disabled}
      />
      {preview ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- local object URL */}
          <img src={preview} alt="Cover photo preview" className="h-28 w-40 rounded-md border-2 border-border object-cover" />
          <div className="flex items-center gap-2">
            <Button type="button" variant="secondary" size="sm" className={SM_HIT} disabled={disabled} onClick={() => inputRef.current?.click()}>Replace</Button>
            <Button type="button" variant="ghost" size="sm" className={SM_HIT} disabled={disabled} onClick={clear}>Remove</Button>
          </div>
        </>
      ) : (
        <>
          <span aria-hidden="true" className="island grid size-12 place-items-center rounded-lg border-2 border-border bg-sun"><ImagePlus className="size-6" /></span>
          <Button type="button" variant="secondary" size="sm" className={SM_HIT} disabled={disabled} onClick={() => inputRef.current?.click()}>Choose a photo</Button>
          <p className="text-xs font-semibold text-muted-foreground">{dragOver ? "Drop to use this photo" : "or drop a photo here — you can change it later in Settings"}</p>
        </>
      )}
    </div>
  );
}
