import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  getStatus,
  getServerStatus,
  subscribe,
  requestWarm,
  beginWarm,
  finishWarm,
  cancelWarm,
  resetOfflineStatus,
  takeWarmRequest,
  currentBuildId,
} from "./offline-status";

beforeEach(() => {
  resetOfflineStatus();
  window.localStorage.clear();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("offline status store", () => {
  it("starts idle with no timestamp for a trip that was never warmed", () => {
    expect(getStatus("t1")).toEqual({ state: "idle", savedAt: null, savedBuild: null, requestId: 0 });
  });

  it("the server snapshot is always idle", () => {
    expect(getServerStatus()).toEqual({ state: "idle", savedAt: null, savedBuild: null, requestId: 0 });
  });

  it("returns the same object until something changes (useSyncExternalStore needs that)", () => {
    const a = getStatus("t1");
    expect(getStatus("t1")).toBe(a);
    beginWarm("t1");
    expect(getStatus("t1")).not.toBe(a);
  });

  it("walks idle → saving → saved and persists savedAt per trip", () => {
    beginWarm("t1");
    expect(getStatus("t1").state).toBe("saving");
    finishWarm("t1", 1_700_000_000_000);
    expect(getStatus("t1")).toMatchObject({ state: "saved", savedAt: 1_700_000_000_000 });
    expect(window.localStorage.getItem("teepee.offline.savedAt.t1")).toBe("1700000000000");
    expect(getStatus("t2").state).toBe("idle");
  });

  it("seeds a saved state from localStorage on first read after a reload", () => {
    window.localStorage.setItem("teepee.offline.savedAt.t1", "1700000000000");
    expect(getStatus("t1")).toMatchObject({ state: "saved", savedAt: 1_700_000_000_000 });
  });

  it("ignores a corrupt stored value", () => {
    window.localStorage.setItem("teepee.offline.savedAt.t1", "not a number");
    expect(getStatus("t1")).toMatchObject({ state: "idle", savedAt: null });
  });

  it("requestWarm bumps requestId and notifies subscribers", () => {
    const listener = vi.fn();
    const unsubscribe = subscribe(listener);
    requestWarm("t1");
    expect(getStatus("t1").requestId).toBe(1);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    requestWarm("t1");
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("cancelWarm falls back to saved when a timestamp exists, else idle", () => {
    beginWarm("t1");
    cancelWarm("t1");
    expect(getStatus("t1").state).toBe("idle");

    finishWarm("t1", 1_700_000_000_000);
    beginWarm("t1");
    cancelWarm("t1");
    expect(getStatus("t1")).toMatchObject({ state: "saved", savedAt: 1_700_000_000_000 });
  });

  it("cancelWarm is a no-op when nothing is in flight", () => {
    const before = getStatus("t1");
    cancelWarm("t1");
    expect(getStatus("t1")).toBe(before);
  });
});

describe("saved build (final review item 1b)", () => {
  it("reads the build id from NEXT_PUBLIC_BUILD_ID, falling back to dev", () => {
    vi.stubEnv("NEXT_PUBLIC_BUILD_ID", "b7");
    expect(currentBuildId()).toBe("b7");
    vi.stubEnv("NEXT_PUBLIC_BUILD_ID", "");
    expect(currentBuildId()).toBe("dev");
  });

  it("stores the build next to savedAt and reads it back after a reload", () => {
    vi.stubEnv("NEXT_PUBLIC_BUILD_ID", "b2");
    finishWarm("t1", 1_700_000_000_000);
    expect(getStatus("t1")).toMatchObject({ savedAt: 1_700_000_000_000, savedBuild: "b2" });
    expect(window.localStorage.getItem("teepee.offline.savedBuild.t1")).toBe("b2");
    resetOfflineStatus();
    expect(getStatus("t1")).toMatchObject({ state: "saved", savedAt: 1_700_000_000_000, savedBuild: "b2" });
  });

  it("an old entry with no build still reads as saved, with an unknown build", () => {
    window.localStorage.setItem("teepee.offline.savedAt.t1", "1700000000000");
    expect(getStatus("t1")).toMatchObject({ state: "saved", savedAt: 1_700_000_000_000, savedBuild: null });
  });
});

describe("takeWarmRequest (spec 2026-10-06 §A)", () => {
  it("is true once after each Save again, false otherwise", () => {
    expect(takeWarmRequest("t1")).toBe(false);
    requestWarm("t1");
    expect(takeWarmRequest("t1")).toBe(true);
    expect(takeWarmRequest("t1")).toBe(false);
  });
  it("resetOfflineStatus forgets handled requests too", () => {
    requestWarm("t1");
    resetOfflineStatus();
    expect(takeWarmRequest("t1")).toBe(false);
  });
});
