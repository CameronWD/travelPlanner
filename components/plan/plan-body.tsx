"use client";

import * as React from "react";
import { parsePlanHash, serializePlanHash } from "@/lib/plan/plan-hash";
import { scrollToId, ringId } from "@/lib/scroll-to";

export interface PlanActions {
  addStop(): void;
  newChapter(): void;
  suggestChapters(): void;
}

export interface PlanBodyValue {
  today: string;
  hashDay: string | null;
  isOpen(stopId: string): boolean;
  toggle(stopId: string): void;
  open(stopId: string): void;
  selectedDay(stopId: string): string | null;
  selectDay(stopId: string, dateISO: string): void;
  jumpTo(stopId: string): void;
  actions: PlanActions;
  registerActions(a: Partial<PlanActions>): () => void;
}

const NOOP_ACTIONS: PlanActions = {
  addStop() {},
  newChapter() {},
  suggestChapters() {},
};

const INERT_VALUE: PlanBodyValue = {
  today: "",
  hashDay: null,
  isOpen: () => false,
  toggle: () => {},
  open: () => {},
  selectedDay: () => null,
  selectDay: () => {},
  jumpTo: () => {},
  actions: NOOP_ACTIONS,
  registerActions: () => () => {},
};

const PlanBodyContext = React.createContext<PlanBodyValue | null>(null);

/**
 * Owns the Plan page's fold-open set and selected days, keeps them in sync
 * with the `#open=/&day=/#stop-` hash (lib/plan/plan-hash.ts), and hosts the
 * header-buttons-to-ItineraryManager actions registry (PLAN.md §3, §6.3).
 * Without a provider, `usePlanBody()` returns an inert default so components
 * still render standalone in isolation and in existing tests.
 */
export function PlanBody({
  initialOpen,
  today,
  children,
}: {
  initialOpen: string[];
  today: string;
  children: React.ReactNode;
}) {
  const [openIds, setOpenIds] = React.useState<string[]>(initialOpen);
  const [days, setDays] = React.useState<Record<string, string>>({});
  const [hashDay, setHashDay] = React.useState<string | null>(null);
  const lastDayRef = React.useRef<string | null>(null);
  const registry = React.useRef<Partial<PlanActions>>({});

  function writeHash(open: string[], day: string | null) {
    const h = serializePlanHash({ open, day });
    window.history.replaceState(null, "", `${location.pathname}${location.search}${h ? `#${h}` : ""}`);
  }

  function toggle(id: string) {
    const next = openIds.includes(id) ? openIds.filter((x) => x !== id) : [...openIds, id];
    setOpenIds(next);
    writeHash(next, lastDayRef.current);
  }

  function open(id: string) {
    if (openIds.includes(id)) return;
    const next = [...openIds, id];
    setOpenIds(next);
    writeHash(next, lastDayRef.current);
  }

  function selectDay(stopId: string, date: string) {
    setDays((d) => ({ ...d, [stopId]: date }));
    lastDayRef.current = date;
    writeHash(openIds, date);
  }

  function selectedDay(stopId: string): string | null {
    return days[stopId] ?? null;
  }

  function reduced(): boolean {
    return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  }

  function targetFor(id: string): string {
    const desktop = window.matchMedia?.("(min-width: 1024px)").matches;
    const preferred = desktop ? `stop-${id}` : `m-stop-${id}`;
    const fallback = desktop ? `m-stop-${id}` : `stop-${id}`;
    return document.getElementById(preferred) ? preferred : fallback;
  }

  function jumpTo(id: string) {
    const target = targetFor(id);
    const isReduced = reduced();
    scrollToId(target, { reduced: isReduced });
    const settle = () => {
      open(id);
      ringId(target);
    };
    if (isReduced) {
      settle();
      return;
    }
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      window.removeEventListener("scrollend", finish);
      window.clearTimeout(timer);
      settle();
    };
    window.addEventListener("scrollend", finish);
    const timer = window.setTimeout(finish, 600);
  }

  // Mount effect: read the hash once (and on hashchange) and apply it. Every
  // branch defers its setState calls inside a microtask (never synchronously
  // in the effect body) to satisfy react-hooks/set-state-in-effect — same
  // idiom as itinerary-manager.tsx's accommodation-nudge effect.
  React.useEffect(() => {
    function apply(hash: string) {
      const p = parsePlanHash(hash);
      if (p.stopTarget) {
        const stopTarget = p.stopTarget;
        void Promise.resolve().then(() => {
          setOpenIds((o) => (o.includes(stopTarget) ? o : [...o, stopTarget]));
          requestAnimationFrame(() => {
            const t = targetFor(stopTarget);
            scrollToId(t, { reduced: reduced() });
            ringId(t);
          });
        });
      } else if (p.open.length || p.day) {
        void Promise.resolve().then(() => {
          setOpenIds(p.open);
          setHashDay(p.day);
          lastDayRef.current = p.day;
        });
      }
    }
    apply(window.location.hash);
    function onHashChange() {
      apply(location.hash);
    }
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const actions = React.useMemo<PlanActions>(
    () => ({
      addStop: () => registry.current.addStop?.(),
      newChapter: () => registry.current.newChapter?.(),
      suggestChapters: () => registry.current.suggestChapters?.(),
    }),
    [],
  );

  function registerActions(a: Partial<PlanActions>): () => void {
    Object.assign(registry.current, a);
    return () => {
      for (const key of Object.keys(a) as (keyof PlanActions)[]) {
        if (registry.current[key] === a[key]) delete registry.current[key];
      }
    };
  }

  const value = React.useMemo<PlanBodyValue>(
    () => ({
      today,
      hashDay,
      isOpen: (id: string) => openIds.includes(id),
      toggle,
      open,
      selectedDay,
      selectDay,
      jumpTo,
      actions,
      registerActions,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- functions close over openIds/days/hashDay directly; re-memoised whenever any of those change.
    [today, hashDay, openIds, days, actions],
  );

  return <PlanBodyContext.Provider value={value}>{children}</PlanBodyContext.Provider>;
}

export function usePlanBody(): PlanBodyValue {
  return React.useContext(PlanBodyContext) ?? INERT_VALUE;
}

/**
 * Registers plan actions (addStop/newChapter/suggestChapters)
 * against the enclosing PlanBody so header buttons can reach whatever
 * ItineraryManager currently implements them. No dependency array: the
 * latest closures (fresh state, fresh callbacks) are re-registered on every
 * render rather than going stale between PlanBody's memoisation and
 * ItineraryManager's own re-renders.
 */
export function useRegisterPlanActions(a: Partial<PlanActions>): void {
  const { registerActions } = usePlanBody();
  React.useEffect(() => registerActions(a));
}
