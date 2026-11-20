import { MAX_APPEAR_MS } from "@/lib/usage/lists";
import { WAS_SAVED_COPY_MESSAGE } from "@/lib/offline";
import { savedCopyAnswer } from "@/lib/saved-copy";

export function afterNextPaint(cb: () => void): void {
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => setTimeout(cb, 0));
  else setTimeout(cb, 16);
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

export function watchHidden(): { wasHidden: () => boolean; stop: () => void } {
  let hidden = false;
  const onChange = () => {
    if (document.visibilityState === "hidden") hidden = true;
  };
  try {
    onChange();
    document.addEventListener("visibilitychange", onChange);
  } catch {}
  return {
    wasHidden: () => hidden,
    stop: () => {
      try {
        document.removeEventListener("visibilitychange", onChange);
      } catch {}
    },
  };
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
