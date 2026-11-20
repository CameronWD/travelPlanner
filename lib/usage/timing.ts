import { MAX_APPEAR_MS } from "@/lib/usage/lists";
import { WAS_SAVED_COPY_MESSAGE } from "@/lib/offline";
import { savedCopyAnswer } from "@/lib/saved-copy";

export function afterNextPaint(cb: () => void): void {
  const run = () => {
    try {
      cb();
    } catch {}
  };
  try {
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => setTimeout(run, 0));
    else setTimeout(run, 16);
  } catch {}
}

export function appearMs(startedAt: number | null, firstOfDocument: boolean): number | null {
  try {
    if (document.visibilityState === "hidden") return null;
    let ms: number;
    if (firstOfDocument) {
      if (typeof performance === "undefined") return null;
      ms = Math.round(performance.now());
    } else {
      if (startedAt === null) return null;
      ms = Date.now() - startedAt;
    }
    return Number.isFinite(ms) && ms >= 0 && ms <= MAX_APPEAR_MS ? ms : null;
  } catch {
    return null;
  }
}

let lastHiddenAt: number | null = null;
let hiddenAtInstall = false;
let tracking = false;

function onVisibility() {
  if (document.visibilityState === "hidden") lastHiddenAt = Date.now();
}

export function trackHidden(): void {
  try {
    if (tracking) return;
    tracking = true;
    if (document.visibilityState === "hidden") {
      lastHiddenAt = Date.now();
      hiddenAtInstall = true;
    } else if (performance.getEntriesByType?.("visibility-state").some((entry) => entry.name === "hidden")) {
      hiddenAtInstall = true;
    }
    document.addEventListener("visibilitychange", onVisibility);
  } catch {}
}

export function wasHiddenSince(startedAt: number | null): boolean {
  if (startedAt === null) return hiddenAtInstall || lastHiddenAt !== null;
  return lastHiddenAt !== null && lastHiddenAt >= startedAt;
}

export function resetHiddenForTests(): void {
  try {
    document.removeEventListener("visibilitychange", onVisibility);
  } catch {}
  lastHiddenAt = null;
  hiddenAtInstall = false;
  tracking = false;
}

export function probeSavedCopy(path: string, timeoutMs = 1000): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const controller = navigator.serviceWorker?.controller;
      if (!controller) return resolve(false);
      const channel = new MessageChannel();
      const timer = setTimeout(() => resolve(false), timeoutMs);
      channel.port1.onmessage = (event) => {
        clearTimeout(timer);
        resolve(savedCopyAnswer(event.data));
      };
      controller.postMessage({ type: WAS_SAVED_COPY_MESSAGE, url: path }, [channel.port2]);
    } catch {
      resolve(false);
    }
  });
}
