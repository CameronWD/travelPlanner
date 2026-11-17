"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { toast } from "@/components/ui/use-toast";
import { failureMessage } from "@/components/ui/failure-message";
import { isConstrainedConnection, type ConnectionHint } from "@/lib/offline";

export interface ResilientLoader<P extends object> {
  // Pass to React.useState: the component a mount keeps for its lifetime.
  current(): React.ComponentType<P>;
  preload(): void;
}

// A `next/dynamic` whose import was rejected (a chunk missing offline) throws
// into the route's error boundary and stays rejected. This one resolves to
// `Fallback` instead, and the next component to mount asks for the module again.
export function createResilientLoader<P extends object>(
  load: () => Promise<React.ComponentType<P>>,
  Fallback: React.ComponentType<P>,
): ResilientLoader<P> {
  let failed = false;
  const make = () =>
    dynamic(
      () =>
        load().catch(() => {
          failed = true;
          return Fallback;
        }),
      { ssr: false },
    ) as React.ComponentType<P>;
  let Inner = make();
  let asked = false;
  return {
    current() {
      if (failed) {
        failed = false;
        Inner = make();
      }
      return Inner;
    },
    // Fetches the chunk (the service worker keeps it for offline) without rendering anything.
    preload() {
      if (asked) return;
      asked = true;
      load().catch(() => {
        asked = false;
      });
    },
  };
}

const OPEN_FAILED = "Couldn't open that. Try again.";

export type LazyDialog<P extends object> = React.ComponentType<P> & { preload(): void };

// A dialog loaded when first opened. If its module cannot load, the dialog
// closes itself through `close` and the Traveller is told why, rather than
// the page failing.
export function createLazyDialog<P extends object>(
  load: () => Promise<React.ComponentType<P>>,
  close: (props: P) => void,
): LazyDialog<P> {
  function Unavailable(props: P) {
    const told = React.useRef(false);
    React.useEffect(() => {
      if (told.current) return;
      told.current = true;
      toast({ variant: "destructive", title: failureMessage(OPEN_FAILED) });
      close(props);
    }, [props]);
    return null;
  }
  const loader = createResilientLoader<P>(load, Unavailable);
  function LazyDialogLoader(props: P) {
    const [Current] = React.useState(loader.current);
    return <Current {...props} />;
  }
  return Object.assign(LazyDialogLoader, { preload: loader.preload });
}

const IDLE_FALLBACK_MS = 1500;

type IdleWindow = Window & {
  requestIdleCallback?: (cb: () => void) => number;
  cancelIdleCallback?: (id: number) => void;
};

// Online, and never on a connection that asks to save data: the same line the
// offline save draws for its automatic run.
export function usePreloadWhenIdle(loaders: ReadonlyArray<{ preload(): void }>): void {
  React.useEffect(() => {
    if (!navigator.onLine) return;
    if (isConstrainedConnection((navigator as Navigator & { connection?: ConnectionHint }).connection)) return;
    const run = () => {
      for (const loader of loaders) loader.preload();
    };
    const win = window as IdleWindow;
    if (win.requestIdleCallback) {
      const id = win.requestIdleCallback(run);
      return () => win.cancelIdleCallback?.(id);
    }
    const id = window.setTimeout(run, IDLE_FALLBACK_MS);
    return () => window.clearTimeout(id);
  }, [loaders]);
}
