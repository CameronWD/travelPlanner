"use client";
import * as React from "react";
import { useRouter } from "next/navigation";

const TYPING = /^(INPUT|TEXTAREA|SELECT)$/;

/** ← / → change day (DAY_VIEW §2), never while typing or inside a dialog. */
export function DayKeyboardNav({ prevHref, nextHref }: { prevHref: string | null; nextHref: string | null }) {
  const router = useRouter();
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target;
      if (t instanceof Element && (TYPING.test(t.tagName) || (t as HTMLElement).isContentEditable || t.closest("[role=dialog]"))) return;
      if (e.key === "ArrowRight" && nextHref) router.push(nextHref);
      else if (e.key === "ArrowLeft" && prevHref) router.push(prevHref);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, prevHref, nextHref]);
  return null;
}
