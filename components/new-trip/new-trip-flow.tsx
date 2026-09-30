"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useAnimate, useIsPresent, useReducedMotion } from "motion/react";
import { todayLocalISO } from "@/lib/dates";
import { createTrip } from "@/server/actions/trips";
import { compressImage } from "@/lib/image-compress";
import { toast } from "@/components/ui/use-toast";
import {
  DRAFT_KEY, clampStep, draftReducer, errorStep, initDraft, isDirty, parseDraft, serializeDraft, stepErrorsFrom, toCreateInput, validateStep,
  type Draft, type DraftAction, type Step, type StepErrors,
} from "@/lib/new-trip/draft";
import { markArrival } from "@/lib/new-trip/arrival";
import { FlowTopBar, LeaveDialog, stepLabels } from "./flow-top-bar";
import { FlowProgressMobile } from "./flow-progress-mobile";
import { StepName } from "./step-name";
import { StepWhen } from "./step-when";
import { StepFrom } from "./step-from";
import { StepWherePast } from "./step-where-past";
import { StepCover } from "./step-cover";
import { TripPreview } from "./trip-preview";
import { useDebouncedValue } from "./use-debounced-value";
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

const EASE_POP = [0.2, 0.8, 0.2, 1] as const;
const EASE_EXIT = [0.4, 0, 1, 1] as const;
const EASE_BOUNCE = [0.34, 1.56, 0.64, 1] as const;
// Trip home itself, not a sub-page or the Globe: only there does the countdown tile drop in.
const TRIP_HOME = /^\/trips\/[^/?#]+$/;
type Dir = 1 | -1;
const SLIDE = {
  enter: (d: Dir) => ({ x: d > 0 ? "100%" : "-100%" }),
  center: { x: 0, transition: { duration: 0.32, ease: EASE_POP } },
  exit: (d: Dir) => ({ x: d > 0 ? "-100%" : "100%", transition: { duration: 0.2, ease: EASE_EXIT } }),
};
const FADE = {
  enter: { opacity: 0 },
  center: { opacity: 1, transition: { duration: 0.08 } },
  exit: { opacity: 0, transition: { duration: 0.08 } },
};

/**
 * With AnimatePresence mode="wait" the entering step mounts only after the old
 * one has left, so arrival work (focus, announcement) runs from its mount. A
 * layout effect lands it in the same commit as the new heading; `autoFocus`
 * inputs are focused earlier in that commit, so they keep focus. The leaving
 * step is inert: its handlers hold the old draft, so a second Continue during
 * the exit would otherwise step again.
 */
function StepArrival({ step, onArrive, children }: { step: Step; onArrive: (s: Step) => void; children: React.ReactNode }) {
  const present = useIsPresent();
  React.useLayoutEffect(() => onArrive(step), [onArrive, step]);
  return <div inert={!present} className="flex flex-1 flex-col">{children}</div>;
}

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

function FlowBody({ past, firstTrip, displayName, initialName, initialStep, fromShareToken }: NewTripFlowProps) {
  const router = useRouter();
  const today = React.useMemo(() => todayLocalISO(), []);
  const [draft, dispatch] = React.useReducer(draftReducer, undefined, () => initDraft({ past, initialName, initialStep, stored: readStored(past) }));
  const [errors, setErrors] = React.useState<StepErrors>({});
  const [attempt, setAttempt] = React.useState(0);
  const [leaving, setLeaving] = React.useState(false);
  const [dir, setDir] = React.useState<Dir>(1);
  const reduce = useReducedMotion();
  const [announce, setAnnounce] = React.useState("");
  const [pending, startTransition] = React.useTransition();
  const [cover, setCover] = React.useState<{ file: File; url: string } | null>(null);
  const coverUrlRef = React.useRef<string | null>(null);
  const formRef = React.useRef<HTMLFormElement | null>(null);
  const draftRef = React.useRef(draft);
  const labels = React.useMemo(() => stepLabels(past), [past]);
  const stampName = useDebouncedValue(draft.name, 250);
  const [thunkKey, setThunkKey] = React.useState(0);
  const [liftScope, animateLift] = useAnimate<HTMLDivElement>();

  // The first date (exact start or rough month) presses the stamp, once per draft (MOTION N6).
  // draftRef is marked here too, so a second date in the same frame can't press twice.
  const act = React.useCallback((a: DraftAction) => {
    const firstDate = (a.type === "set-range" && a.start) || (a.type === "set-rough-month" && a.ym);
    if (firstDate && !draftRef.current.stamped) {
      draftRef.current = { ...draftRef.current, stamped: true };
      setThunkKey((k) => k + 1);
      dispatch({ type: "stamped" });
    }
    dispatch(a);
  }, []);

  // Pop and lift (MOTION N13 step 2). Phones have no preview card to lift.
  async function lift() {
    const el = liftScope.current;
    if (reduce || !el || !window.matchMedia("(min-width: 768px)").matches) return;
    el.setAttribute("data-lifted", "");
    await animateLift(el, { scale: 1.04, y: -6 }, { duration: 0.24, ease: EASE_BOUNCE });
  }

  React.useEffect(() => () => { if (coverUrlRef.current) URL.revokeObjectURL(coverUrlRef.current); }, []);

  function onCover(file: File | null) {
    if (coverUrlRef.current) URL.revokeObjectURL(coverUrlRef.current);
    const next = file ? { file, url: URL.createObjectURL(file) } : null;
    coverUrlRef.current = next?.url ?? null;
    setCover(next);
  }

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
  const onArrive = React.useCallback((step: Step) => {
    if (shownStep.current === step) return;
    shownStep.current = step;
    setAnnounce(`Step ${step} of 4, ${labels[step - 1]}`);
    const form = formRef.current;
    if (form && !form.contains(document.activeElement)) form.querySelector<HTMLElement>("h2")?.focus();
  }, [labels]);

  React.useEffect(() => {
    function onPop() {
      const n = Number(new URL(window.location.href).searchParams.get("step"));
      const step = clampStep(draftRef.current, n);
      setErrors({});
      setDir(step < draftRef.current.step ? -1 : 1);
      dispatch({ type: "go", step });
    }
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  function goTo(step: Step, opts: { keepErrors?: boolean } = {}) {
    // draftRef, not draft: a leaving step's handlers close over the draft it was rendered with.
    const from = draftRef.current.step;
    if (step === from) return;
    if (!opts.keepErrors) setErrors({});
    setDir(step > from ? 1 : -1);
    dispatch({ type: "go", step });
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
    else submit();
  }

  function submit() {
    startTransition(async () => {
      // compressImage never throws: an image it can't decode comes back as it is.
      const file = cover?.file ? await compressImage(cover.file) : null;
      let result: Awaited<ReturnType<typeof createTrip>>;
      try {
        result = await createTrip(toCreateInput(draft, { fromShareToken }), file);
      } catch {
        // A thrown create (network, platform limit) stays inline on step 4; the draft stays.
        setErrors({ form: "Something went wrong — nothing was created. Try again." });
        setAttempt((a) => a + 1);
        return;
      }
      if (!result.success) {
        setErrors(stepErrorsFrom(result.errors));
        setAttempt((a) => a + 1);
        const step = errorStep(result.errors);
        if (step !== draft.step) goTo(step, { keepErrors: true });
        return;
      }
      try {
        window.sessionStorage.removeItem(DRAFT_KEY);
      } catch {
        // nothing to forget
      }
      await lift();
      if (TRIP_HOME.test(result.href)) markArrival(result.tripId);
      if (firstTrip && !past) toast({ title: `${draft.name.trim()} is ready.`, description: "Add your first stop to start the route." });
      router.push(result.href);
    });
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
    if (isDirty(draft, cover != null)) setLeaving(true);
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
    if (t.closest("[data-radix-popper-content-wrapper], [role='dialog'], [inert]")) return;
    if (e.key === "Escape") {
      e.preventDefault();
      requestLeave();
    } else if (e.key === "Enter" && !t.closest("button, a, input, textarea, select, [role='combobox'], [role='radio']")) {
      e.preventDefault();
      formRef.current?.requestSubmit();
    }
  }

  const stepProps: StepProps = { draft, dispatch: act, errors, attempt, formRef, onNext: next, onBack: back, today, pending };
  const stepEl =
    draft.step === 1 ? <StepName {...stepProps} eyebrow={eyebrowFor(past, firstTrip, displayName)} />
    : draft.step === 2 ? <StepWhen {...stepProps} />
    : draft.step === 3 ? (past ? <StepWherePast {...stepProps} /> : <StepFrom {...stepProps} />)
    : <StepCover {...stepProps} cover={cover ? { url: cover.url } : null} onCover={onCover} onEdit={(s) => goTo(s)} />;

  return (
    <div onKeyDown={onKeyDown} className="flex h-dvh flex-col bg-background">
      <FlowTopBar labels={labels} step={draft.step} disabled={pending} onGo={(s) => goTo(s)} onCancel={requestLeave} />
      <FlowProgressMobile step={draft.step} onBack={back} disabled={pending} />
      <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[minmax(0,7fr)_minmax(0,4fr)] xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <main className="relative flex min-h-0 flex-col overflow-y-auto overflow-x-hidden px-5 pt-[22px] md:px-10 md:pb-12 md:pt-14 xl:pl-24 xl:pr-20">
          <div className="tp-rise-in flex flex-1 flex-col">
            <AnimatePresence mode="wait" initial={false} custom={dir}>
              <motion.div
                key={draft.step}
                custom={dir}
                variants={reduce ? FADE : SLIDE}
                initial="enter"
                animate="center"
                exit="exit"
                data-step={draft.step}
                data-direction={dir > 0 ? "forward" : "back"}
                className="flex flex-1 flex-col"
              >
                <StepArrival step={draft.step} onArrive={onArrive}>{stepEl}</StepArrival>
              </motion.div>
            </AnimatePresence>
          </div>
        </main>
        <aside aria-hidden="true" className="relative hidden items-center justify-center border-l-2 border-border bg-canvas bg-[radial-gradient(hsl(var(--border-soft))_1.5px,transparent_1.5px)] bg-[size:22px_22px] p-8 md:flex">
          <div ref={liftScope} className="group/lift max-w-full">
            <TripPreview className="tp-drop-in" past={past} step={draft.step} name={draft.name} stampName={stampName} dateMode={draft.dateMode} startDate={draft.startDate} endDate={draft.endDate} roughMonth={draft.roughMonth} today={today} coverUrl={cover?.url} thunkKey={thunkKey} />
          </div>
        </aside>
      </div>
      <p aria-live="polite" className="sr-only">{announce}</p>
      <LeaveDialog open={leaving} onOpenChange={setLeaving} onLeave={leave} />
    </div>
  );
}
