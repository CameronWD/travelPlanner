import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { findUnique } = vi.hoisted(() => ({ findUnique: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { usageSwitch: { findUnique } } }));

let mod: typeof import("./switch");

beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-12-01T12:00:00Z"));
  vi.resetModules();
  mod = await import("./switch");
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("readUsageRecording", () => {
  it("no row reads as on", async () => {
    findUnique.mockResolvedValue(null);
    expect(await mod.readUsageRecording()).toBe(true);
    expect(findUnique).toHaveBeenCalledWith({ where: { id: "usage" }, select: { recording: true } });
  });

  it("reads once within 30 seconds and again after", async () => {
    findUnique.mockResolvedValue({ recording: false });
    expect(await mod.readUsageRecording()).toBe(false);
    vi.advanceTimersByTime(29_999);
    expect(await mod.readUsageRecording()).toBe(false);
    expect(findUnique).toHaveBeenCalledTimes(1);
    findUnique.mockResolvedValue({ recording: true });
    vi.advanceTimersByTime(1);
    expect(await mod.readUsageRecording()).toBe(true);
    expect(findUnique).toHaveBeenCalledTimes(2);
  });

  it("a read that throws rethrows and is not cached", async () => {
    findUnique.mockRejectedValueOnce(new Error("db down"));
    await expect(mod.readUsageRecording()).rejects.toThrow("db down");
    findUnique.mockResolvedValue({ recording: true });
    expect(await mod.readUsageRecording()).toBe(true);
    expect(findUnique).toHaveBeenCalledTimes(2);
  });

  it("primeUsageRecording answers without a read", async () => {
    mod.primeUsageRecording(false);
    expect(await mod.readUsageRecording()).toBe(false);
    expect(findUnique).not.toHaveBeenCalled();
  });
});
