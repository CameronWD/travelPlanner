"use client";

import * as React from "react";
import { MapPin, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PlaceCombobox } from "@/components/ui/place-combobox";
import { CurrencyRow } from "@/components/ui/currency-row";
import { StepActions, ContinueButton } from "./step-actions";
import type { StepProps } from "./step-props";

export function StepWherePast({ draft, dispatch, errors, attempt, formRef, onNext, onBack, pending }: StepProps) {
  const headingId = React.useId();
  const [text, setText] = React.useState("");

  function addTyped(): boolean {
    if (!text.trim()) return false;
    dispatch({ type: "add-stop", stop: { name: text } });
    setText("");
    return true;
  }

  const lastLocated = [...draft.stops].reverse().find((s) => s.lat !== undefined && s.lng !== undefined) as { lat: number; lng: number } | undefined;

  return (
    <form
      ref={formRef}
      aria-labelledby={headingId}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        addTyped();
        onNext();
      }}
      className="flex flex-1 flex-col"
    >
      <fieldset disabled={pending} className="contents">
        <h2 id={headingId} tabIndex={-1} className="font-display text-[44px] font-extrabold leading-[.95] tracking-[-0.04em] outline-none md:text-[64px]">
          Where did you stop?
        </h2>
        <p className="mt-2 text-[15px] font-medium text-muted-foreground">Add the places you stayed. You can skip this and add them later.</p>

        <div
          className="mt-6"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.defaultPrevented && text.trim()) {
              e.preventDefault();
              addTyped();
            }
          }}
        >
          <PlaceCombobox
            aria-label="Add a place"
            placeholder="Add a town or city"
            autoFocus
            value={text}
            onValueChange={setText}
            onPick={(p) => {
              dispatch({ type: "add-stop", stop: { name: p.name, lat: p.lat, lng: p.lng, ...(p.countryCode ? { countryCode: p.countryCode } : {}) } });
              setText("");
            }}
            rankNear={lastLocated}
          />
        </div>

        {draft.stops.length ? (
          <ul aria-label="Places" className="mt-4 flex flex-wrap gap-2">
            {draft.stops.map((s, i) => (
              <li key={`${s.name}|${i}`} className="inline-flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border-2 border-border bg-card pl-3.5 pr-1 text-[15px] font-bold">
                <MapPin aria-hidden="true" className="size-4" />
                {s.name}
                <button
                  type="button"
                  aria-label={`Remove ${s.name}`}
                  onClick={() => dispatch({ type: "remove-stop", index: i })}
                  className="relative grid size-8 place-items-center rounded-full hover:bg-muted after:absolute after:-inset-1.5 after:content-['']"
                >
                  <X aria-hidden="true" className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        {errors.home ? <p key={attempt} role="alert" className="mt-3 text-[15px] font-bold text-coral-text">{errors.home}</p> : null}

        <div className="mt-6">
          <CurrencyRow value={draft.homeCurrency} onChange={(code) => dispatch({ type: "set-currency", code })} note="Costs in other currencies convert to this." />
        </div>

        <StepActions
          showBack
          onBack={onBack}
          secondary={
            draft.stops.length === 0 ? (
              <Button type="button" variant="outline" className="pressable h-14 px-6 text-[17px]" onClick={onNext}>
                Skip
              </Button>
            ) : null
          }
          primary={<ContinueButton />}
        />
      </fieldset>
    </form>
  );
}
