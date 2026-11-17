"use client";

import { useEffect, useRef } from "react";

const STAMP_KEY = "teepee.session.keepaliveAt";
const INTERVAL_MS = 24 * 60 * 60 * 1000;

function readStamp(): number {
  try {
    return Number(localStorage.getItem(STAMP_KEY)) || 0;
  } catch {
    return 0;
  }
}

function writeStamp(at: number) {
  try {
    localStorage.setItem(STAMP_KEY, String(at));
  } catch {}
}

/**
 * Renews the sign-in cookie as the app is used (POST /api/auth-keepalive), at
 * most once a day per browser: on mount and whenever the tab comes back. The
 * stamp is written only once the server answers, so a post that fails offline
 * is tried again on the next visit. Silent by design.
 */
export function SessionKeepalive() {
  const inFlight = useRef(false);

  useEffect(() => {
    const renew = async () => {
      if (inFlight.current || Date.now() - readStamp() < INTERVAL_MS) return;
      inFlight.current = true;
      try {
        const res = await fetch("/api/auth-keepalive", { method: "POST" });
        if (res.ok) writeStamp(Date.now());
      } catch {
      } finally {
        inFlight.current = false;
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") void renew();
    };

    void renew();
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  return null;
}
