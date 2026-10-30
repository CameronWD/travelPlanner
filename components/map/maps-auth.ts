"use client";

import { useSyncExternalStore } from "react";

declare global {
  interface Window {
    gm_authFailure?: () => void;
  }
}

// Google calls gm_authFailure once per page load and vis.gl never surfaces it, so the refusal is remembered here for
// every map or Places widget mounted later in the same page (e.g. after a client-side navigation).
let authFailed = false;
let installed = false;
let previous: (() => void) | undefined;
const listeners = new Set<() => void>();

function install() {
  if (installed) return;
  installed = true;
  previous = window.gm_authFailure;
  window.gm_authFailure = () => {
    previous?.();
    authFailed = true;
    for (const listener of listeners) listener();
  };
}

function subscribe(listener: () => void) {
  install();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useMapsAuthFailed(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => authFailed,
    () => false,
  );
}

export function resetMapsAuthForTests(): void {
  if (installed) window.gm_authFailure = previous;
  authFailed = false;
  installed = false;
  previous = undefined;
  listeners.clear();
}
