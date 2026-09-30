"use client";

import * as React from "react";
import { StepActions, ContinueButton } from "./step-actions";
import type { StepProps } from "./step-props";

export function StepFrom({ formRef, onNext, onBack }: StepProps) {
  const headingId = React.useId();
  return (
    <form ref={formRef} aria-labelledby={headingId} noValidate onSubmit={(e) => { e.preventDefault(); onNext(); }} className="flex flex-1 flex-col">
      <h2 id={headingId} tabIndex={-1} className="font-display text-[44px] font-extrabold leading-[.95] tracking-[-0.04em] outline-none md:text-[64px]">
        Leaving from?
      </h2>
      <StepActions showBack onBack={onBack} primary={<ContinueButton />} />
    </form>
  );
}
