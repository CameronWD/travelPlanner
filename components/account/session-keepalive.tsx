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

export function SessionKeepalive() {
  const inFlight = useRef(false);

  useEffect(() => {
    const renew = async () => {
      if (inFlight.current || Date.now() - readStamp() < INTERVAL_MS) return;
      inFlight.current = true;
      try {
        const res = await fetch("/api/auth-keepalive", { method: "POST" });
        // Stamped only on success, so a post that fails offline retries on the next visit.
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
