/**
 * The browser's install prompt, captured once at app load so the Install
 * nudge (CONTEXT.md; components/trips/install-nudge.tsx) can offer the
 * real install later. Chrome on Android (and desktop) fires
 * `beforeinstallprompt` early and exactly once per page load; if nothing
 * is listening by then, the only install path left is the browser menu.
 * Pure module, no React: the nudge subscribes through useSyncExternalStore.
 * iOS never fires this event — the nudge handles iPhone separately.
 */
export interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

type Listener = () => void;

let captured: InstallPromptEvent | null = null;
const listeners = new Set<Listener>();

function notify(): void {
  for (const listener of listeners) listener();
}

export function captureInstallPrompt(e: Event): void {
  e.preventDefault();
  captured = e as InstallPromptEvent;
  notify();
}

export function clearInstallPrompt(): void {
  captured = null;
  notify();
}

export function getInstallPrompt(): InstallPromptEvent | null {
  return captured;
}

export function subscribeInstallPrompt(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Register on `target` (the window); returns the teardown. */
export function listenForInstallPrompt(target: Window = window): () => void {
  const onPrompt = (e: Event) => captureInstallPrompt(e);
  const onInstalled = () => clearInstallPrompt();
  target.addEventListener("beforeinstallprompt", onPrompt);
  target.addEventListener("appinstalled", onInstalled);
  return () => {
    target.removeEventListener("beforeinstallprompt", onPrompt);
    target.removeEventListener("appinstalled", onInstalled);
  };
}
