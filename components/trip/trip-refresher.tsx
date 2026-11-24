"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  RESUME_REFRESH_AFTER_MS,
  TRIP_REFRESH_EVENT,
  TRIP_REFRESH_PROBE_TIMEOUT_MS,
} from "@/lib/trip-refresh";

const DIALOG_RECHECK_MS = 1000;
const PROBE_URL = "/manifest.webmanifest";
const OPEN_DIALOG = '[role="dialog"],[role="alertdialog"]';

export function TripRefresher() {
  const { refresh } = useRouter();

  useEffect(() => {
    let lastRefreshAt = Date.now();
    let recheck: ReturnType<typeof setInterval> | null = null;
    let probing = false;
    let unmounted = false;

    const stopRecheck = () => {
      if (recheck === null) return;
      clearInterval(recheck);
      recheck = null;
    };
    // A refresh whose fetch fails becomes a hard page reload, so only refresh once the server has answered.
    const serverAnswers = async () => {
      try {
        const response = await fetch(PROBE_URL, {
          method: "HEAD",
          cache: "no-store",
          signal: AbortSignal.timeout(TRIP_REFRESH_PROBE_TIMEOUT_MS),
        });
        return response.ok;
      } catch {
        return false;
      }
    };
    const dialogOpen = () => document.querySelector(OPEN_DIALOG) !== null;
    const holdForDialog = () => {
      // A half-typed form in an open dialog must not be disturbed: wait for it to close.
      recheck ??= setInterval(() => {
        if (navigator.onLine === false) return stopRecheck();
        if (!probing && !dialogOpen()) run();
      }, DIALOG_RECHECK_MS);
    };
    const run = async () => {
      stopRecheck();
      probing = true;
      const answered = await serverAnswers();
      probing = false;
      if (!answered || unmounted || navigator.onLine === false) return;
      if (dialogOpen()) return holdForDialog();
      lastRefreshAt = Date.now();
      refresh();
    };
    const want = () => {
      if (navigator.onLine === false || probing) return;
      if (dialogOpen()) return holdForDialog();
      void run();
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
      unmounted = true;
      stopRecheck();
      window.removeEventListener("pageshow", onResume);
      document.removeEventListener("visibilitychange", onResume);
      window.removeEventListener("online", want);
      window.removeEventListener(TRIP_REFRESH_EVENT, want);
    };
  }, [refresh]);

  return null;
}
