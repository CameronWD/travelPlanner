import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  captureInstallPrompt,
  clearInstallPrompt,
  getInstallPrompt,
  listenForInstallPrompt,
  subscribeInstallPrompt,
} from "./install-prompt";

function fakePrompt(): Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted"; platform: string }> } {
  const e = new Event("beforeinstallprompt", { cancelable: true }) as Event & {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: "accepted"; platform: string }>;
  };
  e.prompt = vi.fn().mockResolvedValue(undefined);
  e.userChoice = Promise.resolve({ outcome: "accepted", platform: "web" });
  return e;
}

beforeEach(() => clearInstallPrompt());

describe("install prompt capture", () => {
  it("starts empty", () => {
    expect(getInstallPrompt()).toBeNull();
  });

  it("captures the event, prevents the browser's own mini-infobar, and notifies subscribers", () => {
    const listener = vi.fn();
    const off = subscribeInstallPrompt(listener);
    const e = fakePrompt();
    captureInstallPrompt(e);
    expect(e.defaultPrevented).toBe(true);
    expect(getInstallPrompt()).toBe(e);
    expect(listener).toHaveBeenCalledTimes(1);
    off();
    clearInstallPrompt();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("clears and notifies", () => {
    const listener = vi.fn();
    subscribeInstallPrompt(listener);
    captureInstallPrompt(fakePrompt());
    clearInstallPrompt();
    expect(getInstallPrompt()).toBeNull();
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("listenForInstallPrompt wires beforeinstallprompt and appinstalled on the target, and tears down", () => {
    const target = new EventTarget() as unknown as Window;
    const off = listenForInstallPrompt(target);
    const e = fakePrompt();
    target.dispatchEvent(e);
    expect(getInstallPrompt()).toBe(e);
    target.dispatchEvent(new Event("appinstalled"));
    expect(getInstallPrompt()).toBeNull();
    off();
    target.dispatchEvent(fakePrompt());
    expect(getInstallPrompt()).toBeNull();
  });
});
