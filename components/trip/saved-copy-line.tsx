"use client";

import { useSyncExternalStore } from "react";
import { WAS_SAVED_COPY_MESSAGE } from "@/lib/offline";
import { isSavedCopyMessage, savedCopyAnswer, savedCopyLineContent, savedCopyState } from "@/lib/saved-copy";

let servedAsSavedCopy = false;
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

function markSavedCopy() {
  if (servedAsSavedCopy) return;
  servedAsSavedCopy = true;
  notify();
}

// The worker's pushed message can reach the page before React listens, so the
// page also asks the worker whether it just answered this URL with a saved copy.
function askWorker() {
  const controller = navigator.serviceWorker?.controller;
  if (!controller) return;
  const channel = new MessageChannel();
  channel.port1.onmessage = (event) => {
    if (savedCopyAnswer(event.data)) markSavedCopy();
  };
  controller.postMessage({ type: WAS_SAVED_COPY_MESSAGE, url: window.location.pathname }, [channel.port2]);
}

function onWorkerMessage(event: MessageEvent) {
  if (isSavedCopyMessage(event.data)) markSavedCopy();
}

function onVisible() {
  if (document.visibilityState === "visible") notify();
}

function subscribe(listener: () => void) {
  const first = listeners.size === 0;
  listeners.add(listener);
  if (first) {
    window.addEventListener("online", notify);
    window.addEventListener("offline", notify);
    window.addEventListener("pageshow", notify);
    document.addEventListener("visibilitychange", onVisible);
    navigator.serviceWorker?.addEventListener("message", onWorkerMessage);
    askWorker();
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      window.removeEventListener("online", notify);
      window.removeEventListener("offline", notify);
      window.removeEventListener("pageshow", notify);
      document.removeEventListener("visibilitychange", onVisible);
      navigator.serviceWorker?.removeEventListener("message", onWorkerMessage);
    }
  };
}

const NOT_STALE = "";

export function SavedCopyLine({
  tripRef,
  startDate,
  endDate,
  renderedToday,
  zone,
}: {
  tripRef: string;
  startDate: string | null;
  endDate: string | null;
  renderedToday: string;
  zone: string;
}) {
  // The snapshot is the device's today when the page is stale, else "": a primitive, and "" on the server and while hydrating, so nothing flashes.
  const deviceToday = useSyncExternalStore(
    subscribe,
    () => {
      const state = savedCopyState({ renderedToday, zone, now: new Date(), servedAsSavedCopy });
      return state.stale ? state.deviceToday : NOT_STALE;
    },
    () => NOT_STALE,
  );
  if (deviceToday === NOT_STALE) return null;
  const { text, linkText, href } = savedCopyLineContent({ tripRef, startDate, endDate, renderedToday, deviceToday });
  return (
    <p role="status" className="mb-4 rounded-md border border-border bg-muted px-3 py-2 text-sm text-foreground print:hidden">
      {text}
      {linkText && href ? (
        <>
          {" "}
          {/* A plain link on purpose: the layout's `today` only refreshes on a full page load. */}
          <a href={href} className="font-medium underline underline-offset-2">
            {linkText}
          </a>
        </>
      ) : null}
    </p>
  );
}
