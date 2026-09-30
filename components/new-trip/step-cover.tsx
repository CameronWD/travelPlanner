"use client";

import * as React from "react";
import type { Step } from "@/lib/new-trip/draft";
import { StepActions, ContinueButton } from "./step-actions";
import type { StepProps } from "./step-props";

export interface StepCoverProps extends StepProps {
  cover: { url: string } | null;
  onCover: (file: File | null) => void;
  onEdit: (step: Step) => void;
}

export function StepCover({ draft, formRef, onNext, onBack }: StepCoverProps) {
  const headingId = React.useId();
  return (
    <form ref={formRef} aria-labelledby={headingId} noValidate onSubmit={(e) => { e.preventDefault(); onNext(); }} className="flex flex-1 flex-col">
      <h2 id={headingId} tabIndex={-1} className="font-display text-[44px] font-extrabold leading-[.95] tracking-[-0.04em] outline-none md:text-[64px]">
        Got a photo for it?
      </h2>
      <StepActions showBack onBack={onBack} primary={<ContinueButton label={draft.past ? "Add trip" : "Create trip"} />} />
    </form>
  );
}
