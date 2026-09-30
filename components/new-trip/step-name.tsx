"use client";

import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import { AppLink } from "@/components/navigation/app-link";
import { MAX_NAME } from "@/lib/new-trip/draft";
import { StepActions, ContinueButton } from "./step-actions";
import { TripPreviewMini } from "./trip-preview";
import type { StepProps } from "./step-props";
import { cn } from "@/lib/cn";

export function StepName({ draft, dispatch, errors, attempt, formRef, onNext, today, pending, eyebrow }: StepProps & { eyebrow: string }) {
  const headingId = React.useId();
  const helpId = React.useId();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const error = errors.name;

  React.useEffect(() => {
    if (error) inputRef.current?.focus();
  }, [error, attempt]);

  const trimmed = draft.name.trim();
  const pastHref = `/trips/new?past=1${trimmed ? `&name=${encodeURIComponent(trimmed)}` : ""}`;

  return (
    <form ref={formRef} aria-labelledby={headingId} noValidate onSubmit={(e) => { e.preventDefault(); onNext(); }} className="flex flex-1 flex-col md:pt-8">
      <fieldset disabled={pending} className="contents">
        <p className="text-[15px] font-bold text-muted-foreground">{eyebrow}</p>
        <h2 id={headingId} tabIndex={-1} className="mt-2 font-display text-[52px] font-extrabold leading-[.9] tracking-[-0.045em] outline-none md:text-[88px]">
          {draft.past ? "Where did you go?" : "Where to?"}
        </h2>
        <div key={attempt} className={cn("mt-8", error && "tp-wiggle")}>
          <input
            ref={inputRef}
            aria-label="Trip name"
            aria-invalid={error ? true : undefined}
            aria-describedby={helpId}
            autoFocus
            autoComplete="off"
            maxLength={MAX_NAME}
            placeholder="Japan in spring"
            value={draft.name}
            onChange={(e) => dispatch({ type: "set-name", name: e.target.value })}
            className={cn(
              "h-16 w-full rounded-[20px] border-2 bg-card px-6 text-[22px] font-bold text-foreground caret-coral shadow-hard-3 placeholder:text-muted-foreground focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring md:h-20 md:text-[30px]",
              error ? "border-coral-text" : "border-border",
            )}
          />
        </div>
        {/* The input's description stays put and current; only the visible copy cross-fades. */}
        <p id={helpId} aria-live="polite" className="sr-only">{error ?? "A place, a season, an excuse. You can change it later."}</p>
        <AnimatePresence mode="wait" initial={false}>
          <motion.p
            key={error ? "error" : "help"}
            aria-hidden="true"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
            className={cn("mt-3 text-[15px] font-medium", error ? "text-coral-text" : "text-muted-foreground")}
          >
            {error ?? (
              <>
                <span className="hidden md:inline">A place, a season, an excuse. </span>You can change it later.
              </>
            )}
          </motion.p>
        </AnimatePresence>
        <TripPreviewMini past={draft.past} step={1} name={draft.name} dateMode={draft.dateMode} today={today} />
        <StepActions
          showBack={false}
          primary={<ContinueButton />}
          after={
            draft.past ? null : (
              <p className="text-[15px] font-semibold">
                Already been?{" "}
                <AppLink href={pastHref} className="font-extrabold text-coral-text underline underline-offset-2">Log a past trip</AppLink>
              </p>
            )
          }
        />
      </fieldset>
    </form>
  );
}
