"use client";

import { useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { WAS_SAVED_COPY_MESSAGE } from "@/lib/offline";
import { savedCopyMessagePath, savedCopyAnswer, savedCopyLineContent, savedCopyState } from "@/lib/saved-copy";

// The path the worker answered with a saved copy: a later page the router
// fetches in this document is fresh, so the flag belongs to that path alone.
let savedCopyPath: string | null = null;
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

function setSavedCopyPath(path: string | null) {
  if (savedCopyPath === path) return;
  savedCopyPath = path;
  notify();
}

// The worker's pushed message can reach the page before React listens, so the
// page also asks the worker whether it just answered this URL with a saved copy.
function askWorker() {
  const controller = navigator.serviceWorker?.controller;
  if (!controller) return;
  const path = window.location.pathname;
  const channel = new MessageChannel();
  channel.port1.onmessage = (event) => {
    if (savedCopyAnswer(event.data)) setSavedCopyPath(path);
    else if (savedCopyPath === path) setSavedCopyPath(null);
  };
  controller.postMessage({ type: WAS_SAVED_COPY_MESSAGE, url: path }, [channel.port2]);
}

function onWorkerMessage(event: MessageEvent) {
  const path = savedCopyMessagePath(event.data);
  if (path !== null) setSavedCopyPath(path);
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
  const pathname = usePathname();
  const deviceToday = useSyncExternalStore(
    subscribe,
    () => {
      const state = savedCopyState({ renderedToday, zone, now: new Date(), servedAsSavedCopy: savedCopyPath === pathname });
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
