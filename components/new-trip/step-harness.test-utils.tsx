import * as React from "react";
import { screen } from "@testing-library/react";
import { draftReducer, emptyDraft, type Draft, type StepErrors } from "@/lib/new-trip/draft";
import type { StepProps } from "./step-props";

type Extra<P> = Omit<P, keyof StepProps>;

export function StepHarness<P extends StepProps>({ Step, initial = {}, errors = {}, onNext = () => {}, onBack = () => {}, today = "2026-09-30", extra }: {
  Step: React.ComponentType<P>;
  initial?: Partial<Draft>;
  errors?: StepErrors;
  onNext?: () => void;
  onBack?: () => void;
  today?: string;
  extra?: Extra<P>;
}) {
  const [draft, dispatch] = React.useReducer(draftReducer, undefined, () => ({ ...emptyDraft(initial.past ?? false), name: "Kyoto", ...initial }));
  const formRef = React.useRef<HTMLFormElement | null>(null);
  const props = { draft, dispatch, errors, attempt: 0, formRef, onNext, onBack, today, pending: false, ...extra } as P;
  return (
    <>
      <Step {...props} />
      <output data-testid="draft">{JSON.stringify(draft)}</output>
    </>
  );
}

export function currentDraft(): Draft {
  return JSON.parse(screen.getByTestId("draft").textContent ?? "{}");
}
