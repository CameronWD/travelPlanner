import type * as React from "react";
import type { Draft, DraftAction, StepErrors } from "@/lib/new-trip/draft";

export interface StepProps {
  draft: Draft;
  dispatch: React.Dispatch<DraftAction>;
  errors: StepErrors;
  /** Bumped on every refused Continue, so the error wiggle replays (MOTION N12). */
  attempt: number;
  formRef: React.RefObject<HTMLFormElement | null>;
  onNext: () => void;
  onBack: () => void;
  /** Device today, YYYY-MM-DD. */
  today: string;
  pending: boolean;
}
