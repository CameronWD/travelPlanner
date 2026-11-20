"use client";

import { useEffect } from "react";
import { sendUsageOnce } from "@/lib/usage/client";
import { afterNextPaint } from "@/lib/usage/timing";

let sent = false;

export function UsageShareOpened() {
  useEffect(() => {
    if (sent) return;
    sent = true;
    afterNextPaint(() => sendUsageOnce("share-link-opened"));
  }, []);
  return null;
}
