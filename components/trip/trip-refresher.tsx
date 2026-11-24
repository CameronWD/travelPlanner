"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { RESUME_REFRESH_AFTER_MS, TRIP_REFRESH_EVENT } from "@/lib/trip-refresh";

const DIALOG_RECHECK_MS = 1000;
const OPEN_DIALOG = '[role="dialog"],[role="alertdialog"]';

export function TripRefresher() {
  const { refresh } = useRouter();

  useEffect(() => {
    let lastRefreshAt = Date.now();
    let recheck: ReturnType<typeof setInterval> | null = null;

    const stopRecheck = () => {
      if (recheck === null) return;
      clearInterval(recheck);
      recheck = null;
    };
    const run = () => {
      stopRecheck();
      lastRefreshAt = Date.now();
      refresh();
    };
    const want = () => {
      if (navigator.onLine === false) return;
      if (!document.querySelector(OPEN_DIALOG)) return run();
      // A half-typed form in an open dialog must not be disturbed: wait for it to close.
      recheck ??= setInterval(() => {
        if (navigator.onLine === false) return stopRecheck();
        if (!document.querySelector(OPEN_DIALOG)) run();
      }, DIALOG_RECHECK_MS);
    };
    const onResume = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastRefreshAt > RESUME_REFRESH_AFTER_MS) want();
    };

    window.addEventListener("pageshow", onResume);
    document.addEventListener("visibilitychange", onResume);
    window.addEventListener("online", want);
    window.addEventListener(TRIP_REFRESH_EVENT, want);
    return () => {
      stopRecheck();
      window.removeEventListener("pageshow", onResume);
      document.removeEventListener("visibilitychange", onResume);
      window.removeEventListener("online", want);
      window.removeEventListener(TRIP_REFRESH_EVENT, want);
    };
  }, [refresh]);

  return null;
}
