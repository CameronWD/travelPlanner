"use client";

import * as React from "react";
import { ArrowRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SM_HIT } from "@/components/ui/touch-target";
import { cn } from "@/lib/cn";
import type { Draft, Step } from "@/lib/new-trip/draft";
import { whenLine } from "@/lib/new-trip/draft";
import { StepActions } from "./step-actions";
import type { StepProps } from "./step-props";

export interface StepCoverProps extends StepProps {
  cover: { url: string } | null;
  onCover: (file: File | null) => void;
  onEdit: (step: Step) => void;
}

export function StepCover({ draft, errors, formRef, onNext, onBack, today, pending, cover, onCover, onEdit }: StepCoverProps) {
  const headingId = React.useId();
  return (
    <form ref={formRef} aria-labelledby={headingId} noValidate onSubmit={(e) => { e.preventDefault(); onNext(); }} className="flex flex-1 flex-col">
      <fieldset disabled={pending} className="contents">
        <h2 id={headingId} tabIndex={-1} className="font-display text-[44px] font-extrabold leading-[.95] tracking-[-0.04em] outline-none md:text-[64px]">
          Got a photo for it?
        </h2>
        <p className="mt-3 max-w-[560px] text-base text-foreground/80">Totally optional. Skip it and we&apos;ll stamp the card for you, then sketch your route once you add stops.</p>
        <div className="mt-8 flex flex-col items-center gap-8 md:flex-row md:items-start">
          <PolaroidDropzone cover={cover} onCover={onCover} disabled={pending} />
          <ReviewList draft={draft} today={today} onEdit={onEdit} />
        </div>
        {errors.form ? <p role="alert" className="mt-4 text-[15px] font-bold text-coral-text">{errors.form}</p> : null}
        <StepActions
          showBack
          onBack={onBack}
          primary={
            <Button type="submit" variant="accent" loading={pending} className="h-14 flex-1 px-7 text-[17px] text-foreground shadow-hard-3 md:flex-none">
              {draft.past ? "Add trip" : "Create trip"}
              <ArrowRight aria-hidden="true" />
            </Button>
          }
          hint={draft.past ? null : <span className="text-on-accent-muted">Next: add your first stop</span>}
        />
      </fieldset>
    </form>
  );
}

function PolaroidDropzone({ cover, onCover, disabled }: { cover: { url: string } | null; onCover: (f: File | null) => void; disabled: boolean }) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = React.useState(false);
  const take = (f?: File | null) => {
    if (f && f.type.startsWith("image/")) onCover(f);
  };
  return (
    <div className="flex shrink-0 flex-col items-center">
      <div
        data-testid="cover-dropzone"
        data-dragging={dragging ? "" : undefined}
        onDragOver={(e) => { e.preventDefault(); if (!disabled) setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); if (!disabled) take(e.dataTransfer.files?.[0]); }}
        className={cn("w-[200px] rounded-xl border-2 border-border bg-card p-[9px] pb-[34px] shadow-hard-3", dragging ? "rotate-0 scale-[1.03]" : "-rotate-3")}
      >
        <input ref={inputRef} type="file" accept="image/*" aria-label="Cover photo" tabIndex={-1} className="sr-only" disabled={disabled} onChange={(e) => { take(e.target.files?.[0]); e.target.value = ""; }} />
        <div className={cn("relative grid aspect-[3/4] place-items-center overflow-hidden rounded-[6px] border-2 border-border", cover || dragging ? "border-solid" : "border-dashed")}>
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element -- local object URL
            <img src={cover.url} alt="Cover photo preview" className="absolute inset-0 size-full object-cover" />
          ) : (
            <button type="button" disabled={disabled} onClick={() => inputRef.current?.click()} className="flex size-full flex-col items-center justify-center gap-2 text-center focus-visible:outline-[3px] focus-visible:-outline-offset-[3px] focus-visible:outline-ring">
              <span aria-hidden="true" className="island grid size-11 place-items-center rounded-full border-2 border-border bg-sun"><Plus className="size-5" strokeWidth={3} /></span>
              <span className="text-[15px] font-extrabold">Drop a photo</span>
              <span className="text-[13px] font-semibold text-muted-foreground">or choose one</span>
            </button>
          )}
        </div>
      </div>
      {cover ? (
        <div className="mt-3 flex gap-2">
          <Button type="button" variant="secondary" size="sm" className={SM_HIT} disabled={disabled} onClick={() => inputRef.current?.click()}>Replace</Button>
          <Button type="button" variant="ghost" size="sm" className={SM_HIT} disabled={disabled} onClick={() => onCover(null)}>Remove</Button>
        </div>
      ) : null}
    </div>
  );
}

interface ReviewRow {
  step: Step;
  tone: string;
  label: string;
  value: string | null;
  empty: string;
}

function reviewRows(draft: Draft, today: string): ReviewRow[] {
  const code = draft.homeCurrency;
  const homeValue = draft.past
    ? draft.stops.length
      ? `${draft.stops.slice(0, 3).map((s) => s.name).join(", ")}${draft.stops.length > 3 ? ` +${draft.stops.length - 3}` : ""} · money in ${code}`
      : null
    : draft.homeName
      ? `${draft.homeName} · money in ${code}`
      : null;
  return [
    { step: 1, tone: "bg-coral", label: "Name", value: draft.name.trim() || null, empty: "" },
    { step: 2, tone: "bg-sun", label: "When", value: whenLine(draft, today), empty: "No dates yet" },
    {
      step: 3,
      tone: "bg-teal",
      label: draft.past ? "Where" : "From",
      value: homeValue,
      empty: draft.past ? `No places yet · money in ${code}` : `Home base not set · money in ${code}`,
    },
  ];
}

function ReviewList({ draft, today, onEdit }: { draft: Draft; today: string; onEdit: (step: Step) => void }) {
  const id = React.useId();
  return (
    <section aria-labelledby={id} className="w-full min-w-0 flex-1">
      <h3 id={id} className="text-[11px] font-extrabold uppercase tracking-[0.08em]">Your trip</h3>
      <ul className="mt-2.5 flex flex-col gap-2.5">
        {reviewRows(draft, today).map(({ step, tone, label, value, empty }) => (
          <li key={step} className="flex min-h-12 items-center gap-3 rounded-[14px] border-2 border-border bg-card px-3.5 py-2">
            <span aria-hidden="true" className={cn("island grid size-7 shrink-0 place-items-center rounded-lg border-2 border-border text-[13px] font-extrabold", tone)}>{step}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-semibold text-muted-foreground">{label}</span>
              <span className={cn("block truncate text-[15px] font-bold tabular-nums", !value && "text-muted-foreground")}>{value || empty}</span>
            </span>
            <button type="button" aria-label={`Edit ${label}`} onClick={() => onEdit(step)} className="min-h-11 shrink-0 px-2 text-sm font-extrabold text-coral-text underline-offset-2 hover:underline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring">Edit</button>
          </li>
        ))}
      </ul>
    </section>
  );
}
