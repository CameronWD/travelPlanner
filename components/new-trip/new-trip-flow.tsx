"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { todayLocalISO } from "@/lib/dates";
import {
  DRAFT_KEY, clampStep, draftReducer, initDraft, isDirty, parseDraft, serializeDraft, validateStep,
  type Draft, type Step, type StepErrors,
} from "@/lib/new-trip/draft";
import { FlowTopBar, LeaveDialog, stepLabels } from "./flow-top-bar";
import { FlowProgressMobile } from "./flow-progress-mobile";
import { StepName } from "./step-name";
import { StepWhen } from "./step-when";
import { StepFrom } from "./step-from";
import { StepWherePast } from "./step-where-past";
import { StepCover } from "./step-cover";
import { TripPreview } from "./trip-preview";
import type { StepProps } from "./step-props";

export interface NewTripFlowProps {
  past: boolean;
  firstTrip: boolean;
  /** The Traveller's display name (only its first word is shown), or null (spec C7). */
  displayName?: string | null;
  initialName?: string;
  initialStep?: number;
  /** Route copy (Phase 4): threaded into createTrip, ignored server-side until then. */
  fromShareToken?: string;
}

const noopSubscribe = () => () => {};

/**
 * The flow reads sessionStorage and the device clock, neither of which the
 * server has; rendering the body only on the client keeps SSR and the first
 * client render identical.
 */
export function NewTripFlow(props: NewTripFlowProps) {
  const mounted = React.useSyncExternalStore(noopSubscribe, () => true, () => false);
  if (!mounted) {
    return (
      <div aria-busy="true" className="flex h-dvh flex-col bg-background">
        <div className="hidden h-[84px] border-b-2 border-border bg-sun md:block" />
      </div>
    );
  }
  return <FlowBody {...props} />;
}

function readStored(past: boolean): Draft | null {
  try {
    return parseDraft(window.sessionStorage.getItem(DRAFT_KEY), past);
  } catch {
    return null;
  }
}

function writeStepToUrl(step: Step, mode: "push" | "replace") {
  const url = new URL(window.location.href);
  url.searchParams.set("step", String(step));
  url.searchParams.delete("name");
  const next = `${url.pathname}?${url.searchParams.toString()}`;
  // Native history integrates with the App Router (next/dist/docs 01-getting-started/04-linking-and-navigating.md, "Native History API") — no server round trip per step.
  if (mode === "push") window.history.pushState(null, "", next);
  else window.history.replaceState(null, "", next);
}

function eyebrowFor(past: boolean, firstTrip: boolean, displayName?: string | null): string {
  if (past) return "Log a past trip";
  if (!firstTrip) return "New trip";
  const first = displayName?.trim().split(/\s+/)[0];
  return first ? `Welcome, ${first}. Let's start your first trip.` : "Let's start your first trip.";
}

function FlowBody({ past, firstTrip, displayName, initialName, initialStep }: NewTripFlowProps) {
  const router = useRouter();
  const today = React.useMemo(() => todayLocalISO(), []);
  const [draft, dispatch] = React.useReducer(draftReducer, undefined, () => initDraft({ past, initialName, initialStep, stored: readStored(past) }));
  const [errors, setErrors] = React.useState<StepErrors>({});
  const [attempt, setAttempt] = React.useState(0);
  const [leaving, setLeaving] = React.useState(false);
  const [announce, setAnnounce] = React.useState("");
  const [pending] = React.useState(false); // Task 13 replaces this with useTransition
  const formRef = React.useRef<HTMLFormElement | null>(null);
  const draftRef = React.useRef(draft);
  const labels = React.useMemo(() => stepLabels(past), [past]);

  React.useEffect(() => {
    draftRef.current = draft;
    try {
      window.sessionStorage.setItem(DRAFT_KEY, serializeDraft(draft));
    } catch {
      // Private mode / storage full: the draft just won't survive a refresh.
    }
  }, [draft]);

  const mountStep = React.useRef(draft.step);
  React.useEffect(() => {
    writeStepToUrl(mountStep.current, "replace");
  }, []);

  // A step with a main input autofocuses it on mount; otherwise the new heading takes focus.
  const shownStep = React.useRef(draft.step);
  React.useEffect(() => {
    if (shownStep.current === draft.step) return;
    shownStep.current = draft.step;
    const form = formRef.current;
    if (form && !form.contains(document.activeElement)) form.querySelector<HTMLElement>("h2")?.focus();
  }, [draft.step]);

  React.useEffect(() => {
    function onPop() {
      const n = Number(new URL(window.location.href).searchParams.get("step"));
      const step = clampStep(draftRef.current, n);
      setErrors({});
      dispatch({ type: "go", step });
      setAnnounce(`Step ${step} of 4, ${labels[step - 1]}`);
    }
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [labels]);

  function goTo(step: Step, opts: { keepErrors?: boolean } = {}) {
    if (step === draft.step) return;
    if (!opts.keepErrors) setErrors({});
    dispatch({ type: "go", step });
    setAnnounce(`Step ${step} of 4, ${labels[step - 1]}`);
    writeStepToUrl(step, "push");
  }

  function next() {
    const errs = validateStep(draft, draft.step);
    if (Object.keys(errs).length) {
      setErrors(errs);
      setAttempt((a) => a + 1);
      return;
    }
    if (draft.step < 4) goTo((draft.step + 1) as Step);
    // Step 4 submits — Task 13.
  }

  function leave() {
    try {
      window.sessionStorage.removeItem(DRAFT_KEY);
    } catch {
      // nothing to forget
    }
    router.push("/trips");
  }

  function requestLeave() {
    if (isDirty(draft, false)) setLeaving(true);
    else leave();
  }

  function back() {
    if (draft.step > 1) goTo((draft.step - 1) as Step);
    else requestLeave();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    // An IME uses Esc/Enter to cancel or commit a candidate; those keys aren't ours.
    if (e.defaultPrevented || e.nativeEvent.isComposing || e.keyCode === 229) return;
    const t = e.target as HTMLElement;
    // Dialogs and popovers (portalled, but React events still bubble here) own their keys.
    if (t.closest("[data-radix-popper-content-wrapper], [role='dialog']")) return;
    if (e.key === "Escape") {
      e.preventDefault();
      requestLeave();
    } else if (e.key === "Enter" && !t.closest("button, a, input, textarea, select, [role='combobox'], [role='radio']")) {
      e.preventDefault();
      formRef.current?.requestSubmit();
    }
  }

  const stepProps: StepProps = { draft, dispatch, errors, attempt, formRef, onNext: next, onBack: back, today, pending };
  const stepEl =
    draft.step === 1 ? <StepName {...stepProps} eyebrow={eyebrowFor(past, firstTrip, displayName)} />
    : draft.step === 2 ? <StepWhen {...stepProps} />
    : draft.step === 3 ? (past ? <StepWherePast {...stepProps} /> : <StepFrom {...stepProps} />)
    : <StepCover {...stepProps} cover={null} onCover={() => {}} onEdit={(s) => goTo(s)} />;

  return (
    <div onKeyDown={onKeyDown} className="flex h-dvh flex-col bg-background">
      <FlowTopBar labels={labels} step={draft.step} disabled={pending} onGo={(s) => goTo(s)} onCancel={requestLeave} />
      <FlowProgressMobile step={draft.step} onBack={back} disabled={pending} />
      <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[minmax(0,7fr)_minmax(0,4fr)] xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <main className="relative flex min-h-0 flex-col overflow-y-auto overflow-x-hidden px-5 pt-[22px] md:px-10 md:pb-12 md:pt-14 xl:pl-24 xl:pr-20">
          {stepEl}
        </main>
        <aside aria-hidden="true" className="relative hidden items-center justify-center border-l-2 border-border bg-canvas bg-[radial-gradient(hsl(var(--border-soft))_1.5px,transparent_1.5px)] bg-[size:22px_22px] p-8 md:flex">
          <TripPreview past={past} step={draft.step} name={draft.name} dateMode={draft.dateMode} startDate={draft.startDate} endDate={draft.endDate} roughMonth={draft.roughMonth} today={today} />
        </aside>
      </div>
      <p aria-live="polite" className="sr-only">{announce}</p>
      <LeaveDialog open={leaving} onOpenChange={setLeaving} onLeave={leave} />
    </div>
  );
}
