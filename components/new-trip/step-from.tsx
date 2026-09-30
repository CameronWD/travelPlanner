"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { PlaceCombobox } from "@/components/ui/place-combobox";
import { CurrencyRow } from "@/components/ui/currency-row";
import { currencyForCountry } from "@/lib/currency-for-country";
import { StepActions, ContinueButton } from "./step-actions";
import type { StepProps } from "./step-props";

export function StepFrom({ draft, dispatch, errors, attempt, formRef, onNext, onBack, pending }: StepProps) {
  const headingId = React.useId();

  const picked = draft.homePlace;
  const fromPlace = picked?.countryCode !== undefined && currencyForCountry(picked.countryCode) === draft.homeCurrency;
  const note = fromPlace ? `Picked from ${picked!.name}. Costs in other currencies convert to this.` : "Costs in other currencies convert to this.";

  return (
    <form ref={formRef} aria-labelledby={headingId} noValidate onSubmit={(e) => { e.preventDefault(); onNext(); }} className="flex flex-1 flex-col">
      <fieldset disabled={pending} className="contents">
        <h2 id={headingId} tabIndex={-1} className="font-display text-[44px] font-extrabold leading-[.95] tracking-[-0.04em] outline-none md:text-[64px]">
          Leaving from?
        </h2>
        <p className="mt-2 text-[15px] font-medium text-muted-foreground">Your home base. It&apos;s where the trip starts and ends.</p>

        <div className="mt-6">
          <PlaceCombobox
            aria-label="Leaving from"
            autoFocus
            value={draft.homeName ?? ""}
            onValueChange={(text) => dispatch({ type: "set-home-text", text })}
            onPick={(place) => dispatch({ type: "pick-home", place })}
          />
        </div>
        {errors.home ? <p key={attempt} role="alert" className="mt-3 text-[15px] font-bold text-coral-text">{errors.home}</p> : null}

        <div className="mt-6">
          <CurrencyRow value={draft.homeCurrency} onChange={(code) => dispatch({ type: "set-currency", code })} note={note} />
        </div>

        <StepActions
          showBack
          onBack={onBack}
          secondary={
            <Button
              type="button"
              variant="outline"
              className="pressable h-14 px-6 text-[17px]"
              onClick={() => {
                dispatch({ type: "clear-home" });
                onNext();
              }}
            >
              Skip
            </Button>
          }
          primary={<ContinueButton />}
        />
      </fieldset>
    </form>
  );
}
